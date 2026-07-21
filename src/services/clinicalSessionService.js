// Standalone version — no Firebase dependency. Storage is localStorage-only.
// Sessions are pushed to Turso via tursoService.js for cross-device access.

const LOCAL_KEY = 'epsa_clinical_sessions';
const DEVICE_KEY = 'epsa_device_id';

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function getLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; }
}
function setLocal(sessions) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(sessions)); } catch {}
}

export async function getOrCreateUid() {
  return getDeviceId();
}

export function normaliseSession(raw) {
  const formData     = raw.formData    ?? raw.step1      ?? null;
  const engineResult = raw.engineResult ?? raw.preResult  ?? null;
  const step2        = raw.step2       ?? null;
  const postResult   = raw.postResult  ?? null;
  const status       = raw.status      ?? (step2 ? 'STEP2_COMPLETE' : 'STEP1_COMPLETE');
  const type         = (step2 || postResult) ? 'full' : (raw.type ?? 'clinical');

  return {
    version: 'epsa-session-v1',
    type,
    formData,
    engineResult,
    step1: formData,
    preResult: engineResult,
    step2,
    postResult,
    status,
    finalCategory: raw.finalCategory ?? null,
    rawAnswers: raw.rawAnswers ?? null,
    consented: raw.consented ?? null,
    redcapPushedAt: raw.redcapPushedAt ?? null,
    checklistData: raw.checklistData ?? null,
  };
}

export function generateSessionRef(date = new Date()) {
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `EP-${ymd}-${suffix}`;
}

export async function saveClinicalSession(_uid, sessionData) {
  const id = `cs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const sessionRef = sessionData.sessionRef ?? generateSessionRef();
  const record = { id, sessionRef, ...normaliseSession(sessionData) };

  const sessions = getLocal().filter(s => s.sessionRef !== sessionRef);
  sessions.unshift({ ...record, createdAt: new Date().toISOString() });
  setLocal(sessions);

  return id;
}

export async function getClinicalSessions() {
  return getLocal().map(s => ({
    ...normaliseSession(s),
    id: s.id,
    sessionRef: s.sessionRef ?? null,
    createdAt: s.createdAt,
    _storage: 'local',
  }));
}

export async function deleteClinicalSession(_uid, session) {
  setLocal(getLocal().filter(s => s.id !== session.id));
}

export async function clearAllClinicalSessions() {
  try { localStorage.removeItem(LOCAL_KEY); } catch {}
}

export function exportSessionsAsJson(sessions, filename) {
  const payload = sessions.map(s => ({
    ...normaliseSession(s),
    sessionRef: s.sessionRef ?? null,
    createdAt: s.createdAt ?? null,
  }));
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `epsa_sessions_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importSessionsFromFile(_uid, file) {
  const text = await file.text();
  const raw = JSON.parse(text);
  const items = Array.isArray(raw) ? raw : [raw];
  if (!items.length) throw new Error('File is empty');
  for (const item of items) {
    const { id: _id, createdAt: _ts, _source, ...rest } = item;
    await saveClinicalSession(null, rest);
  }
  return items.length;
}

export function mergeSessions(records) {
  const keyOf = s => s.sessionRef ?? s.id;
  const local = getLocal();
  const localKeys = new Set(local.map(keyOf));
  const incomingKeys = new Set(records.map(keyOf));
  const merged = [
    ...records,
    ...local.filter(s => !incomingKeys.has(keyOf(s))),
  ].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  setLocal(merged);
  return records.filter(s => !localKeys.has(keyOf(s))).length;
}

export async function setSessionConsent(_uid, session, consented) {
  const sessions = getLocal().map(s =>
    s.id === session.id ? { ...s, consented } : s
  );
  setLocal(sessions);
}

export async function updateSessionStep2(_uid, session, step2Data) {
  const sessions = getLocal().map(s => {
    if (s.id !== session.id) return s;
    return {
      ...s,
      step2: step2Data,
      status: 'STEP2_COMPLETE',
    };
  });
  setLocal(sessions);
  return sessions.find(s => s.id === session.id) ?? null;
}

// ---------------------------------------------------------------------------
// Phone hash linkage — mobile bus PSA follow-up
//
// WHY: Mobile bus patients complete the survey on-site but PSA results return
// 3–5 days later. A SHA-256 hash of the phone number is stored temporarily to
// allow staff to match the PSA result to the correct session when it arrives.
// The hash is deleted once PSA is entered — no phone number is ever stored.
// ---------------------------------------------------------------------------

/**
 * Store a phone hash on a session to enable future PSA linkage.
 * Called at the end of mobile bus survey completion.
 *
 * @param {string} sessionId - session.id
 * @param {string} phoneHash - SHA-256 hash from phoneHash.js
 */
export function setSessionPhoneHash(sessionId, phoneHash) {
  const sessions = getLocal().map(s =>
    s.id === sessionId ? { ...s, _phoneHash: phoneHash } : s
  );
  setLocal(sessions);
}

/**
 * Find a session by phone hash.
 * Called when staff enter a phone number to look up a pending PSA result.
 *
 * @param {string} phoneHash - SHA-256 hash of the phone number entered by staff
 * @returns {object|null} - matching session or null
 */
export function findSessionByPhoneHash(phoneHash) {
  return getLocal().find(s => s._phoneHash === phoneHash) ?? null;
}

/**
 * Remove the phone hash from a session after PSA has been entered.
 * Called automatically after successful PSA linkage.
 * Once removed, the record is fully de-identified.
 *
 * @param {string} sessionId - session.id
 */
export function clearSessionPhoneHash(sessionId) {
  const sessions = getLocal().map(s => {
    if (s.id !== sessionId) return s;
    const { _phoneHash: _removed, ...rest } = s;
    return rest;
  });
  setLocal(sessions);
}
