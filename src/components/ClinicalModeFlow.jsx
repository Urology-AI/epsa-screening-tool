import React, { useState, useMemo, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { useTranslation } from 'react-i18next';
import './ClinicalModeFlow.css';
import InfoIcon from './InfoIcon.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import ThemeSwitcher from './ThemeSwitcher.jsx';
import TextScaleControl from './TextScaleControl.jsx';
import { fieldReferences } from '../utils/fieldReferences';
import { calculateDynamicEPsa } from '../utils/dynamicCalculator';
import { DEFAULT_CALCULATOR_CONFIG } from '../config/calculatorConfig';
import { FH_MAP, DIET_MAP, deriveIpssFromQol, expandShimSingle } from '../utils/epsaFormUtils';
import { submitToRedcap } from '../utils/redcapSubmit';
import ClinicalModeResult from './ClinicalModeResult.jsx';
import { ZapIcon, ChevronRightIcon, RotateCcwIcon, CheckIcon, FlaskConicalIcon, ArrowLeftIcon, ShieldCheckIcon, LockIcon, FileTextIcon, PrinterIcon } from 'lucide-react';
import ClinicalModePrintForm from './ClinicalModePrintForm.jsx';
import QrCodePoster from './QrCodePoster.jsx';
import { getOrCreateUid, saveClinicalSession, generateSessionRef } from '../services/clinicalSessionService';
import { isSupabaseConfigured, pushSessions } from '../services/supabaseService';

/* ─── BMI helpers ─── */
function calcBmi(ft, inch, lbs) {
  const inches = (parseFloat(ft) || 0) * 12 + (parseFloat(inch) || 0);
  const w = parseFloat(lbs);
  return inches && w ? (703 * w) / (inches * inches) : null;
}
function calcBmiMetric(cm, kg) {
  const h = parseFloat(cm), w = parseFloat(kg);
  return h && w ? w / ((h / 100) * (h / 100)) : null;
}
function deriveBmi(a, mH, mW) {
  if (mH && mW) return calcBmiMetric(a.heightCm, a.weightKg);
  if (!mH && !mW) return calcBmi(a.heightFt, a.heightIn, a.weightLbs);
  const inches = mH ? (parseFloat(a.heightCm) || 0) / 2.54
    : (parseFloat(a.heightFt) || 0) * 12 + (parseFloat(a.heightIn) || 0);
  const lbs = mW ? (parseFloat(a.weightKg) || 0) * 2.20462 : parseFloat(a.weightLbs);
  return inches && lbs ? (703 * lbs) / (inches * inches) : null;
}
function deriveIpss(qol) {
  // Maps IPSS Quality of Life question (0–6) to a 7-item IPSS array.
  // Mapping calibrated against Barry et al. (J Urol 1992) median IPSS by QoL response:
  //   QoL 0–1 (Delighted/Pleased)        → total 0  (mild,     IPSS 0–7)
  //   QoL 2   (Mostly Satisfied)          → total 7  (mild,     IPSS 0–7)
  //   QoL 3   (Mixed)                     → total 14 (moderate, IPSS 8–19)
  //   QoL 4   (Mostly Dissatisfied)       → total 21 (moderate-severe boundary)
  //   QoL 5–6 (Unhappy/Terrible)          → total 35 (severe,   IPSS 20–35)
  if (qol <= 1) return [0, 0, 0, 0, 0, 0, 0];   // total 0  — mild
  if (qol === 2) return [1, 1, 1, 1, 1, 1, 1];   // total 7  — mild
  if (qol === 3) return [2, 2, 2, 2, 2, 2, 2];   // total 14 — moderate
  if (qol === 4) return [3, 3, 3, 3, 3, 3, 3];   // total 21 — moderate-severe
  return [5, 5, 5, 5, 5, 5, 5];                  // total 35 — severe
}

/* ─── Chip group ─── */
const Chips = ({ options, value, onChange, ariaLabel }) => (
  <div className="qef-chips" role="radiogroup" aria-label={ariaLabel}>
    {options.map((opt) => {
      const sel = String(value) === String(opt.value);
      return (
        <button key={String(opt.value)} type="button" role="radio" aria-checked={sel}
          className={`qef-chip${sel ? ' qef-chip--sel' : ''}`}
          onClick={() => onChange(opt.value)}
        >{opt.label}</button>
      );
    })}
  </div>
);

/* ─── Question card ─── */
const QCard = ({ num, label, info, sublabel, citation, answered, children }) => (
  <div className={`qef-card${answered ? ' qef-card--answered' : ''}`}>
    <div className="qef-card-header">
      <span className={`qef-q-num${answered ? ' qef-q-num--done' : ''}`}>
        {answered ? <CheckIcon size={13} aria-hidden="true" /> : num}
      </span>
      <span className="qef-q-label">{label}</span>
      {info && <InfoIcon {...info} />}
    </div>
    {sublabel && <p className="qef-sublabel">{sublabel}</p>}
    {children}
    {citation && <p className="qef-citation">{citation}</p>}
  </div>
);

/* ─── IRB Study Consent screen (bus flow) ─── */
function BusStudyConsent({ onAgree, onDecline }) {
  const [checked, setChecked] = useState(false);
  return (
    <div className="qef-study-consent">
      <button type="button" className="qef-study-consent-back" onClick={onDecline}>
        <ArrowLeftIcon size={16} /> Back to results
      </button>
      <div className="qef-study-consent-header">
        <FlaskConicalIcon size={28} className="qef-study-consent-icon" />
        <h2>Contribute to Prostate Cancer Research</h2>
        <p className="qef-study-consent-subtitle">Mount Sinai IRB Study STUDY-14-00050</p>
      </div>
      <div className="qef-study-consent-body">
        <section>
          <h3>What we&apos;re asking</h3>
          <p>
            We are asking you to share your de-identified screening responses with
            the Mount Sinai prostate cancer research team. Your data will help
            improve early detection models for future patients.
          </p>
        </section>
        <section>
          <h3>What data is shared</h3>
          <p>
            Only your anonymized questionnaire responses (age range, risk factors,
            and ePSA score) are shared. No name, phone number, or other identifying
            information is collected or transmitted.
          </p>
        </section>
        <section>
          <h3>Your rights</h3>
          <p>
            Participation is entirely voluntary. You may decline without any
            effect on the screening services available to you today. To withdraw
            data after submission, contact the research team at{' '}
            <strong>ePSA-research@mountsinai.org</strong>.
          </p>
        </section>
        <section>
          <h3>Principal Investigator</h3>
          <p>Ashutosh K. Tewari, MD — Icahn School of Medicine at Mount Sinai, Urology Department</p>
        </section>
        <div className="qef-study-consent-shield">
          <ShieldCheckIcon size={14} />
          This study is approved by the Mount Sinai Program for the Protection of
          Human Subjects — IRB Protocol STUDY-14-00050.
        </div>
        <label className="qef-study-consent-check">
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />
          <span>I have read the above and voluntarily agree to share my anonymous data with the Mount Sinai research team.</span>
        </label>
      </div>
      <div className="qef-study-consent-actions">
        <button type="button" className={`qef-submit-btn${checked ? ' qef-submit-btn--ready' : ''}`}
          disabled={!checked} onClick={onAgree}>
          <CheckIcon size={16} /> I Agree — Share My Data
        </button>
        <button type="button" className="qef-reset-link" onClick={onDecline}>
          No thanks, continue without sharing
        </button>
      </div>
    </div>
  );
}

/* ─── Storage consent question (asked before results) ───
   Designed for patients screening directly on their own phone: if they
   signed the paper consent form their session is saved to the study
   database; otherwise results stay on the device only. */
function StorageConsentQuestion({ onYes, onNo }) {
  return (
    <div className="qef-consent-q">
      <div className="qef-consent-q-icon"><ShieldCheckIcon size={28} /></div>
      <h2 className="qef-consent-q-title">One quick question before you begin</h2>
      <p className="qef-consent-q-body">
        Have you <strong>signed a consent form</strong> for the Mount Sinai
        screening study today?
      </p>
      <p className="qef-consent-q-note">
        If yes, your anonymous responses are saved to the secure study
        database. If no, your results are kept on this device only — you can
        still see and print them.
      </p>
      <div className="qef-consent-q-actions">
        <button type="button" className="qef-submit-btn qef-submit-btn--ready" onClick={onYes}>
          <CheckIcon size={16} /> Yes — I signed the consent form
        </button>
        <button type="button" className="qef-consent-q-local-btn" onClick={onNo}>
          No — use my results locally only
        </button>
      </div>
    </div>
  );
}

/* ─── Staff PIN modal ─── */
const ADMIN_PIN = import.meta.env.VITE_CLINICAL_ADMIN_PIN || '1234';

function StaffPinModal({ onSuccess, onClose }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleSubmit(e) {
    e.preventDefault();
    if (pin === ADMIN_PIN) {
      onSuccess();
    } else {
      setError('Incorrect PIN. Please try again.');
      setPin('');
      inputRef.current?.focus();
    }
  }

  return (
    <div className="csm-pin-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="csm-pin-modal" role="dialog" aria-modal="true" aria-label="Staff access">
        <div className="csm-pin-icon"><LockIcon size={22} /></div>
        <h2 className="csm-pin-title">Staff Access</h2>
        <p className="csm-pin-sub">Enter your PIN to manage saved sessions.</p>
        <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <input
            ref={inputRef}
            type="password"
            className={`csm-pin-input${error ? ' csm-pin-input--error' : ''}`}
            value={pin}
            onChange={e => { setPin(e.target.value); setError(''); }}
            placeholder="••••"
            maxLength={20}
            autoComplete="current-password"
          />
          {error && <p className="csm-pin-error">{error}</p>}
          <button type="submit" className="csm-pin-submit" disabled={!pin}>Unlock</button>
        </form>
        <button type="button" className="csm-pin-cancel" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

/* ─── QR Code ─── */
const APP_URL = 'https://epsa-30d0b.web.app';

function AppQRCode() {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, APP_URL, {
      width: 120,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    });
  }, []);
  return (
    <div className="qef-qr-block">
      <canvas ref={canvasRef} />
      <p className="qef-qr-label">Scan to open on your phone</p>
    </div>
  );
}

