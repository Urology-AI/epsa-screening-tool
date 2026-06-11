import React from 'react';
import { AlertTriangleIcon } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          maxWidth: '600px',
          margin: '4rem auto',
          padding: '2rem',
          background: 'var(--surface, #ffffff)',
          color: 'var(--ink-900, #111827)',
          border: '1px solid var(--line-100, #e5e7eb)',
          borderRadius: '12px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          textAlign: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
        }}
      >
        <div style={{ marginBottom: '1rem', color: '#d97706' }} aria-hidden="true"><AlertTriangleIcon size={40} /></div>
        <h1 style={{ fontSize: '1.25rem', margin: '0 0 0.5rem 0', fontWeight: 700 }}>
          Something went wrong
        </h1>
        <p style={{ color: 'var(--ink-600, #4b5563)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
          The ePSA calculator hit an unexpected error. Your answers may not have been saved.
          Please reload the page to start over. If this keeps happening, contact your clinician.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '0.625rem 1.25rem',
              background: '#1a5c86',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.9375rem',
            }}
          >
            Reload page
          </button>
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              padding: '0.625rem 1.25rem',
              background: 'transparent',
              color: 'var(--ink-700, #374151)',
              border: '1px solid var(--line-200, #d1d5db)',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.9375rem',
            }}
          >
            Try to continue
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
