import React, { useState, useEffect } from 'react';
import ClinicalSessionsManager from './components/ClinicalSessionsManager.jsx';
import './components/ClinicalSessionsManager.css';
import { getOrCreateUid } from './services/clinicalSessionService';
import {
  isSupabaseConfigured,
  signInWithMicrosoft,
  signOut,
  getSession,
  onAuthStateChange,
} from './services/supabaseService';
import { LogInIcon, LogOutIcon, LockIcon } from 'lucide-react';
import './App.css';

// Fallback PIN gate used when Supabase is not configured (dev / offline use)
const ADMIN_PIN = import.meta.env.VITE_CLINICAL_ADMIN_PIN || '1234';

function PinGate({ onUnlock }) {
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
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: '1.5rem', padding: '2rem',
      background: 'var(--surface-bg, #0f172a)', color: 'var(--ink-900, #fff)',
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
            padding: '0.75rem 1rem', borderRadius: '8px',
            border: error ? '2px solid #ef4444' : '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.07)', color: 'inherit',
            fontSize: '1.1rem', textAlign: 'center', letterSpacing: '0.25em',
          }}
        />
        {error && <p style={{ margin: 0, color: '#ef4444', fontSize: '0.85rem', textAlign: 'center' }}>{error}</p>}
        <button
          type="submit"
          disabled={!pin}
          style={{
            padding: '0.75rem', borderRadius: '8px', border: 'none',
            background: '#3b82f6', color: '#fff', fontWeight: 700,
            fontSize: '1rem', cursor: pin ? 'pointer' : 'not-allowed', opacity: pin ? 1 : 0.5,
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

function MicrosoftLoginGate({ onSession }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleLogin() {
    setLoading(true);
    setError(null);
    try {
      await signInWithMicrosoft();
      // Redirect happens — onAuthStateChange in parent picks up the session on return
    } catch (err) {
      setError(err.message || 'Sign-in failed. Try again.');
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: '1.5rem', padding: '2rem',
      background: 'var(--surface-bg, #0f172a)', color: 'var(--ink-900, #fff)',
    }}>
      <LockIcon size={40} style={{ opacity: 0.6 }} />
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Staff Admin</h1>
      <p style={{ margin: 0, opacity: 0.6, fontSize: '0.9rem', textAlign: 'center', maxWidth: 280 }}>
        Sign in with your Mount Sinai Microsoft account to continue.
      </p>
      <button
        onClick={handleLogin}
        disabled={loading}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none',
          background: '#0078d4', color: '#fff', fontWeight: 700,
          fontSize: '1rem', cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
        }}
      >
        <LogInIcon size={18} />
        {loading ? 'Redirecting…' : 'Sign in with Microsoft'}
      </button>
      {error && <p style={{ margin: 0, color: '#ef4444', fontSize: '0.85rem' }}>{error}</p>}
      <a href="/" style={{ fontSize: '0.82rem', opacity: 0.45, color: 'inherit', marginTop: '1rem' }}>
        ← Back to kiosk
      </a>
    </div>
  );
}

export default function AdminApp() {
  const [uid, setUid] = useState(null);
  const [session, setSession] = useState(undefined); // undefined = loading
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const useSupabase = isSupabaseConfigured();

  useEffect(() => {
    getOrCreateUid().then(setUid).catch(() => {});
  }, []);

  // Supabase auth state
  useEffect(() => {
    if (!useSupabase) { setSession(null); return; }
    getSession().then(setSession);
    return onAuthStateChange(setSession);
  }, [useSupabase]);

  // Still loading auth state
  if (session === undefined) {
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--surface-bg, #0f172a)', color: 'var(--ink-900, #fff)',
      }}>
        Loading…
      </div>
    );
  }

  // Not using Supabase → fall back to PIN gate
  if (!useSupabase) {
    if (!pinUnlocked) return <PinGate onUnlock={() => setPinUnlocked(true)} />;
    return (
      <ClinicalSessionsManager
        uid={uid}
        onBack={() => { window.location.href = '/'; }}
        onNewSession={() => { window.location.href = '/'; }}
      />
    );
  }

  // Supabase configured but not signed in
  if (!session) return <MicrosoftLoginGate />;

  // Signed in via Microsoft
  const userEmail = session.user?.email;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.5rem 1rem',
        background: 'var(--ms-navy, #212070)', color: '#fff',
        fontSize: '0.8rem',
      }}>
        <span style={{ opacity: 0.8 }}>{userEmail}</span>
        <button
          onClick={async () => { await signOut(); setSession(null); }}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            background: 'none', border: '1px solid rgba(255,255,255,0.25)',
            color: '#fff', borderRadius: '6px', padding: '0.3rem 0.65rem',
            fontSize: '0.75rem', cursor: 'pointer',
          }}
        >
          <LogOutIcon size={13} /> Sign out
        </button>
      </div>
      <ClinicalSessionsManager
        uid={uid}
        onBack={() => { window.location.href = '/'; }}
        onNewSession={() => { window.location.href = '/'; }}
      />
    </div>
  );
}
