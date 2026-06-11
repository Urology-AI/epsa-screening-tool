import React, { useState } from 'react';
import RiskGauge from './RiskGauge.jsx';
import { ArrowRightIcon, RotateCcwIcon, EditIcon, TrendingUpIcon, ChevronDownIcon, ChevronUpIcon, PrinterIcon, CloudIcon, DownloadIcon } from 'lucide-react';
import ClinicalModePrintForm from './ClinicalModePrintForm.jsx';
import ClinicalModeResultPrint from './ClinicalModeResultPrint.jsx';
import './ClinicalModeResult.css';


const AUA_FACTORS = new Set(['Age', 'Black ancestry', 'Family history']);

function mapRawToGauge(raw, max, fallback) {
  if (!Number.isFinite(raw) || !Number.isFinite(max) || max <= 0) return fallback ?? 50;
  const c = Math.max(0, Math.min(max, raw));
  if (c <= 10) return Math.round((c / 10) * 33);
  if (c <= 17) return Math.round(34 + ((c - 11) / 6) * 32);
  return Math.round(67 + ((c - 18) / Math.max(1, max - 18)) * 33);
}

const CATEGORIES = [
  { key: 'low',          label: 'Low — Routine Screening',              color: '#16a34a' },
  { key: 'intermediate', label: 'Intermediate — Consider PSA Discussion', color: '#2563eb' },
  { key: 'elevated',     label: 'Strong Candidate for PSA Testing',      color: '#d97706' },
];

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ClinicalModeResult({ result, answers, formData, onEditAnswers, onStartOver, onContinue, onStudyConsent, onConsentNow, readOnly = false, sessionRef, cloudStatus = null, consented = null }) {
  const [showAll, setShowAll] = useState(false);
  const [showPrintForm, setShowPrintForm] = useState(false);
  const [showResultPrint, setShowResultPrint] = useState(false);
  const [showCloudNote, setShowCloudNote] = useState(false);

  if (showPrintForm) {
    return <ClinicalModePrintForm answers={answers ?? {}} onBack={() => setShowPrintForm(false)} />;
  }

  if (showResultPrint) {
    return (
      <ClinicalModeResultPrint
        result={result}
        formData={formData}
        rawAnswers={answers}
        sessionRef={sessionRef}
        onBack={() => setShowResultPrint(false)}
      />
    );
  }

  const {
    epsaTierKey, epsaTierLabel, epsaGuidelineText,
    itemImpacts = [], score, calculationDetails,
    aboveMaxScreeningAge,
  } = result;

  const gaugeScore = mapRawToGauge(
    Number(calculationDetails?.rawScore),
    Number(calculationDetails?.maxScore),
    score,
  );

  const isHigher = epsaTierKey === 'elevated';
  const isLower  = epsaTierKey === 'low';

  const sorted = [...itemImpacts].sort((a, b) => Number(b.points) - Number(a.points));
  const TOP_N = 5;
  const visible = showAll ? sorted : sorted.slice(0, TOP_N);

  const guidelineText = epsaGuidelineText ||
    (isHigher ? 'AUA/SUO 2026 guidelines recommend a PSA test based on your risk profile.'
    : isLower  ? 'Your risk profile is below the AUA/SUO 2026 screening threshold. Continue routine age-based screening.'
    : 'AUA/SUO 2026 guidelines suggest discussing PSA testing with your physician.');

  // AUA/SUO 2026: over age 75, screening is individualized SDM — do not show a tier card
  if (aboveMaxScreeningAge) {
    return (
      <div className="qer-root">
        <div className="qer-guideline-banner qer-guideline-banner--moderate" style={{ borderLeft: '4px solid #2563eb' }}>
          <div className="qer-guideline-eyebrow">AUA/SUO 2026 — Shared Decision-Making Required</div>
          <p className="qer-guideline-body">
            Routine PSA screening above age 75 is not recommended by standard guidelines. Whether to continue screening depends on your overall health, life expectancy, and personal preferences. <strong>Please discuss with your physician.</strong>
          </p>
          <p className="qer-guideline-body" style={{ marginTop: '0.5rem', fontSize: '12px', color: '#6b7280' }}>
            AUA/SUO 2026 Statement 8 · NCCN Early Detection v2.2026 · EAU 2024
          </p>
        </div>
        <p className="qer-disclaimer">Educational use only · Not a substitute for physician evaluation · AUA/SUO 2026</p>
      </div>
    );
  }

  return (
    <div className="qer-root">

      {/* ── Session reference + cloud save indicator ── */}
      {sessionRef && (
        <div className="qer-session-ref">
          <span className="qer-session-ref-label">Session ID</span>
          <span className="qer-session-ref-value">{sessionRef}</span>
          <button
            type="button"
            className={`qer-cloud-btn${cloudStatus ? ` qer-cloud-btn--${cloudStatus}` : ''}`}
            onClick={() => setShowCloudNote(v => !v)}
            aria-label="Data storage info"
            title={cloudStatus === 'saved' ? 'Saved in the database'
              : cloudStatus === 'saving' ? 'Saving to the database…'
              : cloudStatus === 'error' ? 'Could not save to the database'
              : cloudStatus === 'local' ? 'Saved on this device only'
              : 'About data storage'}
          >
            <CloudIcon size={15} />
            {cloudStatus === 'saved' && <span className="qer-cloud-label">Saved in database</span>}
            {cloudStatus === 'saving' && <span className="qer-cloud-label">Saving…</span>}
            {cloudStatus === 'error' && <span className="qer-cloud-label">Not saved</span>}
            {cloudStatus === 'local' && <span className="qer-cloud-label">On this device only</span>}
          </button>
        </div>
      )}
      {showCloudNote && (
        <div className="qer-cloud-note">
          {cloudStatus === 'local' ? (
            <>
              <strong>Saved on this device only.</strong> You chose not to share your responses, so nothing was sent to the study database. If you have since signed a consent form, you can share them now.
              {onConsentNow && (
                <button type="button" className="qer-action-btn qer-action-btn--secondary qer-consent-now-btn"
                  onClick={() => { setShowCloudNote(false); onConsentNow(); }}>
                  <CloudIcon size={14} aria-hidden="true" /> I&apos;ve signed the consent form — save to database
                </button>
              )}
            </>
          ) : cloudStatus === 'saved' ? (
            <><strong>Saved in the database.</strong> This response was stored in the secure study database and will be transferred to the REDCap research registry. No personally identifiable information is collected.</>
          ) : cloudStatus === 'error' ? (
            <><strong>Could not reach the database.</strong> Your response is saved on this device and will be uploaded when staff sync sessions. No personally identifiable information is collected.</>
          ) : (
            <><strong>Saved temporarily to the cloud.</strong> This response is stored in a secure database and will be automatically transferred to the REDCap research registry. Once transferred, it is deleted from temporary storage. No personally identifiable information is collected.</>
          )}
          <button type="button" className="qer-cloud-note-close" onClick={() => setShowCloudNote(false)}>Dismiss</button>
        </div>
      )}

      {/* ── Consent-later banner: results kept local, offer to share ── */}
      {!readOnly && consented === false && cloudStatus === 'local' && onConsentNow && (
        <div className="qer-consent-banner">
          <p>
            <strong>Your results are saved on this device only.</strong> Signed
            a consent form? You can add this response to the study database.
          </p>
          <button type="button" className="qer-action-btn qer-action-btn--secondary" onClick={onConsentNow}>
            <CloudIcon size={14} aria-hidden="true" /> Save to database
          </button>
        </div>
      )}

      {/* ── Gauge + categories ── */}
      <div className="qer-gauge-section">
        <RiskGauge score={gaugeScore} tierKey={epsaTierKey} tierLabel={epsaTierLabel} />
        <div className="qer-categories">
          {CATEGORIES.map(({ key, label, color }) => (
            <div key={key}
              className={`qer-cat${epsaTierKey === key ? ' qer-cat--active' : ''}`}
              style={epsaTierKey === key ? { borderColor: color, color } : {}}
            >
              <span className="qer-cat-dot" style={{ background: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* ── Guideline recommendation ── */}
      <div className={`qer-guideline-banner qer-guideline-banner--${isHigher ? 'high' : isLower ? 'low' : 'moderate'}`}>
        <div className="qer-guideline-eyebrow">AUA/SUO 2026 Guideline Recommendation</div>
        <p className="qer-guideline-body">{guidelineText}</p>
      </div>

      {/* ── Factors ordered by impact, no points shown ── */}
      {sorted.length > 0 && (
        <div className="qer-section">
          <div className="qer-section-title">
            <TrendingUpIcon size={13} aria-hidden="true" />
            Risk factors — sorted by impact
          </div>
          <div className="qer-factor-list">
            {visible.map((f) => {
              const pts = Number(f.points) || 0;
              const isAua = AUA_FACTORS.has(f.item);
              return (
                <div key={f.item} className={`qer-factor${pts > 0 ? ' qer-factor--elevated' : ''}`}>
                  <div className="qer-factor-left">
                    <span className="qer-factor-name">{f.item}</span>
                    {isAua
                      ? <span className="qer-source-tag qer-source-tag--aua">AUA/SUO 2026</span>
                      : <span className="qer-source-tag qer-source-tag--model">Research-based</span>}
                  </div>
                  {f.value && <span className="qer-factor-val">{f.value}</span>}
                </div>
              );
            })}
          </div>
          {sorted.length > TOP_N && (
            <button type="button" className="qer-show-more" onClick={() => setShowAll(v => !v)}>
              {showAll
                ? <><ChevronUpIcon size={12} /> Show fewer</>
                : <><ChevronDownIcon size={12} /> Show all {sorted.length} factors</>}
            </button>
          )}
        </div>
      )}

      <p className="qer-disclaimer">
        Educational use only · Not a substitute for physician evaluation · AUA/SUO 2026
      </p>
      <p className="qer-disclaimer" style={{ marginTop: '0.25rem' }}>
        Model trained on Grade Group ≥3 outcome (N=94 cohort). AUA/NCCN define clinically significant cancer as Grade Group ≥2. Validated variables: age, race, family history, PSA thresholds. Other factors are research-based.
      </p>


      {!readOnly && (
        <div className="qer-actions">
          <button type="button" className="qer-action-btn qer-action-btn--primary" onClick={onContinue}>
            Continue to Full ePSA <ArrowRightIcon size={16} aria-hidden="true" />
          </button>
          <button type="button" className="qer-action-btn qer-action-btn--secondary" onClick={onEditAnswers}>
            <EditIcon size={14} aria-hidden="true" /> Edit Answers
          </button>
          <button type="button" className="qer-action-btn qer-action-btn--secondary" onClick={() => setShowResultPrint(true)}>
            <PrinterIcon size={14} aria-hidden="true" /> Print Answers &amp; Result
          </button>
          <button type="button" className="qer-action-btn qer-action-btn--secondary" onClick={() => setShowPrintForm(true)}>
            <PrinterIcon size={14} aria-hidden="true" /> Print Blank Form
          </button>
          <button
            type="button"
            className="qer-action-btn qer-action-btn--secondary"
            onClick={() => downloadJson(
              { sessionRef, formData, result, rawAnswers: answers, exportedAt: new Date().toISOString() },
              `epsa-results-${sessionRef || Date.now()}.json`
            )}
          >
            <DownloadIcon size={14} aria-hidden="true" /> Export Results JSON
          </button>
          <button type="button" className="qer-action-btn qer-action-btn--ghost" onClick={onStartOver}>
            <RotateCcwIcon size={14} aria-hidden="true" /> Start Over
          </button>
        </div>
      )}

    </div>
  );
}
