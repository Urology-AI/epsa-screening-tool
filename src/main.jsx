import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './App.css';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './i18n/i18n.js';
import ClinicalModeFlow from './components/ClinicalModeFlow.jsx';
import AdminApp from './AdminApp.jsx';

// Route: /admin → staff session manager (PIN-gated)
//        everything else → patient kiosk
const isAdmin = window.location.pathname.startsWith('/admin');

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      {isAdmin ? <AdminApp /> : <ClinicalModeFlow />}
    </ErrorBoundary>
  </React.StrictMode>
);
