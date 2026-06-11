import React, { useRef } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import './PrintableForm.css';
import './ClinicalModeResultPrint.css';

const TIER_COLORS = {
  low:          '#16a34a',
  intermediate: '#2563eb',
  elevated:     '#d97706',
};

const TIER_LABELS = {
  low:          'Low — Routine Screening',
  intermediate: 'Intermediate — Consider PSA Discussion',
  elevated:     'Strong Candidate for PSA Testing',
};

function fmtRace(v) {
  return { 'african-american': 'Black / African American', 'american-indian': 'American Indian / Alaska Native',
    asian: 'Asian', 'native-hawaiian': 'Native Hawaiian / Pacific Islander', white: 'White', unknown: 'Unknown / Other' }[v] ?? v ?? '—';
}
function fmtFH(v) {
  return { none: 'None', one: '1 first-degree relative', twoplus: '2+ first-degree relatives', unknown: 'Unknown' }[v]
    ?? { 0: 'None', 1: '1 first-degree relative', 2: '2+ first-degree relatives' }[v] ?? v ?? '—';
}
function fmtExercise(v) {
  return { 0: 'Regular (≥150 min/wk)', 1: 'Some (<150 min/wk)', 2: 'None' }[String(v)] ?? v ?? '—';
}
function fmtSmoking(v) {
  return { 0: 'Never', 1: 'Former', 2: 'Current' }[String(v)] ?? v ?? '—';
}
function fmtQol(v) {
  return { 0: '0 – Delighted', 1: '1 – Pleased', 2: '2 – Mostly satisfied',
    3: '3 – Mixed', 4: '4 – Mostly dissatisfied', 5: '5 – Unhappy', 6: '6 – Terrible' }[String(v)] ?? v ?? '—';
}
function fmtShim(v) {
  return { 1: 'Severe ED', 2: 'Moderate ED', 3: 'Mild-moderate ED', 4: 'Mild ED', 5: 'No ED' }[String(v)] ?? v ?? '—';
}
function fmtComorbidities(v) {
  return { none: 'None', one: 'One', 'two+': 'Two or more',
    0: 'None', 1: 'One', 2: 'Two or more' }[String(v)] ?? v ?? '—';
}
function fmtYnu(v) { return { yes: 'Yes', no: 'No', unknown: 'Unknown' }[v] ?? v ?? '—'; }
function fmtEthnicity(v) {
  return { 'hispanic-latino': 'Hispanic / Latino', 'not-hispanic-latino': 'Not Hispanic / Latino', unknown: 'Unknown' }[v] ?? v ?? '—';
}

function buildRows(formData, rawAnswers) {
  const a = rawAnswers ?? {};
  const f = formData ?? {};

  const bmi = f.bmi ?? null;
  const bmiLabel = bmi ? `${Number(bmi).toFixed(1)} (${bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese'})` : '—';

  // Height
  let height = '—';
  if (a.heightCm) height = `${a.heightCm} cm`;
  else if (a.heightFt !== undefined && a.heightFt !== '') height = `${a.heightFt} ft ${a.heightIn ?? 0} in`;

  // Weight
  let weight = '—';
  if (a.weightKg) weight = `${a.weightKg} kg`;
  else if (a.weightLbs) weight = `${a.weightLbs} lbs`;

  return [
    { label: 'Age',                 value: f.age ?? a.age ?? '—' },
    { label: 'Race',                value: fmtRace(f.race ?? a.race) },
    { label: 'Ethnicity',           value: fmtEthnicity(f.ethnicity ?? a.ethnicity) },
    { label: 'Family history',      value: fmtFH(a.familyHistory ?? f.familyHistory) },
    { label: 'BRCA2 / Lynch status',value: fmtYnu(f.brcaStatus ?? a.brca) },
    { label: 'Height',              value: height },
    { label: 'Weight',              value: weight },
    { label: 'BMI',                 value: bmiLabel },
    { label: 'Exercise',            value: fmtExercise(f.exercise ?? a.exercise) },
    { label: 'Smoking',             value: fmtSmoking(f.smoking ?? a.smoking) },
    { label: 'Diet pattern',        value: f.dietPattern ?? a.diet ?? '—' },
    { label: 'Major comorbidities', value: fmtComorbidities(a.comorbidities ?? f.comorbidityScore) },
    { label: 'Urinary QoL (IPSS)',  value: fmtQol(f.ipssQol ?? a.qol) },
    { label: 'Erectile function',   value: fmtShim(a.shim ?? f.shim?.[0]) },
    ...(f.inflammationHistory ? [{ label: 'Inflammation / prostatitis history', value: f.inflammationHistory === 1 ? 'Yes' : 'No' }] : []),
    ...(f.chemicalExposure && f.chemicalExposure !== 'no' ? [{ label: 'Chemical / occupational exposure', value: f.chemicalExposure }] : []),
  ];
}

