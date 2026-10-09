import React, { useState } from 'react';
import { UploadIcon } from 'lucide-react';
import { saveClinicalSession } from '../services/clinicalSessionService';
import { buildImportPlan, FORMAT_LABELS } from '../utils/sessionImport';
import { KIOSK_ENGINE as ENGINE } from '../utils/kioskEngine';

const CONSENT_OPTIONS = [
  { value: 'file', label: 'Keep what the file says' },
  { value: 'yes', label: 'Patients consented to cloud storage' },
  { value: 'no', label: 'Patients declined (never pushed to cloud)' },
];

export default function ImportWizard({ uid, existingRefs, onClose, onImported }) {
  const [step, setStep] = useState(1);
  const [plan, setPlan] = useState(null);
  const [consent, setConsent] = useState('file');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function handleFiles(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (!picked.length) return;
    const files = await Promise.all(picked.map(async f => ({ name: f.name, text: await f.text() })));
    setPlan(buildImportPlan(files, existingRefs, ENGINE));
    setStep(2);
  }

  function toggle(id) {
    setPlan(p => ({ ...p, entries: p.entries.map(en => en.id === id ? { ...en, include: !en.include } : en) }));
  }

  // Run the kiosk engine over every ticked row that came with someone else's score.
  function handleRecalculate() {
    setPlan(p => ({
      ...p,
      entries: p.entries.map(en => (en.include && en.rescore)
        ? {
            ...en,
            before: en.session.engineResult?.score ?? null,
            session: { ...en.session, ...en.rescore },
            rescore: null,
            warnings: en.warnings.filter(w => !/not rescored/.test(w)),
          }
        : en),
    }));
  }

  async function handleImport() {
    setBusy(true);
    let added = 0; let replaced = 0;
    try {
      for (const en of plan.entries.filter(x => x.include)) {
        const { createdAt: _c, ...session } = en.session;
        if (consent !== 'file') session.consented = consent === 'yes';
        await saveClinicalSession(uid, session);
        if (en.exists) replaced += 1; else added += 1;
      }
      setResult({ added, replaced, skipped: plan.entries.filter(x => !x.include).length });
      setStep(3);
      onImported?.();
    } catch (err) {
      setResult({ error: err.message });
      setStep(3);
    } finally {
      setBusy(false);
    }
  }

  const chosen = plan?.entries.filter(e => e.include).length ?? 0;
  const recalcable = plan?.entries.filter(e => e.include && e.rescore).length ?? 0;

  return (
    <div className="iw-backdrop" role="dialog" aria-modal="true" aria-label="Import wizard">
      <div className="iw-panel">
        <div className="iw-head">
          <h3>Import Wizard</h3>
          <span className="iw-steps">Step {step} of 3</span>
        </div>

        {step === 1 && (
          <div className="iw-body">
            <p>Select one or more ePSA JSON files: kiosk exports, kiosk results files, or exports from the calculator (Part 1, or Part 1 + 2).</p>
            <p className="iw-hint">Files for the same EP- reference are merged, so a Part 2 file fills in Part 1. Nothing is saved until you confirm.</p>
            <label className="iw-btn iw-btn--primary">
              <UploadIcon size={15} /> Choose files
              <input type="file" accept=".json,application/json" multiple hidden onChange={handleFiles} />
            </label>
          </div>
        )}

        {step === 2 && plan && (
          <div className="iw-body">
            {plan.entries.length === 0 && <p>Nothing importable was found.</p>}
            {plan.entries.length > 0 && (
              <div className="iw-table-wrap">
                <table className="iw-table">
                  <thead><tr><th></th><th>Reference</th><th>Source</th><th>Age</th><th>Score</th><th>Part 2</th><th>Notes</th></tr></thead>
                  <tbody>
                    {plan.entries.map(en => {
                      const s = en.session;
                      return (
                        <tr key={en.id} className={en.include ? '' : 'iw-off'}>
                          <td><input type="checkbox" checked={en.include} onChange={() => toggle(en.id)} aria-label={`Include ${s.sessionRef}`} /></td>
                          <td>{s.sessionRef}</td>
                          <td>{FORMAT_LABELS[en.format]}</td>
                          <td>{s.formData?.age ?? '—'}</td>
                          <td>
                            {en.before != null && en.before !== s.engineResult?.score && <span className="iw-old">{en.before} → </span>}
                            {s.engineResult?.score ?? '—'}
                            {en.rescore && en.rescore.engineResult?.score !== s.engineResult?.score && (
                              <div className="iw-note">kiosk engine: {en.rescore.engineResult?.score}</div>
                            )}
                          </td>
                          <td>{s.step2 ? 'Yes' : '—'}</td>
                          <td>
                            {en.exists && <span className="iw-tag iw-tag--warn">Replaces existing</span>}
                            {en.warnings.map(w => <div key={w} className="iw-note">{w}</div>)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {plan.rejected.length > 0 && (
              <div className="iw-rejected">
                <strong>Skipped ({plan.rejected.length})</strong>
                {plan.rejected.map((r, i) => <div key={i}>{r.file}: {r.reason}</div>)}
              </div>
            )}
            {plan.entries.length > 0 && (
              <label className="iw-consent">Cloud consent for these sessions
                <select value={consent} onChange={e => setConsent(e.target.value)}>
                  {CONSENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            )}
          </div>
        )}

        {step === 3 && result && (
          <div className="iw-body">
            {result.error
              ? <p className="iw-err">Import failed: {result.error}</p>
              : <p>Imported {result.added} new and replaced {result.replaced}{result.skipped ? `, skipped ${result.skipped}` : ''}.</p>}
          </div>
        )}

        <div className="iw-foot">
          {step === 2 && <button type="button" className="iw-btn" onClick={() => { setPlan(null); setStep(1); }}>Back</button>}
          {step === 2 && recalcable > 0 && (
            <button type="button" className="iw-btn" onClick={handleRecalculate} disabled={busy}>
              Recalculate {recalcable} with kiosk engine
            </button>
          )}
          {step === 2 && (
            <button type="button" className="iw-btn iw-btn--primary" disabled={!chosen || busy} onClick={handleImport}>
              {busy ? 'Importing…' : `Import ${chosen} session${chosen !== 1 ? 's' : ''}`}
            </button>
          )}
          <button type="button" className="iw-btn" onClick={onClose}>{step === 3 ? 'Done' : 'Cancel'}</button>
        </div>
      </div>
    </div>
  );
}
