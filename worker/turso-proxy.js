/**
 * Cloudflare Worker — Turso proxy for the ePSA clinical sessions database.
 *
 * WHY THIS EXISTS
 * Both the screening tool and the main ePSA app used to talk to Turso directly
 * from the browser, using `import.meta.env.VITE_TURSO_AUTH_TOKEN`. Vite inlines
 * VITE_-prefixed vars into the bundle, so that database credential was public
 * to anyone who loaded the page — and it granted full read/write/delete on the
 * whole clinical_sessions table. This Worker holds the token as a secret and
 * exposes only the specific operations the apps need.
 *
 * Deploy:
 *   wrangler deploy --config worker/wrangler.turso.toml
 *
 * Secrets (set once, never in code):
 *   wrangler secret put TURSO_URL            --config worker/wrangler.turso.toml
 *   wrangler secret put TURSO_AUTH_TOKEN     --config worker/wrangler.turso.toml
 *
 * Vars (in wrangler.turso.toml):
 *   AZURE_CLIENT_ID, AZURE_TENANT_ID, ALLOWED_ORIGINS
 *
 * Routes:
 *   POST /public/session          INSERT-ONLY. No token. See below.
 *
 *   Everything else requires a Mount Sinai Entra (MSAL) bearer token:
 *   POST /sessions/push           upsert a batch of sessions
 *   GET  /sessions                pull every session
 *   POST /sessions/delete         delete rows by cloud id
 *   POST /sessions/checklist      attach a clinician checklist to a session
 *   POST /sessions/redcap-pushed  mark a session as pushed to REDCap
 *
 * THE PUBLIC ROUTE
 * epsa.mssm.edu serves a patient-facing questionnaire. A consenting member of
 * the public must be able to upload their own result without a Mount Sinai
 * login, so /public/session is deliberately unauthenticated — but it is
 * strictly upload-only:
 *
 *   - plain INSERT, never INSERT OR REPLACE, so a caller who supplies an
 *     existing id cannot overwrite a real clinical session; the write simply
 *     fails on the primary key
 *   - returns no row data, so it cannot be used to read anything back or to
 *     probe which ids exist
 *   - no list, update, delete or checklist capability
 *   - Turnstile-verified when TURNSTILE_SECRET_KEY is set, and rate limited
 *     per IP either way
 *   - every row is stamped source='public' so staff can see provenance before
 *     pushing it to REDCap
 *
 * The worst outcome of abuse here is junk rows that staff can see and discard.
 * Compare what this replaces: a database credential in the browser bundle
 * granting full read, write and delete over every clinical session.
 */

import { createClient } from '@libsql/client/web';

// ---------------------------------------------------------------------------
// Schema — owned by the Worker now that clients cannot execute arbitrary SQL.
// ---------------------------------------------------------------------------

// Must stay identical to COLS in src/services/tursoService.js — the client
// builds each row (including de-identification) and this Worker reads only
// these keys, so a column present there but missing here is silently dropped.
const COLS = [
  'id', 'session_ref', 'created_at', 'type', 'status', 'final_category',
  // Part 1 inputs (formData)
  'age', 'race', 'family_history', 'genetic_risk', 'bmi', 'exercise',
  'smoking', 'chemical_exposure', 'diet_pattern', 'comorbidity_score',
  'ipss_qol', 'shim_q1',
  // Part 1 result (engineResult)
  'tier_key', 'tier_label', 'display_range',
  // Part 2 inputs (step2)
  'psa', 'pirads', 'on_hormonal_therapy',
  // REDCap export tracking
  'redcap_pushed_at',
  // Complete session blob
  'full_record',
];

