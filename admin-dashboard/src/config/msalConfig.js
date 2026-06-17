/**
 * Microsoft Authentication Library (MSAL) configuration
 * for the ePSA Admin Dashboard — Mount Sinai SSO.
 *
 * ─── Azure AD App Registration checklist (one-time, done by IT) ───────────────
 *  1. Portal: portal.azure.com → Azure Active Directory → App registrations → New
 *  2. Name:   "ePSA Admin Dashboard"
 *  3. Supported account types: "Accounts in this organizational directory only
 *     (Mount Sinai only – Single tenant)"
 *  4. Redirect URI: type = SPA  →  https://<admin-dashboard-url>
 *     (add http://localhost:3001 for local dev)
 *  5. After creation, copy:
 *       Application (client) ID  →  VITE_MSAL_CLIENT_ID
 *       Directory (tenant) ID    →  VITE_MSAL_TENANT_ID
 *  6. API permissions → Microsoft Graph → User.Read (already granted by default)
 *  7. Authentication → Allow public client flows: NO  (SPA redirect is enough)
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * Put these in admin-dashboard/.env.local (gitignored):
 *   VITE_MSAL_CLIENT_ID=<paste Application (client) ID here>
 *   VITE_MSAL_TENANT_ID=<paste Directory (tenant) ID here>
 */

export const MSAL_CONFIG = {
  auth: {
    clientId:    import.meta.env.VITE_MSAL_CLIENT_ID || 'YOUR_CLIENT_ID',
    authority:   `https://login.microsoftonline.com/${import.meta.env.VITE_MSAL_TENANT_ID || 'mountsinai.org'}`,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
};

// Scopes requested on login — User.Read gives us name + email from Graph.
export const LOGIN_SCOPES = ['User.Read', 'openid', 'profile', 'email'];

// Only users whose UPN ends with one of these domains are granted admin access.
// Add secondary domains if Mount Sinai IT uses them (e.g. @mssm.edu).
export const ALLOWED_DOMAINS = [
  'mountsinai.org',
  'mssm.edu',
];
