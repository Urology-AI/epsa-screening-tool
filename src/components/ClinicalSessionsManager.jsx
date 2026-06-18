import React, { useState, useEffect, useCallback } from 'react';
import {
  TrashIcon, DownloadIcon, UploadIcon, PrinterIcon,
  ChevronDownIcon, ChevronUpIcon, ArrowLeftIcon,
  SendIcon, RefreshCwIcon, PlusIcon, ZapIcon,
  CloudUploadIcon, CloudDownloadIcon
} from 'lucide-react';
import { getClinicalSessions, deleteClinicalSession, clearAllClinicalSessions, exportSessionsAsJson, importSessionsFromFile, saveClinicalSession, mergeSessions, setSessionConsent, updateSessionStep2 } from '../services/clinicalSessionService';
import { isTursoConfigured, pushSessions, pullSessions, getSyncedKeys, syncKey, markPendingDelete, getPendingDeleteCount, isPushable, markRedcapPushed } from '../services/tursoService';
import { submitToRedcap } from '../utils/redcapSubmit';
import ClinicalModeResult from './ClinicalModeResult.jsx';
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

function Part2EntryForm({ session, uid, onSaved, onCancel, tursoReady }) {
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
      const updated = await updateSessionStep2(uid, session, step2);
      if (tursoReady && updated) await pushSessions([updated]);
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

function SessionRow({ session, uid, onDeleted, onConsented, onUpdated, tursoReady, tursoSynced }) {
  const [expanded, setExpanded] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushStatus, setPushStatus] = useState(null);
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

  async function handlePushRedcap() {
    if (!session.formData) return;
    setPushing(true);
    setPushStatus(null);
    try {
      const result = await submitToRedcap(session.formData, session.sessionRef);
      if (!result.success) throw new Error(result.error);
      setPushStatus('ok');
      // Persist the timestamp locally and in Turso
      if (tursoReady) {
        await markRedcapPushed(session).catch(() => {});
      }
      await onUpdated?.();
    } catch {
      setPushStatus('err');
    } finally {
      setPushing(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  // Patient signed the consent form after the fact (or staff confirm it):
  // record consent and push the session to the cloud.
  async function handleMarkConsented() {
    if (consenting !== 'confirm') { setConsenting('confirm'); return; }
    setConsenting('working');
    try {
      await setSessionConsent(uid, session, true);
      if (tursoReady) await pushSessions([{ ...session, consented: true }]);
      setConsenting(false);
      await onConsented?.(session);
    } catch {
      setConsenting('err');
    }
  }

  function handleExportThis() {
    exportSessionsAsJson([session]);
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
          <span className="csm-row-badge csm-row-badge--noconsent" title="Patient declined cloud storage — this session is never pushed">
            No consent
          </span>
        )}
        {session.redcapPushedAt && (
          <span className="csm-row-badge csm-row-badge--redcap" title={`Pushed to REDCap on ${new Date(session.redcapPushedAt).toLocaleString()}`}>
            REDCap ✓
          </span>
        )}
        {tursoReady && !noConsent && (
          <span
            className={`csm-row-badge csm-row-badge--${tursoSynced ? 'synced' : 'unsynced'}`}
            title={tursoSynced ? 'This case exists in the Turso cloud database' : 'Not yet pushed to the Turso cloud database'}
          >
            {tursoSynced ? 'Turso ✓' : 'Not synced'}
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
            {tursoSynced && (
              <button
                type="button"
                className={`csm-action-btn csm-action-btn--redcap${pushStatus === 'ok' ? ' csm-action-btn--ok' : pushStatus === 'err' ? ' csm-action-btn--err' : ''}`}
                onClick={handlePushRedcap}
                disabled={pushing}
                title={session.redcapPushedAt ? `Last pushed ${new Date(session.redcapPushedAt).toLocaleString()}` : 'Push to REDCap'}
              >
                <SendIcon size={14} />
                {pushing ? 'Pushing…'
                  : pushStatus === 'ok' ? 'Sent!'
                  : pushStatus === 'err' ? 'Failed'
                  : session.redcapPushedAt ? 'Re-push to REDCap'
                  : 'Push to REDCap'}
              </button>
            )}
            {noConsent && (
              <button
                type="button"
                className={`csm-action-btn csm-action-btn--consent${consenting === 'confirm' ? ' csm-action-btn--confirm' : ''}${consenting === 'err' ? ' csm-action-btn--err' : ''}`}
                onClick={handleMarkConsented}
                onBlur={() => { if (consenting === 'confirm') setConsenting(false); }}
                disabled={consenting === 'working'}
                title="Record that the patient has signed the consent form, then sync this session to the cloud"
              >
                <CloudUploadIcon size={14} />
                {consenting === 'working' ? 'Syncing…'
                  : consenting === 'confirm' ? 'Confirm consent signed?'
                  : consenting === 'err' ? 'Failed — retry'
                  : 'Mark consented & sync'}
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
              tursoReady={tursoReady}
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

const TEST_REDCAP_RECORD = {
  age: '55',
  race: 'white',
  family_history: '1',
  genetic_risk: 'no',
  bmi: '26.5',
  exercise: 'moderate',
  smoking: 'never',
  chemical_exposure: 'no',
  diet_pattern: 'western',
  comorbidities: 0,
  ipss_qol: '2',
  erection_confidence: '4',
};

export default function ClinicalSessionsManager({ uid, onBack, onNewSession }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState(null);
  const [redcapTest, setRedcapTest] = useState(null); // null | 'testing' | 'ok' | 'err'
  const [confirmClear, setConfirmClear] = useState(false); // false | 'confirm' | 'exporting'
  const [filterTier, setFilterTier] = useState('all'); // 'all' | 'low' | 'intermediate' | 'elevated'
  const [filterStep2, setFilterStep2] = useState('all'); // 'all' | 'needs' | 'done'
  const [syncing, setSyncing] = useState(null); // 'push' | 'pull' | null
  const [syncedKeys, setSyncedKeys] = useState(() => getSyncedKeys());
  const [pendingDeletes, setPendingDeletes] = useState(() => getPendingDeleteCount());
  const tursoReady = isTursoConfigured();
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
    pendingRedcap: sessions.filter(s => !s.redcapPushedAt && s.consented !== false).length,
  };

  const filteredSessions = sessions.filter(s => {
    if (filterTier !== 'all' && (s.engineResult?.epsaTierKey || 'unknown') !== filterTier) return false;
    if (filterStep2 === 'needs' && (s.step2 || s.postResult)) return false;
    if (filterStep2 === 'done' && !(s.step2 || s.postResult)) return false;
    return true;
  });

  async function handlePushCloud() {
    if ((!sessions.length && !pendingDeletes) || syncing) return;
    setSyncing('push');
    setImportMsg(null);
    try {
      const { pushed, deleted } = await pushSessions(sessions);
      const skipped = sessions.filter(s => !isPushable(s)).length;
      setSyncedKeys(getSyncedKeys());
      setPendingDeletes(getPendingDeleteCount());
      const parts = [`Pushed ${pushed} session${pushed !== 1 ? 's' : ''} to cloud`];
      if (skipped) parts.push(`kept ${skipped} non-consented session${skipped !== 1 ? 's' : ''} local`);
      if (deleted) parts.push(`removed ${deleted} deleted case${deleted !== 1 ? 's' : ''}`);
      setImportMsg(`${parts.join('; ')}.`);
    } catch (err) {
      setImportMsg(`Push failed: ${err.message}`);
    } finally {
      setSyncing(null);
    }
  }

  async function handlePullCloud() {
    if (syncing) return;
    setSyncing('pull');
    setImportMsg(null);
    try {
      const pulled = await pullSessions();
      const added = mergeSessions(pulled);
      setSyncedKeys(getSyncedKeys());
      setPendingDeletes(getPendingDeleteCount());
      setImportMsg(`Pulled ${pulled.length} session${pulled.length !== 1 ? 's' : ''} from cloud (${added} new).`);
      await refresh();
    } catch (err) {
      setImportMsg(`Pull failed: ${err.message}`);
    } finally {
      setSyncing(null);
    }
  }

  async function handleSessionDeleted(session) {
    if (tursoReady && (await markPendingDelete(session))) {
      setSyncedKeys(getSyncedKeys());
      setPendingDeletes(getPendingDeleteCount());
      setImportMsg('Session deleted from this device. It will be removed from Turso on the next push.');
    } else {
      setImportMsg('Session deleted.');
    }
    await refresh();
  }

  async function handleSessionConsented(session) {
    setSyncedKeys(getSyncedKeys());
    setImportMsg(`Consent recorded for ${session.sessionRef ?? session.id}${tursoReady ? ' — session synced to cloud' : ''}.`);
    await refresh();
  }

  async function handleTestRedcap() {
    if (redcapTest === 'testing') return;
    setRedcapTest('testing');
    setImportMsg(null);
    const result = await submitToRedcap(TEST_REDCAP_RECORD, `test_${Date.now()}`);
    if (result.success) {
      setRedcapTest('ok');
      setImportMsg('REDCap test submission succeeded.');
    } else {
      setRedcapTest('err');
      setImportMsg(`REDCap test failed: ${result.error}`);
    }
    setTimeout(() => setRedcapTest(null), 4000);
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
        <label className={`csm-toolbar-btn${importing ? ' csm-toolbar-btn--loading' : ''}`}>
          <UploadIcon size={15} /> {importing ? 'Importing…' : 'Import JSON'}
          <input type="file" accept=".json" hidden onChange={handleImport} />
        </label>
        {tursoReady && (
          <>
            <button
              type="button"
              className={`csm-toolbar-btn${syncing === 'push' ? ' csm-toolbar-btn--loading' : ''}`}
              onClick={handlePushCloud}
              disabled={(!sessions.length && !pendingDeletes) || !!syncing}
              title={pendingDeletes
                ? `Push all sessions and remove ${pendingDeletes} deleted case${pendingDeletes !== 1 ? 's' : ''} from the Turso cloud database`
                : 'Push all sessions to the Turso cloud database (de-identified)'}
            >
              <CloudUploadIcon size={15} />
              {syncing === 'push' ? 'Pushing…' : pendingDeletes ? `Push to Cloud (${pendingDeletes} to remove)` : 'Push to Cloud'}
            </button>
            <button
              type="button"
              className={`csm-toolbar-btn${syncing === 'pull' ? ' csm-toolbar-btn--loading' : ''}`}
              onClick={handlePullCloud}
              disabled={!!syncing}
              title="Pull sessions from the Turso cloud database"
            >
              <CloudDownloadIcon size={15} /> {syncing === 'pull' ? 'Pulling…' : 'Pull from Cloud'}
            </button>
          </>
        )}
        <button
          type="button"
          className={`csm-toolbar-btn${redcapTest === 'ok' ? ' csm-toolbar-btn--ok' : redcapTest === 'err' ? ' csm-toolbar-btn--err' : ''}`}
          onClick={handleTestRedcap}
          disabled={redcapTest === 'testing'}
          title="Send a dummy record to REDCap to verify the proxy is working"
        >
          <SendIcon size={15} />
          {redcapTest === 'testing' ? 'Testing…' : redcapTest === 'ok' ? 'REDCap ✓' : redcapTest === 'err' ? 'REDCap ✗' : 'Test REDCap'}
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
                  tursoReady={tursoReady}
                  tursoSynced={syncedKeys.has(syncKey(s))}
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