/* ─── Welcome screen ─── */
function WelcomeScreen({ onStart, onStaffAccess, onPrintForm, onPrintQr }) {
  return (
    <div className="qef-welcome">

      {/* ── Hero ── */}
      <div className="qef-welcome-hero">
        <div className="qef-welcome-hero-top">
          <img src="/sinai_dark.png" alt="Mount Sinai" className="qef-logo" onError={(e) => { e.target.style.display = 'none'; }} />
          <ThemeSwitcher />
        </div>
        <h1 className="qef-welcome-title">
          Million Strong Initiative
          <br />
          <span className="qef-welcome-title-sub">ePSA — Electronic Prostate Specific Awareness</span>
        </h1>
        <p className="qef-welcome-sub">Bringing state-of-the-art screening directly to your community</p>
      </div>

      <div className="qef-welcome-body">

        {/* ── Stats ── */}
        <div className="qef-stats-row">
          <div className="qef-stat">
            <span className="qef-stat-num">1 in 8</span>
            <span className="qef-stat-label">Men get prostate cancer — early detection saves lives</span>
          </div>
          <div className="qef-stat">
            <span className="qef-stat-num">10,000+</span>
            <span className="qef-stat-label">Men screened since 2022</span>
          </div>
        </div>

        {/* ── Quick-read info cards ── */}
        <div className="qef-learn-section">
          <p className="qef-learn-label">Quick read — know before you go</p>

          <div className="qef-learn-card qef-learn-card--psa">
            <div className="qef-learn-card-head">
              <strong>What is PSA?</strong>
            </div>
            <p>PSA (Prostate-Specific Antigen) is a protein made by your prostate gland. A simple blood test measures its level. Elevated PSA can be an early clue to prostate cancer — or to other harmless prostate conditions. It is <em>not</em> a diagnosis on its own, but it is the best early-warning signal we have.</p>
          </div>

          <div className="qef-learn-card qef-learn-card--who">
            <div className="qef-learn-card-head">
              <strong>Who should get a PSA test?</strong>
            </div>
            <ul className="qef-learn-list">
              <li><strong>All men ages 45–75</strong> — routine screening is recommended</li>
              <li><strong>Black men from age 40</strong> — 2× higher lifetime risk</li>
              <li><strong>Family history of prostate cancer</strong> — start at 40–45</li>
              <li><strong>BRCA1/2 carrier</strong> — earlier and more frequent testing</li>
            </ul>
            <p className="qef-learn-note">Most early prostate cancer has <strong>no symptoms</strong>. Don't wait to feel something wrong.</p>
          </div>

          <div className="qef-learn-card qef-learn-card--epsa">
            <div className="qef-learn-card-head">
              <strong>What is Prostate Cancer Screening?</strong>
            </div>
            <p>This screening tool is built on data from thousands of Mount Sinai patients. It combines your age, race, family history, lifestyle, and symptoms to estimate your prostate cancer risk — giving you and your clinician a clear starting point for a shared decision about PSA testing.</p>
            <div className="qef-learn-badges">
              <span className="qef-learn-badge">AUA/SUO 2026</span>
              <span className="qef-learn-badge">NCCN 2024</span>
              <span className="qef-learn-badge">Not a diagnosis</span>
            </div>
          </div>
        </div>

        {/* ── Services ── */}
        <div className="qef-info-card">
          <div className="qef-info-title">Free services available today</div>
          <ul className="qef-info-list">
            <li>PSA blood test</li>
            <li>Bladder health scan</li>
            <li>Nurse consultation</li>
          </ul>
        </div>

        {/* ── CTA ── */}
        <button className="qef-cta-btn" onClick={onStart} type="button">
          <ZapIcon size={18} aria-hidden="true" />
          <span className="qef-cta-btn-text">
            <span className="qef-cta-btn-main">Check My Risk Now</span>
            <span className="qef-cta-btn-note">12 questions · about 1 minute</span>
          </span>
          <ChevronRightIcon size={18} aria-hidden="true" />
        </button>

        <p className="qef-walkin">
          Walk-ins welcome · No appointment needed
          <br />
          Questions? Call <a href="tel:6465318092" className="qef-tel">646-531-8092</a>
        </p>

        <AppQRCode />

        <div className="qef-welcome-actions">
          <button type="button" className="qef-action-btn" onClick={onPrintForm}>
            <FileTextIcon size={16} aria-hidden="true" />
            Print PDF Form
          </button>
          <button type="button" className="qef-action-btn" onClick={onPrintQr}>
            <PrinterIcon size={16} aria-hidden="true" />
            Print QR Code
          </button>
        </div>

        <button type="button" className="qef-staff-link" onClick={onStaffAccess}>
          Staff access
        </button>
      </div>
    </div>
  );
}

