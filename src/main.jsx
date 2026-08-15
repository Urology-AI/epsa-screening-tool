import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './App.css';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './i18n/i18n.js';
import AppShell from './AppShell.jsx';

// One app, one auth gate. This file used to branch on window.location.pathname
// and mount either an MSAL-protected AdminApp or a completely unauthenticated
// ClinicalModeFlow — so the kiosk wrote clinical sessions with no signed-in
// user. AppShell now authenticates first and routes afterwards.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  </React.StrictMode>
);
