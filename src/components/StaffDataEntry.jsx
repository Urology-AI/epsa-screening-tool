import React, { useState, useRef, useEffect } from 'react';
import { submitToRedcap } from '../utils/redcapSubmit';
import './StaffDataEntry.css';

const EMPTY = {
  sessionRef: '',
  age: '',
  race: '',
  bmi: '',
  ipssTotal: '',
  ipssQol: '',
  shimTotal: '',
  familyHistory: '',
  exercise: '',
  smoking: '',
  brcaStatus: '',
  chemicalExposure: '',
  brcaNotes: '',
};

function genUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'cm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

// Build formData shape compatible with buildClinicalRecord in redcapSubmit.js
function buildFormData(f) {
  const shimTotalNum = f.shimTotal === '' ? null : Number(f.shimTotal);
  // Distribute shim total across 5 questions (max 5 each)
  function distribute(total, len, max) {
    if (total === null || total === undefined || total === '' || !Number.isFinite(total)) return Array(len).fill(null);
    const arr = Array(len).fill(0);
    let rem = Math.max(0, total);
    for (let i = 0; i < len; i++) { const v = Math.min(max, rem); arr[i] = v; rem -= v; if (rem <= 0) break; }
    return arr;
  }
  // For IPSS, derive array from total
  const ipssTotalNum = f.ipssTotal === '' ? null : Number(f.ipssTotal);
  function distributeIpss(total) {
    if (total === null || !Number.isFinite(total)) return Array(7).fill(null);
    const arr = Array(7).fill(0);
    let rem = Math.max(0, total);
    for (let i = 0; i < 7; i++) { const v = Math.min(5, rem); arr[i] = v; rem -= v; if (rem <= 0) break; }
    return arr;
  }

  // Map race values to what buildClinicalRecord expects
  const RACE_VALUE_MAP = {
    'white': 'white',
    'african-american': 'african-american',
    'hispanic': 'hispanic',
    'asian': 'asian',
    'mixed': 'mixed',
    'other': 'other',
    'unknown': 'unknown',
  };

  const FH_MAP = {
    '0': 0,
    '1': 1,
    '2': 2,
    'unknown': 'unknown',
  };

  return {
    age: f.age === '' ? undefined : Number(f.age),
    race: (RACE_VALUE_MAP[f.race] ?? f.race) || undefined,
    ethnicity: null,
    bmi: f.bmi === '' ? undefined : Number(f.bmi),
    ipss: distributeIpss(ipssTotalNum),
    ipssQol: f.ipssQol === '' ? undefined : Number(f.ipssQol),
    shim: distribute(shimTotalNum, 5, 5),
    familyHistory: FH_MAP[f.familyHistory] ?? undefined,
    exercise: f.exercise === '' ? undefined : Number(f.exercise),
    smoking: f.smoking === '' ? undefined : Number(f.smoking),
    brcaStatus: f.brcaStatus || undefined,
    chemicalExposure: f.chemicalExposure || 'no',
    dietPattern: 'other',
    comorbidityScore: 0,
    inflammationHistory: 0,
    hypertension: null,
    hyperlipidemia: null,
    coronaryArteryDisease: null,
    diabetes: null,
    metricH: false,
    metricW: false,
  };
}