const TOTAL = 12;

/* ─── Active-session persistence ───
   The patient's own results live on their phone: the last completed session
   is kept in localStorage so closing the tab or reloading brings the results
   screen (and the consent-later option) back, until they tap "Start over".
   Expires after 24h so a shared/kiosk device doesn't show stale results. */
const ACTIVE_SESSION_KEY = 'epsa_clinical_active_session';
const ACTIVE_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function loadActiveSession() {
  try {
    const raw = JSON.parse(localStorage.getItem(ACTIVE_SESSION_KEY) || 'null');
    if (!raw?.result?.engineResult || !raw.sessionRef) return null;
    if (!raw.savedAt || Date.now() - new Date(raw.savedAt).getTime() > ACTIVE_SESSION_TTL_MS) {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

function saveActiveSession(snapshot) {
  try {
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({ ...snapshot, savedAt: new Date().toISOString() }));
  } catch { /* ignore quota errors */ }
}

function clearActiveSession() {
  try { localStorage.removeItem(ACTIVE_SESSION_KEY); } catch { /* ignore */ }
}

export default function ClinicalModeFlow() {
  const { t } = useTranslation();
  // Restore the patient's last session (if any) so a reload or closed tab
  // returns to the results screen — or to the consent question if they
  // never answered it.
  const restored = useMemo(loadActiveSession, []);
  const [screen, setScreen] = useState(restored ? (restored.consented == null ? 'storage_consent' : 'result') : 'welcome');
  const [answers, setAnswers] = useState(restored?.answers ?? {});
  const [metricH, setMetricH] = useState(false);
  const [metricW, setMetricW] = useState(false);
  const [result, setResult] = useState(restored?.result ?? null);
  const [ageError, setAgeError] = useState('');
  const [uid, setUid] = useState(null);
  const [idleSecondsLeft, setIdleSecondsLeft] = useState(null); // null = not counting
  const [sessionRef, setSessionRef] = useState(restored?.sessionRef ?? null);
  // null | 'saving' | 'saved' | 'error' | 'local' — an interrupted 'saving'
  // restores as 'error' (the local copy uploads on the next staff sync).
  const [cloudStatus, setCloudStatus] = useState(restored ? (restored.cloudStatus === 'saving' ? 'error' : restored.cloudStatus ?? null) : null);
  const [consented, setConsented] = useState(restored?.consented ?? null); // null until the consent question is answered
  const [showPrintForm, setShowPrintForm] = useState(false);
  const [showQrPoster, setShowQrPoster] = useState(false);

  useEffect(() => {
    getOrCreateUid().then(setUid).catch(() => {});
  }, []);

  // Kiosk idle-reset: when the result screen is showing and there's no
  // interaction for IDLE_WARN_S seconds, show a countdown banner, then reset.
  const IDLE_WARN_S = 90;
  const IDLE_COUNTDOWN_S = 15;
  useEffect(() => {
    if (screen !== 'result' && screen !== 'storage_consent' && screen !== 'study_consent') {
      setIdleSecondsLeft(null);
      return;
    }
    let warnTimer, countdownInterval;
    const resetTimers = () => {
      clearTimeout(warnTimer);
      clearInterval(countdownInterval);
      setIdleSecondsLeft(null);
      warnTimer = setTimeout(() => {
        setIdleSecondsLeft(IDLE_COUNTDOWN_S);
        countdownInterval = setInterval(() => {
          setIdleSecondsLeft(s => {
            if (s <= 1) { clearInterval(countdownInterval); handleReset(); return null; }
            return s - 1;
          });
        }, 1000);
      }, IDLE_WARN_S * 1000);
    };
    const events = ['pointerdown', 'keydown', 'scroll'];
    events.forEach(e => window.addEventListener(e, resetTimers, { passive: true }));
    resetTimers();
    return () => {
      clearTimeout(warnTimer);
      clearInterval(countdownInterval);
      events.forEach(e => window.removeEventListener(e, resetTimers));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // Keep the active session snapshot in sync so reloads land back here.
  useEffect(() => {
    if (result?.engineResult && sessionRef) {
      saveActiveSession({ answers, result, sessionRef, consented, cloudStatus });
    }
  }, [answers, result, sessionRef, consented, cloudStatus]);

  const set = (key, val) => setAnswers((p) => ({ ...p, [key]: val }));

  const bmi = useMemo(() => deriveBmi(answers, metricH, metricW), [answers, metricH, metricW]);

  // Per-question answered state
  const isAnswered = useMemo(() => {
    const age = parseInt(answers.age);
    const heightOk = metricH ? !!answers.heightCm : (answers.heightFt !== undefined && answers.heightFt !== '');
    const weightOk = metricW ? !!answers.weightKg : !!answers.weightLbs;
    return {
      age:           !!(age && age >= 18 && age <= 99),
      race:          !!answers.race,
      familyHistory: answers.familyHistory !== undefined && answers.familyHistory !== null && answers.familyHistory !== '',
      qol:           answers.qol !== undefined && answers.qol !== null && answers.qol !== '',
      height:        heightOk,
      weight:        weightOk,
      exercise:      answers.exercise !== undefined && answers.exercise !== null && answers.exercise !== '',
      smoking:       answers.smoking  !== undefined && answers.smoking  !== null && answers.smoking  !== '',
      diet:          !!answers.diet,
      comorbidities: answers.comorbidities !== undefined && answers.comorbidities !== null && answers.comorbidities !== '',
      shim:          answers.shim !== undefined && answers.shim !== null && answers.shim !== '',
      brca:          !!answers.brca,
    };
  }, [answers, metricH, metricW]);

  const answered = Object.values(isAnswered).filter(Boolean).length;
  const ready = answered === TOTAL;

  function handleAgeBlur() {
    const age = parseInt(answers.age);
    if (answers.age === '' || answers.age === undefined) { setAgeError(''); return; }
    if (!age || age < 18 || age > 99) setAgeError('Please enter an age between 18 and 99.');
    else setAgeError('');
  }

  async function handleSubmit() {
    if (!ready) return;
    const formData = {
      age: parseInt(answers.age),
      race: answers.race,
      ethnicity: answers.ethnicity || null,
      familyHistory: FH_MAP[answers.familyHistory] ?? 0,
      ipss: deriveIpssFromQol(answers.qol),
      ipssQol: answers.qol,
      shim: expandShimSingle(answers.shim),
      dietPattern: answers.diet || 'other',
      exercise: answers.exercise,
      smoking: answers.smoking,
      bmi: bmi ? parseFloat(bmi.toFixed(1)) : 22,
      brcaStatus: answers.brca,
      inflammationHistory: answers.inflammation === 'yes' ? 1 : 0,
      chemicalExposure: answers.chemicalExposure ?? 'no',
      comorbidityScore: Number(answers.comorbidities) || 0,
      hypertension: null, hyperlipidemia: null, coronaryArteryDisease: null, diabetes: null,
    };
    const engineResult = calculateDynamicEPsa(formData, DEFAULT_CALCULATOR_CONFIG);
    const ref = generateSessionRef();
    setSessionRef(ref);
    setResult({ engineResult, formData });
    if (consented == null) {
      // Consent question normally comes before the questionnaire; this is a
      // fallback for restored sessions that never answered it.
      setScreen('storage_consent');
    } else {
      setScreen('result');
      persistSession(consented, { formData, engineResult }, ref);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Save the session with the patient's consent choice. Consented sessions
   *  go to Turso + REDCap; non-consented ones stay on this device only. */
  function persistSession(didConsent, { formData, engineResult }, ref) {
    const localSave = uid
      ? saveClinicalSession(uid, { formData, engineResult, sessionRef: ref, rawAnswers: answers, consented: didConsent }).catch(() => null)
      : Promise.resolve(null);
    if (!didConsent) {
      setCloudStatus('local');
      return;
    }
    if (isSupabaseConfigured()) {
      setCloudStatus('saving');
      localSave
        .then((id) => pushSessions([{
          id: id ?? ref,
          sessionRef: ref,
          createdAt: new Date().toISOString(),
          formData,
          engineResult,
          rawAnswers: answers,
          consented: true,
        }]))
        .then(() => setCloudStatus('saved'))
        .catch(() => setCloudStatus('error'));
    }
    submitToRedcap(formData, ref).catch(() => {});
  }

  function handleStorageConsent(didConsent) {
    setConsented(didConsent);
    if (result?.engineResult) {
      // Asked post-submit (restored session fallback): save and show results.
      setScreen('result');
      persistSession(didConsent, result, sessionRef);
    } else {
      // Normal path: asked right after "Check My Risk", before the questions.
      setScreen('form');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Patient consents after seeing results (e.g. signs the form afterwards):
   *  upgrade the saved session and push it to the cloud. */
  function handleConsentNow() {
    setConsented(true);
    persistSession(true, result, sessionRef);
  }

  function handleReset() {
    clearActiveSession();
    setAnswers({}); setMetricH(false); setMetricW(false); setResult(null); setAgeError(''); setSessionRef(null); setCloudStatus(null); setConsented(null);
    setScreen('welcome');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleEditAnswers() {
    setScreen('form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function saveBusflowAndNavigate(studyConsent = false) {
    if (result) {
      try {
        sessionStorage.setItem('busflow_import', JSON.stringify({
          formData: result.formData,
          engineResult: result.engineResult,
          studyConsent,
        }));
      } catch { /* ignore */ }
    }
    window.location.href = window.location.origin + window.location.pathname;
  }

  function handleContinue() {
    saveBusflowAndNavigate(false);
  }

  async function handleStudyConsentAgree() {
    if (result?.formData) {
      submitToRedcap(result.formData, sessionRef); // fire-and-forget; don't block UX
    }
    saveBusflowAndNavigate(true);
  }

  if (showPrintForm) {
    return <ClinicalModePrintForm onBack={() => setShowPrintForm(false)} answers={{}} />;
  }

  if (showQrPoster) {
    return <QrCodePoster onBack={() => setShowQrPoster(false)} />;
  }

  if (screen === 'welcome') {
    return (
      <>
        {idleSecondsLeft !== null && (
          <div className="qef-idle-banner" role="alert">
            Session ending in {idleSecondsLeft}s&ensp;·&ensp;
            <button onClick={handleReset}>Start over now</button>
          </div>
        )}
        <WelcomeScreen
          onStart={() => { setScreen('form'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          onStaffAccess={() => { window.location.href = '/admin'; }}
          onPrintForm={() => setShowPrintForm(true)}
          onPrintQr={() => setShowQrPoster(true)}
        />
      </>
    );
  }

  if (screen === 'storage_consent' && result?.engineResult) {
    return (
      <div className="qef-root">
        <StorageConsentQuestion
          onYes={() => handleStorageConsent(true)}
          onNo={() => handleStorageConsent(false)}
        />
      </div>
    );
  }

  if (screen === 'study_consent') {
    return (
      <div className="qef-root">
        <BusStudyConsent
          onAgree={handleStudyConsentAgree}
          onDecline={() => { setScreen('result'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
        />
      </div>
    );
  }

  if (screen === 'result' && result?.engineResult) {
    return (
      <div className="qef-root">
        {idleSecondsLeft !== null && (
          <div className="qef-idle-banner" role="alert">
            Session ending in {idleSecondsLeft}s&ensp;·&ensp;
            <button onClick={handleReset}>Start over now</button>
          </div>
        )}
        <div className="qef-result-header">
          <button type="button" className="qef-logo-home-btn" onClick={() => { handleReset(); }} title="Go to home">
            <img src="/sinai_dark.png" alt="Mount Sinai" style={{ height: '1.5rem', width: 'auto' }} onError={(e) => { e.target.style.display = 'none'; }} />
          </button>
          <span className="qef-result-header-title">Your Results</span>
        </div>
        <ClinicalModeResult
          result={result.engineResult}
          answers={answers}
          formData={result.formData}
          sessionRef={sessionRef}
          cloudStatus={cloudStatus}
          consented={consented}
          onConsentNow={handleConsentNow}
          readOnly={false}
          onEditAnswers={handleEditAnswers}
          onStartOver={handleReset}
          onContinue={handleContinue}
          onStudyConsent={() => { setScreen('study_consent'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
        />
      </div>
    );
  }

  const bmiLabel = bmi
    ? `${t('part1.step2.bmiLabel')}: ${bmi.toFixed(1)} — ${bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese'}`
    : null;

  return (
    <div className="qef-root">
      {/* ── Sticky progress bar ── */}
      <div className="qef-progress-bar">
        <div className="qef-progress-top">
          <button type="button" className="qef-logo-home-btn" onClick={() => { setScreen('welcome'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} title="Go to home">
            <img src="/sinai_dark.png" alt="Mount Sinai" style={{ height: '1.25rem', width: 'auto' }} onError={(e) => { e.target.style.display = 'none'; }} />
          </button>
          <button type="button" className="qef-back-btn" onClick={() => { setScreen('welcome'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            <ArrowLeftIcon size={16} aria-hidden="true" /> Back
          </button>
          <div className="qef-progress-text">{answered} / {TOTAL}</div>
          <div className="qef-progress-controls">
            <TextScaleControl />
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
        </div>
        <div className="qef-progress-track">
          <div className="qef-progress-fill" style={{ width: `${(answered / TOTAL) * 100}%` }} />
        </div>
      </div>

      <div className="qef-questions">

        {/* Q1 — Age */}
        <QCard num={1} label={t('part1.fields.age.title')} info={fieldReferences.age}
          sublabel={t('part1.fields.age.helper')} answered={isAnswered.age}>
          <input className={`qef-input${ageError ? ' qef-input--error' : ''}`}
            type="number" min={18} max={99}
            placeholder={t('part1.fields.age.placeholder')}
            value={answers.age ?? ''}
            onChange={(e) => { set('age', e.target.value); setAgeError(''); }}
            onBlur={handleAgeBlur}
          />
          {ageError && <p className="qef-field-error">{ageError}</p>}
        </QCard>

        {/* Q2 — Race */}
        <QCard num={2} label={t('part1.fields.race.title')} info={fieldReferences.race} answered={isAnswered.race}>
          <Chips ariaLabel={t('part1.fields.race.title')} value={answers.race ?? ''} onChange={(v) => set('race', v)}
            options={[
              { value: 'african-american', label: t('part1.race.african-american') },
              { value: 'american-indian',  label: t('part1.race.american-indian') },
              { value: 'asian',            label: t('part1.race.asian') },
              { value: 'native-hawaiian',  label: t('part1.race.native-hawaiian') },
              { value: 'white',            label: t('part1.race.white') },
              { value: 'unknown',          label: t('part1.race.unknown') },
            ]}
          />
        </QCard>

        {/* Q2b — Ethnicity */}
        <QCard num="2b" label={t('part1.fields.ethnicity.title')} answered={!!answers.ethnicity}>
          <Chips ariaLabel={t('part1.fields.ethnicity.title')} value={answers.ethnicity ?? ''} onChange={(v) => set('ethnicity', v)}
            options={[
              { value: 'hispanic-latino',     label: t('part1.ethnicity.hispanic-latino') },
              { value: 'not-hispanic-latino', label: t('part1.ethnicity.not-hispanic-latino') },
              { value: 'unknown',             label: t('part1.ethnicity.unknown') },
            ]}
          />
        </QCard>

        {/* Q3 — Family history */}
        <QCard num={3} label={t('part1.step1.familyHistory.title')} info={fieldReferences.familyHistory}
          sublabel={t('part1.fields.familyHistory.helper')} answered={isAnswered.familyHistory}>
          <Chips ariaLabel={t('part1.step1.familyHistory.title')} value={answers.familyHistory ?? ''} onChange={(v) => set('familyHistory', v)}
            options={[
              { value: 'none',     label: t('quickEntry.family.none') },
              { value: 'one',      label: t('quickEntry.family.one') },
              { value: 'two_plus', label: t('quickEntry.family.twoPlus') },
              { value: 'unknown',  label: t('part1.options.unknown') },
            ]}
          />
        </QCard>

        {/* Q4 — Urinary QoL */}
        <QCard num={4} label={t('part1.steps.ipss.sectionTitle')} info={fieldReferences.ipss}
          sublabel={t('quickEntry.ipssQolLabel')} answered={isAnswered.qol}
          citation="International Prostate Symptom Score (IPSS) — AUA/WHO validated. Score ≥ 3 warrants clinical evaluation.">
          <Chips ariaLabel={t('part1.steps.ipss.sectionTitle')} value={answers.qol ?? ''} onChange={(v) => set('qol', v)}
            options={[
              { value: 0, label: t('quickEntry.ipssQol.delighted') },
              { value: 1, label: t('quickEntry.ipssQol.pleased') },
              { value: 2, label: t('quickEntry.ipssQol.mostlySatisfied') },
              { value: 3, label: t('quickEntry.ipssQol.mixed') },
              { value: 4, label: t('quickEntry.ipssQol.mostlyDissatisfied') },
              { value: 5, label: t('quickEntry.ipssQol.unhappy') },
              { value: 6, label: t('quickEntry.ipssQol.terrible') },
            ]}
          />
        </QCard>

        {/* Q5 — Height */}
        <QCard num={5} label={t('part1.step2.heightQuestion')} info={fieldReferences.heightWeight} answered={isAnswered.height}>
          <div className="qef-unit-row">
            <button type="button" className="qef-unit-toggle" onClick={() => setMetricH((v) => !v)}>
              {metricH ? t('part1.step2.heightUnit.metric') : t('part1.step2.heightUnit.imperial')}
            </button>
          </div>
          {metricH ? (
            <input className="qef-input" type="number" min={100} max={250}
              placeholder={t('part1.step2.heightMetricPlaceholder')}
              value={answers.heightCm ?? ''} onChange={(e) => set('heightCm', e.target.value)} />
          ) : (
            <div className="qef-height-row">
              <input className="qef-input qef-input--sm" type="number" min={3} max={8}
                placeholder={t('part1.step2.heightImperialFeetPlaceholder')}
                value={answers.heightFt ?? ''} onChange={(e) => set('heightFt', e.target.value)} />
              <input className="qef-input qef-input--sm" type="number" min={0} max={11}
                placeholder={t('part1.step2.heightImperialInchesPlaceholder')}
                value={answers.heightIn ?? ''} onChange={(e) => set('heightIn', e.target.value)} />
            </div>
          )}
        </QCard>

        {/* Q6 — Weight + live BMI */}
        <QCard num={6} label={t('part1.step2.weightQuestion')} info={fieldReferences.heightWeight}
          sublabel={t('part1.step2.weightHelper')} answered={isAnswered.weight}>
          <div className="qef-unit-row">
            <button type="button" className="qef-unit-toggle" onClick={() => setMetricW((v) => !v)}>
              {metricW ? t('part1.step2.weightUnit.kg') : t('part1.step2.weightUnit.lbs')}
            </button>
          </div>
          {metricW ? (
            <input className="qef-input" type="number" min={30} max={300}
              placeholder={t('part1.step2.weightMetricPlaceholder')}
              value={answers.weightKg ?? ''} onChange={(e) => set('weightKg', e.target.value)} />
          ) : (
            <input className="qef-input" type="number" min={66} max={660}
              placeholder={t('part1.step2.weightImperialPlaceholder')}
              value={answers.weightLbs ?? ''} onChange={(e) => set('weightLbs', e.target.value)} />
          )}
          {bmiLabel && <div className="qef-bmi-badge">{bmiLabel}</div>}
        </QCard>

        {/* Q7 — Exercise */}
        <QCard num={7} label={t('part1.fields.exercise.title')} info={fieldReferences.exercise}
          sublabel={t('part1.fields.exercise.helper')} answered={isAnswered.exercise}>
          <Chips ariaLabel={t('part1.fields.exercise.title')} value={answers.exercise ?? ''} onChange={(v) => set('exercise', v)}
            options={[
              { value: 0, label: t('part1.step3.exercise.regular') },
              { value: 1, label: t('part1.step3.exercise.some') },
              { value: 2, label: t('part1.step3.exercise.none') },
            ]}
          />
        </QCard>

        {/* Q8 — Smoking */}
        <QCard num={8} label={t('part1.fields.smoking.title')} info={fieldReferences.smoking}
          sublabel={t('part1.fields.smoking.helper')} answered={isAnswered.smoking}>
          <Chips ariaLabel={t('part1.fields.smoking.title')} value={answers.smoking ?? ''} onChange={(v) => set('smoking', v)}
            options={[
              { value: 0, label: t('part1.step3.smoking.never') },
              { value: 1, label: t('part1.step3.smoking.former') },
              { value: 2, label: t('part1.step3.smoking.current') },
            ]}
          />
        </QCard>

        {/* Q9 — Diet */}
        <QCard num={9} label={t('part1.fields.diet.title')} info={fieldReferences.diet}
          sublabel={t('part1.fields.diet.helper')} answered={isAnswered.diet}>
          <Chips ariaLabel={t('part1.fields.diet.title')} value={answers.diet ?? ''} onChange={(v) => set('diet', v)}
            options={[
              { value: 'western',       label: t('part1.step4.diet.western') },
              { value: 'mediterranean', label: t('part1.step4.diet.mediterranean') },
              { value: 'asian',         label: t('part1.step4.diet.asian') },
              { value: 'dash',          label: t('part1.step4.diet.dash') },
              { value: 'plant-based',   label: t('part1.step4.diet.plantBased') },
              { value: 'pescatarian',   label: t('part1.step4.diet.pescatarian') },
              { value: 'low-carb-keto', label: t('part1.step4.diet.lowCarbKeto') },
              { value: 'other',         label: t('part1.step4.diet.other') },
            ]}
          />
        </QCard>

        {/* Q10 — Comorbidities */}
        <QCard num={10} label="Major comorbidities" info={fieldReferences.comorbidities}
          sublabel="Hypertension, high cholesterol (hyperlipidemia), coronary artery disease, or diabetes"
          answered={isAnswered.comorbidities}>
          <Chips ariaLabel="Comorbidities" value={answers.comorbidities ?? ''} onChange={(v) => set('comorbidities', v)}
            options={[
              { value: 0, label: 'None' },
              { value: 1, label: 'One' },
              { value: 2, label: 'Two or more' },
            ]}
          />
        </QCard>

        {/* Q11 — SHIM */}
        <QCard num={11} label={t('part1.fields.shim.title')} info={fieldReferences.shim}
          sublabel={t('part1.shimShort.singleQuestionLabel')} answered={isAnswered.shim}
          citation="Sexual Health Inventory for Men (SHIM / IIEF-5). Your answer is private and confidential.">
          <Chips ariaLabel={t('part1.fields.shim.title')} value={answers.shim ?? ''} onChange={(v) => set('shim', v)}
            options={[
              { value: 1, label: t('part1.shimShort.options.severe') },
              { value: 2, label: t('part1.shimShort.options.moderate') },
              { value: 3, label: t('part1.shimShort.options.mildModerate') },
              { value: 4, label: t('part1.shimShort.options.mild') },
              { value: 5, label: t('part1.shimShort.options.none') },
            ]}
          />
        </QCard>

        {/* Q12 — BRCA / Genetic testing */}
        <QCard num={12} label={t('part1.fields.brcaStatus.title')} info={fieldReferences.brcaStatus}
          sublabel={t('part1.fields.brcaStatus.helper')} answered={isAnswered.brca}>
          <Chips ariaLabel={t('part1.fields.brcaStatus.title')} value={answers.brca ?? ''} onChange={(v) => set('brca', v)}
            options={[
              { value: 'no',      label: t('part1.options.no') },
              { value: 'yes',     label: t('part1.options.yes') },
              { value: 'unknown', label: t('part1.options.unknown') },
            ]}
          />
        </QCard>

        {/* Optional factors */}
        <div className="qef-optional-section">
          <p className="qef-optional-heading">Optional — answer if known</p>

          {/* Inflammation history */}
          <QCard num="+" label="History of prostate inflammation / prostatitis"
            info={fieldReferences.inflammationHistory}
            answered={answers.inflammation !== undefined}>
            <Chips ariaLabel="Inflammation history" value={answers.inflammation ?? ''} onChange={(v) => set('inflammation', v)}
              options={[
                { value: 'no',  label: 'No' },
                { value: 'yes', label: 'Yes' },
              ]}
            />
          </QCard>

          {/* Chemical / occupational exposure */}
          <QCard num="+" label="Chemical or occupational exposure"
            info={fieldReferences.chemicalExposure}
            sublabel="Includes Agent Orange, 9/11 WTC dust, or other significant chemical exposure"
            answered={answers.chemicalExposure !== undefined}>
            <Chips ariaLabel="Chemical exposure" value={answers.chemicalExposure ?? ''} onChange={(v) => set('chemicalExposure', v)}
              options={[
                { value: 'no',      label: 'No' },
                { value: 'yes',     label: 'Yes' },
                { value: 'unknown', label: 'Unknown' },
              ]}
            />
          </QCard>
        </div>

      </div>

      {/* ── Sticky footer ── */}
      <div className="qef-footer">
        <div className="qef-footer-inner">
          <button type="button" className="qef-reset-link" onClick={handleReset}>
            <RotateCcwIcon size={13} aria-hidden="true" />
            Start over
          </button>
          <button type="button"
            className={`qef-submit-btn${ready ? ' qef-submit-btn--ready' : ''}`}
            disabled={!ready} onClick={handleSubmit}
          >
            {ready ? 'See My Result' : `${answered} / ${TOTAL} answered`}
            <ChevronRightIcon size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
