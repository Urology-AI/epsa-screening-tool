import React, { useState } from 'react';

const ACTION_OPTIONS = [
  { key: 'ordered_psa',     label: 'Ordered PSA test' },
  { key: 'referred_urology', label: 'Referred to urology' },
  { key: 'watchful_waiting', label: 'Watchful waiting / recheck in 6 mo' },
  { key: 'declined',        label: 'Patient declined' },
  { key: 'no_change',       label: 'No change to plan' },
];

export default function ClinicianChecklist({ sessionRef, onSubmit, onSkip }) {
  const [influence, setInfluence] = useState('');
  const [action, setAction] = useState('');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const actionRequired = influence !== '' && influence !== 'no';
  const canSubmit = influence !== '' && (!actionRequired || action !== '');

  function handleSubmit() {
    if (!canSubmit || submitted) return;
    setSubmitted(true);
    setTimeout(() => {
      onSubmit({ influence, action, notes });
    }, 2000);
  }

  return (
    <div className="ccl-root">
      <div className="ccl-header">
        <span className="ccl-header-title">IRB STUDY-14-00050 — Clinician Impact Check</span>
        <span className="ccl-header-sub">3 quick questions · takes &lt; 60 seconds</span>
      </div>

      {submitted ? (
        <div className="ccl-confirm">Checklist recorded ✓</div>
      ) : (
        <>
          <div className="ccl-question">
            <div className="ccl-question-text">
              Q1: Did this ePSA result influence your clinical recommendation?
            </div>
            <div className="ccl-options">
              {[
                { key: 'yes', label: 'Yes' },
                { key: 'partially', label: 'Partially' },
                { key: 'no', label: 'No' },
              ].map((opt) => (
                <label key={opt.key} className="ccl-radio">
                  <input
                    type="radio"
                    name="ccl-influence"
                    value={opt.key}
                    checked={influence === opt.key}
                    onChange={() => setInfluence(opt.key)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div className="ccl-question">
            <div className="ccl-question-text">Q2: What action did you take?</div>
            <div className="ccl-options ccl-options--column">
              {ACTION_OPTIONS.map((opt) => (
                <label key={opt.key} className="ccl-radio">
                  <input
                    type="radio"
                    name="ccl-action"
                    value={opt.key}
                    checked={action === opt.key}
                    onChange={() => setAction(opt.key)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div className="ccl-question">
            <div className="ccl-question-text">Q3: Notes (optional)</div>
            <input
              type="text"
              className="ccl-notes-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
            />
          </div>

          <div className="ccl-actions">
            <button
              type="button"
              className="ccl-btn ccl-btn--primary"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              Submit
            </button>
            <button type="button" className="ccl-btn ccl-btn--ghost" onClick={onSkip}>
              Skip
            </button>
          </div>

          <p className="ccl-disclosure">
            By submitting, you confirm the patient was informed their de-identified
            responses are stored under IRB STUDY-14-00050 and may be contacted for
            follow-up surveys.
          </p>
        </>
      )}
    </div>
  );
}
