import { createClient } from '@supabase/supabase-js';
import { normaliseSession } from './clinicalSessionService';

// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------

export function isSupabaseConfigured() {
  return !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

function getClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// Auth helpers (Microsoft via Supabase Auth Azure provider)
// ---------------------------------------------------------------------------

export async function signInWithMicrosoft() {
  const sb = getClient();
  return sb.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      scopes: 'email profile',
      redirectTo: window.location.origin + '/admin',
    },
  });
}

export async function signOut() {
  const sb = getClient();
  return sb.auth.signOut();
}

export async function getSession() {
  const sb = getClient();
  const { data } = await sb.auth.getSession();
  return data.session;
}

export function onAuthStateChange(callback) {
  const sb = getClient();
  const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => callback(session));
  return () => subscription.unsubscribe();
}

// ---------------------------------------------------------------------------
// Local sync ledger (same pattern as tursoService)
// ---------------------------------------------------------------------------

const SYNCED_KEY = 'epsa_sb_synced';
const PENDING_DELETE_KEY = 'epsa_sb_pending_deletes';
const ID_MAP_KEY = 'epsa_sb_id_map';

function loadIdMap() {
  try { return JSON.parse(localStorage.getItem(ID_MAP_KEY) || '{}'); } catch { return {}; }
}
function saveIdMap(m) { localStorage.setItem(ID_MAP_KEY, JSON.stringify(m)); }

function loadSynced() {
  try { return JSON.parse(localStorage.getItem(SYNCED_KEY) || '{}'); } catch { return {}; }
}
function markSynced(sessions) {
  const m = loadSynced();
  const now = new Date().toISOString();
  for (const s of sessions) m[syncKey(s)] = now;
  localStorage.setItem(SYNCED_KEY, JSON.stringify(m));
}

export function getSyncedKeys() {
  return new Set(Object.keys(loadSynced()));
}

function loadPendingDeletes() {
  try { return JSON.parse(localStorage.getItem(PENDING_DELETE_KEY) || '{}'); } catch { return {}; }
}
function savePendingDeletes(m) { localStorage.setItem(PENDING_DELETE_KEY, JSON.stringify(m)); }

export function getPendingDeleteCount() {
  return Object.keys(loadPendingDeletes()).length;
}

export function syncKey(session) {
  return session.sessionRef ?? session.id;
}

async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 24);
}

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

export function isPushable(session) {
  return session.consented !== false;
}

// ---------------------------------------------------------------------------
// De-identification (HIPAA Safe Harbor — age > 89 → 89)
// ---------------------------------------------------------------------------

function deidentify(session, cloudId) {
  const clean = normaliseSession(session);
  const formData = (() => {
    if (!clean.formData) return clean.formData;
    const age = Number(clean.formData.age);
    return Number.isFinite(age) && age > 89 ? { ...clean.formData, age: 89 } : clean.formData;
  })();
  return { ...clean, formData, step1: formData, id: cloudId, sessionRef: session.sessionRef ?? null, createdAt: session.createdAt ?? null };
}

function buildRow(session, cloudId) {
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
    age: f.age != null ? Number(f.age) : null,
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
    shim_q1: Array.isArray(f.shim) ? (f.shim[0] ?? null) : null,
    tier_key: r.epsaTierKey ?? null,
    tier_label: r.epsaTierLabel ?? null,
    display_range: r.displayRange ?? null,
    psa: s2.psa != null ? Number(s2.psa) : null,
    pirads: s2.pirads != null ? String(s2.pirads) : null,
    on_hormonal_therapy: s2.onHormonalTherapy ?? false,
    consented: session.consented ?? null,
    full_record: deidentify(session, cloudId),
  };
}

// ---------------------------------------------------------------------------
// Push / pull
// ---------------------------------------------------------------------------

async function flushPendingDeletes(sb) {
  const pending = loadPendingDeletes();
  const ids = [...new Set(Object.values(pending).flat())];
  if (!ids.length) return 0;
  await sb.from('clinical_sessions').delete().in('id', ids);
  localStorage.removeItem(PENDING_DELETE_KEY);
  return Object.keys(pending).length;
}

export async function pushSessions(sessions) {
  sessions = sessions.filter(isPushable);
  if (!sessions.length && !getPendingDeleteCount()) return { pushed: 0, deleted: 0 };

  const sb = getClient();
  const deleted = await flushPendingDeletes(sb);
  if (!sessions.length) return { pushed: 0, deleted };

  const idMap = loadIdMap();
  await Promise.all(sessions.map(async s => {
    if (!idMap[s.id]) idMap[s.id] = await sha256hex(syncKey(s));
  }));
  saveIdMap(idMap);

  const rows = sessions.map(s => buildRow(s, idMap[s.id]));
  const { error } = await sb.from('clinical_sessions').upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(error.message);

  markSynced(sessions);
  return { pushed: rows.length, deleted };
}

export async function pullSessions() {
  const sb = getClient();
  await flushPendingDeletes(sb);

  const { data, error } = await sb
    .from('clinical_sessions')
    .select('id, full_record')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const idMap = loadIdMap();
  const cloudToLocal = Object.fromEntries(Object.entries(idMap).map(([l, c]) => [c, l]));

  let dirty = false;
  const sessions = [];
  for (const row of data ?? []) {
    if (!row.full_record) continue;
    const entry = typeof row.full_record === 'string' ? JSON.parse(row.full_record) : row.full_record;
    const localId = cloudToLocal[row.id] ?? row.id;
    if (!cloudToLocal[row.id]) { idMap[localId] = row.id; dirty = true; }
    sessions.push({ ...entry, id: localId });
  }

  if (dirty) saveIdMap(idMap);
  markSynced(sessions);
  return sessions;
}

export async function pullSessionByRef(sessionRef) {
  const sb = getClient();
  const { data, error } = await sb
    .from('clinical_sessions')
    .select('full_record')
    .eq('session_ref', sessionRef)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.full_record) return null;
  return typeof data.full_record === 'string' ? JSON.parse(data.full_record) : data.full_record;
}
