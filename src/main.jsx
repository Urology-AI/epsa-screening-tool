import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './App.css';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './i18n/i18n.js';

const isAdmin = window.location.pathname.startsWith('/admin');

async function boot() {
  const root = ReactDOM.createRoot(document.getElementById('root'));

  if (isAdmin) {
    const { default: AdminApp } = await import('./AdminApp.jsx');
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <AdminApp />
        </ErrorBoundary>
      </React.StrictMode>
    );
  } else {
    const { default: ClinicalModeFlow } = await import('./components/ClinicalModeFlow.jsx');
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <ClinicalModeFlow />
        </ErrorBoundary>
      </React.StrictMode>
    );
  }
}

boot();
