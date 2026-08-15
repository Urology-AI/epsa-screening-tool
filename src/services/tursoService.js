import { normaliseSession } from './clinicalSessionService';
import { getAuthToken, hasAuthToken } from './authToken';

/**
 * Clinical session sync, via the Entra-authenticated epsa-turso-proxy Worker.
 *
 * This module used to open a Turso connection directly from the browser using
 * a VITE_-prefixed Turso auth token read from the build env. Vite inlines such vars
 * into the bundle, so that database credential was readable by anyone who
 * loaded the page — and it carried full read/write/delete over the entire
 * clinical_sessions table. The token now lives only as a Worker secret and
 * every call below carries the caller's Mount Sinai Entra token instead.
 *
 * What did NOT move to the server: de-identification. `deidentifySession()`
 * still runs in the browser, so identifiers are stripped before the data
 * leaves the device rather than being trusted to a remote hop.
 *
 * Local ids never leave the browser — each session gets a SHA-256 cloud id,
 * with the local↔cloud mapping kept in localStorage.
 */

// Flat columns extracted from the session for direct SQL querying.
// Must stay identical to COLS in worker/turso-proxy.js.
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

const PROXY_URL = (import.meta.env.VITE_TURSO_PROXY_URL || '').replace(/\/$/, '');

/**
 * Upload one consented session from the PUBLIC screening tool.
 *
 * Sends no credential, because there is no signed-in user at epsa.mssm.edu —
 * it is a patient-facing questionnaire. The proxy's /public/session route is
 * insert-only: it cannot read, list, update or delete, it returns no row data,
 * and a duplicate id fails rather than overwriting an existing session.
 *
 * Prefer pushSessions() whenever someone IS signed in; that path is
 * authenticated and marks the row as staff-entered.
 */
export async function uploadPublicSession(session, cloudId, turnstileToken) {
  if (!PROXY_URL) return { ok: false, reason: 'not_configured' };

  const row = sessionColumns(session, cloudId);

  const res = await fetch(`${PROXY_URL}/public/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ row, turnstileToken }),
  });

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error || ''; } catch { /* non-JSON */ }
    return { ok: false, reason: detail || `http_${res.status}` };
  }
  return { ok: true };
}

export function isTursoConfigured() {
  return !!PROXY_URL;
}

/**
 * Call the proxy. Throws on any non-2xx so callers surface a real error
 * instead of silently treating a rejected write as success.
 */
async function callProxy(path, { method = 'POST', body } = {}) {
  if (!PROXY_URL) {
    throw new Error('Cloud sync is not configured on this deployment (VITE_TURSO_PROXY_URL).');
  }
  const token = await getAuthToken();

  const res = await fetch(`${PROXY_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401) {
    throw new Error('Your Mount Sinai sign-in is no longer valid. Please sign in again.');
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error || ''; } catch { /* non-JSON body */ }
    throw new Error(detail || `Cloud sync failed (HTTP ${res.status}).`);
  }
  return res.json();
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
async function flushPendingDeletes() {
  const pending = loadPendingDeletes();
  const ids = [...new Set(Object.values(pending).flat())];
  if (!ids.length) return 0;
  await callProxy('/sessions/delete', { body: { ids } });
  // Only cleared after the proxy confirms; a failed call throws above and the
  // tombstones survive to be retried on the next push or pull.
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
  const deleted = await flushPendingDeletes();
  if (!sessions.length) return { pushed: 0, deleted };

  // The cloud row id is a hash of the stable syncKey (sessionRef when
  // available), so the same case pushed twice — even after an export/import
  // cycle or from another device — updates one row instead of duplicating.
  const idMap = loadIdMap();
  await Promise.all(sessions.map(async (s) => {
    if (!idMap[s.id]) idMap[s.id] = await sha256hex(syncKey(s));
  }));
  saveIdMap(idMap);

  // Rows are built (and de-identified) here, then handed to the proxy. SQL is
  // assembled server-side from a fixed column list, so the client cannot widen
  // the write beyond these columns.
  const rows = sessions.map((s) => sessionColumns(s, idMap[s.id]));

  const { pushed } = await callProxy('/sessions/push', { body: { rows } });
  markSynced(sessions);
  return { pushed: pushed ?? rows.length, deleted };
}

/**
 * Pull all sessions from Turso. Sessions already known to this device keep
 * their local id (via the saved id map); new ones use the cloud hash as id.
 * Returns session records ready to merge into local storage.
 */
export async function pullSessions() {
  // Apply pending deletions first so locally deleted cases don't resurrect.
  await flushPendingDeletes();

  const { rows } = await callProxy('/sessions', { method: 'GET' });

  const idMap = loadIdMap();
  const cloudToLocal = {};
  for (const [localId, cloudId] of Object.entries(idMap)) {
    cloudToLocal[cloudId] = localId;
  }

  let idMapDirty = false;
  const sessions = [];
  for (const r of rows) {
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
  const idMap = loadIdMap();
  if (!idMap[session.id]) idMap[session.id] = await sha256hex(syncKey(session));
  saveIdMap(idMap);
  const cloudId = idMap[session.id];
  const { pushedAt } = await callProxy('/sessions/redcap-pushed', {
    body: { id: cloudId },
  });
  return pushedAt ?? new Date().toISOString();
}


/**
 * Persist the clinician checklist onto an existing session row, keyed by
 * session_ref. Updates the flat columns and merges checklistData into the
 * full_record JSON blob.
 */
export async function saveChecklistToTurso(sessionRef, checklistData) {
  if (!isTursoConfigured()) return { ok: false, reason: 'turso_not_configured' };
  if (!sessionRef) return { ok: false, reason: 'missing_session_ref' };

  // The read-modify-write of full_record happens inside the proxy, in one
  // place, rather than as a client round-trip that could interleave with
  // another clinician editing the same session.
  try {
    await callProxy('/sessions/checklist', {
      body: { sessionRef, checklistData },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message || 'checklist_save_failed' };
  }
}

// pullSessionByRef() was removed along with the proxy's public by-ref route.
//
// It existed so the patient-facing ePSA app could resume a screening from the
// EP-YYYYMMDD-XXXX code on a results card, which required reading clinical
// session data without an authenticated user. Every route on the proxy now
// requires a Mount Sinai Entra token, so a completed screening is reopened or
// amended on the clinical side by signed-in staff.
