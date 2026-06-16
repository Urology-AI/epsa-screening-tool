import React, { useEffect, useState } from 'react';
import { MsalProvider, useMsal, useIsAuthenticated } from '@azure/msal-react';
import { PublicClientApplication, InteractionStatus } from '@azure/msal-browser';
import ClinicalSessionsManager from './components/ClinicalSessionsManager.jsx';
import './components/ClinicalSessionsManager.css';
import { getOrCreateUid } from './services/clinicalSessionService';
import { msalConfig, loginRequest } from './config/msalConfig.js';
import { LockIcon, LogOutIcon } from 'lucide-react';
import './App.css';

const msalInstance = new PublicClientApplication(msalConfig);

function AdminContent() {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [uid, setUid] = useState(null);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    getOrCreateUid().then(setUid).catch(() => {});
  }, []);

  // Handle redirect response — MsalProvider calls initialize() before rendering children
  useEffect(() => {
    instance.handleRedirectPromise().catch(err => {
      setLoginError(err.message || 'Login failed');
    });
  }, [instance]);

  function handleLogin() {
    setLoginError('');
    instance.loginRedirect(loginRequest).catch(err => {
      setLoginError(err.message || 'Login failed');
    });
  }

  function handleLogout() {
    instance.logoutRedirect({ postLogoutRedirectUri: window.location.origin + '/admin' });
  }

  const isLoading = inProgress === InteractionStatus.Redirect || inProgress === InteractionStatus.Login;

  if (!isAuthenticated) {
    return (
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.5rem',
        padding: '2rem',
        background: 'var(--surface)',
        color: 'var(--ink-900)',
      }}>
        <LockIcon size={40} style={{ opacity: 0.6 }} />
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Staff Admin</h1>
        <p style={{ margin: 0, color: 'var(--ink-600)', fontSize: '0.9rem', textAlign: 'center' }}>
          Sign in with your Microsoft account to continue
        </p>
        {loginError && (
          <p style={{ margin: 0, color: '#ef4444', fontSize: '0.85rem', textAlign: 'center', maxWidth: '320px' }}>
            {loginError}
          </p>
        )}
        <button
          onClick={handleLogin}
          disabled={isLoading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.75rem 1.5rem',
            borderRadius: '8px',
            border: 'none',
            background: '#0078d4',
            color: '#fff',
            fontWeight: 700,
            fontSize: '1rem',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.6 : 1,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
            <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
            <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
          </svg>
          {isLoading ? 'Signing in…' : 'Sign in with Microsoft'}
        </button>
        <a href="/" style={{ fontSize: '0.82rem', opacity: 0.45, color: 'inherit', marginTop: '0.5rem' }}>
          ← Back to kiosk
        </a>
      </div>
    );
  }

  const account = accounts[0];

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        position: 'fixed',
        top: '0.75rem',
        right: '0.75rem',
        zIndex: 999,
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        background: 'var(--surface-subtle)',
        borderRadius: '8px',
        padding: '0.4rem 0.75rem',
        fontSize: '0.82rem',
        color: 'var(--ink-900)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--ink-300)',
      }}>
        <span style={{ opacity: 0.7 }}>{account?.username || account?.name}</span>
        <button
          onClick={handleLogout}
          title="Sign out"
          style={{
            background: 'none',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            padding: '0.1rem',
            display: 'flex',
            alignItems: 'center',
            opacity: 0.7,
          }}
        >
          <LogOutIcon size={14} />
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

export default function AdminApp() {
  return (
    <MsalProvider instance={msalInstance}>
      <AdminContent />
    </MsalProvider>
  );
}
