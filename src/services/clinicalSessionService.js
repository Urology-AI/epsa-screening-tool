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
