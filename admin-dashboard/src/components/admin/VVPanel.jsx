/**
 * Verification & Validation Panel
 * FDA SaMD quality-assurance panel for ePSA — model verification,
 * clinical validation tracking, and risk mitigation log.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, Play, CheckCircle, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { calculateDynamicEPsa } from '@frontend/utils/epsaEngine';
import { DEFAULT_CALCULATOR_CONFIG } from '@frontend/config/calculatorConfig';
import './VVPanel.css';

// ─── Score helper ─────────────────────────────────────────────────────────────

function getScore(formData) {
  const result = calculateDynamicEPsa(formData, DEFAULT_CALCULATOR_CONFIG);
  return result?.calculationDetails?.rawScore ?? null;
}

// ─── Test case builders ───────────────────────────────────────────────────────
// Key mappings confirmed from epsaEngine.js:
//   exercise  → Number(formData.exercise)   0=regular 1=some 2=none
//   smoking   → Number(formData.smoking)    0=never   1=former 2=current
//   dietPattern → formData.dietPattern      'western'|'red_meat'|other
//   brcaStatus  → formData.brcaStatus       'yes'|'no'|'unknown'
//   familyHistory → formData.familyHistory  number (>0 = positive)
//   ipss      → array of 7 ints [0-5]
//   shim      → array of 5 ints [0-5]
//   comorbidityScore → 0|1|2

const IPSS_NONE   = [0, 0, 0, 0, 0, 0, 0];  // total 0  — mild
const IPSS_MILD   = [1, 1, 1, 1, 1, 1, 0];  // total 6  — mild
const IPSS_SEVERE = [4, 4, 4, 4, 4, 4, 4];  // total 28 — severe
const SHIM_NORMAL = [5, 5, 5, 5, 5];        // total 25 — normal erectile function
const SHIM_NEUT   = [3, 3, 3, 3, 3];        // total 15 — mild (no extra points)
const SHIM_ED     = [2, 2, 2, 2, 2];        // total 10 — moderate ED (<12) → +8 pts

function base(overrides = {}) {
  return {
    race: 'white',
    familyHistory: 0,
    bmi: 26,
    ipss: IPSS_MILD,
    shim: SHIM_NEUT,
    exercise: 0,       // regular
    smoking: 0,        // never — NOTE: engine reads formData.smoking (number), not smokingStatus
    dietPattern: 'other',
    brcaStatus: 'no',
    comorbidityScore: 0,
    ...overrides,
  };
}

// ── Score Range: 5 test cases ──────────────────────────────────────────────
// rawScore is the sum of clinical points. It can exceed 80 (probability is clamped
// to 100% separately). The valid range check is: rawScore >= 0 and not null.
const RANGE_CASES = [
  {
    label: 'Worst case — age 75, Black, FH 2+, BMI 35, IPSS severe, no exercise, current smoker, western diet, BRCA+, 2 comorbidities',
    data: base({ age: 75, race: 'black', familyHistory: 2, bmi: 35, ipss: IPSS_SEVERE, shim: SHIM_ED, exercise: 2, smoking: 2, dietPattern: 'western', brcaStatus: 'yes', comorbidityScore: 2 }),
    expectRange: [0, 200],
  },
  {
    label: 'Best case — age 40, white, no FH, BMI 22, IPSS none, regular exercise, never smoked, mediterranean, BRCA−, 0 comorbidities',
    data: base({ age: 40, race: 'white', familyHistory: 0, bmi: 22, ipss: IPSS_NONE, shim: SHIM_NORMAL, exercise: 0, smoking: 0, dietPattern: 'mediterranean', brcaStatus: 'no', comorbidityScore: 0 }),
    expectRange: [0, 200],
  },
  {
    label: 'Average — age 55, unknown race, no FH, BMI 26, IPSS mild, some exercise, former smoker, other diet, BRCA unknown, 1 comorbidity',
    data: base({ age: 55, race: 'unknown', familyHistory: 0, bmi: 26, ipss: IPSS_MILD, shim: SHIM_NEUT, exercise: 1, smoking: 1, dietPattern: 'other', brcaStatus: 'unknown', comorbidityScore: 1 }),
    expectRange: [0, 200],
  },
  {
    label: 'Edge — age 18 (below model range; engine returns shell with rawScore 0)',
    data: base({ age: 18, race: 'white', familyHistory: 0, bmi: 22, ipss: IPSS_NONE, shim: SHIM_NORMAL, exercise: 0, smoking: 0, comorbidityScore: 0 }),
    expectRange: [0, 0],
    note: 'Shell: belowMinAge',
  },
  {
    label: 'Edge — age 99 (above model range; engine returns shell with rawScore 0)',
    data: base({ age: 99, race: 'white', familyHistory: 0, bmi: 22, ipss: IPSS_NONE, shim: SHIM_NORMAL, exercise: 0, smoking: 0, comorbidityScore: 0 }),
    expectRange: [0, 0],
    note: 'Shell: aboveMaxScreeningAge',
  },
];

// ── Monotonicity: each "higher risk" case must score ≥ "lower risk" ──────────
// Base uses age 55, white, no FH, BMI 26, IPSS mild=6 (below 8 → 0 pts),
// regular exercise, never smoked, other diet, BRCA no, 0 comorbidities, neutral SHIM.
const MONO_BASE = base({ age: 55 });

const MONO_PAIRS = [
  {
    label: 'Age 70 ≥ Age 45 (older age → higher score)',
    higher: base({ age: 70 }),
    lower:  base({ age: 45 }),
  },
  {
    label: 'Black ancestry ≥ White (Black race → higher score)',
    higher: base({ age: 55, race: 'black' }),
    lower:  base({ age: 55, race: 'white' }),
  },
  {
    label: 'FH 2+ ≥ No FH (first-degree family history → higher score)',
    higher: base({ age: 55, familyHistory: 2 }),
    lower:  base({ age: 55, familyHistory: 0 }),
  },
  {
    label: 'BMI 35 ≥ BMI 22 (obesity → higher score)',
    higher: base({ age: 55, bmi: 35 }),
    lower:  base({ age: 55, bmi: 22 }),
  },
  {
    label: 'IPSS severe ≥ IPSS none (moderate–severe LUTS → higher score; engine uses literature value, not the negative training-set coefficient)',
    higher: base({ age: 55, ipss: IPSS_SEVERE }),  // total 28 → 8 pts
    lower:  base({ age: 55, ipss: IPSS_NONE }),    // total 0  → 0 pts
  },
];

// ── Tier threshold: one known-low and one known-elevated case ─────────────────
// Low: age 40, all defaults → rawScore expected = 0 (< 18)
// Elevated: age 55, Black, FH+, BMI 35, no exercise, comorbidities → score well above 18
const TIER_LOW  = base({ age: 40, race: 'white', familyHistory: 0, bmi: 22, ipss: IPSS_NONE, shim: SHIM_NORMAL, exercise: 0, smoking: 0, brcaStatus: 'no', comorbidityScore: 0 });
const TIER_HIGH = base({ age: 55, race: 'black', familyHistory: 2, bmi: 35, ipss: IPSS_MILD, exercise: 2, smoking: 2, dietPattern: 'western', comorbidityScore: 2 });

// ─── Run all checks ───────────────────────────────────────────────────────────

function runVerification() {
  // Check 1 — Score Range
  const rangeResults = RANGE_CASES.map(tc => {
    const raw = getScore(tc.data);
    const pass = raw !== null && raw >= tc.expectRange[0] && raw <= tc.expectRange[1];
    return { label: tc.label, raw, expectRange: tc.expectRange, note: tc.note, pass };
  });
  const check1Pass = rangeResults.every(r => r.pass);

  // Check 2 — Monotonicity
  const monoResults = MONO_PAIRS.map(pair => {
    const hi = getScore(pair.higher);
    const lo = getScore(pair.lower);
    const pass = hi !== null && lo !== null && hi >= lo;
    return { label: pair.label, hi, lo, pass };
  });
  const check2Pass = monoResults.every(r => r.pass);

  // Check 3 — Tier Thresholds
  const lowRaw  = getScore(TIER_LOW);
  const highRaw = getScore(TIER_HIGH);
  const tier3LowPass  = lowRaw  !== null && lowRaw  < 18;
  const tier3HighPass = highRaw !== null && highRaw >= 18;
  const check3Pass    = tier3LowPass && tier3HighPass;

  // Check 4 — EPV
  const numVars = DEFAULT_CALCULATOR_CONFIG.part1.variables.length;
  const events  = 23;
  const epv     = numVars > 0 ? parseFloat((events / numVars).toFixed(2)) : 0;
  const check4Pass = epv >= 10;

  return {
    allPass: check1Pass && check2Pass && check3Pass && check4Pass,
    checks: [
      { id: 1, label: 'Score Range — calculator returns a valid non-negative rawScore for all 5 test cases', pass: check1Pass, detail: rangeResults },
      { id: 2, label: 'Monotonicity — each high-risk input scores ≥ its matched low-risk input', pass: check2Pass, detail: monoResults },
      { id: 3, label: 'Tier Thresholds — Youden cutoff rawScore ≥ 18 maps to Elevated tier', pass: check3Pass, detail: { lowRaw, highRaw, tier3LowPass, tier3HighPass } },
      { id: 4, label: 'EPV (events per variable) — minimum standard ≥ 10', pass: check4Pass, detail: { events, numVars, epv } },
    ],
  };
}

// ─── Clinical Validation Tracker (Section 2) ─────────────────────────────────

const TRACKER_KEY = 'epsa_vv_tracker';
const MILESTONES = [
  { id: 'dataset',    label: 'Retrospective dataset assembled', target: 'N ≥ 600'  },
  { id: 'events',     label: 'Events (PSA > 4.0) confirmed',   target: 'N ≥ 120'  },
  { id: 'epv',        label: 'EPV achieved (≥ 10)',            target: 'Yes'       },
  { id: 'auc',        label: 'Internal AUC (PSA > 4.0)',       target: '≥ 0.75'   },
  { id: 'calibration',label: 'Calibration (H-L p-value)',      target: '> 0.05'   },
  { id: 'dca',        label: 'Decision Curve Analysis done',   target: 'Yes'       },
  { id: 'external',   label: 'External validation started',    target: 'N ≥ 1000' },
  { id: 'paper1',     label: 'Paper 1 submitted',              target: 'Eur Urol'  },
];

function loadTracker() {
  try {
    const s = localStorage.getItem(TRACKER_KEY);
    if (s) return JSON.parse(s);
  } catch {}
  return Object.fromEntries(MILESTONES.map(m => [m.id, 'Pending']));
}

// ─── Risk Mitigation Log (Section 3) ─────────────────────────────────────────

const RISK_LOG_KEY = 'epsa_risk_log';
const FAILURE_MODES = [
  { id: 'false_low',       label: 'False low score → missed PSA referral',                  mitigation: 'Conservative threshold (≥18) + disclaimer',                        defaultOpen: false },
  { id: 'defaults',        label: 'Default values accepted uncritically (BMI 26, IPSS 4)',   mitigation: 'DefaultBadge labels in QuickEPsaEntry',                             defaultOpen: false },
  { id: 'weight_mismatch', label: 'Model weight mismatch after refit',                       mitigation: 'Version lock in calculatorConfig + monotonicity checks',             defaultOpen: false },
  { id: 'redcap',          label: 'REDCap submission fails silently',                        mitigation: 'Auto-retry + local session fallback in clinicalSessionService',      defaultOpen: false },
  { id: 'epv_low',         label: 'EPV < 10 — model underpowered',                          mitigation: 'Expand dataset to N ≥ 600 (Study 1)',                               defaultOpen: true  },
];

function loadRiskLog() {
  try {
    const s = localStorage.getItem(RISK_LOG_KEY);
    if (s) return JSON.parse(s);
  } catch {}
  return Object.fromEntries(FAILURE_MODES.map(f => [f.id, f.defaultOpen ? 'open' : 'mitigated']));
}

// ─── Collapsible Section ──────────────────────────────────────────────────────

function Section({ title, badge, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="vvp-section">
      <button className="vvp-section-header" onClick={() => setOpen(o => !o)}>
        <span className="vvp-section-chevron">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
        <span className="vvp-section-title">{title}</span>
        {badge}
      </button>
      {open && <div className="vvp-section-body">{children}</div>}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

const VVPanel = () => {
  const [verResult, setVerResult] = useState(null);
  const [running, setRunning]     = useState(false);
  const [lastRun, setLastRun]     = useState(null);
  const [tracker, setTracker]     = useState(loadTracker);
  const [riskLog, setRiskLog]     = useState(loadRiskLog);

  const runChecks = useCallback(() => {
    setRunning(true);
    // defer to next tick so the spinner renders
    setTimeout(() => {
      try { setVerResult(runVerification()); } catch (e) { console.error('[VVP]', e); }
      setLastRun(new Date());
      setRunning(false);
    }, 0);
  }, []);

  useEffect(() => { runChecks(); }, [runChecks]);

  const updateTracker = (id, value) => {
    setTracker(prev => {
      const next = { ...prev, [id]: value };
      localStorage.setItem(TRACKER_KEY, JSON.stringify(next));
      return next;
    });
  };

  const toggleRisk = (id) => {
    setRiskLog(prev => {
      const next = { ...prev, [id]: prev[id] === 'open' ? 'mitigated' : 'open' };
      localStorage.setItem(RISK_LOG_KEY, JSON.stringify(next));
      return next;
    });
  };

  const openRisks          = Object.values(riskLog).filter(v => v === 'open').length;
  const completedMilestones = MILESTONES.filter(m => tracker[m.id] && tracker[m.id] !== 'Pending').length;
  const cfg                = DEFAULT_CALCULATOR_CONFIG;
  const epvValue           = parseFloat((23 / cfg.part1.variables.length).toFixed(2));
  const epvColor           = epvValue > 20 ? 'green' : epvValue >= 10 ? 'yellow' : 'red';

  return (
    <div className="vvp-root">
      <div className="vvp-page-header">
        <h2>Verification &amp; Validation</h2>
        <p className="vvp-subtitle">FDA SaMD Quality Assurance — Model verification, clinical validation tracking, and risk mitigation</p>
      </div>

      {/* ── Section 1: Model Verification ── */}
      <Section
        title="Model Verification"
        badge={
          verResult && (
            <span className={`vvp-badge ${verResult.allPass ? 'green' : 'red'}`}>
              {verResult.checks.filter(c => c.pass).length} / {verResult.checks.length} checks passed
            </span>
          )
        }
      >
        <div className="vvp-ver-toolbar">
          <button className="vvp-run-btn" onClick={runChecks} disabled={running}>
            {running ? <RefreshCw size={14} className="vvp-spin" /> : <Play size={14} />}
            {running ? 'Running…' : 'Run Verification'}
          </button>
          {lastRun && (
            <span className="vvp-timestamp">Last run: {lastRun.toLocaleTimeString()}</span>
          )}
        </div>

        {verResult && verResult.checks.map(check => (
          <div key={check.id} className="vvp-check-block">
            <div className="vvp-check-row">
              <span className={`vvp-check-icon ${check.pass ? 'pass' : 'fail'}`}>
                {check.pass ? <CheckCircle size={16} /> : <XCircle size={16} />}
              </span>
              <span className="vvp-check-label">
                <strong>Check {check.id}</strong> — {check.label}
              </span>
              <span className={`vvp-badge ${check.pass ? 'green' : 'red'}`}>
                {check.pass ? 'PASS' : 'FAIL'}
              </span>
            </div>

            {/* Check 1 detail */}
            {check.id === 1 && Array.isArray(check.detail) && (
              <table className="vvp-table vvp-detail-table">
                <thead><tr><th>Test Case</th><th>rawScore</th><th>Expected</th><th>Result</th></tr></thead>
                <tbody>
                  {check.detail.map((r, i) => (
                    <tr key={i}>
                      <td>{r.label}</td>
                      <td className="vvp-mono">{r.raw !== null ? r.raw : '—'}</td>
                      <td className="vvp-mono">[{r.expectRange[0]}, {r.expectRange[1] === 200 ? '∞' : r.expectRange[1]}]</td>
                      <td><span className={`vvp-badge sm ${r.pass ? 'green' : 'red'}`}>{r.pass ? '✓' : '✗'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Check 2 detail */}
            {check.id === 2 && Array.isArray(check.detail) && (
              <table className="vvp-table vvp-detail-table">
                <thead><tr><th>Pair</th><th>High-risk</th><th>Low-risk</th><th>Result</th></tr></thead>
                <tbody>
                  {check.detail.map((r, i) => (
                    <tr key={i}>
                      <td>{r.label}</td>
                      <td className="vvp-mono">{r.hi}</td>
                      <td className="vvp-mono">{r.lo}</td>
                      <td><span className={`vvp-badge sm ${r.pass ? 'green' : 'red'}`}>{r.pass ? '✓' : '✗'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Check 3 detail */}
            {check.id === 3 && check.detail && (
              <div className="vvp-tier-detail">
                <div className={`vvp-tier-item ${check.detail.tier3LowPass ? 'pass' : 'fail'}`}>
                  Low-risk input → rawScore = <strong>{check.detail.lowRaw}</strong> (expected &lt; 18)
                  {check.detail.tier3LowPass ? ' ✓' : ' ✗ FAIL'}
                </div>
                <div className={`vvp-tier-item ${check.detail.tier3HighPass ? 'pass' : 'fail'}`}>
                  High-risk input → rawScore = <strong>{check.detail.highRaw}</strong> (expected ≥ 18)
                  {check.detail.tier3HighPass ? ' ✓' : ' ✗ FAIL'}
                </div>
              </div>
            )}

            {/* Check 4 detail */}
            {check.id === 4 && check.detail && (
              <div className="vvp-epv-detail">
                <span>Events (csPCa): <strong>{check.detail.events}</strong></span>
                <span>Variables (Part 1): <strong>{check.detail.numVars}</strong></span>
                <span>EPV: <span className={`vvp-badge ${epvColor}`}>{check.detail.epv}</span></span>
                <span className="vvp-epv-note">Minimum standard is ≥ 10 — dataset expansion to N ≥ 600 required</span>
              </div>
            )}
          </div>
        ))}
      </Section>

      {/* ── Section 2: Clinical Validation Tracker ── */}
      <Section
        title="Clinical Validation Tracker"
        badge={
          <span className={`vvp-badge ${completedMilestones === MILESTONES.length ? 'green' : completedMilestones > 0 ? 'yellow' : 'red'}`}>
            {completedMilestones} / {MILESTONES.length} milestones complete
          </span>
        }
      >
        <table className="vvp-table vvp-tracker-table">
          <thead>
            <tr><th>#</th><th>Milestone</th><th>Target</th><th>Status</th></tr>
          </thead>
          <tbody>
            {MILESTONES.map((m, i) => {
              const val      = tracker[m.id] || 'Pending';
              const complete = val && val !== 'Pending';
              return (
                <tr key={m.id} className={complete ? 'vvp-row-complete' : ''}>
                  <td className="vvp-cell-num">{i + 1}</td>
                  <td>{m.label}</td>
                  <td className="vvp-cell-target">{m.target}</td>
                  <td>
                    <input
                      className="vvp-input"
                      value={val}
                      onChange={e => updateTracker(m.id, e.target.value)}
                      placeholder="Pending"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      {/* ── Section 3: Risk Mitigation Log ── */}
      <Section
        title="Risk Mitigation Log"
        badge={
          openRisks > 0
            ? <span className="vvp-badge red">{openRisks} open risk{openRisks !== 1 ? 's' : ''}</span>
            : <span className="vvp-badge green">All risks mitigated</span>
        }
      >
        <table className="vvp-table vvp-risk-table">
          <thead>
            <tr><th>#</th><th>Failure Mode</th><th>Mitigation</th><th>Status</th></tr>
          </thead>
          <tbody>
            {FAILURE_MODES.map((f, i) => {
              const isOpen = (riskLog[f.id] || 'open') === 'open';
              return (
                <tr key={f.id} className={isOpen ? 'vvp-row-open' : 'vvp-row-mitigated'}>
                  <td className="vvp-cell-num">{i + 1}</td>
                  <td>{f.label}</td>
                  <td className="vvp-cell-mitigation">{f.mitigation}</td>
                  <td>
                    <button
                      className={`vvp-toggle ${isOpen ? 'open' : 'mitigated'}`}
                      onClick={() => toggleRisk(f.id)}
                    >
                      {isOpen
                        ? <><AlertTriangle size={12} /> Open</>
                        : <><CheckCircle size={12} /> Mitigated</>
                      }
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
    </div>
  );
};

export default VVPanel;