const ClinicalModeResultPrint = ({ result, formData, rawAnswers, sessionRef, onBack }) => {
  const printRef = useRef(null);

  const tierKey   = result?.epsaTierKey ?? 'intermediate';
  const tierLabel = TIER_LABELS[tierKey] ?? result?.epsaTierLabel ?? tierKey;
  const tierColor = TIER_COLORS[tierKey] ?? '#2563eb';
  const rows = buildRows(formData, rawAnswers);

  const handlePrint = async () => {
    if (!printRef.current) return;
    const btn = document.querySelector('.cmrp-btn-dl');
    if (btn) { btn.textContent = 'Generating PDF…'; btn.disabled = true; }
    try {
      const canvas = await html2canvas(printRef.current, {
        scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff',
        width: printRef.current.scrollWidth, height: printRef.current.scrollHeight,
      });
      const pdf = new jsPDF('portrait', 'pt', 'letter');
      const m = 20, pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
      const cw = pw - m * 2, ch = ph - m * 2;
      const fullH = (canvas.height * cw) / canvas.width;
      if (fullH <= ch) {
        pdf.addImage(canvas.toDataURL('image/png', 1.0), 'PNG', m, m, cw, fullH, undefined, 'FAST');
      } else {
        const srcPH = Math.floor((ch * canvas.width) / cw);
        let oy = 0, pg = 0;
        while (oy < canvas.height) {
          const sh = Math.min(srcPH, canvas.height - oy);
          const pc = document.createElement('canvas'); pc.width = canvas.width; pc.height = sh;
          const ctx = pc.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, pc.width, pc.height);
          ctx.drawImage(canvas, 0, oy, canvas.width, sh, 0, 0, canvas.width, sh);
          if (pg > 0) pdf.addPage();
          pdf.addImage(pc.toDataURL('image/png', 1.0), 'PNG', m, m, cw, (sh * cw) / canvas.width, undefined, 'FAST');
          oy += sh; pg++;
        }
      }
      const safe = (sessionRef ?? 'result').replace(/[^a-z0-9-]/gi, '-');
      pdf.save(`ePSA-Clinical-${safe}.pdf`);
    } catch { window.print(); }
    if (btn) { btn.textContent = 'Download PDF'; btn.disabled = false; }
  };

  return (
    <div className="printable-form-container">
      <div className="form-actions">
        {onBack && <button className="btn-back" onClick={onBack}>← Back to Results</button>}
        <button className="btn-print cmrp-btn-dl" onClick={handlePrint}>Download PDF</button>
      </div>

      <div className="printable-form-content cmrp-content" ref={printRef}>
        {/* Header */}
        <div className="cmrp-header">
          <div className="cmrp-logo-wrap">
            <img src="/logo.png" alt="ePSA logo" className="printable-logo"
              onError={(e) => { e.target.src = '/logo.jpg'; e.target.onerror = () => { e.target.style.display = 'none'; }; }} />
          </div>
          <div className="cmrp-header-text">
            <div className="cmrp-header-title">ePSA Clinical Screening — Results Summary</div>
            <div className="cmrp-header-sub">Million Strong Men · Mount Sinai · AUA/SUO 2026</div>
          </div>
          {sessionRef && (
            <div className="cmrp-session-ref">
              <span className="cmrp-session-ref-label">Session ID</span>
              <span className="cmrp-session-ref-value">{sessionRef}</span>
            </div>
          )}
        </div>

        {/* Result tier */}
        <div className="cmrp-tier-block" style={{ borderLeft: `4px solid ${tierColor}`, color: tierColor }}>
          <div className="cmrp-tier-eyebrow">AUA/SUO 2026 Risk Category</div>
          <div className="cmrp-tier-label">{tierLabel}</div>
          {result?.epsaGuidelineText && (
            <p className="cmrp-tier-body">{result.epsaGuidelineText}</p>
          )}
        </div>

        {/* Answers table */}
        <div className="cmrp-section-title">Submitted Answers</div>
        <table className="cmrp-table">
          <tbody>
            {rows.map(({ label, value }) => (
              <tr key={label} className="cmrp-row">
                <td className="cmrp-cell cmrp-cell--label">{label}</td>
                <td className="cmrp-cell cmrp-cell--value">{String(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Risk factors sorted by impact */}
        {result?.itemImpacts?.length > 0 && (
          <>
            <div className="cmrp-section-title" style={{ marginTop: '1rem' }}>Risk Factors (by impact)</div>
            <table className="cmrp-table">
              <tbody>
                {[...result.itemImpacts]
                  .sort((a, b) => Number(b.points) - Number(a.points))
                  .map((f) => (
                    <tr key={f.item} className="cmrp-row">
                      <td className="cmrp-cell cmrp-cell--label">{f.item}</td>
                      <td className="cmrp-cell cmrp-cell--value">{f.value ?? '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        )}

        <p className="cmrp-disclaimer">
          Educational use only · Not a substitute for physician evaluation · AUA/SUO 2026 ·
          Model trained on Grade Group ≥3 (N=94). Validated variables: age, race, family history.
        </p>
        <p className="cmrp-disclaimer">Generated {new Date().toLocaleString()}</p>
      </div>
    </div>
  );
};

export default ClinicalModeResultPrint;
