/**
 * SinaiResearch.jsx
 * ─────────────────────────────────────────────────────────────────────────
 * Admin dashboard page for the Mount Sinai clinic-cohort flow.
 *
 * Four sub-tabs:
 *   - Sessions    : live list of sinaiSessions/* with per-row actions
 *   - Codes       : clinic code roster (generate, revoke)
 *   - Audit Log   : code lifecycle + admin action audit
 *   - Settings    : REDCap live-mode toggle + config status
 *
 * All mutating actions go through Cloud Functions so each one is
 * audited server-side (adminAccessLog + clinicCodeAuditLog).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlaskConical, FileText, ListChecks, ClipboardList, Settings,
  RefreshCw, CheckCircle2, AlertTriangle, AlertCircle, Clock,
  Download, Upload, Trash2, ShieldOff, X, Plus, Loader2, Copy,
  ToggleLeft, ToggleRight, Search, Building, Globe, Cloud, RotateCw, Link2,
  UserPlus, Users, ClipboardPen,
} from 'lucide-react';
import { collection, getDocs, query, orderBy, limit as fsLimit } from 'firebase/firestore';
import { adminDb } from '../../config/adminFirebase';
import {
  listSinaiSessions, getSinaiSession, submitSessionToRedcap,
  deleteSinaiSession, markCodeImported,
  listPublicConsentedSessions, getPublicSession, resyncPublicSession,
  linkPublicSessionToSinai,
  generateClinicCodes, revokeClinicCode,
  listClinicCodeAuditLog, toggleSinaiRedcapEnabled, readSinaiConfig,
  enrollPatient, listPatients, createSinaiSessionForPatient,
  formatCode, buildCsvFromRecord, downloadFile,
} from '../../services/sinaiAdminService';
import './SinaiResearch.css';

const SUBTABS = [
  { id: 'patients', label: 'Patients',  Icon: Users },
  { id: 'sessions', label: 'Sessions',  Icon: ListChecks },
  { id: 'codes',    label: 'Codes',     Icon: FileText },
  { id: 'audit',    label: 'Audit Log', Icon: ClipboardList },
  { id: 'settings', label: 'Settings',  Icon: Settings },
];

const STATUS_LABELS = {
  pending:            { label: 'Pending REDCap',    color: 'amber',  Icon: Clock },
  submitted_redcap:   { label: 'In REDCap',         color: 'green',  Icon: CheckCircle2 },
  imported_manually:  { label: 'Imported manually', color: 'blue',   Icon: CheckCircle2 },
  redcap_error:       { label: 'REDCap error',      color: 'red',    Icon: AlertCircle },
};

const fmtDate = (millis) => millis ? new Date(millis).toLocaleString() : '—';
const fmtShort = (millis) => millis ? new Date(millis).toLocaleDateString() : '—';

// ─────────────────────────────────────────────────────────────────────────
// Top-level component
// ─────────────────────────────────────────────────────────────────────────

const SinaiResearch = () => {
  const [subtab, setSubtab] = useState('patients');
  const [config, setConfig] = useState({ redcapEnabled: false, updatedAt: null, updatedBy: null });

  useEffect(() => { readSinaiConfig().then(setConfig); }, []);

  return (
    <div className="sinai-research">
      <header className="sr-header">
        <div className="sr-header-title">
          <div className="sr-header-icon"><Building size={22} /></div>
          <div>
            <h2>Mount Sinai Research</h2>
            <p>Clinic-cohort sessions, codes, and REDCap integration · IRB STUDY-14-00050</p>
          </div>
        </div>
        <div className={`sr-flag-pill ${config.redcapEnabled ? 'sr-flag-pill--on' : 'sr-flag-pill--off'}`}>
          {config.redcapEnabled
            ? (<><ToggleRight size={14} /> Live REDCap submission ENABLED</>)
            : (<><ToggleLeft size={14} /> Live REDCap submission OFF — sessions queue for admin</>)}
        </div>
      </header>

      <nav className="sr-tabs" role="tablist">
        {SUBTABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`sr-tab ${subtab === id ? 'sr-tab--active' : ''}`}
            onClick={() => setSubtab(id)}
            role="tab"
            aria-selected={subtab === id}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="sr-body">
        {subtab === 'patients' && <PatientsTab />}
        {subtab === 'sessions' && <SessionsTab />}
        {subtab === 'codes'    && <CodesTab />}
        {subtab === 'audit'    && <AuditTab />}
        {subtab === 'settings' && <SettingsTab config={config} onChange={setConfig} />}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Patients tab — study participant roster
// ─────────────────────────────────────────────────────────────────────────

const PATIENT_STATUS_LABELS = {
  enrolled:          { label: 'Enrolled — awaiting ePSA', color: 'amber',  Icon: Clock },
  completed:         { label: 'ePSA completed',            color: 'blue',   Icon: CheckCircle2 },
  submitted_redcap:  { label: 'In REDCap',                 color: 'green',  Icon: CheckCircle2 },
  imported_manually: { label: 'Imported manually',         color: 'blue',   Icon: CheckCircle2 },
  redcap_error:      { label: 'REDCap error',              color: 'red',    Icon: AlertCircle },
};

const PatientsTab = () => {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionMsg, setActionMsg] = useState(null);
  const [showEnroll, setShowEnroll] = useState(false);
  const [selected, setSelected] = useState(null); // patient for manual results entry

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listPatients({ status: statusFilter === 'all' ? undefined : statusFilter, limit: 200 });
      setPatients(res.patients || []);
    } catch (err) {
      setError(err?.message || 'Failed to load patients.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) =>
      p.participantId.toLowerCase().includes(q) ||
      (p.clinicCode || '').toLowerCase().includes(q) ||
      (p.notes || '').toLowerCase().includes(q)
    );
  }, [patients, searchTerm]);

  return (
    <>
      {actionMsg && (
        <div className={`sr-banner sr-banner--${actionMsg.kind}`}>
          {actionMsg.kind === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{actionMsg.text}</span>
          <button onClick={() => setActionMsg(null)} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}

      <div className="sr-toolbar">
        <div className="sr-toolbar-left">
          <div className="sr-search">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search by participant ID, clinic code, or notes"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select className="sr-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="enrolled">Enrolled — awaiting ePSA</option>
            <option value="completed">ePSA completed</option>
            <option value="submitted_redcap">In REDCap</option>
            <option value="imported_manually">Imported manually</option>
            <option value="redcap_error">REDCap error</option>
          </select>
        </div>
        <div className="sr-toolbar-right">
          <button className="sr-btn-ghost" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'sr-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button className="sr-btn-primary" onClick={() => setShowEnroll(true)}>
            <UserPlus size={14} /> <span>Enroll patient</span>
          </button>
        </div>
      </div>

      {error && <div className="sr-banner sr-banner--error"><AlertCircle size={16} /><span>{error}</span></div>}

      <div className="sr-table-wrap">
        <table className="sr-table">
          <thead>
            <tr>
              <th>Participant ID</th>
              <th>Status</th>
              <th>Clinic code</th>
              <th>Enrolled</th>
              <th>Enrolled by</th>
              <th>REDCap ID</th>
              <th>Notes</th>
              <th aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading && (
              <tr><td colSpan={8} className="sr-empty">No patients match these filters.</td></tr>
            )}
            {filtered.map((p) => {
              const cfg = PATIENT_STATUS_LABELS[p.status] || PATIENT_STATUS_LABELS.enrolled;
              return (
                <tr key={p.participantId}>
                  <td><code className="sr-code-soft">{p.participantId}</code></td>
                  <td>
                    <span className={`sr-status sr-status--${cfg.color}`}>
                      <cfg.Icon size={12} /> {cfg.label}
                    </span>
                  </td>
                  <td>
                    <span className="sr-code-cell">
                      <code className="sr-code">{formatCode(p.clinicCode)}</code>
                      <button
                        type="button"
                        className="sr-copy-btn"
                        title="Copy"
                        onClick={() => navigator.clipboard?.writeText(formatCode(p.clinicCode))}
                      >
                        <Copy size={12} />
                      </button>
                    </span>
                  </td>
                  <td>{fmtShort(p.enrolledAt)}</td>
                  <td className="sr-small">{p.enrolledBy || '—'}</td>
                  <td className="sr-mono">{p.redcapRecordId || '—'}</td>
                  <td className="sr-small" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.notes || '—'}
                  </td>
                  <td>
                    {p.status === 'enrolled' && (
                      <button
                        className="sr-btn-row"
                        onClick={() => setSelected(p)}
                        title="Enter ePSA results manually"
                      >
                        <ClipboardPen size={12} style={{ marginRight: 4 }} />
                        Enter results
                      </button>
                    )}
                    {p.status !== 'enrolled' && p.sessionId && (
                      <span className="sr-small" style={{ color: '#64748b', fontSize: 11 }}>
                        session {p.sessionId.slice(0, 8)}…
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="sr-table-footer">
        <span className="sr-table-meta">
          {filtered.length} patient{filtered.length === 1 ? '' : 's'} shown · {patients.length} total enrolled
        </span>
      </div>

      {showEnroll && (
        <EnrollPatientModal
          onClose={() => setShowEnroll(false)}
          onEnrolled={(msg) => { setActionMsg(msg); setShowEnroll(false); load(); }}
        />
      )}

      {selected && (
        <ManualResultsModal
          patient={selected}
          onClose={() => setSelected(null)}
          onSaved={(msg) => { setActionMsg(msg); setSelected(null); load(); }}
        />
      )}
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Enroll patient modal
// ─────────────────────────────────────────────────────────────────────────

const EnrollPatientModal = ({ onClose, onEnrolled }) => {
  const [participantId, setParticipantId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const handleEnroll = async () => {
    setError(null);
    const id = participantId.trim();
    if (!id) { setError('Participant ID is required.'); return; }
    if (!/^[A-Za-z0-9_\-]{2,64}$/.test(id)) {
      setError('Participant ID must be 2–64 characters: letters, numbers, hyphens, underscores only.');
      return;
    }
    setBusy(true);
    try {
      const res = await enrollPatient(id, notes.trim() || undefined);
      setResult(res);
    } catch (err) {
      setError(err?.message || 'Failed to enroll patient.');
    } finally {
      setBusy(false);
    }
  };

  const handleDone = () => {
    onEnrolled({
      kind: 'success',
      text: `Patient ${result.participantId} enrolled. Code: ${result.clinicCode}`,
    });
  };

  return (
    <div className="sr-modal-root" role="dialog" aria-modal="true">
      <div className="sr-modal-backdrop" onClick={result ? handleDone : onClose} />
      <div className="sr-modal-panel">
        <header className="sr-modal-header">
          <div>
            <h3>Enroll study participant</h3>
            <p className="sr-modal-sub">A clinic code will be generated and reserved for this participant.</p>
          </div>
          <button type="button" className="sr-modal-close" onClick={result ? handleDone : onClose}><X size={16} /></button>
        </header>

        {!result && (
          <div className="sr-modal-body">
            {error && (
              <div className="sr-banner sr-banner--error" style={{ marginBottom: 12 }}>
                <AlertCircle size={16} /><span>{error}</span>
              </div>
            )}
            <div className="sr-form-row">
              <label>Participant ID <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                type="text"
                value={participantId}
                onChange={(e) => setParticipantId(e.target.value)}
                placeholder="e.g. PSA-2024-001"
                disabled={busy}
                style={{ fontFamily: '"SF Mono", Menlo, Consolas, monospace' }}
              />
            </div>
            <p className="sr-modal-help" style={{ marginTop: -6, marginBottom: 10 }}>
              Use your study's de-identified ID scheme. No names or MRNs.
            </p>
            <div className="sr-form-row" style={{ alignItems: 'flex-start' }}>
              <label style={{ paddingTop: 8 }}>Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional — coordinator notes, enrollment context, etc."
                rows={3}
                disabled={busy}
                maxLength={500}
                style={{
                  flex: 1, padding: '7px 10px', fontSize: 13,
                  border: '1px solid #cbd5e1', borderRadius: 8,
                  background: '#fff', outline: 'none', resize: 'vertical', fontFamily: 'inherit',
                }}
              />
            </div>
          </div>
        )}

        {result && (
          <div className="sr-modal-body">
            <div className="sr-banner sr-banner--success" style={{ marginBottom: 16 }}>
              <CheckCircle2 size={16} />
              <span>Patient enrolled successfully.</span>
            </div>
            <div className="sr-detail-grid">
              <DetailField label="Participant ID" value={result.participantId} mono />
              <DetailField label="Status" value="Enrolled — awaiting ePSA" />
            </div>
            <div style={{ margin: '18px 0 6px', textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Assigned clinic code — give this to the patient</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <code style={{
                  fontSize: 28, letterSpacing: '0.15em', fontWeight: 700,
                  background: '#f1f5f9', padding: '10px 20px', borderRadius: 10,
                  fontFamily: '"SF Mono", Menlo, Consolas, monospace',
                }}>
                  {result.clinicCode}
                </code>
                <button
                  className="sr-copy-btn"
                  title="Copy code"
                  onClick={() => navigator.clipboard?.writeText(result.clinicCode)}
                  style={{ padding: 8 }}
                >
                  <Copy size={16} />
                </button>
              </div>
            </div>
            <p className="sr-modal-help" style={{ marginTop: 12, textAlign: 'center' }}>
              The patient will enter this code in the ePSA app to link their session,
              or you can enter their results manually from the Patients tab.
            </p>
          </div>
        )}

        <footer className="sr-modal-footer">
          <div className="sr-modal-footer-left" />
          <div className="sr-modal-footer-right">
            {!result && (
              <>
                <button className="sr-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
                <button className="sr-btn-primary" onClick={handleEnroll} disabled={busy || !participantId.trim()}>
                  {busy ? <Loader2 size={14} className="sr-spin" /> : <UserPlus size={14} />}
                  <span>Enroll &amp; generate code</span>
                </button>
              </>
            )}
            {result && (
              <button className="sr-btn-primary" onClick={handleDone}>Done</button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Manual results entry modal
// Three-step form: Step 1 data → Step 1 result → Step 2 (optional)
// ─────────────────────────────────────────────────────────────────────────

const RACE_OPTIONS = [
  { value: 'white',    label: 'White / Caucasian' },
  { value: 'black',    label: 'Black / African American' },
  { value: 'hispanic', label: 'Hispanic / Latino' },
  { value: 'asian',    label: 'Asian' },
  { value: 'other',    label: 'Other / Unknown' },
];

const BRCA_OPTIONS = [
  { value: 'none',    label: 'None known' },
  { value: 'BRCA1',   label: 'BRCA1 carrier' },
  { value: 'BRCA2',   label: 'BRCA2 carrier' },
  { value: 'unknown', label: 'Unknown' },
];

const DIET_OPTIONS = [
  { value: 'western',      label: 'Western (high fat, processed)' },
  { value: 'mediterranean', label: 'Mediterranean' },
  { value: 'vegetarian',   label: 'Vegetarian / Vegan' },
  { value: 'other',        label: 'Other / Unknown' },
];

const RISK_OPTIONS = [
  { value: 'low',       label: 'Low' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'high',      label: 'High' },
  { value: 'very_high', label: 'Very High' },
];

const PIRADS_OPTIONS = ['1', '2', '3', '4', '5'];

const BinaryToggle = ({ label, value, onChange, disabled }) => (
  <div className="sr-form-row" style={{ alignItems: 'center' }}>
    <label>{label}</label>
    <div style={{ display: 'flex', gap: 8 }}>
      {[{ v: 1, l: 'Yes' }, { v: 0, l: 'No' }].map(({ v, l }) => (
        <button
          key={v}
          type="button"
          disabled={disabled}
          onClick={() => onChange(v)}
          style={{
            padding: '5px 16px', fontSize: 13, borderRadius: 6, cursor: 'pointer',
            border: '1px solid',
            borderColor: value === v ? '#6366f1' : '#cbd5e1',
            background: value === v ? '#eef2ff' : '#fff',
            color: value === v ? '#4338ca' : '#334155',
            fontWeight: value === v ? 600 : 400,
          }}
        >
          {l}
        </button>
      ))}
    </div>
  </div>
);

const NumInput = ({ label, value, onChange, disabled, min, max, placeholder, unit }) => (
  <div className="sr-form-row">
    <label>{label}</label>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        disabled={disabled}
        min={min}
        max={max}
        placeholder={placeholder}
        style={{ width: 120 }}
      />
      {unit && <span style={{ fontSize: 13, color: '#94a3b8' }}>{unit}</span>}
    </div>
  </div>
);

const SelectInput = ({ label, value, onChange, options, disabled }) => (
  <div className="sr-form-row">
    <label>{label}</label>
    <select className="sr-select" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} style={{ flex: 1 }}>
      <option value="">— select —</option>
      {options.map(({ value: v, label: l }) => <option key={v} value={v}>{l}</option>)}
    </select>
  </div>
);

const FORM_STEPS = ['Step 1 — Demographics & Risk', 'Step 1 Result', 'Step 2 — PSA & Imaging (optional)'];

const ManualResultsModal = ({ patient, onClose, onSaved }) => {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [enrollmentNotes, setEnrollmentNotes] = useState('');

  // ── Step 1 fields ──────────────────────────────────────────────────
  const [age, setAge] = useState('');
  const [race, setRace] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [weight, setWeight] = useState('');
  const [familyHistory, setFamilyHistory] = useState(0);
  const [inflammationHistory, setInflammationHistory] = useState(0);
  const [brcaStatus, setBrcaStatus] = useState('none');
  const [ipssTotal, setIpssTotal] = useState('');
  const [shimTotal, setShimTotal] = useState('');
  const [exercise, setExercise] = useState(0);
  const [smoking, setSmoking] = useState(0);
  const [chemicalExposure, setChemicalExposure] = useState(0);
  const [dietPattern, setDietPattern] = useState('');
  const [hypertension, setHypertension] = useState(0);
  const [hyperlipidemia, setHyperlipidemia] = useState(0);
  const [cad, setCad] = useState(0);
  const [diabetes, setDiabetes] = useState(0);

  // ── Step 1 result fields ───────────────────────────────────────────
  const [score, setScore] = useState('');
  const [risk, setRisk] = useState('');
  const [scoreRange, setScoreRange] = useState('');
  const [modelVersion, setModelVersion] = useState('');

  // ── Step 2 fields ──────────────────────────────────────────────────
  const [includeStep2, setIncludeStep2] = useState(false);
  const [knowPsa, setKnowPsa] = useState(true);
  const [psa, setPsa] = useState('');
  const [onHormonalTherapy, setOnHormonalTherapy] = useState(false);
  const [hormonalTherapyType, setHormonalTherapyType] = useState('');
  const [knowPirads, setKnowPirads] = useState(false);
  const [pirads, setPirads] = useState('');
  const [prostateVolume, setProstateVolume] = useState('');
  const [finalCategory, setFinalCategory] = useState('');
  const [finalScore, setFinalScore] = useState('');

  const validateStep = () => {
    setError(null);
    if (step === 0) {
      if (!age || Number(age) < 18 || Number(age) > 120) {
        setError('Age must be between 18 and 120.'); return false;
      }
      if (!race) { setError('Race is required.'); return false; }
    }
    if (step === 1) {
      if (score === '' || isNaN(Number(score))) {
        setError('Score is required.'); return false;
      }
      if (!risk) { setError('Risk level is required.'); return false; }
    }
    return true;
  };

  const buildPayload = () => {
    const bmi = (weight && heightFt !== '')
      ? (() => {
          const totalIn = (Number(heightFt) * 12) + Number(heightIn || 0);
          const kg = Number(weight) * 0.453592;
          const m = totalIn * 0.0254;
          return m > 0 ? Math.round((kg / (m * m)) * 10) / 10 : undefined;
        })()
      : undefined;

    const step1 = {
      age: Number(age),
      race,
      ...(heightFt !== '' ? { heightFt: Number(heightFt), heightIn: Number(heightIn || 0), heightUnit: 'ft' } : {}),
      ...(weight !== '' ? { weight: Number(weight), weightUnit: 'lbs', weightKg: Math.round(Number(weight) * 0.453592 * 10) / 10 } : {}),
      ...(bmi !== undefined ? { bmi } : {}),
      familyHistory,
      inflammationHistory,
      brcaStatus,
      ...(ipssTotal !== '' ? { ipss: Number(ipssTotal) } : {}),
      ...(shimTotal !== '' ? { shim: Number(shimTotal) } : {}),
      exercise,
      smoking,
      chemicalExposure,
      ...(dietPattern ? { dietPattern } : {}),
      hypertension,
      hyperlipidemia,
      coronaryArteryDisease: cad,
      diabetes,
      comorbidityScore: hypertension + hyperlipidemia + cad + diabetes,
    };

    const result = {
      score: Number(score),
      risk,
      ...(scoreRange ? { scoreRange } : {}),
      ...(modelVersion ? { modelVersion } : {}),
    };

    const step2 = includeStep2 ? {
      knowPsa,
      ...(knowPsa && psa !== '' ? { psa: String(psa) } : {}),
      onHormonalTherapy,
      ...(onHormonalTherapy && hormonalTherapyType ? { hormonalTherapyType } : {}),
      knowPirads,
      ...(knowPirads && pirads ? { pirads } : {}),
      ...(prostateVolume !== '' ? { prostateVolume: String(prostateVolume) } : {}),
    } : undefined;

    return {
      participantId: patient.participantId,
      step1,
      result,
      ...(step2 ? { step2 } : {}),
      pathwayMode: includeStep2 ? 'step1_and_step2' : 'step1_only',
      ...(finalCategory ? { finalCategory } : {}),
      ...(finalScore !== '' ? { finalScore: Number(finalScore) } : {}),
      ...(enrollmentNotes.trim() ? { enrollmentNotes: enrollmentNotes.trim() } : {}),
    };
  };

  const handleNext = () => {
    if (!validateStep()) return;
    setStep((s) => s + 1);
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;
    setBusy(true);
    setError(null);
    try {
      const payload = buildPayload();
      const res = await createSinaiSessionForPatient(payload);
      onSaved({
        kind: 'success',
        text: `Results saved for ${patient.participantId}.${res.redcapSubmitted ? ` Submitted to REDCap (record ${res.redcapRecordId}).` : ' Session pending REDCap submission.'}`,
      });
    } catch (err) {
      setError(err?.message || 'Failed to save results.');
      setBusy(false);
    }
  };

  return (
    <div className="sr-modal-root" role="dialog" aria-modal="true">
      <div className="sr-modal-backdrop" onClick={onClose} />
      <div className="sr-modal-panel sr-modal-panel--wide">
        <header className="sr-modal-header">
          <div>
            <h3>Enter ePSA results manually</h3>
            <p className="sr-modal-sub">
              Participant: <code className="sr-code-soft">{patient.participantId}</code>
              <span style={{ margin: '0 8px', color: '#cbd5e1' }}>·</span>
              Code: <code className="sr-code">{formatCode(patient.clinicCode)}</code>
            </p>
          </div>
          <button type="button" className="sr-modal-close" onClick={onClose}><X size={16} /></button>
        </header>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e2e8f0', padding: '0 18px' }}>
          {FORM_STEPS.map((label, i) => (
            <div
              key={i}
              style={{
                padding: '10px 16px', fontSize: 13, fontWeight: i === step ? 600 : 400,
                color: i === step ? '#6366f1' : i < step ? '#16a34a' : '#94a3b8',
                borderBottom: i === step ? '2px solid #6366f1' : '2px solid transparent',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {i < step && <CheckCircle2 size={13} />}
              {label}
            </div>
          ))}
        </div>

        {error && (
          <div className="sr-banner sr-banner--error" style={{ margin: '12px 18px 0' }}>
            <AlertCircle size={16} /><span>{error}</span>
          </div>
        )}

        <div className="sr-modal-body">
          {/* ── STEP 0: Demographics & risk factors ── */}
          {step === 0 && (
            <div>
              <NumInput label="Age *" value={age} onChange={setAge} min={18} max={120} placeholder="e.g. 65" unit="years" />
              <SelectInput label="Race *" value={race} onChange={setRace} options={RACE_OPTIONS} />
              <div className="sr-form-row">
                <label>Height</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
                  <input type="number" value={heightFt} onChange={(e) => setHeightFt(e.target.value)} placeholder="ft" min={3} max={8} style={{ width: 70 }} />
                  <span style={{ fontSize: 13, color: '#94a3b8' }}>ft</span>
                  <input type="number" value={heightIn} onChange={(e) => setHeightIn(e.target.value)} placeholder="in" min={0} max={11} style={{ width: 70 }} />
                  <span style={{ fontSize: 13, color: '#94a3b8' }}>in</span>
                </div>
              </div>
              <NumInput label="Weight" value={weight} onChange={setWeight} min={50} max={700} placeholder="e.g. 185" unit="lbs" />
              <SelectInput label="Diet pattern" value={dietPattern} onChange={setDietPattern} options={DIET_OPTIONS} />
              <SelectInput label="BRCA status" value={brcaStatus} onChange={setBrcaStatus} options={BRCA_OPTIONS} />
              <NumInput label="IPSS total score" value={ipssTotal} onChange={setIpssTotal} min={0} max={35} placeholder="0–35" />
              <NumInput label="SHIM total score" value={shimTotal} onChange={setShimTotal} min={0} max={25} placeholder="0–25" />

              <p style={{ fontSize: 12, fontWeight: 600, color: '#475569', margin: '14px 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk factors</p>
              <BinaryToggle label="Family history of prostate cancer" value={familyHistory} onChange={setFamilyHistory} />
              <BinaryToggle label="History of prostate inflammation" value={inflammationHistory} onChange={setInflammationHistory} />
              <BinaryToggle label="Regular vigorous exercise" value={exercise} onChange={setExercise} />
              <BinaryToggle label="Current / former smoker" value={smoking} onChange={setSmoking} />
              <BinaryToggle label="Chemical / pesticide exposure" value={chemicalExposure} onChange={setChemicalExposure} />

              <p style={{ fontSize: 12, fontWeight: 600, color: '#475569', margin: '14px 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Comorbidities</p>
              <BinaryToggle label="Hypertension" value={hypertension} onChange={setHypertension} />
              <BinaryToggle label="Hyperlipidemia" value={hyperlipidemia} onChange={setHyperlipidemia} />
              <BinaryToggle label="Coronary artery disease" value={cad} onChange={setCad} />
              <BinaryToggle label="Diabetes" value={diabetes} onChange={setDiabetes} />
            </div>
          )}

          {/* ── STEP 1: Risk score result ── */}
          {step === 1 && (
            <div>
              <p className="sr-modal-help" style={{ marginBottom: 14 }}>
                Enter the ePSA Step 1 score as computed by the calculator.
              </p>
              <NumInput label="Score *" value={score} onChange={setScore} min={0} max={100} placeholder="e.g. 42" />
              <SelectInput label="Risk level *" value={risk} onChange={setRisk} options={RISK_OPTIONS} />
              <div className="sr-form-row">
                <label>Score range</label>
                <input type="text" value={scoreRange} onChange={(e) => setScoreRange(e.target.value)} placeholder="e.g. 35–50" style={{ flex: 1 }} />
              </div>
              <div className="sr-form-row">
                <label>Model version</label>
                <input type="text" value={modelVersion} onChange={(e) => setModelVersion(e.target.value)} placeholder="e.g. v2.1" style={{ flex: 1 }} />
              </div>
            </div>
          )}

          {/* ── STEP 2: PSA & imaging ── */}
          {step === 2 && (
            <div>
              <div className="sr-form-row" style={{ alignItems: 'center' }}>
                <label>Include Step 2 data?</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={includeStep2} onChange={(e) => setIncludeStep2(e.target.checked)} />
                  <span style={{ fontSize: 13 }}>Yes — patient had PSA / MRI data</span>
                </label>
              </div>

              {includeStep2 && (
                <>
                  <BinaryToggle label="PSA value known?" value={knowPsa ? 1 : 0} onChange={(v) => setKnowPsa(v === 1)} />
                  {knowPsa && (
                    <NumInput label="PSA value" value={psa} onChange={setPsa} min={0} max={200} placeholder="e.g. 4.5" unit="ng/mL" />
                  )}
                  <BinaryToggle label="On hormonal therapy?" value={onHormonalTherapy ? 1 : 0} onChange={(v) => setOnHormonalTherapy(v === 1)} />
                  {onHormonalTherapy && (
                    <div className="sr-form-row">
                      <label>Therapy type</label>
                      <input type="text" value={hormonalTherapyType} onChange={(e) => setHormonalTherapyType(e.target.value)} placeholder="e.g. ADT, finasteride" style={{ flex: 1 }} />
                    </div>
                  )}
                  <BinaryToggle label="PI-RADS score known?" value={knowPirads ? 1 : 0} onChange={(v) => setKnowPirads(v === 1)} />
                  {knowPirads && (
                    <SelectInput label="PI-RADS score" value={pirads} onChange={setPirads} options={PIRADS_OPTIONS.map((v) => ({ value: v, label: `PI-RADS ${v}` }))} />
                  )}
                  <NumInput label="Prostate volume" value={prostateVolume} onChange={setProstateVolume} min={0} max={500} placeholder="e.g. 40" unit="mL" />

                  <p style={{ fontSize: 12, fontWeight: 600, color: '#475569', margin: '14px 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Final result</p>
                  <div className="sr-form-row">
                    <label>Final category</label>
                    <input type="text" value={finalCategory} onChange={(e) => setFinalCategory(e.target.value)} placeholder="e.g. Consider biopsy" style={{ flex: 1 }} />
                  </div>
                  <NumInput label="Final score" value={finalScore} onChange={setFinalScore} min={0} max={100} placeholder="e.g. 68" />
                </>
              )}

              <p style={{ fontSize: 12, fontWeight: 600, color: '#475569', margin: '14px 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Enrollment notes</p>
              <div className="sr-form-row" style={{ alignItems: 'flex-start' }}>
                <label style={{ paddingTop: 8 }}>Notes</label>
                <textarea
                  value={enrollmentNotes}
                  onChange={(e) => setEnrollmentNotes(e.target.value)}
                  placeholder="How the session was collected, any deviations from protocol, etc."
                  rows={3}
                  maxLength={1000}
                  style={{
                    flex: 1, padding: '7px 10px', fontSize: 13,
                    border: '1px solid #cbd5e1', borderRadius: 8,
                    background: '#fff', outline: 'none', resize: 'vertical', fontFamily: 'inherit',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <footer className="sr-modal-footer">
          <div className="sr-modal-footer-left">
            {step > 0 && (
              <button className="sr-btn-ghost" onClick={() => { setError(null); setStep((s) => s - 1); }} disabled={busy}>
                ← Back
              </button>
            )}
          </div>
          <div className="sr-modal-footer-right">
            <button className="sr-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            {step < FORM_STEPS.length - 1 && (
              <button className="sr-btn-primary" onClick={handleNext}>
                Next →
              </button>
            )}
            {step === FORM_STEPS.length - 1 && (
              <button className="sr-btn-primary" onClick={handleSubmit} disabled={busy}>
                {busy ? <Loader2 size={14} className="sr-spin" /> : <CheckCircle2 size={14} />}
                <span>Save results</span>
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Sessions tab — unified view of Sinai + Public-consented research sessions
// ─────────────────────────────────────────────────────────────────────────

const PUBLIC_SYNC_LABELS = {
  synced:   { label: 'In REDCap',  color: 'green', Icon: CheckCircle2 },
  unsynced: { label: 'Awaiting',   color: 'amber', Icon: Clock },
  error:    { label: 'REDCap err', color: 'red',   Icon: AlertCircle },
};

const SessionsTab = () => {
  const [sinaiSessions, setSinaiSessions] = useState([]);
  const [publicSessions, setPublicSessions] = useState([]);
  const [cohortFilter, setCohortFilter] = useState('all'); // all | sinai | public
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const tasks = [];
    if (cohortFilter !== 'public') {
      tasks.push(
        listSinaiSessions({ status: statusFilter === 'all' ? 'all' : statusFilter, limit: 100 })
          .then((res) => setSinaiSessions(res.sessions || []))
          .catch((err) => setError((prev) => prev || err?.message || 'Failed to load Sinai sessions.'))
      );
    } else {
      setSinaiSessions([]);
    }
    if (cohortFilter !== 'sinai') {
      const syncStatus =
        statusFilter === 'submitted_redcap' ? 'synced'
        : statusFilter === 'pending' || statusFilter === 'imported_manually' ? 'unsynced'
        : statusFilter === 'redcap_error' ? 'error'
        : 'all';
      tasks.push(
        listPublicConsentedSessions({ syncStatus, limit: 100 })
          .then((res) => setPublicSessions(res.sessions || []))
          .catch((err) => setError((prev) => prev || err?.message || 'Failed to load public sessions.'))
      );
    } else {
      setPublicSessions([]);
    }
    await Promise.allSettled(tasks);
    setLoading(false);
  }, [cohortFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Merge + sort the two lists into a unified, badged display
  const unified = useMemo(() => {
    const sinaiRows = sinaiSessions.map((s) => ({
      cohort: 'sinai',
      key: `sinai:${s.sessionId}`,
      sessionId: s.sessionId,
      sortMillis: s.createdAtMillis,
      raw: s,
    }));
    const publicRows = publicSessions.map((s) => ({
      cohort: 'public',
      key: `public:${s.sessionId}`,
      sessionId: s.sessionId,
      sortMillis: s.createdAtMillis,
      raw: s,
    }));
    const all = [...sinaiRows, ...publicRows].sort((a, b) => (b.sortMillis || 0) - (a.sortMillis || 0));

    const q = searchTerm.trim().toLowerCase();
    if (!q) return all;
    return all.filter((row) => {
      const r = row.raw;
      return (
        row.sessionId.toLowerCase().includes(q) ||
        (r.clinicCode || '').toLowerCase().includes(q) ||
        (r.userIdPrefix || '').toLowerCase().includes(q) ||
        (r.redcapRecordId || '').toLowerCase().includes(q)
      );
    });
  }, [sinaiSessions, publicSessions, searchTerm]);

  return (
    <>
      {actionMsg && (
        <div className={`sr-banner sr-banner--${actionMsg.kind}`}>
          {actionMsg.kind === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{actionMsg.text}</span>
          <button onClick={() => setActionMsg(null)} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}

      {/* Cohort filter chips */}
      <div className="sr-cohort-bar">
        {[
          { id: 'all',    label: 'All cohorts',           Icon: ListChecks },
          { id: 'sinai',  label: 'Mount Sinai',           Icon: Building },
          { id: 'public', label: 'Public · Consented',    Icon: Globe },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`sr-cohort-chip ${cohortFilter === id ? `sr-cohort-chip--active sr-cohort-chip--${id}` : ''}`}
            onClick={() => setCohortFilter(id)}
          >
            <Icon size={14} />
            <span>{label}</span>
            <span className="sr-cohort-chip-count">
              {id === 'all'    ? unified.length
                : id === 'sinai'  ? sinaiSessions.length
                : publicSessions.length}
            </span>
          </button>
        ))}
      </div>

      <div className="sr-toolbar">
        <div className="sr-toolbar-left">
          <div className="sr-search">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search by session ID, clinic code, user prefix, or REDCap record"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="sr-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending REDCap</option>
            <option value="submitted_redcap">In REDCap</option>
            <option value="imported_manually">Imported manually</option>
            <option value="redcap_error">REDCap error</option>
          </select>
        </div>
        <button className="sr-btn-ghost" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'sr-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {error && <div className="sr-banner sr-banner--error"><AlertCircle size={16} /><span>{error}</span></div>}

      <div className="sr-table-wrap">
        <table className="sr-table">
          <thead>
            <tr>
              <th>Cohort</th>
              <th>Status</th>
              <th>Source</th>
              <th>Created</th>
              <th>Pathway</th>
              <th>Risk</th>
              <th>REDCap ID</th>
              <th aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {unified.length === 0 && !loading && (
              <tr><td colSpan={8} className="sr-empty">No sessions match these filters.</td></tr>
            )}
            {unified.map((row) => {
              const r = row.raw;
              if (row.cohort === 'sinai') {
                const cfg = STATUS_LABELS[r.status] || STATUS_LABELS.pending;
                return (
                  <tr key={row.key}>
                    <td><CohortBadge cohort="sinai" /></td>
                    <td>
                      <span className={`sr-status sr-status--${cfg.color}`}>
                        <cfg.Icon size={12} /> {cfg.label}
                      </span>
                    </td>
                    <td>
                      <code className="sr-code">{formatCode(r.clinicCode)}</code>
                    </td>
                    <td>{fmtShort(r.createdAtMillis)}</td>
                    <td className="sr-mono">{r.pathwayMode}</td>
                    <td>
                      {r.finalCategory ? <span>{r.finalCategory}</span>
                        : r.finalScore !== undefined ? <span>score {r.finalScore}</span>
                        : '—'}
                    </td>
                    <td className="sr-mono">{r.redcapRecordId || '—'}</td>
                    <td>
                      <button className="sr-btn-row" onClick={() => setSelected({ cohort: 'sinai', raw: r })}>View</button>
                    </td>
                  </tr>
                );
              }
              // public row
              const syncKey =
                r.redcapSyncError ? 'error'
                : r.redcapSynced ? 'synced'
                : 'unsynced';
              const cfg = PUBLIC_SYNC_LABELS[syncKey];
              return (
                <tr key={row.key}>
                  <td><CohortBadge cohort="public" linked={!!r.linkedToSinai} /></td>
                  <td>
                    <span className={`sr-status sr-status--${cfg.color}`}>
                      <cfg.Icon size={12} /> {cfg.label}
                    </span>
                  </td>
                  <td className="sr-small">
                    <code className="sr-code-soft">uid:{r.userIdPrefix}…</code>
                    {r.linkedToSinai && (
                      <div style={{ marginTop: 3, fontSize: 11, color: '#64748b' }}>
                        <Link2 size={10} style={{ verticalAlign: 'middle' }} />
                        {' '}linked → <code className="sr-code">{formatCode(r.linkedToSinai.clinicCode)}</code>
                      </div>
                    )}
                  </td>
                  <td>{fmtShort(r.createdAtMillis)}</td>
                  <td className="sr-mono">{r.pathwayMode || r.status}</td>
                  <td>
                    {r.finalCategory ? <span>{r.finalCategory}</span>
                      : r.finalScore !== null ? <span>score {r.finalScore}</span>
                      : '—'}
                  </td>
                  <td className="sr-mono">{r.redcapSynced ? row.sessionId.slice(0, 8) + '…' : '—'}</td>
                  <td>
                    <button className="sr-btn-row" onClick={() => setSelected({ cohort: 'public', raw: r })}>View</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="sr-table-footer">
        <span className="sr-table-meta">
          {unified.length} session{unified.length === 1 ? '' : 's'} shown
          {' · '}
          <span style={{ color: '#94a3b8' }}>
            {sinaiSessions.length} Sinai · {publicSessions.length} public
          </span>
        </span>
      </div>

      {selected?.cohort === 'sinai' && (
        <SessionDetailModal
          summary={selected.raw}
          onClose={() => setSelected(null)}
          onAction={(msg) => { setActionMsg(msg); setSelected(null); load(); }}
        />
      )}
      {selected?.cohort === 'public' && (
        <PublicSessionModal
          summary={selected.raw}
          onClose={() => setSelected(null)}
          onAction={(msg) => { setActionMsg(msg); setSelected(null); load(); }}
        />
      )}
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Cohort badge
// ─────────────────────────────────────────────────────────────────────────

const CohortBadge = ({ cohort, linked = false }) => {
  if (cohort === 'sinai') {
    return (
      <span className="sr-cohort-badge sr-cohort-badge--sinai" title="Mount Sinai cohort · IRB STUDY-14-00050">
        <Building size={11} /> <span>Mount Sinai</span>
      </span>
    );
  }
  if (linked) {
    return (
      <span className="sr-cohort-badge sr-cohort-badge--linked" title="Started public, later linked to a Mount Sinai clinic code">
        <Link2 size={11} /> <span>Linked → Sinai</span>
      </span>
    );
  }
  return (
    <span className="sr-cohort-badge sr-cohort-badge--public" title="Public cohort · researchConsent given">
      <Globe size={11} /> <span>Public · Consented</span>
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Session detail modal
// ─────────────────────────────────────────────────────────────────────────

const SessionDetailModal = ({ summary, onClose, onAction }) => {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // 'submit' | 'delete' | 'mark_imported'
  const [error, setError] = useState(null);

  // Mark imported form state
  const [importRecordId, setImportRecordId] = useState('');
  const [importNotes, setImportNotes] = useState('');
  const [showImportForm, setShowImportForm] = useState(false);

  // Delete form state
  const [deleteReason, setDeleteReason] = useState('');
  const [showDeleteForm, setShowDeleteForm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const full = await getSinaiSession(summary.sessionId);
        if (!cancelled) setDoc(full);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load session.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [summary.sessionId]);

  const handleSubmitToRedcap = async () => {
    setBusy('submit'); setError(null);
    try {
      const res = await submitSessionToRedcap(summary.sessionId);
      onAction({ kind: 'success', text: `Submitted to REDCap (record ${res.redcapRecordId})` });
    } catch (err) {
      setError(err?.message || 'REDCap submission failed.');
      setBusy(null);
    }
  };

  const handleMarkImported = async () => {
    if (!importRecordId.trim()) { setError('Please enter the REDCap record ID.'); return; }
    setBusy('mark_imported'); setError(null);
    try {
      await markCodeImported(summary.clinicCode, importRecordId.trim(), importNotes.trim() || null);
      onAction({ kind: 'success', text: `Marked as imported (REDCap record ${importRecordId.trim()})` });
    } catch (err) {
      setError(err?.message || 'Failed to mark as imported.');
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    setBusy('delete'); setError(null);
    try {
      await deleteSinaiSession(summary.sessionId, deleteReason.trim() || null);
      onAction({ kind: 'success', text: 'Session deleted.' });
    } catch (err) {
      setError(err?.message || 'Failed to delete session.');
      setBusy(null);
    }
  };

  const handleDownloadJson = () => {
    if (!doc) return;
    const data = JSON.stringify(doc, null, 2);
    downloadFile(`sinai_${summary.clinicCode}_${summary.sessionId.slice(0, 8)}.json`, data, 'application/json');
  };

  const handleDownloadCsv = () => {
    if (!doc) return;
    // Flatten the doc into a single-row CSV. Keep clinically-meaningful fields.
    const flat = {
      sessionId: doc._id,
      clinicCode: doc.clinicCode,
      status: doc.status,
      pathwayMode: doc.pathwayMode,
      createdAt: fmtDate(doc.createdAt),
      expiresAt: fmtDate(doc.expiresAt),
      redcapRecordId: doc.redcapRecordId || '',
      ...flatten(doc.step1 || {}, 'step1_'),
      ...flatten(doc.step2 || {}, 'step2_'),
      ...flatten(doc.result || {}, 'result_'),
      finalCategory: doc.finalCategory || '',
      finalScore: doc.finalScore ?? '',
    };
    const csv = buildCsvFromRecord(flat);
    downloadFile(`sinai_${summary.clinicCode}_${summary.sessionId.slice(0, 8)}.csv`, csv);
  };

  const status = doc?.status || summary.status;
  const cfg = STATUS_LABELS[status] || STATUS_LABELS.pending;
  const canSubmit = status === 'pending' || status === 'redcap_error';
  const canMark   = status === 'pending' || status === 'redcap_error';

  return (
    <div className="sr-modal-root" role="dialog" aria-modal="true">
      <div className="sr-modal-backdrop" onClick={onClose} />
      <div className="sr-modal-panel sr-modal-panel--wide">
        <header className="sr-modal-header">
          <div>
            <span className={`sr-status sr-status--${cfg.color}`}>
              <cfg.Icon size={12} /> {cfg.label}
            </span>
            <h3>Session detail</h3>
            <p className="sr-modal-sub">
              <code className="sr-code">{formatCode(summary.clinicCode)}</code>
              <span style={{ marginLeft: 8, color: '#94a3b8', fontSize: 12 }}>
                {summary.sessionId}
              </span>
            </p>
          </div>
          <button type="button" className="sr-modal-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        {error && (
          <div className="sr-banner sr-banner--error" style={{ margin: '0 18px 12px' }}>
            <AlertCircle size={16} /><span>{error}</span>
          </div>
        )}

        {loading && (
          <div className="sr-modal-body sr-loading">
            <Loader2 size={20} className="sr-spin" /> Loading session…
          </div>
        )}

        {doc && !loading && (
          <>
            <div className="sr-modal-body">
              <div className="sr-detail-grid">
                <DetailField label="Status" value={cfg.label} />
                <DetailField label="Pathway" value={doc.pathwayMode} mono />
                <DetailField label="Created" value={fmtDate(doc.createdAt)} />
                <DetailField label="Expires (TTL)" value={fmtDate(doc.expiresAt)} />
                <DetailField label="REDCap record" value={doc.redcapRecordId || '—'} mono />
                <DetailField label="REDCap submitted" value={fmtDate(doc.redcapSubmittedAt)} />
                {doc.importedAt && (
                  <>
                    <DetailField label="Marked imported at" value={fmtDate(doc.importedAt)} />
                    <DetailField label="Marked imported by" value={doc.importedBy || '—'} />
                  </>
                )}
                {doc.redcapError && (
                  <DetailField
                    label="Last REDCap error"
                    value={doc.redcapError}
                    span
                    error
                  />
                )}
              </div>

              <DetailSection title="Step 1 — risk factors" data={doc.step1} />
              <DetailSection title="Step 1 result" data={doc.result} />
              {doc.step2 && <DetailSection title="Step 2 — PSA / MRI" data={doc.step2} />}
              {(doc.finalCategory || doc.finalScore !== undefined) && (
                <DetailSection
                  title="Step 2 result"
                  data={{ finalCategory: doc.finalCategory, finalScore: doc.finalScore }}
                />
              )}
            </div>

            {showImportForm && (
              <div className="sr-action-panel">
                <header><span>Mark this session as manually imported</span></header>
                <div className="sr-form-row">
                  <label>REDCap record ID</label>
                  <input
                    type="text"
                    value={importRecordId}
                    onChange={(e) => setImportRecordId(e.target.value)}
                    placeholder="e.g. 1042"
                    disabled={busy === 'mark_imported'}
                  />
                </div>
                <div className="sr-form-row">
                  <label>Notes (optional)</label>
                  <input
                    type="text"
                    value={importNotes}
                    onChange={(e) => setImportNotes(e.target.value)}
                    placeholder="Anything the next reviewer should know"
                    disabled={busy === 'mark_imported'}
                  />
                </div>
                <div className="sr-form-actions">
                  <button className="sr-btn-ghost" onClick={() => setShowImportForm(false)}>Cancel</button>
                  <button className="sr-btn-primary" onClick={handleMarkImported} disabled={busy === 'mark_imported'}>
                    {busy === 'mark_imported' ? <Loader2 size={14} className="sr-spin" /> : <CheckCircle2 size={14} />}
                    <span>Confirm import</span>
                  </button>
                </div>
              </div>
            )}

            {showDeleteForm && (
              <div className="sr-action-panel sr-action-panel--danger">
                <header><span>Delete this session immediately</span></header>
                <p className="sr-action-help">
                  This removes the temporary copy from Firestore. It does not affect any
                  REDCap record that may have already been written.
                </p>
                <div className="sr-form-row">
                  <label>Reason (optional)</label>
                  <input
                    type="text"
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    placeholder="e.g. patient asked to withdraw"
                    disabled={busy === 'delete'}
                  />
                </div>
                <div className="sr-form-actions">
                  <button className="sr-btn-ghost" onClick={() => setShowDeleteForm(false)}>Cancel</button>
                  <button className="sr-btn-danger" onClick={handleDelete} disabled={busy === 'delete'}>
                    {busy === 'delete' ? <Loader2 size={14} className="sr-spin" /> : <Trash2 size={14} />}
                    <span>Delete session</span>
                  </button>
                </div>
              </div>
            )}

            <footer className="sr-modal-footer">
              <div className="sr-modal-footer-left">
                <button className="sr-btn-ghost" onClick={handleDownloadJson}>
                  <Download size={14} /> JSON
                </button>
                <button className="sr-btn-ghost" onClick={handleDownloadCsv}>
                  <Download size={14} /> REDCap CSV
                </button>
                <button
                  className="sr-btn-danger-ghost"
                  onClick={() => setShowDeleteForm((s) => !s)}
                  disabled={busy != null}
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
              <div className="sr-modal-footer-right">
                {canMark && (
                  <button
                    className="sr-btn-ghost"
                    onClick={() => setShowImportForm((s) => !s)}
                    disabled={busy != null}
                  >
                    <Upload size={14} /> Mark imported
                  </button>
                )}
                {canSubmit && (
                  <button
                    className="sr-btn-primary"
                    onClick={handleSubmitToRedcap}
                    disabled={busy != null}
                  >
                    {busy === 'submit'
                      ? <Loader2 size={14} className="sr-spin" />
                      : <Upload size={14} />}
                    <span>Submit to REDCap</span>
                  </button>
                )}
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
};

const DetailField = ({ label, value, mono = false, span = false, error = false }) => (
  <div className={`sr-detail-field ${span ? 'sr-detail-field--span' : ''} ${error ? 'sr-detail-field--error' : ''}`}>
    <span className="sr-detail-field-label">{label}</span>
    <span className={`sr-detail-field-value ${mono ? 'sr-mono' : ''}`}>{value ?? '—'}</span>
  </div>
);

const DetailSection = ({ title, data }) => {
  if (!data) return null;
  const entries = Object.entries(data).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (entries.length === 0) return null;
  return (
    <details className="sr-detail-section" open>
      <summary>{title}</summary>
      <div className="sr-detail-section-grid">
        {entries.map(([k, v]) => (
          <DetailField key={k} label={k} value={renderValue(v)} mono />
        ))}
      </div>
    </details>
  );
};

const renderValue = (v) => {
  if (Array.isArray(v)) return `[${v.join(', ')}]`;
  if (typeof v === 'object' && v !== null) return JSON.stringify(v);
  return String(v);
};

const flatten = (obj, prefix) => {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) out[prefix + k] = v.join(';');
    else if (typeof v === 'object') out[prefix + k] = JSON.stringify(v);
    else out[prefix + k] = v;
  }
  return out;
};

// ─────────────────────────────────────────────────────────────────────────
// Public session detail modal
// ─────────────────────────────────────────────────────────────────────────

const PublicSessionModal = ({ summary, onClose, onAction }) => {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [showLinkForm, setShowLinkForm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const full = await getPublicSession(summary.sessionId);
        if (!cancelled) setDoc(full);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load session.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [summary.sessionId]);

  const handleResync = async () => {
    setBusy('resync'); setError(null);
    try {
      await resyncPublicSession(summary.sessionId);
      onAction({ kind: 'success', text: 'Resync requested — the syncToRedcap trigger will re-run shortly.' });
    } catch (err) {
      setError(err?.message || 'Failed to request resync.');
      setBusy(null);
    }
  };

  const handleLinkSubmit = async (payload) => {
    setBusy('link'); setError(null);
    try {
      const res = await linkPublicSessionToSinai({
        sessionId: summary.sessionId,
        ...payload,
      });
      onAction({
        kind: 'success',
        text: `Linked to clinic code ${formatCode(res.clinicCode)}. New Sinai session ${res.sinaiSessionId} created.`,
      });
    } catch (err) {
      setError(err?.message || 'Failed to link session.');
      setBusy(null);
    }
  };

  const handleDownloadJson = () => {
    if (!doc) return;
    downloadFile(
      `public_${summary.userIdPrefix}_${summary.sessionId.slice(0, 8)}.json`,
      JSON.stringify(doc, null, 2),
      'application/json'
    );
  };

  const handleDownloadCsv = () => {
    if (!doc) return;
    const session = doc.session || {};
    const flat = {
      sessionId: doc._id,
      cohort: 'public_consented',
      userIdPrefix: doc.userIdPrefix,
      researchConsent: doc.researchConsent,
      researchTimestamp: doc.researchTimestampMillis ? new Date(doc.researchTimestampMillis).toISOString() : '',
      consentBasis: doc.consentBasis || '',
      status: session.status || '',
      pathwayMode: session.pathwayMode || '',
      createdAt: session.createdAt ? new Date(session.createdAt).toISOString() : '',
      redcapSynced: session.redcapSynced === true,
      redcapSyncedAt: session.redcapSyncedAt ? new Date(session.redcapSyncedAt).toISOString() : '',
      ...flatten(session.step1 || {}, 'step1_'),
      ...flatten(session.step2 || {}, 'step2_'),
      ...flatten(session.result || {}, 'result_'),
      finalCategory: session.finalCategory || '',
      finalScore: session.finalScore ?? '',
    };
    downloadFile(
      `public_${summary.userIdPrefix}_${summary.sessionId.slice(0, 8)}.csv`,
      buildCsvFromRecord(flat)
    );
  };

  const session = doc?.session || {};
  const syncKey =
    session.redcapSyncError ? 'error'
    : session.redcapSynced ? 'synced'
    : 'unsynced';
  const cfg = PUBLIC_SYNC_LABELS[syncKey];
  const canResync = !session.redcapSynced;

  return (
    <div className="sr-modal-root" role="dialog" aria-modal="true">
      <div className="sr-modal-backdrop" onClick={onClose} />
      <div className="sr-modal-panel sr-modal-panel--wide">
        <header className="sr-modal-header">
          <div>
            <CohortBadge cohort="public" linked={!!summary.linkedToSinai} />
            <h3 style={{ marginTop: 8 }}>Public-cohort session</h3>
            <p className="sr-modal-sub">
              <code className="sr-code-soft">uid:{summary.userIdPrefix}…</code>
              <span style={{ marginLeft: 8, color: '#94a3b8', fontSize: 12 }}>
                {summary.sessionId}
              </span>
            </p>
          </div>
          <button type="button" className="sr-modal-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        {error && (
          <div className="sr-banner sr-banner--error" style={{ margin: '0 18px 12px' }}>
            <AlertCircle size={16} /><span>{error}</span>
          </div>
        )}

        {loading && (
          <div className="sr-modal-body sr-loading">
            <Loader2 size={20} className="sr-spin" /> Loading session…
          </div>
        )}

        {doc && !loading && (
          <>
            <div className="sr-modal-body">
              <div className="sr-detail-grid">
                <DetailField label="Cohort" value="Public · Consented" />
                <DetailField label="REDCap sync status" value={cfg.label} />
                <DetailField label="Pathway" value={session.pathwayMode} mono />
                <DetailField label="Session status" value={session.status} mono />
                <DetailField label="Created" value={fmtDate(session.createdAt)} />
                <DetailField label="REDCap synced at" value={fmtDate(session.redcapSyncedAt)} />
                <DetailField label="Research consent given" value={doc.researchConsent ? 'Yes' : 'No'} />
                <DetailField label="Consent timestamp" value={fmtDate(doc.researchTimestampMillis)} />
                <DetailField label="Consent basis" value={doc.consentBasis || '—'} mono />
                <DetailField label="User ID" value={`${doc.userId.slice(0, 24)}…`} mono />
                {summary.linkedToSinai && (
                  <DetailField
                    label="Linked to Sinai code"
                    value={`${formatCode(summary.linkedToSinai.clinicCode)} at ${fmtDate(summary.linkedToSinai.linkedAtMillis)}`}
                    span
                  />
                )}
                {session.redcapSyncError && (
                  <DetailField label="Last REDCap error" value={session.redcapSyncError} span error />
                )}
              </div>

              <DetailSection title="Step 1 — risk factors" data={session.step1} />
              <DetailSection title="Step 1 result" data={session.result} />
              {session.step2 && <DetailSection title="Step 2 — PSA / MRI" data={session.step2} />}
              {(session.finalCategory || session.finalScore !== undefined) && (
                <DetailSection
                  title="Step 2 result"
                  data={{ finalCategory: session.finalCategory, finalScore: session.finalScore }}
                />
              )}
            </div>

            {showLinkForm && !summary.linkedToSinai && (
              <LinkToSinaiForm
                adminEmailDefault={doc?.consentBasis === 'sinai_irb_study_14_00050' ? '' : ''}
                onCancel={() => setShowLinkForm(false)}
                onSubmit={handleLinkSubmit}
                busy={busy === 'link'}
              />
            )}

            <footer className="sr-modal-footer">
              <div className="sr-modal-footer-left">
                <button className="sr-btn-ghost" onClick={handleDownloadJson}>
                  <Download size={14} /> JSON
                </button>
                <button className="sr-btn-ghost" onClick={handleDownloadCsv}>
                  <Download size={14} /> REDCap CSV
                </button>
              </div>
              <div className="sr-modal-footer-right">
                {!summary.linkedToSinai && (
                  <button
                    className="sr-btn-ghost"
                    onClick={() => setShowLinkForm((s) => !s)}
                    disabled={busy != null}
                    title="Document patient consent and link this session to a Mount Sinai clinic code"
                  >
                    <Link2 size={14} /> {showLinkForm ? 'Hide link form' : 'Link to Mount Sinai patient'}
                  </button>
                )}
                {canResync && (
                  <button className="sr-btn-primary" onClick={handleResync} disabled={busy != null}>
                    {busy === 'resync' ? <Loader2 size={14} className="sr-spin" /> : <RotateCw size={14} />}
                    <span>Re-trigger REDCap sync</span>
                  </button>
                )}
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// LinkToSinaiForm — admin attests to obtaining IRB consent before linking
//
// Lives inline inside PublicSessionModal so the entire link workflow stays
// inside the admin dashboard. Backend gates: clinic code valid+unused,
// consent method documented, notes ≥10 chars, attestation checkbox checked.
// ─────────────────────────────────────────────────────────────────────────

const CONSENT_METHODS = [
  { id: 'verbal',     label: 'Verbal (clinician witnessed)' },
  { id: 'written',    label: 'Written (electronic signature)' },
  { id: 'paper',      label: 'Paper consent form (on file)' },
  { id: 'electronic', label: 'Electronic (e.g. patient portal)' },
];

const toDatetimeLocalValue = (millis) => {
  const d = new Date(millis);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const LinkToSinaiForm = ({ onCancel, onSubmit, busy }) => {
  const [code, setCode] = useState('');
  const [consentMethod, setConsentMethod] = useState('verbal');
  const [consentTimestampStr, setConsentTimestampStr] = useState(toDatetimeLocalValue(Date.now()));
  const [consentAttestor, setConsentAttestor] = useState('');
  const [consentNotes, setConsentNotes] = useState('');
  const [attachmentRef, setAttachmentRef] = useState('');
  const [attestationChecked, setAttestationChecked] = useState(false);
  const [localError, setLocalError] = useState(null);

  const codeNormalized = (code || '').replace(/[\s\-_]/g, '').toUpperCase();
  const codeLooksValid = codeNormalized.length === 12 && /^[A-Z0-9]+$/.test(codeNormalized);
  const notesValid = consentNotes.trim().length >= 10;
  const timestampMillis = consentTimestampStr ? new Date(consentTimestampStr).getTime() : NaN;
  const timestampValid = Number.isFinite(timestampMillis) && timestampMillis <= Date.now() + 60 * 1000;
  const canSubmit =
    codeLooksValid && notesValid && timestampValid && attestationChecked && !busy;

  const handleSubmit = () => {
    setLocalError(null);
    if (!codeLooksValid) { setLocalError('Clinic code must be 12 characters (letters/digits).'); return; }
    if (!timestampValid) { setLocalError('Consent timestamp must be a valid date/time, not in the future.'); return; }
    if (!notesValid)     { setLocalError('Consent notes must be at least 10 characters.'); return; }
    if (!attestationChecked) { setLocalError('Admin attestation checkbox is required.'); return; }

    onSubmit({
      clinicCode: codeNormalized,
      consentMethod,
      consentTimestampMillis: timestampMillis,
      consentAttestor: consentAttestor.trim() || undefined,
      consentNotes: consentNotes.trim(),
      consentAttachmentRef: attachmentRef.trim() || undefined,
      adminAttestation: true,
    });
  };

  return (
    <div className="sr-action-panel sr-action-panel--link">
      <header>
        <span>
          <Link2 size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Link to Mount Sinai patient (IRB STUDY-14-00050)
        </span>
      </header>
      <p className="sr-action-help">
        Document the patient&apos;s consent before linking. Both gates must hold —
        a valid clinic code <strong>and</strong> documented IRB consent.
      </p>

      {localError && (
        <div className="sr-banner sr-banner--error" style={{ marginBottom: 10 }}>
          <AlertCircle size={16} /><span>{localError}</span>
        </div>
      )}

      <div className="sr-form-row">
        <label>Clinic code</label>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="XXXX-XXXX-XXXX"
          disabled={busy}
          style={{ fontFamily: '"SF Mono", Menlo, Consolas, monospace', letterSpacing: '0.06em' }}
        />
      </div>

      <div className="sr-form-row">
        <label>Consent method</label>
        <select
          className="sr-select"
          value={consentMethod}
          onChange={(e) => setConsentMethod(e.target.value)}
          disabled={busy}
          style={{ flex: 1 }}
        >
          {CONSENT_METHODS.map(({ id, label }) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
      </div>

      <div className="sr-form-row">
        <label>When obtained</label>
        <input
          type="datetime-local"
          value={consentTimestampStr}
          onChange={(e) => setConsentTimestampStr(e.target.value)}
          max={toDatetimeLocalValue(Date.now())}
          disabled={busy}
        />
      </div>

      <div className="sr-form-row">
        <label>Attestor</label>
        <input
          type="text"
          value={consentAttestor}
          onChange={(e) => setConsentAttestor(e.target.value)}
          placeholder="(defaults to your admin email if blank)"
          maxLength={200}
          disabled={busy}
        />
      </div>

      <div className="sr-form-row" style={{ alignItems: 'flex-start' }}>
        <label style={{ paddingTop: 8 }}>Notes</label>
        <textarea
          value={consentNotes}
          onChange={(e) => setConsentNotes(e.target.value)}
          placeholder="Describe how consent was obtained, who was present, anything the IRB would want to see (min 10 chars)."
          minLength={10}
          maxLength={1000}
          rows={3}
          disabled={busy}
          style={{
            flex: 1,
            padding: '7px 10px',
            fontSize: 13,
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            background: '#fff',
            outline: 'none',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
      </div>
      <div className="sr-form-row">
        <label>Attachment</label>
        <input
          type="text"
          value={attachmentRef}
          onChange={(e) => setAttachmentRef(e.target.value)}
          placeholder="Optional: Firebase Storage path to a paper consent scan"
          maxLength={500}
          disabled={busy}
        />
      </div>

      <label
        className="sr-attestation"
        style={{
          display: 'flex',
          gap: 8,
          padding: '10px 12px',
          margin: '10px 0',
          background: '#fef9c3',
          border: '1px solid #fcd34d',
          borderRadius: 8,
          fontSize: 13,
          color: '#78350f',
          cursor: 'pointer',
          lineHeight: 1.5,
        }}
      >
        <input
          type="checkbox"
          checked={attestationChecked}
          onChange={(e) => setAttestationChecked(e.target.checked)}
          disabled={busy}
          style={{ marginTop: 3, accentColor: '#d97706' }}
        />
        <span>
          <strong>I attest</strong> that the patient identified by this clinic code provided
          IRB STUDY-14-00050 consent through the method indicated above, and that I have
          reviewed this session before linking. This action is logged and audited.
        </span>
      </label>

      <div className="sr-form-actions">
        <button className="sr-btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="sr-btn-primary" onClick={handleSubmit} disabled={!canSubmit}>
          {busy ? <Loader2 size={14} className="sr-spin" /> : <Link2 size={14} />}
          <span>Link to Mount Sinai cohort</span>
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Codes tab
// ─────────────────────────────────────────────────────────────────────────

const CodesTab = () => {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // all | unused | used | revoked
  const [showGenerate, setShowGenerate] = useState(false);
  const [generated, setGenerated] = useState(null); // result of last mint

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await getDocs(query(collection(adminDb, 'clinicCodes'), orderBy('issuedAt', 'desc'), fsLimit(500)));
      const list = snap.docs.map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          code: data.code || d.id,
          issuedBy: data.issuedBy,
          issuedAtMillis: data.issuedAt?.toMillis?.() ?? null,
          expiresAtMillis: data.expiresAt?.toMillis?.() ?? null,
          used: data.used === true,
          usedAtMillis: data.usedAt?.toMillis?.() ?? null,
          sessionId: data.sessionId || null,
          redcapRecordId: data.redcapRecordId || null,
          submittedToRedcap: data.submittedToRedcap === true,
          revoked: data.revoked === true,
          revokedReason: data.revokedReason || null,
        };
      });
      setCodes(list);
    } catch (err) {
      setError(err?.message || 'Failed to load codes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'all') return codes;
    if (filter === 'unused') return codes.filter((c) => !c.used && !c.revoked);
    if (filter === 'used') return codes.filter((c) => c.used);
    if (filter === 'revoked') return codes.filter((c) => c.revoked);
    return codes;
  }, [codes, filter]);

  const handleRevoke = async (code) => {
    const reason = window.prompt(`Revoke clinic code ${formatCode(code)}? Optional reason:`);
    if (reason === null) return;
    try {
      await revokeClinicCode(code, reason.trim() || null);
      await load();
    } catch (err) {
      alert(err?.message || 'Failed to revoke code.');
    }
  };

  return (
    <>
      {error && <div className="sr-banner sr-banner--error"><AlertCircle size={16} /><span>{error}</span></div>}

      <div className="sr-toolbar">
        <div className="sr-toolbar-left">
          <select className="sr-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All codes</option>
            <option value="unused">Unused</option>
            <option value="used">Used</option>
            <option value="revoked">Revoked</option>
          </select>
          <span className="sr-toolbar-counter">{filtered.length} of {codes.length}</span>
        </div>
        <div className="sr-toolbar-right">
          <button className="sr-btn-ghost" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'sr-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button className="sr-btn-primary" onClick={() => setShowGenerate(true)}>
            <Plus size={14} /> <span>Generate codes</span>
          </button>
        </div>
      </div>

      <div className="sr-table-wrap">
        <table className="sr-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Status</th>
              <th>Issued by</th>
              <th>Issued</th>
              <th>Expires</th>
              <th>Used at</th>
              <th>REDCap ID</th>
              <th aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading && (
              <tr><td colSpan={8} className="sr-empty">No codes match this filter.</td></tr>
            )}
            {filtered.map((c) => {
              const statusInfo =
                c.revoked ? { label: 'Revoked', color: 'red', Icon: ShieldOff }
                : c.used ? { label: 'Used', color: 'green', Icon: CheckCircle2 }
                : { label: 'Unused', color: 'amber', Icon: Clock };
              return (
                <tr key={c.id}>
                  <td>
                    <span className="sr-code-cell">
                      <code className="sr-code">{formatCode(c.code)}</code>
                      <button
                        type="button"
                        className="sr-copy-btn"
                        title="Copy"
                        onClick={() => navigator.clipboard?.writeText(formatCode(c.code))}
                      >
                        <Copy size={12} />
                      </button>
                    </span>
                  </td>
                  <td>
                    <span className={`sr-status sr-status--${statusInfo.color}`}>
                      <statusInfo.Icon size={12} /> {statusInfo.label}
                    </span>
                  </td>
                  <td className="sr-small">{c.issuedBy || '—'}</td>
                  <td>{fmtShort(c.issuedAtMillis)}</td>
                  <td>{c.expiresAtMillis ? fmtShort(c.expiresAtMillis) : 'never'}</td>
                  <td>{fmtShort(c.usedAtMillis)}</td>
                  <td className="sr-mono">{c.redcapRecordId || '—'}</td>
                  <td>
                    {!c.revoked && !c.used && (
                      <button className="sr-btn-row sr-btn-row--danger" onClick={() => handleRevoke(c.code)}>
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showGenerate && (
        <GenerateCodesModal
          onClose={() => { setShowGenerate(false); setGenerated(null); }}
          onGenerated={(result) => { setGenerated(result); load(); }}
          result={generated}
        />
      )}
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Generate codes modal
// ─────────────────────────────────────────────────────────────────────────

const GenerateCodesModal = ({ onClose, onGenerated, result }) => {
  const [count, setCount] = useState(10);
  const [expiresInDays, setExpiresInDays] = useState(90);
  const [neverExpires, setNeverExpires] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleGenerate = async () => {
    setBusy(true); setError(null);
    try {
      const res = await generateClinicCodes(
        Number(count),
        neverExpires ? null : Number(expiresInDays)
      );
      onGenerated(res);
    } catch (err) {
      setError(err?.message || 'Failed to generate codes.');
    } finally {
      setBusy(false);
    }
  };

  const handleCopyAll = () => {
    if (!result?.codes) return;
    const text = result.codes.map((c) => c.display).join('\n');
    navigator.clipboard?.writeText(text);
  };

  const handleDownloadAll = () => {
    if (!result?.codes) return;
    const csv = ['code\n', ...result.codes.map((c) => `${c.display}\n`)].join('');
    downloadFile(`clinic_codes_${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <div className="sr-modal-root" role="dialog" aria-modal="true">
      <div className="sr-modal-backdrop" onClick={onClose} />
      <div className="sr-modal-panel">
        <header className="sr-modal-header">
          <div>
            <h3>Generate clinic codes</h3>
            <p className="sr-modal-sub">Codes are random 12-char strings using a phone-readable charset.</p>
          </div>
          <button type="button" className="sr-modal-close" onClick={onClose}><X size={16} /></button>
        </header>

        {!result && (
          <div className="sr-modal-body">
            {error && (
              <div className="sr-banner sr-banner--error" style={{ marginBottom: 12 }}>
                <AlertCircle size={16} /><span>{error}</span>
              </div>
            )}
            <div className="sr-form-row">
              <label>How many?</label>
              <input
                type="number"
                min={1}
                max={100}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                disabled={busy}
              />
            </div>
            <div className="sr-form-row">
              <label>Expires in</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <input
                  type="number"
                  min={1}
                  max={730}
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(Math.max(1, Math.min(730, Number(e.target.value) || 1)))}
                  disabled={busy || neverExpires}
                  style={{ width: 100 }}
                />
                <span style={{ color: '#94a3b8', fontSize: 13 }}>days</span>
                <label className="sr-checkbox" style={{ marginLeft: 12 }}>
                  <input
                    type="checkbox"
                    checked={neverExpires}
                    onChange={(e) => setNeverExpires(e.target.checked)}
                    disabled={busy}
                  />
                  <span>Never expires</span>
                </label>
              </div>
            </div>
            <div className="sr-modal-help">
              You can revoke any code from the codes table later.
            </div>
          </div>
        )}

        {result && (
          <div className="sr-modal-body">
            <div className="sr-banner sr-banner--success" style={{ marginBottom: 12 }}>
              <CheckCircle2 size={16} />
              <span>Generated {result.codes.length} code{result.codes.length === 1 ? '' : 's'}.</span>
            </div>
            <ul className="sr-code-list">
              {result.codes.map((c) => (
                <li key={c.code}>
                  <code className="sr-code">{c.display}</code>
                  <button
                    type="button"
                    className="sr-copy-btn"
                    onClick={() => navigator.clipboard?.writeText(c.display)}
                    title="Copy"
                  >
                    <Copy size={12} />
                  </button>
                </li>
              ))}
            </ul>
            <p className="sr-modal-help" style={{ marginTop: 12 }}>
              Save or distribute these codes now — they can be revoked but not re-shown in full.
            </p>
          </div>
        )}

        <footer className="sr-modal-footer">
          <div className="sr-modal-footer-left">
            {result && (
              <>
                <button className="sr-btn-ghost" onClick={handleCopyAll}>
                  <Copy size={14} /> Copy all
                </button>
                <button className="sr-btn-ghost" onClick={handleDownloadAll}>
                  <Download size={14} /> CSV
                </button>
              </>
            )}
          </div>
          <div className="sr-modal-footer-right">
            <button className="sr-btn-ghost" onClick={onClose}>{result ? 'Done' : 'Cancel'}</button>
            {!result && (
              <button className="sr-btn-primary" onClick={handleGenerate} disabled={busy}>
                {busy ? <Loader2 size={14} className="sr-spin" /> : <Plus size={14} />}
                <span>Generate</span>
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Audit log tab
// ─────────────────────────────────────────────────────────────────────────

const AuditTab = () => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);

  const load = useCallback(async (reset = true) => {
    setLoading(true); setError(null);
    try {
      const res = await listClinicCodeAuditLog({
        limit: 100,
        ...(reset ? {} : nextCursor ? { startAfterMillis: nextCursor } : {}),
      });
      setEntries(reset ? res.entries : [...entries, ...res.entries]);
      setNextCursor(res.nextStartAfterMillis);
    } catch (err) {
      setError(err?.message || 'Failed to load audit log.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextCursor]);

  useEffect(() => { load(true); /* eslint-disable-next-line */ }, []);

  return (
    <>
      {error && <div className="sr-banner sr-banner--error"><AlertCircle size={16} /><span>{error}</span></div>}

      <div className="sr-toolbar">
        <span className="sr-toolbar-counter">{entries.length} entries</span>
        <button className="sr-btn-ghost" onClick={() => load(true)} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'sr-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="sr-table-wrap">
        <table className="sr-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Outcome</th>
              <th>Code (hash prefix)</th>
              <th>Caller</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && !loading && (
              <tr><td colSpan={6} className="sr-empty">No audit entries yet.</td></tr>
            )}
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="sr-small">{fmtDate(e.timestampMillis)}</td>
                <td className="sr-mono">{e.action}</td>
                <td>
                  <span className={`sr-status sr-status--${outcomeColor(e.outcome)}`}>
                    {String(e.outcome)}
                  </span>
                </td>
                <td className="sr-mono sr-small">{e.codeHashPrefix || '—'}</td>
                <td className="sr-small">{e.callerKey || '—'}</td>
                <td className="sr-small">
                  {e.errorMessage && <span style={{ color: '#dc2626' }}>{e.errorMessage}</span>}
                  {e.redcapRecordId && <span> · REDCap: {e.redcapRecordId}</span>}
                  {e.metadata && <span> · {JSON.stringify(e.metadata)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sr-table-footer">
        {nextCursor && (
          <button className="sr-btn-ghost" onClick={() => load(false)} disabled={loading}>
            Load more
          </button>
        )}
      </div>
    </>
  );
};

const outcomeColor = (outcome) => {
  if (!outcome) return 'gray';
  const s = String(outcome);
  if (s === 'valid' || s === 'submitted_redcap' || s === 'submitted_pending' ||
      s === 'marked_imported' || s === 'minted' || s === 'ok' || s === 'toggled') return 'green';
  if (s === 'malformed' || s === 'redcap_error' || s === 'unauthorized') return 'red';
  if (s === 'not_found' || s === 'already_used' || s === 'expired' || s === 'revoked' || s === 'deleted') return 'amber';
  return 'gray';
};

// ─────────────────────────────────────────────────────────────────────────
// Settings tab
// ─────────────────────────────────────────────────────────────────────────

const SettingsTab = ({ config, onChange }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleToggle = async () => {
    const newValue = !config.redcapEnabled;
    if (newValue && !window.confirm(
      'Enable live REDCap submission?\n\n' +
      'New Sinai sessions will be pushed to REDCap immediately on submit. ' +
      'Make sure the Sinai REDCap project is configured and the API token is set.'
    )) return;

    setBusy(true); setError(null);
    try {
      await toggleSinaiRedcapEnabled(newValue);
      const refreshed = await readSinaiConfig();
      onChange(refreshed);
    } catch (err) {
      setError(err?.message || 'Failed to update flag.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sr-settings">
      {error && <div className="sr-banner sr-banner--error"><AlertCircle size={16} /><span>{error}</span></div>}

      <div className="sr-settings-card">
        <div className="sr-settings-card-header">
          <FlaskConical size={18} />
          <h3>Live REDCap submission</h3>
        </div>
        <p className="sr-settings-desc">
          When enabled, completed Sinai sessions are pushed to Mount Sinai REDCap immediately.
          When disabled, sessions are stored in <code>sinaiSessions</code> with a 30-day TTL
          and admins submit each one manually from the Sessions tab. Either way, every
          submission writes a row that admins can review here.
        </p>

        <div className="sr-settings-toggle">
          <div>
            <strong>Status:</strong>{' '}
            {config.redcapEnabled
              ? <span style={{ color: '#16a34a', fontWeight: 600 }}>ENABLED</span>
              : <span style={{ color: '#d97706', fontWeight: 600 }}>DISABLED (admin queue)</span>}
            {config.updatedAt && (
              <div className="sr-settings-meta">
                Last changed {fmtDate(config.updatedAt)} by {config.updatedBy || 'unknown'}
              </div>
            )}
          </div>
          <button
            type="button"
            className={`sr-toggle-btn ${config.redcapEnabled ? 'sr-toggle-btn--on' : ''}`}
            onClick={handleToggle}
            disabled={busy}
            aria-label="Toggle live REDCap submission"
          >
            {busy
              ? <Loader2 size={16} className="sr-spin" />
              : (config.redcapEnabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />)}
          </button>
        </div>
      </div>

      <div className="sr-settings-card">
        <div className="sr-settings-card-header">
          <AlertTriangle size={18} />
          <h3>Deploy checklist</h3>
        </div>
        <p className="sr-settings-desc">
          Before enabling live submission, make sure all of these are in place. The flag
          alone is not enough — these need to happen on the Firebase side.
        </p>
        <ul className="sr-checklist">
          <li>REDCap API URL and token set:
            <pre>firebase functions:config:set \
  redcap.sinai_api_url="https://redcap.mssm.edu/api/" \
  redcap.sinai_api_token="&lt;token&gt;"</pre>
          </li>
          <li>Functions redeployed: <code>firebase deploy --only functions</code></li>
          <li>Firestore TTL policy active on <code>sinaiSessions.expiresAt</code>:
            <pre>gcloud firestore fields ttls update expiresAt \
  --collection-group=sinaiSessions --enable-ttl</pre>
          </li>
          <li>Sinai REDCap data dictionary imported (matches the backend mapper field names)</li>
          <li>Test submission with a throwaway code — verify it lands in REDCap</li>
        </ul>
      </div>
    </div>
  );
};

export default SinaiResearch;
