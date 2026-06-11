import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ClinicalSessionsManager from './components/ClinicalSessionsManager.jsx';
import './components/ClinicalSessionsManager.css';
import { getOrCreateUid } from './services/clinicalSessionService';
import { LockIcon } from 'lucide-react';
import './App.css';

const ADMIN_PIN = import.meta.env.VITE_CLINICAL_ADMIN_PIN || '1234';

function PinGate({ onUnlock }) {
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (pin === ADMIN_PIN) {
      onUnlock();
    } else {
      setError('Incorrect PIN');
      setPin('');
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1.5rem',
      padding: '2rem',
      background: 'var(--surface-bg, #0f172a)',
      color: 'var(--ink-900, #fff)',
    }}>
      <LockIcon size={40} style={{ opacity: 0.6 }} />
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Staff Admin</h1>
      <p style={{ margin: 0, opacity: 0.6, fontSize: '0.9rem' }}>Enter your PIN to continue</p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: '260px' }}>
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={8}
          value={pin}
          onChange={e => { setPin(e.target.value); setError(''); }}
          placeholder="PIN"
          autoFocus
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            border: error ? '2px solid #ef4444' : '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.07)',
            color: 'inherit',
            fontSize: '1.1rem',
            textAlign: 'center',
            letterSpacing: '0.25em',
          }}
        />
        {error && <p style={{ margin: 0, color: '#ef4444', fontSize: '0.85rem', textAlign: 'center' }}>{error}</p>}
        <button
          type="submit"
          disabled={!pin}
          style={{
            padding: '0.75rem',
            borderRadius: '8px',
            border: 'none',
            background: '#3b82f6',
            color: '#fff',
            fontWeight: 700,
            fontSize: '1rem',
            cursor: pin ? 'pointer' : 'not-allowed',
            opacity: pin ? 1 : 0.5,
          }}
        >
          Unlock
        </button>
      </form>
      <a href="/" style={{ fontSize: '0.82rem', opacity: 0.45, color: 'inherit', marginTop: '1rem' }}>
        ← Back to kiosk
      </a>
    </div>
  );
}

export default function AdminApp() {
  const [unlocked, setUnlocked] = useState(false);
  const [uid, setUid] = useState(null);

  useEffect(() => {
    getOrCreateUid().then(setUid).catch(() => {});
  }, []);

  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />;

  return (
    <ClinicalSessionsManager
      uid={uid}
      onBack={() => { window.location.href = '/'; }}
      onNewSession={() => { window.location.href = '/'; }}
    />
  );
}