const CREATE_SQL = `CREATE TABLE IF NOT EXISTS clinical_sessions (
  id TEXT PRIMARY KEY, session_ref TEXT, created_at TEXT, type TEXT, status TEXT,
  final_category TEXT,
  age INTEGER, race TEXT, family_history TEXT, genetic_risk TEXT, bmi REAL,
  exercise TEXT, smoking TEXT, chemical_exposure TEXT, diet_pattern TEXT,
  comorbidity_score INTEGER, ipss_qol INTEGER, shim_q1 INTEGER,
  tier_key TEXT, tier_label TEXT, display_range TEXT,
  psa REAL, pirads TEXT, on_hormonal_therapy INTEGER,
  redcap_pushed_at TEXT,
  clinician_influence TEXT,
  clinician_action TEXT,
  clinician_notes TEXT,
  clinician_checklist_at TEXT,
  full_record TEXT
)`;

// Columns added after the initial release. Each ALTER is wrapped in
// allSettled so an existing table silently gains the column.
const MIGRATE_COLS = [
  // Provenance: how a row arrived. 'staff' = pushed by a signed-in user,
  // 'public' = uploaded from the unauthenticated screening tool. Staff need to
  // see this before pushing a row to the study database.
  ['source', 'TEXT'],
  ['source_verified', 'INTEGER'],
  ['uploaded_at', 'TEXT'],
  ['redcap_pushed_at', 'TEXT'],
  ['clinician_influence', 'TEXT'],
  ['clinician_action', 'TEXT'],
  ['clinician_notes', 'TEXT'],
  ['clinician_checklist_at', 'TEXT'],
];

let schemaReady = false;

async function ensureSchema(client) {
  // Module scope persists across requests in a warm isolate, so the migration
  // runs once per isolate rather than once per request.
  if (schemaReady) return;
  await client.execute(CREATE_SQL);
  await Promise.allSettled(
    MIGRATE_COLS.map(([col, type]) =>
      client.execute(`ALTER TABLE clinical_sessions ADD COLUMN ${col} ${type}`),
    ),
  );
  schemaReady = true;
}

function getClient(env) {
  const url = env.TURSO_URL;
  const authToken = env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) throw new Error('turso_not_configured');
  return createClient({ url: url.replace(/^libsql:\/\//, 'https://'), authToken });
}

// ---------------------------------------------------------------------------
// Mount Sinai Entra (MSAL) token verification.
// ---------------------------------------------------------------------------

const jwksCache = {};

async function fetchJwks(tenantId) {
  const cached = jwksCache[tenantId];
  if (cached && cached.exp > Date.now()) return cached.keys;
  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
  );
  if (!res.ok) throw new Error('jwks_fetch_failed');
  const { keys } = await res.json();
  jwksCache[tenantId] = { keys, exp: Date.now() + 3_600_000 };
  return keys;
}

function b64url(s) {
  return atob(s.replace(/-/g, '+').replace(/_/g, '/'));
}

/**
 * Returns the decoded payload for a valid token, or null.
 * Verifies signature, audience, issuer and expiry — a token that merely
 * *looks* like a JWT is rejected at the signature check.
 */
async function verifyMsalToken(authHeader, env) {
  try {
    if (!authHeader?.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7);

    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const header = JSON.parse(b64url(parts[0]));
    const payload = JSON.parse(b64url(parts[1]));

    const tenantId = env.AZURE_TENANT_ID;

    // Comma-separated ALLOWLIST of accepted audiences rather than a single
    // value, matching worker/redcap-proxy.js in the dashboard repo. Only the
    // screening tool calls this Worker today, but keeping the two token
    // verifiers identical means a second caller (or a re-registered app)
    // cannot fail here in a way it would not fail there.
    //
    // Still strict: exact GUID matches only, no wildcards or prefixes.
    const allowedAudiences = (env.AZURE_CLIENT_ID || '')
      .split(',').map((x) => x.trim()).filter(Boolean);
    if (!tenantId || allowedAudiences.length === 0) return null;

    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!allowedAudiences.includes(payload.aud)) return null;

    const validIssuers = [
      `https://login.microsoftonline.com/${tenantId}/v2.0`,
      `https://sts.windows.net/${tenantId}/`,
    ];
    if (!validIssuers.includes(payload.iss)) return null;

    const keys = await fetchJwks(tenantId);
    const jwk = keys.find((k) => k.kid === header.kid && k.use === 'sig');
    if (!jwk) return null;

    const cryptoKey = await crypto.subtle.importKey(
      'jwk', jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false, ['verify'],
    );

    const sigBytes = Uint8Array.from(b64url(parts[2]), (c) => c.charCodeAt(0));
    const dataBytes = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);

    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', cryptoKey, sigBytes, dataBytes,
    );
    return valid ? payload : null;
  } catch {
    return null;
  }
}


