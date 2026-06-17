/**
 * ClinicalSessionsAdmin.jsx
 * ─────────────────────────────────────────────────────────────────────────
 * Admin view for all kiosk / clinical-mode sessions.
 *
 * Reads from the clinicalSessions/{uid}/records subcollection via a
 * collectionGroup query (admins can read all records per Firestore rules).
 * No PHI beyond what REDCap already holds — sessions store de-identified
 * risk-factor data (age, race, lifestyle, tier, sessionRef).
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  collectionGroup, getDocs, query, orderBy, limit as fsLimit,
} from 'firebase/firestore';
import {
  RefreshCw, Download, ChevronDown, ChevronUp,
  CheckCircle2, AlertCircle, Clock, Send, Search,
} from 'lucide-react';
import { adminDb, adminFunctions } from '../../config/adminFirebase';
import { httpsCallable } from 'firebase/functions';
import './ClinicalSessionsAdmin.css';

const TIER_COLORS = { low: '#16a34a', intermediate: '#d97706', elevated: '#dc2626' };
const PAGE_SIZE = 50;

function fmtDate(val) {
  if (!val) return '—';
  const d = val?.toDate ? val.toDate() : new Date(val);
  return isNaN(d) ? '—' : d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function StatusChip({ status }) {
  if (status === 'submitted') return <span className="csa-chip csa-chip--green"><CheckCircle2 size={12} /> In REDCap</span>;
  if (status === 'error')     return <span className="csa-chip csa-chip--red"><AlertCircle size={12} /> Failed</span>;
  return <span className="csa-chip csa-chip--amber"><Clock size={12} /> Pending</span>;
}

function SessionRow({ session }) {
  const [open, setOpen] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushStatus, setPushStatus] = useState(null);

  const tier = session.engineResult?.epsaTierKey ?? 'unknown';
  const tierLabel = session.engineResult?.epsaTierLabel ?? tier;
  const scoreRange = session.engineResult?.displayRange ?? '—';
  const age = session.formData?.age ?? '—';
  const race = session.formData?.race ?? '—';
  const bmi = session.formData?.bmi ?? '—';

  async function pushToRedcap() {
    if (!session.formData) return;
    setPushing(true);
    try {
      const fn = httpsCallable(adminFunctions, 'submitRedcap');
      await fn({ record: buildRecord(session) });
      setPushStatus('ok');
    } catch {
      setPushStatus('err');
    } finally {
      setPushing(false);
    }
  }

  function buildRecord(s) {
    const f = s.formData ?? {};
    const chemRaw = f.chemicalExposure;
    return {
      record_id:          s.sessionRef ?? s.id,
      age:                f.age,
      race:               f.race,
      family_history:     f.familyHistory,
      genetic_risk:       f.brcaStatus,
      bmi:                f.bmi != null ? parseFloat(String(f.bmi)).toFixed(1) : undefined,
      exercise:           f.exercise,
      smoking:            f.smoking,
      chemical_exposure:  chemRaw === 'no' ? 'no' : chemRaw === 'unknown' ? 'unknown' : chemRaw ? 'yes' : undefined,
      diet_pattern:       f.dietPattern,
      comorbidities:      f.comorbidityScore ?? 0,
      ipss_qol:           f.ipssQol,
      erection_confidence: f.shim?.[0],
    };
  }

  return (
    <div className="csa-row">
      <button type="button" className="csa-row-header" onClick={() => setOpen(v => !v)}>
        <span className="csa-tier-dot" style={{ background: TIER_COLORS[tier] ?? '#9ca3af' }} />
        <span className="csa-ref">{session.sessionRef ?? '—'}</span>
        <span className="csa-date">{fmtDate(session.createdAt)}</span>
        <span className="csa-meta">Age {age} · {race}</span>
        <span className="csa-tier" style={{ color: TIER_COLORS[tier] ?? '#374151' }}>{tierLabel}</span>
        <span className="csa-score">{scoreRange}</span>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>

      {open && (
        <div className="csa-row-body">
          <div className="csa-row-actions">
            <button
              type="button"
              className={`csa-act-btn${pushStatus === 'ok' ? ' csa-act-btn--ok' : pushStatus === 'err' ? ' csa-act-btn--err' : ''}`}
              onClick={pushToRedcap}
              disabled={pushing}
            >
              <Send size={13} />
              {pushing ? 'Pushing…' : pushStatus === 'ok' ? 'Sent to REDCap' : pushStatus === 'err' ? 'Push failed' : 'Push to REDCap'}
            </button>
          </div>
          <table className="csa-detail-table">
            <tbody>
              <tr><th>Session Ref</th><td>{session.sessionRef ?? session.id}</td></tr>
              <tr><th>Date</th><td>{fmtDate(session.createdAt)}</td></tr>
              <tr><th>Age</th><td>{age}</td></tr>
              <tr><th>Race</th><td>{race}</td></tr>
              <tr><th>BMI</th><td>{bmi}</td></tr>
              <tr><th>Risk tier</th><td style={{ color: TIER_COLORS[tier] ?? undefined, fontWeight: 700 }}>{tierLabel} ({scoreRange})</td></tr>
              <tr><th>Family Hx</th><td>{session.formData?.familyHistory ?? '—'}</td></tr>
              <tr><th>BRCA</th><td>{session.formData?.brcaStatus ?? '—'}</td></tr>
              <tr><th>Exercise</th><td>{session.formData?.exercise ?? '—'}</td></tr>
              <tr><th>Smoking</th><td>{session.formData?.smoking ?? '—'}</td></tr>
              <tr><th>Diet</th><td>{session.formData?.dietPattern ?? '—'}</td></tr>
              <tr><th>Comorbidities</th><td>{session.formData?.comorbidityScore ?? '—'}</td></tr>
              <tr><th>IPSS QoL</th><td>{session.formData?.ipssQol ?? '—'}</td></tr>
              <tr><th>SHIM Q1</th><td>{session.formData?.shim?.[0] ?? '—'}</td></tr>
              {session.step2?.psa && <tr><th>PSA</th><td>{session.step2.psa} ng/mL</td></tr>}
              {session.step2?.pirads && session.step2.pirads !== '0' && <tr><th>PI-RADS</th><td>{session.step2.pirads}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ClinicalSessionsAdmin() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = query(
        collectionGroup(adminDb, 'records'),
        orderBy('createdAt', 'desc'),
        fsLimit(PAGE_SIZE),
      );
      const snap = await getDocs(q);
      // Only show records that have a sessionRef (clinical mode sessions)
      const docs = snap.docs
        .filter(d => d.ref.parent.parent?.parent?.id === 'clinicalSessions')
        .map(d => ({
          id: d.id,
          ...d.data(),
          createdAt: d.data().createdAt,
        }));
      setSessions(docs);
    } catch (e) {
      setError(e.message ?? 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function exportCsv() {
    const headers = ['sessionRef', 'date', 'age', 'race', 'bmi', 'tier', 'scoreRange', 'familyHistory', 'brca', 'exercise', 'smoking', 'diet', 'comorbidities', 'ipssQol', 'shimQ1', 'psa', 'pirads'];
    const rows = sessions.map(s => [
      s.sessionRef ?? s.id,
      s.createdAt?.toDate ? s.createdAt.toDate().toISOString() : (s.createdAt ?? ''),
      s.formData?.age ?? '',
      s.formData?.race ?? '',
      s.formData?.bmi ?? '',
      s.engineResult?.epsaTierKey ?? '',
      s.engineResult?.displayRange ?? '',
      s.formData?.familyHistory ?? '',
      s.formData?.brcaStatus ?? '',
      s.formData?.exercise ?? '',
      s.formData?.smoking ?? '',
      s.formData?.dietPattern ?? '',
      s.formData?.comorbidityScore ?? '',
      s.formData?.ipssQol ?? '',
      s.formData?.shim?.[0] ?? '',
      s.step2?.psa ?? '',
      s.step2?.pirads ?? '',
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clinical_sessions_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = sessions.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (s.sessionRef ?? '').toLowerCase().includes(q) ||
      String(s.formData?.age ?? '').includes(q) ||
      (s.formData?.race ?? '').toLowerCase().includes(q) ||
      (s.engineResult?.epsaTierKey ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="csa-root">
      <div className="csa-header">
        <div>
          <h2 className="csa-title">Clinical Sessions</h2>
          <p className="csa-subtitle">Kiosk ePSA sessions — de-identified risk factor data only</p>
        </div>
        <div className="csa-header-actions">
          <button type="button" className="csa-btn" onClick={load} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'csa-spin' : ''} /> Refresh
          </button>
          <button type="button" className="csa-btn" onClick={exportCsv} disabled={!sessions.length}>
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>

      <div className="csa-search-bar">
        <Search size={15} />
        <input
          type="text"
          placeholder="Search by session ID, age, race, tier…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="csa-search-input"
        />
      </div>

      <div className="csa-stats">
        <span>{sessions.length} session{sessions.length !== 1 ? 's' : ''} (last {PAGE_SIZE})</span>
        {filtered.length !== sessions.length && <span> · {filtered.length} matching</span>}
      </div>

      {error && <div className="csa-error"><AlertCircle size={16} /> {error}</div>}

      {loading ? (
        <div className="csa-loading">Loading sessions…</div>
      ) : filtered.length === 0 ? (
        <div className="csa-empty">No clinical sessions found.</div>
      ) : (
        <div className="csa-list">
          {/* Column headers */}
          <div className="csa-list-header">
            <span />
            <span>Session ID</span>
            <span>Date</span>
            <span>Demographics</span>
            <span>Tier</span>
            <span>Score</span>
            <span />
          </div>
          {filtered.map(s => <SessionRow key={s.id} session={s} />)}
        </div>
      )}
    </div>
  );
}
