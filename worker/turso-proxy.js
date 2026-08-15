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
 * Routes — EVERY route requires a Mount Sinai Entra (MSAL) bearer token.
 * There is no public or anonymous route:
 *   POST /sessions/push           upsert a batch of sessions
 *   GET  /sessions                pull every session
 *   POST /sessions/delete         delete rows by cloud id
 *   POST /sessions/checklist      attach a clinician checklist to a session
 *   POST /sessions/redcap-pushed  mark a session as pushed to REDCap
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
    const clientId = env.AZURE_CLIENT_ID;
    if (!tenantId || !clientId) return null;

    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (payload.aud !== clientId) return null;

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

    let client;
    try {
      client = getClient(env);
    } catch {
      return json({ error: 'Turso not configured' }, 503, cors);
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

      const cols = COLS.join(', ');
      const ph = COLS.map(() => '?').join(', ');
      const stmts = rows.map((row) => ({
        sql: `INSERT OR REPLACE INTO clinical_sessions (${cols}) VALUES (${ph})`,
        // Only known columns are read from the payload, so a client cannot
        // widen the write by adding fields.
        args: COLS.map((k) => (row?.[k] === undefined ? null : row[k])),
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
