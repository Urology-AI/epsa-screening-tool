import { createClient } from '@libsql/client/web';
import { normaliseSession } from './clinicalSessionService';

/**
 * Turso cloud sync for clinical staff mode sessions.
 *
 * Mirrors the digital-twin push/pull pattern: each session is stored as a row
 * of flat scalar columns (queryable for research) plus a `full_record` JSON
 * blob that round-trips the complete session on pull.
 *
 * Local ids never leave the browser — each session gets a SHA-256 cloud id,
 * with the local↔cloud mapping kept in localStorage.
 */

// Flat columns extracted from the session for direct SQL querying.
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
  full_record TEXT
)`;

// One migration statement per column added after initial release; each is
// wrapped in allSettled so existing tables silently gain the column.
const MIGRATE_COLS = [
  ['redcap_pushed_at', 'TEXT'],
];

export function isTursoConfigured() {
  return !!(import.meta.env.VITE_TURSO_URL && import.meta.env.VITE_TURSO_AUTH_TOKEN);
}

function getClient() {
  const url = import.meta.env.VITE_TURSO_URL;
  const authToken = import.meta.env.VITE_TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    throw new Error('Turso not configured. Set VITE_TURSO_URL and VITE_TURSO_AUTH_TOKEN.');
  }
  return createClient({ url: url.replace(/^libsql:\/\//, 'https://'), authToken });
}

async function ensureSchema(client) {
  await client.execute(CREATE_SQL);
  await Promise.allSettled(
    MIGRATE_COLS.map(([col, type]) =>
      client.execute(`ALTER TABLE clinical_sessions ADD COLUMN ${col} ${type}`)
    )
  );
}

async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 24);
}

const CLOUD_ID_KEY = 'epsa_cloud_id_map';
function loadIdMap() {
  try { return JSON.parse(localStorage.getItem(CLOUD_ID_KEY) || '{}'); } catch { return {}; }
}
function saveIdMap(m) {
  localStorage.setItem(CLOUD_ID_KEY, JSON.stringify(m));
}

/** Stable identity of a case: the human-readable session ref when present
 *  (survives export/import and other devices), otherwise the local id. */
export function syncKey(session) {
  return session.sessionRef ?? session.id;
}

// Sync ledger: which cases (by syncKey) are known to exist in Turso.
const SYNCED_KEY = 'epsa_turso_synced';
function loadSynced() {
  try { return JSON.parse(localStorage.getItem(SYNCED_KEY) || '{}'); } catch { return {}; }
}
function markSynced(sessions) {
  const m = loadSynced();
  const now = new Date().toISOString();
  for (const s of sessions) m[syncKey(s)] = now;
  localStorage.setItem(SYNCED_KEY, JSON.stringify(m));
}

/** Set of syncKeys known to be in Turso (for per-row sync badges). */
export function getSyncedKeys() {
  return new Set(Object.keys(loadSynced()));
}

// Tombstones: cases deleted locally whose Turso rows still need deleting.
// Keyed by syncKey, holding every cloud row id the case may live under.
const PENDING_DELETE_KEY = 'epsa_turso_pending_deletes';
function loadPendingDeletes() {
  try { return JSON.parse(localStorage.getItem(PENDING_DELETE_KEY) || '{}'); } catch { return {}; }
}
function savePendingDeletes(m) {
  localStorage.setItem(PENDING_DELETE_KEY, JSON.stringify(m));
}

export function getPendingDeleteCount() {
  return Object.keys(loadPendingDeletes()).length;
}

/**
 * Record that a locally deleted case must also be removed from Turso.
 * The actual DELETE runs on the next push or pull. Returns true if the
 * case was synced (i.e. a cloud row exists to delete), false otherwise.
 */
export async function markPendingDelete(session) {
  const key = syncKey(session);
  const synced = loadSynced();
  if (!(key in synced)) return false;

  const ids = new Set([await sha256hex(key)]);
  const idMap = loadIdMap();
  if (idMap[session.id]) ids.add(idMap[session.id]);
  delete idMap[session.id];
  saveIdMap(idMap);

  const pending = loadPendingDeletes();
  pending[key] = [...ids];
  savePendingDeletes(pending);

  delete synced[key];
  localStorage.setItem(SYNCED_KEY, JSON.stringify(synced));
  return true;
}

/** Delete all tombstoned rows from Turso; clears the ledger on success. */
async function flushPendingDeletes(client) {
  const pending = loadPendingDeletes();
  const ids = [...new Set(Object.values(pending).flat())];
  if (!ids.length) return 0;
  await client.batch(
    ids.map((id) => ({ sql: 'DELETE FROM clinical_sessions WHERE id = ?', args: [id] })),
    'write'
  );
  localStorage.removeItem(PENDING_DELETE_KEY);
  return Object.keys(pending).length;
}

/**
 * Strip identifiers before data leaves the browser (HIPAA Safe Harbor):
 *  - id        → cloud hash (set by caller)
 *  - age > 89  → capped at 89
 *  - _storage / _source bookkeeping → dropped
 */
function deidentifySession(session, cloudId) {
  const capAge = (form) => {
    if (!form) return form;
    const age = Number(form.age);
    return Number.isFinite(age) && age > 89 ? { ...form, age: 89 } : form;
  };
  const clean = normaliseSession(session);
  const formData = capAge(clean.formData);
  return {
    ...clean,
    formData,
    step1: formData,
    id: cloudId,
    sessionRef: session.sessionRef ?? null,
    createdAt: session.createdAt ?? null,
  };
}

/** Extract flat column values from a (de-identified) session. */
function sessionColumns(session, cloudId) {
  const f = session.formData ?? {};
  const r = session.engineResult ?? {};
  const s2 = session.step2 ?? {};
  return {
    id: cloudId,
    session_ref: session.sessionRef ?? null,
    created_at: session.createdAt ?? null,
    type: session.type ?? null,
    status: session.status ?? null,
    final_category: session.finalCategory ?? session.postResult?.finalCategory ?? null,
    age: f.age ?? null,
    race: f.race ?? null,
    family_history: f.familyHistory != null ? String(f.familyHistory) : null,
    genetic_risk: f.brcaStatus ?? null,
    bmi: f.bmi != null ? Number(f.bmi) : null,
    exercise: f.exercise ?? null,
    smoking: f.smoking ?? null,
    chemical_exposure: f.chemicalExposure ?? null,
    diet_pattern: f.dietPattern ?? null,
    comorbidity_score: f.comorbidityScore ?? null,
    ipss_qol: f.ipssQol ?? null,
    shim_q1: Array.isArray(f.shim) ? f.shim[0] ?? null : null,
    tier_key: r.epsaTierKey ?? null,
    tier_label: r.epsaTierLabel ?? null,
    display_range: r.displayRange ?? null,
    psa: s2.psa != null ? Number(s2.psa) : null,
    pirads: s2.pirads != null ? String(s2.pirads) : null,
    on_hormonal_therapy: s2.onHormonalTherapy ? 1 : 0,
    redcap_pushed_at: session.redcapPushedAt ?? null,
    full_record: JSON.stringify(deidentifySession(session, cloudId)),
  };
}

/**
 * Push sessions to Turso. Also flushes pending deletions of locally
 * deleted cases. Returns { pushed, deleted }.
 */
/** Sessions the patient declined to share never leave the device.
 *  Legacy sessions without the flag (consented == null) are still pushed. */
export function isPushable(session) {
  return session.consented !== false;
}

export async function pushSessions(sessions) {
  sessions = sessions.filter(isPushable);
  if (!sessions.length && !getPendingDeleteCount()) return { pushed: 0, deleted: 0 };
  const client = getClient();
  await ensureSchema(client);

  const deleted = await flushPendingDeletes(client);
  if (!sessions.length) return { pushed: 0, deleted };

  // The cloud row id is a hash of the stable syncKey (sessionRef when
  // available), so the same case pushed twice — even after an export/import
  // cycle or from another device — updates one row instead of duplicating.
  const idMap = loadIdMap();
  await Promise.all(sessions.map(async (s) => {
    if (!idMap[s.id]) idMap[s.id] = await sha256hex(syncKey(s));
  }));
  saveIdMap(idMap);

  const cols = COLS.join(', ');
  const ph = COLS.map(() => '?').join(', ');

  const stmts = sessions.map((s) => {
    const row = sessionColumns(s, idMap[s.id]);
    return {
      sql: `INSERT OR REPLACE INTO clinical_sessions (${cols}) VALUES (${ph})`,
      args: COLS.map((k) => (row[k] === undefined ? null : row[k])),
    };
  });

  await client.batch(stmts, 'write');
  markSynced(sessions);
  return { pushed: stmts.length, deleted };
}

/**
 * Pull all sessions from Turso. Sessions already known to this device keep
 * their local id (via the saved id map); new ones use the cloud hash as id.
 * Returns session records ready to merge into local storage.
 */
export async function pullSessions() {
  const client = getClient();
  await ensureSchema(client);

  // Apply pending deletions first so locally deleted cases don't resurrect.
  await flushPendingDeletes(client);

  const result = await client.execute(
    'SELECT id, full_record FROM clinical_sessions ORDER BY created_at DESC'
  );

  const idMap = loadIdMap();
  const cloudToLocal = {};
  for (const [localId, cloudId] of Object.entries(idMap)) {
    cloudToLocal[cloudId] = localId;
  }

  let idMapDirty = false;
  const sessions = [];
  for (const row of result.rows) {
    const r = {};
    result.columns.forEach((col, i) => { r[col] = row[i]; });
    const cloudId = r.id;
    if (!r.full_record) continue;

    let entry;
    try { entry = JSON.parse(r.full_record); } catch { continue; }

    // Sessions first seen on this device get local id = cloud hash; the
    // mapping is saved so future pushes reuse the same cloud row.
    const localId = cloudToLocal[cloudId] ?? cloudId;
    if (!cloudToLocal[cloudId]) {
      idMap[localId] = cloudId;
      idMapDirty = true;
    }

    sessions.push({ ...entry, id: localId });
  }

  if (idMapDirty) saveIdMap(idMap);
  markSynced(sessions);
  return sessions;
}

/**
 * Record that a session was successfully pushed to REDCap.
 * Updates the Turso row in place; the caller should also update local storage.
 */
export async function markRedcapPushed(session) {
  const client = getClient();
  await ensureSchema(client);
  const idMap = loadIdMap();
  if (!idMap[session.id]) idMap[session.id] = await sha256hex(syncKey(session));
  saveIdMap(idMap);
  const cloudId = idMap[session.id];
  const now = new Date().toISOString();
  await client.execute({
    sql: 'UPDATE clinical_sessions SET redcap_pushed_at = ? WHERE id = ?',
    args: [now, cloudId],
  });
  return now;
}

/**
 * Fetch a single session by its human-readable ref (EP-YYYYMMDD-XXXX),
 * e.g. to continue a community-screening session in the full app.
 * Read-only: no local sync ledger or id-map side effects.
 * Returns the session record, or null if no row matches.
 */
export async function pullSessionByRef(sessionRef) {
  const client = getClient();
  await ensureSchema(client);

  const result = await client.execute({
    sql: 'SELECT full_record FROM clinical_sessions WHERE session_ref = ? LIMIT 1',
    args: [sessionRef],
  });
  const row = result.rows[0];
  if (!row) return null;

  const fullRecord = row[result.columns.indexOf('full_record')];
  if (!fullRecord) return null;
  try { return JSON.parse(fullRecord); } catch { return null; }
}