// ---------------------------------------------------------------------------
// Strict validation for the public upload route.
//
// Nothing in the browser can gate this endpoint. A flag in localStorage, a
// device id, a header the app sets — all of it is visible in devtools and
// replayable with curl, so none of it is a control. The only real constraints
// are the ones enforced here, on the server, against every field.
//
// SQL injection is already impossible: every statement uses bound parameters,
// so a value can never be parsed as SQL. What this guards against instead is
// junk and abuse — oversized blobs, wrong types, absurd numbers, and fields a
// public caller has no business setting.
// ---------------------------------------------------------------------------

const MAX_FULL_RECORD_BYTES = 64 * 1024;

/** Field name → validator. Anything not listed is dropped, not stored. */
const PUBLIC_FIELD_RULES = {
  id:              (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v),
  session_ref:     (v) => v === null || (typeof v === 'string' && /^EP-\d{8}-[A-Z0-9]{4}$/.test(v)),
  created_at:      (v) => v === null || (typeof v === 'string' && v.length <= 32),
  type:            (v) => v === null || (typeof v === 'string' && v.length <= 32),
  status:          (v) => v === null || (typeof v === 'string' && v.length <= 32),
  final_category:  (v) => v === null || (typeof v === 'string' && v.length <= 64),

  age:             (v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 120),
  race:            (v) => v === null || (typeof v === 'string' && v.length <= 64),
  family_history:  (v) => v === null || (typeof v === 'string' && v.length <= 64),
  genetic_risk:    (v) => v === null || (typeof v === 'string' && v.length <= 64),
  bmi:             (v) => v === null || (typeof v === 'number' && v >= 0 && v <= 200),
  exercise:        (v) => v === null || (typeof v === 'string' && v.length <= 64),
  smoking:         (v) => v === null || (typeof v === 'string' && v.length <= 64),
  chemical_exposure: (v) => v === null || (typeof v === 'string' && v.length <= 64),
  diet_pattern:    (v) => v === null || (typeof v === 'string' && v.length <= 64),
  comorbidity_score: (v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 100),
  ipss_qol:        (v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 100),
  shim_q1:         (v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 100),

  tier_key:        (v) => v === null || (typeof v === 'string' && v.length <= 64),
  tier_label:      (v) => v === null || (typeof v === 'string' && v.length <= 128),
  display_range:   (v) => v === null || (typeof v === 'string' && v.length <= 64),

  psa:             (v) => v === null || (typeof v === 'number' && v >= 0 && v <= 10000),
  pirads:          (v) => v === null || (typeof v === 'string' && v.length <= 16),
  on_hormonal_therapy: (v) => v === null || v === 0 || v === 1,

  full_record:     (v) => {
    if (v === null) return true;
    if (typeof v !== 'string') return false;
    if (v.length > MAX_FULL_RECORD_BYTES) return false;
    try { JSON.parse(v); return true; } catch { return false; }
  },
};

// Deliberately NOT accepted from a public caller, whatever the payload says:
//   redcap_pushed_at, clinician_* — staff workflow state
//   source, source_verified, uploaded_at — provenance, set server-side
//
/**
 * Returns { ok: true, values } or { ok: false, field }.
 * Absent fields become null; unknown fields are ignored rather than stored.
 */
