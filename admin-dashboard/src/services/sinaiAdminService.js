/**
 * sinaiAdminService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin wrappers around the backend's Sinai admin callables.
 * The dashboard reads sinaiSessions / clinicCodes directly via Firestore
 * (admin rules permit read), but all mutating operations go through
 * Cloud Functions so admin actions are audited server-side.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { adminFunctions, adminDb } from '../config/adminFirebase';

const call = (name, payload) => httpsCallable(adminFunctions, name)(payload).then((r) => r.data);

// ── Sinai sessions ─────────────────────────────────────────────────────────

export const listSinaiSessions = (params) =>
  call('adminListSinaiSessions', params || {});

export const getSinaiSession = (sessionId) =>
  call('adminGetSinaiSession', { sessionId });

export const submitSessionToRedcap = (sessionId) =>
  call('adminSubmitSinaiSession', { sessionId });

export const deleteSinaiSession = (sessionId, reason) =>
  call('adminDeleteSinaiSession', { sessionId, reason });

export const markCodeImported = (code, redcapRecordId, notes) =>
  call('markCodeImported', { code, redcapRecordId, notes });

// ── Public-cohort sessions (sessions/* + users/{uid}, researchConsent=true) ──

export const listPublicConsentedSessions = (params) =>
  call('adminListPublicConsentedSessions', params || {});

export const getPublicSession = (sessionId) =>
  call('adminGetPublicSession', { sessionId });

export const resyncPublicSession = (sessionId) =>
  call('adminResyncPublicSession', { sessionId });

/**
 * Admin-attested promotion of a public-consented session into the Sinai cohort.
 *
 * Payload:
 *   sessionId               — public session ID being linked
 *   clinicCode              — normalized or dashed; backend normalizes
 *   consentMethod           — 'verbal' | 'written' | 'paper' | 'electronic'
 *   consentTimestampMillis  — when the patient gave consent (must be ≤ now)
 *   consentAttestor         — who confirmed (defaults to admin email server-side)
 *   consentNotes            — required, ≥10 chars
 *   consentAttachmentRef    — optional Firebase Storage path
 *   adminAttestation        — must be true (the "I attest..." checkbox)
 *
 * Returns: { ok, sinaiSessionId, publicSessionId, clinicCode }
 */
export const linkPublicSessionToSinai = (payload) =>
  call('adminLinkPublicSessionToSinai', payload);

// ── Clinic codes ───────────────────────────────────────────────────────────

export const generateClinicCodes = (count, expiresInDays) =>
  call('adminGenerateClinicCodes', { count, expiresInDays });

export const revokeClinicCode = (code, reason) =>
  call('adminRevokeClinicCode', { code, reason });

// ── Audit log ──────────────────────────────────────────────────────────────

export const listClinicCodeAuditLog = (params) =>
  call('adminListClinicCodeAuditLog', params || {});

// ── Patient roster ─────────────────────────────────────────────────────────

/**
 * Enroll a new study participant and auto-assign a clinic code.
 * Returns: { ok, participantId, clinicCode }
 */
export const enrollPatient = (participantId, notes) =>
  call('adminEnrollPatient', { participantId, ...(notes ? { notes } : {}) });

/**
 * List enrolled patients, newest first.
 * params: { status?, limit?, startAfterParticipantId? }
 */
export const listPatients = (params) =>
  call('adminListPatients', params || {});

/**
 * Admin manually enters ePSA data for a patient (paper intake / bedside).
 * payload: { participantId, step1, result, step2?, finalCategory?,
 *            finalScore?, pathwayMode?, enrollmentNotes? }
 */
export const createSinaiSessionForPatient = (payload) =>
  call('adminCreateSinaiSessionForPatient', payload);

// ── Feature flag ───────────────────────────────────────────────────────────

export const toggleSinaiRedcapEnabled = (enabled) =>
  call('adminToggleSinaiRedcapEnabled', { enabled });

export async function readSinaiConfig() {
  try {
    const snap = await getDoc(doc(adminDb, 'appConfig', 'sinai'));
    if (!snap.exists()) return { redcapEnabled: false, updatedAt: null, updatedBy: null };
    const data = snap.data() || {};
    return {
      redcapEnabled: data.redcapEnabled === true,
      updatedAt: data.updatedAt?.toMillis?.() ?? null,
      updatedBy: data.updatedBy ?? null,
    };
  } catch (err) {
    console.error('readSinaiConfig failed:', err);
    return { redcapEnabled: false, updatedAt: null, updatedBy: null };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function formatCode(rawNormalized) {
  if (!rawNormalized) return '';
  const cleaned = String(rawNormalized).replace(/-/g, '').toUpperCase();
  const groups = [];
  for (let i = 0; i < cleaned.length; i += 4) groups.push(cleaned.slice(i, i + 4));
  return groups.join('-');
}

export function buildCsvFromRecord(record) {
  const keys = Object.keys(record);
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return `${keys.join(',')}\n${keys.map((k) => escape(record[k])).join(',')}\n`;
}

export function downloadFile(filename, content, mime = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
