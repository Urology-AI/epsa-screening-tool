/**
 * Microsoft SSO auth service for the ePSA Admin Dashboard.
 * Replaces the Firebase OTP flow with Azure AD popup sign-in.
 *
 * Drop-in API contract (same shape as the old adminAuthService):
 *   msalAuthService.loginWithMicrosoft()  → { success, user?, message? }
 *   msalAuthService.isAdminAuthenticated() → boolean
 *   msalAuthService.getCurrentAdmin()      → { email, name, uid } | null
 *   msalAuthService.logoutAdmin()          → { success }
 *   msalAuthService.initializeMsal()       → must be called once before any other method
 */

import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
import { MSAL_CONFIG, LOGIN_SCOPES, ALLOWED_DOMAINS } from '../config/msalConfig';

class MsalAuthService {
  constructor() {
    this._pca = null;          // PublicClientApplication — created lazily
    this._account = null;      // cached active account
    this._initPromise = null;
  }

  // ── Initialization (call once at app start) ──────────────────────────────

  async initializeMsal() {
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      try {
        this._pca = new PublicClientApplication(MSAL_CONFIG);
        await this._pca.initialize();

        // Handle the redirect response if we're returning from a redirect flow.
        const response = await this._pca.handleRedirectPromise();
        if (response?.account) {
          this._pca.setActiveAccount(response.account);
          this._account = response.account;
          this._persistSession(response.account);
        } else {
          // Restore from sessionStorage (page reload, tab close/reopen in same session).
          const accounts = this._pca.getAllAccounts();
          if (accounts.length > 0) {
            this._pca.setActiveAccount(accounts[0]);
            this._account = accounts[0];
          }
        }
      } catch (err) {
        console.error('[MSAL] Initialization error:', err);
        this._pca = null;
      }
    })();

    return this._initPromise;
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  async loginWithMicrosoft() {
    if (!this._pca) {
      return { success: false, message: 'MSAL is not initialized. Please refresh the page.' };
    }

    try {
      const response = await this._pca.loginPopup({
        scopes: LOGIN_SCOPES,
        prompt: 'select_account',
      });

      if (!response?.account) {
        return { success: false, message: 'No account returned from Microsoft login.' };
      }

      const account = response.account;
      const email = account.username || account.idTokenClaims?.preferred_username || '';

      if (!this._isDomainAllowed(email)) {
        // Sign them back out so the MSAL cache is clean.
        await this._pca.logoutPopup({ account });
        return {
          success: false,
          message: `Access restricted to Mount Sinai accounts. "${email}" is not authorized.`,
        };
      }

      this._pca.setActiveAccount(account);
      this._account = account;
      this._persistSession(account);

      return {
        success: true,
        user: this._buildUser(account),
      };
    } catch (err) {
      if (err?.errorCode === 'user_cancelled') {
        return { success: false, message: 'Sign-in was cancelled.' };
      }
      console.error('[MSAL] Login error:', err);
      return { success: false, message: err?.message || 'Microsoft sign-in failed. Please try again.' };
    }
  }

  // ── Session ───────────────────────────────────────────────────────────────

  isAdminAuthenticated() {
    if (this._account && this._isDomainAllowed(this._account.username || '')) {
      return true;
    }
    // Fallback: check sessionStorage (survives page reload before _pca finishes init).
    return sessionStorage.getItem('admin_authenticated') === 'true';
  }

  getCurrentAdmin() {
    if (this._account) return this._buildUser(this._account);

    const raw = sessionStorage.getItem('admin_user');
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  }

  async logoutAdmin() {
    try {
      sessionStorage.removeItem('admin_authenticated');
      sessionStorage.removeItem('admin_user');

      if (this._pca && this._account) {
        await this._pca.logoutPopup({ account: this._account });
      }

      this._account = null;
      return { success: true };
    } catch (err) {
      console.error('[MSAL] Logout error:', err);
      // Clear local state regardless so the UI resets.
      this._account = null;
      return { success: true };
    }
  }

  // ── Token (for downstream API calls if ever needed) ───────────────────────

  async getAccessToken(scopes = LOGIN_SCOPES) {
    if (!this._pca || !this._account) return null;
    try {
      const response = await this._pca.acquireTokenSilent({ scopes, account: this._account });
      return response.accessToken;
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        const response = await this._pca.acquireTokenPopup({ scopes, account: this._account });
        return response.accessToken;
      }
      console.error('[MSAL] Token acquisition error:', err);
      return null;
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  _isDomainAllowed(email) {
    if (!email) return false;
    const domain = email.split('@')[1]?.toLowerCase() || '';
    return ALLOWED_DOMAINS.includes(domain);
  }

  _buildUser(account) {
    const email  = account.username || account.idTokenClaims?.preferred_username || '';
    const name   = account.name    || account.idTokenClaims?.name || email;
    return { email, name, uid: account.localAccountId };
  }

  _persistSession(account) {
    const user = this._buildUser(account);
    sessionStorage.setItem('admin_authenticated', 'true');
    sessionStorage.setItem('admin_user', JSON.stringify(user));
  }
}

export const msalAuthService = new MsalAuthService();
