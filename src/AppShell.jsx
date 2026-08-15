import React, { useEffect, useState } from 'react';
import { MsalProvider, useMsal, useIsAuthenticated } from '@azure/msal-react';
import { PublicClientApplication, InteractionRequiredAuthError, InteractionStatus } from '@azure/msal-browser';
import ClinicalSessionsManager from './components/ClinicalSessionsManager.jsx';
import './components/ClinicalSessionsManager.css';
import { getOrCreateUid } from './services/clinicalSessionService';
import { setAuthTokenProvider } from './services/authToken';
import { msalConfig, loginRequest } from './config/msal.js';
import { LockIcon, LogOutIcon } from 'lucide-react';
import './App.css';

/**
 * Single app shell, with one MSAL instance and two access tiers.
 *
 * ROOT (/) is PUBLIC. epsa.mssm.edu serves a patient-facing screening
 * questionnaire; requiring a Mount Sinai login there would put a staff sign-in
 * wall in front of members of the public, which is not what that domain is
 * for. An earlier revision of this file did exactly that and took the public
 * tool offline.
 *
 * /admin REQUIRES SIGN-IN. Everything that reads, exports or deletes stored
 * clinical sessions lives behind it.
 *
 * What makes the public root safe is not a login — it is that the browser no
 * longer holds any database credential. A consented public submission goes to
 * a single insert-only endpoint on the Turso proxy that cannot read, list,
 * update or delete anything. Compare the previous design, where the bundle
 * carried a token granting full read/write/delete over every clinical session.
 *
 * REDCap is not reachable from the public flow at all. Staff review sessions
 * in /admin and push them to the study database from there, with a verified
 * identity on the request.
 */

// One instance, one redirectUri. AdminApp used to override this to /admin,
// which meant two MSAL instances with two registered redirect URIs for what is
// really a single SPA. The intended path is preserved across the redirect via
// sessionStorage instead.
const msalInstance = new PublicClientApplication(msalConfig);
const msalReady = msalInstance.initialize();

const POST_LOGIN_PATH_KEY = 'epsa_post_login_path';

const isAdminPath = () => window.location.pathname.replace(/\/+$/, '').endsWith('/admin');

function ShellContent() {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [uid, setUid] = useState(null);
  const [loginError, setLoginError] = useState('');
  const [KioskFlow, setKioskFlow] = useState(null);

  useEffect(() => {
    getOrCreateUid().then(setUid).catch(() => {});
  }, []);

  useEffect(() => {
    instance.handleRedirectPromise()
      .then(() => {
        // Return the user to the page they asked for before signing in.
        const wanted = sessionStorage.getItem(POST_LOGIN_PATH_KEY);
        if (wanted && wanted !== window.location.pathname) {
          sessionStorage.removeItem(POST_LOGIN_PATH_KEY);
          window.history.replaceState({}, '', wanted);
        }
      })
      .catch((err) => setLoginError(err.message || 'Login failed'));
  }, [instance]);

  /**
   * Install the token provider used by every authenticated service call
   * (Turso proxy and REDCap proxy alike).
   *
   * This supplies the ID TOKEN, not the Graph access token from the User.Read
   * scope: the Worker checks `aud === AZURE_CLIENT_ID`, and a Graph access
   * token carries Graph's audience instead and would be rejected.
   */
  useEffect(() => {
    if (!isAuthenticated || accounts.length === 0) {
      setAuthTokenProvider(null);
      return;
    }
    setAuthTokenProvider(async () => {
      try {
        const res = await instance.acquireTokenSilent({
          ...loginRequest,
          account: accounts[0],
        });
        return res.idToken;
      } catch (err) {
        // Silent renewal failed (expired refresh token, revoked session,
        // conditional-access change). Send the user back through login rather
        // than letting the call fail with an opaque 401.
        if (err instanceof InteractionRequiredAuthError) {
          await instance.acquireTokenRedirect(loginRequest);
        }
        throw err;
      }
    });
  }, [isAuthenticated, accounts, instance]);

  // The kiosk flow is heavy; load it only once past the auth gate.
  useEffect(() => {
    if (isAdminPath()) return;
    let cancelled = false;
    import('./components/ClinicalModeFlow.jsx').then((m) => {
      if (!cancelled) setKioskFlow(() => m.default);
    });
    return () => { cancelled = true; };
  }, []);

  function handleLogin() {
    setLoginError('');
    sessionStorage.setItem(POST_LOGIN_PATH_KEY, window.location.pathname);
    instance.loginRedirect(loginRequest).catch((err) => {
      setLoginError(err.message || 'Login failed');
    });
  }

  function handleLogout() {
    instance.logoutRedirect({
      postLogoutRedirectUri: window.location.origin + import.meta.env.BASE_URL,
    });
  }

  const isLoading = inProgress === InteractionStatus.Redirect || inProgress === InteractionStatus.Login;

  // Only /admin is gated. The root renders for everyone.
  if (!isAuthenticated && !isAdminPath()) {
    return KioskFlow ? <KioskFlow /> : null;
  }

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
        <p style={{ margin: 0, color: 'var(--ink-600)', fontSize: '0.9rem', textAlign: 'center', maxWidth: '340px' }}>
          Sign in with your Mount Sinai account to view and manage stored
          screening sessions.
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
      </div>
    );
  }

  const account = accounts[0];

  const signedInBadge = (
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
  );

  if (isAdminPath()) {
    return (
      <div style={{ position: 'relative' }}>
        {signedInBadge}
        <ClinicalSessionsManager
          uid={uid}
          onBack={() => { window.location.href = import.meta.env.BASE_URL; }}
          onNewSession={() => { window.location.href = import.meta.env.BASE_URL; }}
        />
      </div>
    );
  }

  if (!KioskFlow) return null;

  // Signed-in staff running the kiosk see who they are (and their submissions
  // are attributed); the public sees the questionnaire and nothing else.
  return (
    <div style={{ position: 'relative' }}>
      {signedInBadge}
      <KioskFlow />
    </div>
  );
}

export default function AppShell() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    msalReady.then(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <MsalProvider instance={msalInstance}>
      <ShellContent />
    </MsalProvider>
  );
}
