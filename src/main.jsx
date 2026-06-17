import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './App.css';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './i18n/i18n.js';
import ClinicalModeFlow from './components/ClinicalModeFlow.jsx';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <ClinicalModeFlow />
    </ErrorBoundary>
  </React.StrictMode>
);
