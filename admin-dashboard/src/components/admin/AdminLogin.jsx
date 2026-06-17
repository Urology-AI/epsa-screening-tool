/**
 * Admin Login — Microsoft SSO
 * One button: "Sign in with Microsoft" → Azure AD popup → back here.
 */

import React, { useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { msalAuthService } from '../../services/msalAuthService';
import './AdminLogin.css';

// Microsoft "M" SVG logo (official brand colours, no external request needed)
const MicrosoftLogo = () => (
  <svg width="20" height="20" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="1"  y="1"  width="9" height="9" fill="#F25022" />
    <rect x="11" y="1"  width="9" height="9" fill="#7FBA00" />
    <rect x="1"  y="11" width="9" height="9" fill="#00A4EF" />
    <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
  </svg>
);

const AdminLogin = ({ onLoginSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState('');

  const handleSignIn = async () => {
    setIsLoading(true);
    setError('');

    const result = await msalAuthService.loginWithMicrosoft();

    if (result.success) {
      onLoginSuccess(result.user);
    } else {
      setError(result.message || 'Sign-in failed. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="admin-login-container">
      <div className="admin-login-card">

        {/* ── Header ── */}
        <div className="admin-login-header">
          <div className="sinai-wordmark">
            <div className="sinai-logo-mark">MS</div>
            <div className="sinai-wordmark-text">
              <span className="institution">Mount Sinai</span>
              <span className="app-name">ePSA Research Portal</span>
            </div>
          </div>
          <p>IRB Study STUDY-14-00050 · Admin Access</p>
        </div>

        {/* ── Body ── */}
        <div className="admin-login-form">
          <div className="login-header">
            <MicrosoftLogo />
            <h1>Admin Sign-In</h1>
            <p>Use your Mount Sinai Microsoft account to access the research portal.</p>
          </div>

          {error && (
            <div className="message error">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <button
            className="login-button microsoft-btn"
            onClick={handleSignIn}
            disabled={isLoading}
          >
            {isLoading
              ? <><Loader2 size={20} className="animate-spin" /> Signing in…</>
              : <><MicrosoftLogo /> Sign in with Microsoft</>
            }
          </button>

          <p className="sso-note">
            A browser popup will open for Mount Sinai authentication.<br />
            Allow popups for this site if prompted.
          </p>
        </div>

        {/* ── Footer ── */}
        <div className="admin-login-footer">
          <p>Access restricted to authorized Mount Sinai research staff.<br />
            Contact your system administrator to request access.</p>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