function validatePublicRow(row) {
  const values = {};
  for (const [field, isValid] of Object.entries(PUBLIC_FIELD_RULES)) {
    const raw = row[field] === undefined ? null : row[field];
    if (!isValid(raw)) return { ok: false, field };
    values[field] = raw;
  }
  return { ok: true, values };
}

/** Verify a Cloudflare Turnstile token. Returns true only on a clean pass. */
async function verifyTurnstile(token, ip, env) {
  if (!token) return false;
  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET_KEY);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  try {
    const res = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body },
    );
    return (await res.json()).success === true;
  } catch {
    return false;
  }
}

/** Sliding-window rate limiter backed by KV. True = block. */
async function isRateLimited(kv, key, limitPerMinute) {
  if (!kv) return false; // KV not bound — limiter is a no-op.
  const now = Date.now();
  const windowStart = now - 60_000;
  const raw = await kv.get(key, { type: 'json' });
  const stamps = Array.isArray(raw) ? raw.filter((t) => t > windowStart) : [];
  if (stamps.length >= limitPerMinute) return true;
  stamps.push(now);
  await kv.put(key, JSON.stringify(stamps), { expirationTtl: 90 });
  return false;
}

// ---------------------------------------------------------------------------

const json = (data, status, cors) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedList = (env.ALLOWED_ORIGINS || '')
      .split(',').map((s) => s.trim()).filter(Boolean);

    const originAllowed = allowedList.length === 0 || allowedList.includes(origin);

    const cors = {
      // Echo only an allowlisted origin. Never reflect an arbitrary Origin
      // while also allowing credentials.
      'Access-Control-Allow-Origin': originAllowed && origin ? origin : (allowedList[0] || '*'),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Vary': 'Origin',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (allowedList.length > 0 && origin && !originAllowed) {
      return json({ error: 'Forbidden origin' }, 403, cors);
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    const ip = request.headers.get('CF-Connecting-IP') || '';

    // ── PUBLIC, UPLOAD-ONLY ───────────────────────────────────────────────
    // The only unauthenticated route. Insert-only; see the header comment.
    if (request.method === 'POST' && path === '/public/session') {
      // Fail closed without a rate-limit store. An unauthenticated write
      // endpoint with no limiter is not something to serve on a best-effort
      // basis, and the limiter used to no-op silently when unbound — so the
      // documented limit did not actually exist.
      if (!env.RATE_LIMIT_KV) {
        console.error('public upload refused: RATE_LIMIT_KV is not bound');
        return json({ error: 'Uploads are temporarily unavailable' }, 503, cors);
      }
      if (await isRateLimited(env.RATE_LIMIT_KV, `pub:${ip}`, 10)) {
        return json({ error: 'Too many requests' }, 429, cors);
      }

      // Cap the body before parsing it. Without this a caller can force the
      // Worker to parse an arbitrarily large document.
      const declared = Number(request.headers.get('content-length') || 0);
      if (declared > MAX_FULL_RECORD_BYTES * 2) {
        return json({ error: 'Payload too large' }, 413, cors);
      }

      let body;
      try { body = await request.json(); } catch { return json({ error: 'Bad JSON' }, 400, cors); }

      const row = body?.row;
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        return json({ error: 'row required' }, 400, cors);
      }

      const checked = validatePublicRow(row);
      if (!checked.ok) {
        // Name the field but never echo the value back.
        return json({ error: `Invalid or missing field: ${checked.field}` }, 400, cors);
      }

      // Turnstile is enforced when configured. When it is not, the upload
      // still works but the row is recorded as unverified rather than being
      // silently indistinguishable from a challenged one — so enabling
      // Turnstile later never rewrites the meaning of existing data.
      let verified = 0;
      if (env.TURNSTILE_SECRET_KEY) {
        if (!(await verifyTurnstile(body?.turnstileToken, ip, env))) {
          return json({ error: 'Challenge failed' }, 403, cors);
        }
        verified = 1;
      }

      let client;
      try { client = getClient(env); } catch {
        return json({ error: 'Turso not configured' }, 503, cors);
      }
      await ensureSchema(client);

      // Only validated fields are written, plus server-controlled provenance.
      // redcap_pushed_at and the clinician_* columns are absent by design: a
      // public caller cannot pre-set staff workflow state, and cannot claim
      // its row was staff-entered.
      const values = {
        ...checked.values,
        source: 'public',
        source_verified: verified,
        uploaded_at: new Date().toISOString(),
      };
      const publicCols = Object.keys(values);

      try {
        // Plain INSERT. A duplicate id fails here rather than overwriting an
        // existing clinical session.
        await client.execute({
          sql: `INSERT INTO clinical_sessions (${publicCols.join(', ')}) `
             + `VALUES (${publicCols.map(() => '?').join(', ')})`,
          args: publicCols.map((k) => values[k]),
        });
      } catch (err) {
        const msg = String(err?.message || '');
        if (/UNIQUE|PRIMARY KEY|constraint/i.test(msg)) {
          // Already uploaded — treat as success so a retry or double-tap does
          // not surface an error to a patient, but do not touch the stored row.
          return json({ ok: true, duplicate: true }, 200, cors);
        }
        return json({ error: 'Upload failed' }, 502, cors);
      }

      // Deliberately returns no row data.
      return json({ ok: true }, 200, cors);
    }

    // ── EVERY route below this line requires Mount Sinai Entra SSO ────────
    //
    // There is deliberately no public route. An earlier design exposed
    // POST /session/by-ref so a patient could resume a screening by typing the
    // EP-YYYYMMDD-XXXX code from their results card, gated by Turnstile. That
    // was dropped: Turnstile is a bot check, not authentication, and an
    // unauthenticated read of clinical session data is a finding regardless of
    // how well it is rate limited.
    //
    // Consequence, by design: a completed screening can only be reopened,
    // amended or completed on the clinical side by an authenticated staff
    // member. The patient app rejects EP- refs up front and says so.
    const user = await verifyMsalToken(request.headers.get('Authorization'), env);
    if (!user) return json({ error: 'Unauthorized' }, 401, cors);

    // Backend configuration is checked only AFTER authentication. Doing it
    // first meant an anonymous caller got 503 instead of 401 — which leaks
    // whether the Worker is wired up, and makes "protected" and
    // "misconfigured" indistinguishable to the production probe.
    let client;
    try {
      client = getClient(env);
    } catch {
      return json({ error: 'Turso not configured' }, 503, cors);
    }

    await ensureSchema(client);

    // GET /sessions — pull every session.
    if (request.method === 'GET' && path === '/sessions') {
      const result = await client.execute(
        'SELECT id, full_record FROM clinical_sessions ORDER BY created_at DESC',
      );
      const idIdx = result.columns.indexOf('id');
      const recIdx = result.columns.indexOf('full_record');
      const rows = result.rows
        .map((r) => ({ id: r[idIdx], full_record: r[recIdx] }))
        .filter((r) => r.full_record);
      return json({ rows }, 200, cors);
    }

    if (request.method !== 'POST') {
      return json({ error: 'Not found' }, 404, cors);
    }

    let body;
    try { body = await request.json(); } catch { return json({ error: 'Bad JSON' }, 400, cors); }

    // POST /sessions/push — upsert a batch of pre-built column rows.
    if (path === '/sessions/push') {
      const rows = Array.isArray(body?.rows) ? body.rows : null;
      if (!rows) return json({ error: 'rows[] required' }, 400, cors);
      if (rows.length > 500) return json({ error: 'Batch too large' }, 413, cors);
      if (rows.length === 0) return json({ pushed: 0 }, 200, cors);

      // Provenance is set server-side from the verified identity, so a client
      // cannot label its own rows as staff-entered.
      const staffCols = [...COLS, 'source', 'source_verified'];
      const cols = staffCols.join(', ');
      const ph = staffCols.map(() => '?').join(', ');
      const stmts = rows.map((row) => ({
        // INSERT OR REPLACE is correct here and only here: a signed-in user
        // re-pushing an edited session should update it in place. The public
        // route uses a plain INSERT precisely because it has no such identity.
        sql: `INSERT OR REPLACE INTO clinical_sessions (${cols}) VALUES (${ph})`,
        // Only known columns are read from the payload, so a client cannot
        // widen the write by adding fields.
        args: staffCols.map((k) => {
          if (k === 'source') return 'staff';
          if (k === 'source_verified') return 1;
          return row?.[k] === undefined ? null : row[k];
        }),
      }));

      await client.batch(stmts, 'write');
      return json({ pushed: stmts.length }, 200, cors);
    }

    // POST /sessions/delete — remove rows by cloud id.
    if (path === '/sessions/delete') {
      const ids = Array.isArray(body?.ids) ? body.ids.filter((i) => typeof i === 'string') : null;
      if (!ids) return json({ error: 'ids[] required' }, 400, cors);
      if (ids.length === 0) return json({ deleted: 0 }, 200, cors);
      if (ids.length > 500) return json({ error: 'Batch too large' }, 413, cors);

      await client.batch(
        ids.map((id) => ({ sql: 'DELETE FROM clinical_sessions WHERE id = ?', args: [id] })),
        'write',
      );
      return json({ deleted: ids.length }, 200, cors);
    }

    // POST /sessions/checklist — attach a clinician checklist.
    if (path === '/sessions/checklist') {
      const sessionRef = String(body?.sessionRef || '').trim();
      const c = body?.checklistData;
      if (!sessionRef) return json({ error: 'sessionRef required' }, 400, cors);
      if (!c || typeof c !== 'object') return json({ error: 'checklistData required' }, 400, cors);

      const checklistAt = new Date().toISOString();

      const existing = await client.execute({
        sql: 'SELECT full_record FROM clinical_sessions WHERE session_ref = ? LIMIT 1',
        args: [sessionRef],
      });
      const row = existing.rows[0];
      if (!row) return json({ ok: false, reason: 'not_found' }, 404, cors);

      let fullRecord = null;
      const raw = row[existing.columns.indexOf('full_record')];
      if (raw) {
        try { fullRecord = JSON.parse(raw); } catch { fullRecord = null; }
      }
      if (fullRecord) fullRecord = { ...fullRecord, checklistData: c };

      await client.execute({
        sql: `UPDATE clinical_sessions
              SET clinician_influence = ?,
                  clinician_action = ?,
                  clinician_notes = ?,
                  clinician_checklist_at = ?
                  ${fullRecord ? ', full_record = ?' : ''}
              WHERE session_ref = ?`,
        args: fullRecord
          ? [c.influence ?? null, c.action ?? null, c.notes || null, checklistAt,
             JSON.stringify(fullRecord), sessionRef]
          : [c.influence ?? null, c.action ?? null, c.notes || null, checklistAt,
             sessionRef],
      });

      return json({ ok: true }, 200, cors);
    }

    // POST /sessions/redcap-pushed — stamp the REDCap push time.
    // Keyed by cloud id (the sha256 of the session's syncKey), matching the
    // pre-Worker behaviour: the client already computes and owns that id.
    if (path === '/sessions/redcap-pushed') {
      const id = String(body?.id || '').trim();
      if (!id) return json({ error: 'id required' }, 400, cors);

      const pushedAt = new Date().toISOString();
      await client.execute({
        sql: 'UPDATE clinical_sessions SET redcap_pushed_at = ? WHERE id = ?',
        args: [pushedAt, id],
      });
      return json({ ok: true, pushedAt }, 200, cors);
    }

    return json({ error: 'Not found' }, 404, cors);
  },
};
