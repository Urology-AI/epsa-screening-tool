/**
 * PhoneHashCapture.jsx
 *
 * Shown on the mobile bus after survey completion, before the results screen.
 * Asks the patient for their phone number so that PSA results (which arrive
 * 3–5 days later) can be linked back to this session.
 *
 * PRIVACY:
 * - The phone number is hashed with SHA-256 immediately on submission
 * - The original number is never stored anywhere
 * - The hash is deleted from the session once PSA is entered
 * - Skipping is allowed — patient is not required to provide a number
 */

import React, { useState } from 'react';
import { hashPhone } from '../utils/phoneHash';

export default function PhoneHashCapture({ onCapture, onSkip }) {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const hash = await hashPhone(phone);
      onCapture(hash);
    } catch (err) {
      setError('Please enter a valid phone number (at least 7 digits).');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        <h3 style={styles.heading}>Receive Your PSA Result</h3>
        <p style={styles.body}>
          Your blood sample will be analyzed and results will be ready in a few days.
          Enter your phone number so our team can match your result to your survey when it arrives.
        </p>
        <p style={styles.privacy}>
          🔒 Your phone number is never stored. It is used only to find your record when your result comes in.
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            style={styles.input}
            type="tel"
            inputMode="numeric"
            placeholder="Your phone number"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            autoFocus
          />
          {error && <p style={styles.error}>{error}</p>}
          <button
            style={styles.btnPrimary}
            type="submit"
            disabled={loading || !phone.trim()}
          >
            {loading ? 'Saving…' : 'Continue'}
          </button>
        </form>

        <button style={styles.btnSkip} onClick={onSkip}>
          Skip — I don't want to provide a phone number
        </button>
      </div>
    </div>
  );
}

const styles = {
  root: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '60vh',
    padding: '1rem',
    fontFamily: 'Arial, sans-serif',
  },
  card: {
    background: '#fff',
    borderRadius: 12,
    padding: '2rem',
    maxWidth: 440,
    width: '100%',
    boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
  },
  heading: {
    fontSize: '1.25rem',
    fontWeight: 700,
    color: '#028090',
    marginBottom: '0.75rem',
  },
  body: {
    fontSize: '0.95rem',
    color: '#333',
    lineHeight: 1.6,
    marginBottom: '0.75rem',
  },
  privacy: {
    fontSize: '0.8rem',
    color: '#555',
    background: '#e0f4f6',
    padding: '0.5rem 0.75rem',
    borderRadius: 6,
    marginBottom: '1.25rem',
    lineHeight: 1.5,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    marginBottom: '1rem',
  },
  input: {
    padding: '0.75rem',
    fontSize: '1.1rem',
    border: '1.5px solid #ccc',
    borderRadius: 8,
    outline: 'none',
    textAlign: 'center',
    letterSpacing: '0.05em',
  },
  btnPrimary: {
    padding: '0.75rem',
    background: '#028090',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: '1rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
  btnSkip: {
    display: 'block',
    width: '100%',
    background: 'none',
    border: 'none',
    color: '#888',
    fontSize: '0.8rem',
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: '0.25rem',
  },
  error: {
    color: '#b71c1c',
    fontSize: '0.85rem',
    margin: 0,
  },
};