export default function StaffDataEntry() {
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState(null); // null | { ok: true, recordId } | { ok: false, error }
  const [submitting, setSubmitting] = useState(false);
  const ageRef = useRef(null);

  useEffect(() => {
    ageRef.current?.focus();
  }, []);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  function validate() {
    const errs = [];
    if (!form.age || Number(form.age) < 18 || Number(form.age) > 99) errs.push('Age (18–99) is required');
    if (!form.race) errs.push('Race is required');
    if (!form.bmi || Number(form.bmi) < 15 || Number(form.bmi) > 60) errs.push('BMI (15–60) is required');
    if (form.ipssTotal === '' || Number(form.ipssTotal) < 0 || Number(form.ipssTotal) > 35) errs.push('IPSS Total (0–35) is required');
    if (form.shimTotal === '' || Number(form.shimTotal) < 0 || Number(form.shimTotal) > 25) errs.push('SHIM Total (0–25) is required');
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (errs.length) { setStatus({ ok: false, error: errs.join(' · ') }); return; }
    setSubmitting(true);
    setStatus(null);
    const ref = form.sessionRef.trim() || genUuid();
    const formData = buildFormData(form);
    const res = await submitToRedcap(formData, ref);
    setSubmitting(false);
    if (res.success) {
      setStatus({ ok: true, recordId: ref });
      setForm(EMPTY);
      setTimeout(() => ageRef.current?.focus(), 50);
    } else {
      setStatus({ ok: false, error: res.error || 'Submission failed' });
    }
  }

  function handleReset() {
    setForm(EMPTY);
    setStatus(null);
    ageRef.current?.focus();
  }

  return (
    <div className="sde-root">
      <h2 className="sde-heading">Quick Data Entry</h2>
      <p className="sde-hint">Tab through fields — press Enter or click Submit when done.</p>

      {status?.ok && (
        <div className="sde-banner sde-banner--ok">
          Submitted — Record ID: <strong>{status.recordId}</strong>
        </div>
      )}
      {status && !status.ok && (
        <div className="sde-banner sde-banner--err">{status.error}</div>
      )}

      <form className="sde-form" onSubmit={handleSubmit} noValidate>
        <table className="sde-table">
          <tbody>
            <tr>
              <td className="sde-label">Session Ref</td>
              <td>
                <input
                  className="sde-input sde-input--wide"
                  type="text"
                  placeholder="Auto-generated if blank"
                  value={form.sessionRef}
                  onChange={e => set('sessionRef', e.target.value)}
                />
              </td>
            </tr>
            <tr>
              <td className="sde-label sde-label--req">Age</td>
              <td>
                <input
                  ref={ageRef}
                  className="sde-input"
                  type="number"
                  inputMode="numeric"
                  min={18} max={99}
                  placeholder="18–99"
                  value={form.age}
                  onChange={e => set('age', e.target.value)}
                  required
                />
              </td>
            </tr>
            <tr>
              <td className="sde-label sde-label--req">Race</td>
              <td>
                <select className="sde-select" value={form.race} onChange={e => set('race', e.target.value)} required>
                  <option value="">Select…</option>
                  <option value="white">White</option>
                  <option value="african-american">Black or African American</option>
                  <option value="hispanic">Hispanic</option>
                  <option value="asian">Asian</option>
                  <option value="mixed">Mixed</option>
                  <option value="other">Other</option>
                  <option value="unknown">Unknown</option>
                </select>
              </td>
            </tr>
            <tr>
              <td className="sde-label sde-label--req">BMI</td>
              <td>
                <input
                  className="sde-input"
                  type="number"
                  inputMode="decimal"
                  min={15} max={60} step={0.1}
                  placeholder="15–60"
                  value={form.bmi}
                  onChange={e => set('bmi', e.target.value)}
                  required
                />
              </td>
            </tr>
            <tr>
              <td className="sde-label sde-label--req">IPSS Total</td>
              <td>
                <input
                  className="sde-input"
                  type="number"
                  inputMode="numeric"
                  min={0} max={35} step={1}
                  placeholder="0–35"
                  value={form.ipssTotal}
                  onChange={e => set('ipssTotal', e.target.value)}
                  required
                />
              </td>
            </tr>
            <tr>
              <td className="sde-label">IPSS QoL</td>
              <td>
                <input
                  className="sde-input"
                  type="number"
                  inputMode="numeric"
                  min={0} max={6} step={1}
                  placeholder="0–6"
                  value={form.ipssQol}
                  onChange={e => set('ipssQol', e.target.value)}
                />
              </td>
            </tr>
            <tr>
              <td className="sde-label sde-label--req">SHIM Total</td>
              <td>
                <input
                  className="sde-input"
                  type="number"
                  inputMode="numeric"
                  min={0} max={25} step={1}
                  placeholder="0–25"
                  value={form.shimTotal}
                  onChange={e => set('shimTotal', e.target.value)}
                  required
                />
              </td>
            </tr>
            <tr>
              <td className="sde-label">Family History</td>
              <td>
                <select className="sde-select" value={form.familyHistory} onChange={e => set('familyHistory', e.target.value)}>
                  <option value="">Select…</option>
                  <option value="0">None</option>
                  <option value="1">1st degree</option>
                  <option value="2">2nd degree</option>
                  <option value="unknown">Unknown</option>
                </select>
              </td>
            </tr>
            <tr>
              <td className="sde-label">Exercise</td>
              <td>
                <select className="sde-select" value={form.exercise} onChange={e => set('exercise', e.target.value)}>
                  <option value="">Select…</option>
                  <option value="0">Regular</option>
                  <option value="1">Some</option>
                  <option value="2">None</option>
                </select>
              </td>
            </tr>
            <tr>
              <td className="sde-label">Smoking</td>
              <td>
                <select className="sde-select" value={form.smoking} onChange={e => set('smoking', e.target.value)}>
                  <option value="">Select…</option>
                  <option value="0">Never</option>
                  <option value="1">Former</option>
                  <option value="2">Current</option>
                </select>
              </td>
            </tr>
            <tr>
              <td className="sde-label">BRCA Status</td>
              <td>
                <select className="sde-select" value={form.brcaStatus} onChange={e => set('brcaStatus', e.target.value)}>
                  <option value="">Select…</option>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                  <option value="unknown">Unknown</option>
                </select>
              </td>
            </tr>
            <tr>
              <td className="sde-label">Chemical Exposure</td>
              <td>
                <select className="sde-select" value={form.chemicalExposure} onChange={e => set('chemicalExposure', e.target.value)}>
                  <option value="">Select…</option>
                  <option value="no">No</option>
                  <option value="wtc_911">Yes</option>
                  <option value="unknown">Unknown</option>
                </select>
              </td>
            </tr>
            <tr>
              <td className="sde-label">BRCA / Genetic Notes</td>
              <td>
                <input
                  className="sde-input sde-input--wide"
                  type="text"
                  placeholder="Optional free text"
                  value={form.brcaNotes}
                  onChange={e => set('brcaNotes', e.target.value)}
                />
              </td>
            </tr>
          </tbody>
        </table>

        <div className="sde-actions">
          <button
            type="submit"
            className="sde-btn sde-btn--primary"
            disabled={submitting}
          >
            {submitting ? 'Submitting…' : 'Submit to REDCap'}
          </button>
          <button
            type="button"
            className="sde-btn sde-btn--ghost"
            onClick={handleReset}
          >
            Reset
          </button>
        </div>
      </form>
    </div>
  );
}
