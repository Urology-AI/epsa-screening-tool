import React, { useState, useEffect, useCallback } from 'react';
import {
  TrashIcon, DownloadIcon, UploadIcon, PrinterIcon,
  ChevronDownIcon, ChevronUpIcon, ArrowLeftIcon,
  RefreshCwIcon, PlusIcon, ZapIcon,
  CheckIcon, CalculatorIcon, FileSpreadsheetIcon
} from 'lucide-react';
import { getClinicalSessions, deleteClinicalSession, clearAllClinicalSessions, exportSessionsAsJson, importSessionsFromFile, saveClinicalSession, setSessionConsent, updateSessionStep2, updateSessionResults, markSessionsRedcapExported } from '../services/clinicalSessionService';
import { downloadRedcapCsv, isRedcapEligible } from '../utils/redcapExport';
import ClinicalModeResult from './ClinicalModeResult.jsx';
import ImportWizard from './ImportWizard.jsx';
import { KIOSK_ENGINE } from '../utils/kioskEngine';
import { rescoreSession } from '../utils/sessionImport';
import './ClinicalSessionsManager.css';

const TIER_COLORS = {
  low: '#16a34a',
  intermediate: '#d97706',
  elevated: '#dc2626',
};

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch { return iso; }
}

function Part2EntryForm({ session, uid, onSaved, onCancel }) {
  const [psa, setPsa] = useState('');
  const [pirads, setPirads] = useState('0');
  const [onHormonalTherapy, setOnHormonalTherapy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave(e) {
    e.preventDefault();
    const psaNum = parseFloat(psa);
    if (!psa || isNaN(psaNum) || psaNum < 0) { setError('Enter a valid PSA value (ng/mL).'); return; }
    setSaving(true);
    setError(null);
    try {
      const step2 = {
        psa: psaNum,
        knowPsa: true,
        pirads,
        knowPirads: pirads !== '0',
        onHormonalTherapy,
        hormonalTherapyType: '',
      };
      await updateSessionStep2(uid, session, step2);
      onSaved();
    } catch (err) {
      setError(err.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="csm-part2-form">
      <h4 className="csm-part2-form-title">Enter PSA Results</h4>
      <div className="csm-part2-fields-entry">
        <label className="csm-part2-label">
          PSA (ng/mL)
          <input
            type="number"
            min="0"
            step="0.01"
            value={psa}
            onChange={e => setPsa(e.target.value)}
            placeholder="e.g. 4.2"
            required
            autoFocus
            className="csm-part2-input"
          />
        </label>
        <label className="csm-part2-label">
          PI-RADS score
          <select value={pirads} onChange={e => setPirads(e.target.value)} className="csm-part2-input">
            <option value="0">Not available</option>
            <option value="1">1 — Very low</option>
            <option value="2">2 — Low</option>
            <option value="3">3 — Intermediate</option>
            <option value="4">4 — High</option>
            <option value="5">5 — Very high</option>
          </select>
        </label>
        <label className="csm-part2-label csm-part2-label--check">
          <input type="checkbox" checked={onHormonalTherapy} onChange={e => setOnHormonalTherapy(e.target.checked)} />
          On hormonal therapy
        </label>
      </div>
      {error && <p className="csm-part2-error">{error}</p>}
      <div className="csm-part2-form-btns">
        <button type="submit" disabled={saving} className="csm-action-btn csm-action-btn--primary">
          {saving ? 'Saving…' : 'Save PSA Results'}
        </button>
        <button type="button" onClick={onCancel} className="csm-action-btn">
          Cancel
        </button>
      </div>
    </form>
  );
}

function SessionRow({ session, uid, onDeleted, onConsented, onUpdated }) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [consenting, setConsenting] = useState(false); // false | 'confirm' | 'working' | 'err'
  const [enteringPart2, setEnteringPart2] = useState(false);
  const noConsent = session.consented === false;

  const tier = session.engineResult?.epsaTierKey || 'unknown';
  const tierLabel = session.engineResult?.epsaTierLabel || tier;
  const scoreRange = session.engineResult?.displayRange || '—';
  const age = session.formData?.age || '—';
  const race = session.formData?.race || '—';
  const hasPost = !!(session.step2 || session.postResult);
  const storage = session._storage || 'local';
  const storageLabel = storage === 'both' ? 'Cloud + Local' : storage === 'cloud' ? 'Cloud' : 'Local';
  const psa = session.step2?.psa ?? null;
  const pirads = session.step2?.pirads ?? null;
  const ref = session.sessionRef ?? null;

  async function handleDelete() {
    if (!confirming) { setConfirming(true); return; }
    setConfirming(false);
    await deleteClinicalSession(uid, session);
    await onDeleted(session);
  }

  function handlePrint() {
    window.print();
  }

  // Patient signed the consent form after the fact (or staff confirm it):
  // record consent so the session is included in the REDCap export.
  async function handleMarkConsented() {
    if (consenting !== 'confirm') { setConsenting('confirm'); return; }
    setConsenting('working');
    try {
      await setSessionConsent(uid, session, true);
      setConsenting(false);
      await onConsented?.(session);
    } catch {
      setConsenting('err');
    }
  }

  function handleExportThis() {
    exportSessionsAsJson([session]);
  }

  function handleRecalc() {
    try {
      const r = rescoreSession(session, KIOSK_ENGINE);
      updateSessionResults([{ id: session.id, ...r }]);
      onUpdated?.();
    } catch { /* leave the stored scores untouched */ }
  }

  return (
    <div className="csm-row">
      <button
        type="button"
        className="csm-row-header"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
      >
        <span
          className="csm-tier-dot"
          style={{ background: TIER_COLORS[tier] || '#6b7280' }}
          title={tierLabel}
        />
        <span className="csm-row-date">{formatDate(session.createdAt)}</span>
        {session.unitCode && <span className="csm-row-badge csm-row-badge--unit" title="Screening unit">{session.unitCode}</span>}
        {ref && <span className="csm-row-ref">{ref}</span>}
        <span className="csm-row-meta">Age {age} · {race}</span>
        <span className="csm-row-tier" style={{ color: TIER_COLORS[tier] || '#6b7280' }}>
          {tierLabel} ({scoreRange})
        </span>
        {hasPost && <span className="csm-row-badge csm-row-badge--full">Part 1+2</span>}
        <span className={`csm-row-badge csm-row-badge--${storage}`} title={`Stored in ${storageLabel.toLowerCase()} storage`}>
          {storageLabel}
        </span>
        {noConsent && (
          <span className="csm-row-badge csm-row-badge--noconsent" title="Patient declined — this session is never exported to REDCap">
            No consent
          </span>
        )}
        {session.redcapPushedAt && (
          <span className="csm-row-badge csm-row-badge--redcap" title={`Exported for REDCap on ${new Date(session.redcapPushedAt).toLocaleString()}`}>
            REDCap ✓
          </span>
        )}
        {expanded ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
      </button>

      {expanded && (
        <div className="csm-row-body">
          <div className="csm-row-actions">
            <button type="button" className="csm-action-btn" onClick={handlePrint} title="Print result">
              <PrinterIcon size={14} /> Print
            </button>
            <button type="button" className="csm-action-btn" onClick={handleExportThis} title="Export this session as JSON">
              <DownloadIcon size={14} /> Export
            </button>
            <button type="button" className="csm-action-btn" onClick={handleRecalc} disabled={!session.formData} title="Re-run the ePSA engine on this patient's saved answers">
              <CalculatorIcon size={14} /> Run ePSA
            </button>
            {!hasPost && (
              <button
                type="button"
                className="csm-action-btn csm-action-btn--primary"
                onClick={() => setEnteringPart2(v => !v)}
                title="Enter PSA result and optional PI-RADS score for this patient"
              >
                <ZapIcon size={14} /> {enteringPart2 ? 'Cancel' : 'Enter PSA Results'}
              </button>
            )}
            {noConsent && (
              <button
                type="button"
                className={`csm-action-btn csm-action-btn--consent${consenting === 'confirm' ? ' csm-action-btn--confirm' : ''}${consenting === 'err' ? ' csm-action-btn--err' : ''}`}
                onClick={handleMarkConsented}
                onBlur={() => { if (consenting === 'confirm') setConsenting(false); }}
                disabled={consenting === 'working'}
                title="Record that the patient has signed the consent form, so this session is included in the REDCap export"
              >
                <CheckIcon size={14} />
                {consenting === 'working' ? 'Saving…'
                  : consenting === 'confirm' ? 'Confirm consent signed?'
                  : consenting === 'err' ? 'Failed — retry'
                  : 'Mark consented'}
              </button>
            )}
            <button
              type="button"
              className={`csm-action-btn csm-action-btn--delete${confirming ? ' csm-action-btn--confirm' : ''}`}
              onClick={handleDelete}
              onBlur={() => setConfirming(false)}
              title={`Delete session from ${storageLabel.toLowerCase()} storage`}
            >
              <TrashIcon size={14} />
              {confirming ? 'Confirm delete?' : 'Delete'}
            </button>
          </div>

          {enteringPart2 && !hasPost && (
            <Part2EntryForm
              session={session}
              uid={uid}
              onSaved={() => { setEnteringPart2(false); onUpdated?.(); }}
              onCancel={() => setEnteringPart2(false)}
            />
          )}

          {session.engineResult && session.formData && (
            <div className="csm-result-preview print-target">
              <ClinicalModeResult
                result={session.engineResult}
                formData={session.formData}
                answers={session.rawAnswers ?? session.formData}
                sessionRef={ref}
                onEditAnswers={null}
                onStartOver={null}
                onContinue={null}
                onStudyConsent={null}
                readOnly
              />
              {hasPost && (
                <div className="csm-part2-summary">
                  <div className="csm-part2-title">Part 2 — Post-PSA</div>
                  <div className="csm-part2-fields">
                    {psa !== null && <span><strong>PSA:</strong> {psa} ng/mL</span>}
                    {pirads !== null && pirads !== '0' && <span><strong>PI-RADS:</strong> {pirads}</span>}
                    {session.step2?.onHormonalTherapy && <span>On hormonal therapy</span>}
                    {session.postResult?.finalCategory && (
                      <span><strong>Final category:</strong> {session.postResult.finalCategory}</span>
                    )}
                    {session.finalCategory && !session.postResult?.finalCategory && (
                      <span><strong>Final category:</strong> {session.finalCategory}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ClinicalSessionsManager({ uid, onBack, onNewSession }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [confirmRecalc, setConfirmRecalc] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false); // false | 'confirm' | 'exporting'
  const [filterTier, setFilterTier] = useState('all'); // 'all' | 'low' | 'intermediate' | 'elevated'
  const [filterStep2, setFilterStep2] = useState('all'); // 'all' | 'needs' | 'done'
  const KIOSK_KEY = 'epsa_kiosk_mode';
  const [kioskMode, setKioskMode] = useState(() => {
    try { return localStorage.getItem(KIOSK_KEY) === '1'; } catch { return false; }
  });

  function toggleKiosk() {
    const next = !kioskMode;
    try { next ? localStorage.setItem(KIOSK_KEY, '1') : localStorage.removeItem(KIOSK_KEY); } catch {}
    setKioskMode(next);
  }

  // Check if there's a live ePSA session in sessionStorage to import
  const busflow = (() => {
    try { return JSON.parse(sessionStorage.getItem('busflow_import') || 'null'); } catch { return null; }
  })();
  const hasBusflow = !!(busflow?.engineResult && busflow?.formData);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getClinicalSessions(uid);
      setSessions(data);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const count = await importSessionsFromFile(uid, file);
      setImportMsg(`Imported ${count} session${count !== 1 ? 's' : ''}.`);
      await refresh();
    } catch (err) {
      setImportMsg(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  }

  function handleRecalcAll() {
    if (confirmRecalc !== 'confirm') { setConfirmRecalc('confirm'); return; }
    setConfirmRecalc(false);
    let changed = 0; let failed = 0;
    const updates = [];
    for (const s of sessions) {
      if (!s.formData) { failed += 1; continue; }
      try {
        const r = rescoreSession(s, KIOSK_ENGINE);
        if (r.engineResult?.score !== s.engineResult?.score) changed += 1;
        updates.push({ id: s.id, ...r });
      } catch { failed += 1; }
    }
    updateSessionResults(updates);
    setImportMsg(`Recalculated ${updates.length} session${updates.length !== 1 ? 's' : ''} — ${changed} score${changed !== 1 ? 's' : ''} changed${failed ? `, ${failed} could not be calculated` : ''}. Re-export to REDCap to update records already imported.`);
    refresh();
  }

  function handleExportAll() {
    if (!sessions.length) return;
    exportSessionsAsJson(sessions);
  }

  async function handleClearAll(exportFirst = false) {
    if (!confirmClear) { setConfirmClear('confirm'); return; }
    if (confirmClear === 'confirm' && !exportFirst) {
      // Show export option
      setConfirmClear('exporting');
      return;
    }
    if (exportFirst && sessions.length) exportSessionsAsJson(sessions);
    setConfirmClear(false);
    await clearAllClinicalSessions(uid);
    setImportMsg('All locally stored sessions cleared.');
    await refresh();
  }

  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const stats = {
    total: sessions.length,
    today: sessions.filter(s => s.createdAt && new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) === today).length,
    needsStep2: sessions.filter(s => !(s.step2 || s.postResult)).length,
    pendingRedcap: sessions.filter(s => !s.redcapPushedAt && isRedcapEligible(s)).length,
  };

  const filteredSessions = sessions.filter(s => {
    if (filterTier !== 'all' && (s.engineResult?.epsaTierKey || 'unknown') !== filterTier) return false;
    if (filterStep2 === 'needs' && (s.step2 || s.postResult)) return false;
    if (filterStep2 === 'done' && !(s.step2 || s.postResult)) return false;
    return true;
  });

  // New consented sessions if there are any; otherwise every consented session
  // (a re-export, e.g. after scores were recalculated). REDCap's import updates
  // existing records with the same record_id, so re-importing is safe.
  function handleExportRedcap() {
    const eligible = sessions.filter(isRedcapEligible);
    const pending = eligible.filter(s => !s.redcapPushedAt);
    const batch = pending.length ? pending : eligible;
    if (!batch.length) return;
    downloadRedcapCsv(batch);
    markSessionsRedcapExported(batch.map(s => s.id));
    const skipped = sessions.length - eligible.length;
    setImportMsg(`Exported ${batch.length} session${batch.length !== 1 ? 's' : ''} as a REDCap import CSV${skipped ? `; ${skipped} without consent left out` : ''}. Upload it in REDCap → Data Import Tool.`);
    refresh();
  }

  async function handleSessionDeleted() {
    setImportMsg('Session deleted.');
    await refresh();
  }

  async function handleSessionConsented(session) {
    setImportMsg(`Consent recorded for ${session.sessionRef ?? session.id}.`);
    await refresh();
  }

  async function handleImportBusflow() {
    if (!hasBusflow) return;
    setImportMsg(null);
    try {
      await saveClinicalSession(uid, {
        formData: busflow.formData,
        engineResult: busflow.engineResult,
      });
      setImportMsg('ePSA session saved successfully.');
      await refresh();
    } catch (err) {
      setImportMsg(`Save failed: ${err.message}`);
    }
  }

  return (
    <div className="csm-root">
      <div className="csm-header">
        <button type="button" className="csm-back-btn" onClick={onBack}>
          <ArrowLeftIcon size={16} /> Back
        </button>
        <h2 className="csm-title">Saved Sessions</h2>
        <div className="csm-header-actions">
          <button
            type="button"
            className={`csm-kiosk-toggle${kioskMode ? ' csm-kiosk-toggle--on' : ''}`}
            onClick={toggleKiosk}
            title={kioskMode ? 'Kiosk mode ON — tap to disable (idle reset active on form)' : 'Kiosk mode OFF — tap to enable (adds idle reset to form screen)'}
          >
            {kioskMode ? '🖥 Kiosk ON' : '🖥 Kiosk OFF'}
          </button>
          <button type="button" className="csm-icon-btn" onClick={refresh} title="Refresh">
            <RefreshCwIcon size={16} />
          </button>
        </div>
      </div>

      {!loading && sessions.length > 0 && (
        <div className="csm-stats-strip">
          <div className="csm-stat"><span className="csm-stat-num">{stats.today}</span><span className="csm-stat-label">Today</span></div>
          <div className="csm-stat"><span className="csm-stat-num">{stats.total}</span><span className="csm-stat-label">Total</span></div>
          <div className="csm-stat csm-stat--warn"><span className="csm-stat-num">{stats.needsStep2}</span><span className="csm-stat-label">Needs Step 2</span></div>
          <div className="csm-stat csm-stat--warn"><span className="csm-stat-num">{stats.pendingRedcap}</span><span className="csm-stat-label">Pending REDCap</span></div>
        </div>
      )}

      {!loading && sessions.length > 0 && (
        <div className="csm-filters">
          <select className="csm-filter-select" value={filterTier} onChange={e => setFilterTier(e.target.value)}>
            <option value="all">All tiers</option>
            <option value="low">Low risk</option>
            <option value="intermediate">Intermediate</option>
            <option value="elevated">Elevated</option>
          </select>
          <select className="csm-filter-select" value={filterStep2} onChange={e => setFilterStep2(e.target.value)}>
            <option value="all">All sessions</option>
            <option value="needs">Needs Step 2</option>
            <option value="done">Has Step 2</option>
          </select>
          {(filterTier !== 'all' || filterStep2 !== 'all') && (
            <button type="button" className="csm-filter-clear" onClick={() => { setFilterTier('all'); setFilterStep2('all'); }}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {hasBusflow && (
        <div className="csm-busflow-banner">
          <ZapIcon size={16} className="csm-busflow-icon" />
          <div className="csm-busflow-text">
            <strong>Unsaved ePSA result detected</strong>
            <span>You have a completed ePSA session ready to save.</span>
          </div>
          <button type="button" className="csm-busflow-save-btn" onClick={handleImportBusflow}>
            Save Now
          </button>
        </div>
      )}

      <div className="csm-toolbar">
        <button type="button" className="csm-toolbar-btn csm-toolbar-btn--primary" onClick={onNewSession}>
          <PlusIcon size={15} /> New Session
        </button>
        <button type="button" className="csm-toolbar-btn" onClick={handleExportAll} disabled={!sessions.length}>
          <DownloadIcon size={15} /> Export All
        </button>
        <button
          type="button"
          className={`csm-toolbar-btn${confirmRecalc ? ' csm-toolbar-btn--confirm' : ''}`}
          onClick={handleRecalcAll}
          onBlur={() => setConfirmRecalc(false)}
          disabled={!sessions.length}
          title="Re-run the ePSA engine on every saved session and overwrite the stored scores"
        >
          <CalculatorIcon size={15} /> {confirmRecalc ? 'Overwrite scores? Tap again' : 'Run ePSA on All'}
        </button>
        <label className={`csm-toolbar-btn${importing ? ' csm-toolbar-btn--loading' : ''}`}>
          <UploadIcon size={15} /> {importing ? 'Importing…' : 'Import JSON'}
          <input type="file" accept=".json" hidden onChange={handleImport} />
        </label>
        <button type="button" className="csm-toolbar-btn" onClick={() => setShowWizard(true)} title="Import kiosk or calculator JSON files with a preview">
          <UploadIcon size={15} /> Import Wizard
        </button>
        <button
          type="button"
          className="csm-toolbar-btn"
          onClick={handleExportRedcap}
          disabled={!sessions.some(isRedcapEligible)}
          title="Download consented sessions as a CSV for REDCap's Data Import Tool. Nothing is uploaded from this device."
        >
          <FileSpreadsheetIcon size={15} />
          {stats.pendingRedcap ? `REDCap CSV (${stats.pendingRedcap} new)` : 'REDCap CSV (all)'}
        </button>
        {confirmClear === 'exporting' ? (
          <div className="csm-clear-confirm">
            <span>Export before clearing?</span>
            <button type="button" className="csm-toolbar-btn csm-toolbar-btn--primary" onClick={() => handleClearAll(true)}>
              Export &amp; Clear
            </button>
            <button type="button" className="csm-toolbar-btn csm-toolbar-btn--danger" onClick={() => handleClearAll(false)}>
              Clear Only
            </button>
            <button type="button" className="csm-toolbar-btn" onClick={() => setConfirmClear(false)}>Cancel</button>
          </div>
        ) : (
          <button
            type="button"
            className={`csm-toolbar-btn csm-toolbar-btn--danger${confirmClear === 'confirm' ? ' csm-toolbar-btn--confirm' : ''}`}
            onClick={() => handleClearAll()}
            onBlur={() => setConfirmClear(false)}
            disabled={!sessions.length}
            title="Delete all saved sessions from this device"
          >
            <TrashIcon size={15} /> {confirmClear === 'confirm' ? 'Sure? Tap again' : 'Clear All'}
          </button>
        )}
      </div>

      {showWizard && (
        <ImportWizard
          uid={uid}
          existingRefs={new Set(sessions.map(s => s.sessionRef).filter(Boolean))}
          onClose={() => setShowWizard(false)}
          onImported={refresh}
        />
      )}

      {importMsg && (
        <div className={`csm-import-msg${/failed/i.test(importMsg) ? ' csm-import-msg--err' : ''}`}>
          {importMsg}
        </div>
      )}

      <div className="csm-list">
        {loading ? (
          <div className="csm-empty">Loading sessions…</div>
        ) : filteredSessions.length === 0 ? (
          <div className="csm-empty">
            {sessions.length === 0 ? 'No saved sessions yet. Complete a screening to save results here.' : 'No sessions match the current filters.'}
          </div>
        ) : (() => {
          const groups = {};
          for (const s of filteredSessions) {
            const label = s.createdAt
              ? new Date(s.createdAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
              : 'Unknown date';
            (groups[label] = groups[label] ?? []).push(s);
          }
          return Object.entries(groups).map(([dateLabel, group]) => (
            <div key={dateLabel} className="csm-date-group">
              <div className="csm-date-heading">{dateLabel} <span className="csm-date-count">({group.length})</span></div>
              {group.map(s => (
                <SessionRow
                  key={s.id}
                  session={s}
                  uid={uid}
                  onDeleted={handleSessionDeleted}
                  onConsented={handleSessionConsented}
                  onUpdated={refresh}
                />
              ))}
            </div>
          ));
        })()}
      </div>

      <div className="csm-storage-note">
        {uid && !uid.startsWith('dev_')
          ? 'Sessions synced to Firebase (this device).'
          : 'Sessions stored locally on this device.'}
      </div>
    </div>
  );
}
