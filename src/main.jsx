import React from 'react';
import ReactDOM from 'react-dom/client';
import { MsalProvider } from '@azure/msal-react';
import { msalInstance } from './config/msal.js';
import './index.css';
import './App.css';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './i18n/i18n.js';
import ClinicalModeFlow from './components/ClinicalModeFlow.jsx';

msalInstance.initialize().then(() => {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(
    <React.StrictMode>
      <MsalProvider instance={msalInstance}>
        <ErrorBoundary>
          <ClinicalModeFlow />
        </ErrorBoundary>
      </MsalProvider>
    </React.StrictMode>
  );
});
