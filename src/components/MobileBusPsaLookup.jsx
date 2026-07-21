/**
 * MobileBusPsaLookup.jsx
 *
 * Staff-facing component for entering PSA results for mobile bus patients
 * whose PSA was not available at the time of the survey.
 *
 * Flow:
 *   1. Staff enter the patient's phone number (the patient gave it at the bus)
 *   2. App hashes the number → finds the matching session
 *   3. Staff enter the PSA value
 *   4. PSA is saved to the session, phone hash is deleted
 *   5. Record is now fully de-identified
 *
 * PRIVACY: The phone number is hashed immediately on input and never stored.
 * The hash is deleted from the session after PSA entry is complete.
 */

import React, { useState } from 'react';
import { hashPhone } from '../utils/phoneHash';
import {
  findSessionByPhoneHash,
  updateSessionStep2,
  clearSessionPhoneHash,
} from '../services/clinicalSessionService';

const STATES = {
  LOOKUP: 'lookup',       // staff entering phone number
  FOUND: 'found',         // session found, enter PSA
  PSA_SAVED: 'psa_saved', // PSA saved successfully
  NOT_FOUND: 'not_found', // no matching session
  ERROR: 'error',         // unexpected error
};

export default function MobileBusPsaLookup() {
  const [phone, setPhone] = useState('');
  const [psa, setPsa] = useState('');
  const [state, setState] = useState(STATES.LOOKUP);
  const [session, setSession] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLookup(e) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const hash = await hashPhone(phone);
      const found = findSessionByPhoneHash(hash);
      if (found) {
        setSession(found);
        setState(STATES.FOUND);
      } else {
        setState(STATES.NOT_FOUND);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Lookup failed');
      setState(STATES.ERROR);
    } finally {
      setLoading(false);
    }
  }

  async function handlePsaSave(e) {
    e.preventDefault();
    const psaNum = parseFloat(psa);
    if (!psa || isNaN(psaNum) || psaNum < 0 || psaNum > 200) {
      setErrorMsg('Enter a valid PSA value (0–200 ng/mL)');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      // Save PSA to session
      const step2 = {
        psa: psaNum,
        knowPsa: true,
        pirads: '0',
        knowPirads: false,
        onHormonalTherapy: false,
        hormonalTherapyType: '',
      };
      await updateSessionStep2(null, session, step2);

      // Remove phone hash — record is now fully de-identified
      clearSessionPhoneHash(session.id);

      setState(STATES.PSA_SAVED);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save PSA');
      setState(STATES.ERROR);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setPhone('');
    setPsa('');
    setSession(null);
    setErrorMsg('');
    setState(STATES.LOOKUP);
  }

  return (
    <div style={styles.root}>
      <h2 style={styles.heading}>Enter PSA Result — Mobile Bus Follow-Up</h2>
      <p style={styles.hint}>
        Enter the patient's phone number to find their survey session, then enter their PSA result.
        The phone number is never stored — only used to find the record.
      </p>

      {state === STATES.LOOKUP && (
        <form onSubmit={handleLookup} style={styles.form}>
          <label style={styles.label}>
            Patient phone number
            <input
              style={styles.input}
              type="tel"
              inputMode="numeric"
              placeholder="e.g. 212-555-0100"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              autoFocus
              required
            />
          </label>
          <button style={styles.btnPrimary} type="submit" disabled={loading}>
            {loading ? 'Looking up…' : 'Find Session'}
          </button>
        </form>
      )}

      {state === STATES.NOT_FOUND && (
        <div style={styles.card}>
          <p style={styles.errorText}>
            No session found for that phone number. The patient may not have completed the survey,
            or the number may have been entered differently at the bus.
          </p>
          <button style={styles.btnGhost} onClick={reset}>Try again</button>
        </div>
      )}

      {state === STATES.FOUND && session && (
        <form onSubmit={handlePsaSave} style={styles.form}>
          <div style={styles.sessionInfo}>
            <p style={styles.sessionLabel}>Session found</p>
            <p style={styles.sessionRef}>{session.sessionRef ?? session.id}</p>
            <p style={styles.sessionMeta}>
              Completed: {session.createdAt ? new Date(session.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
            </p>
          </div>
          <label style={styles.label}>
            PSA result (ng/mL)
            <input
              style={styles.input}
              type="number"
              inputMode="decimal"
              min="0"
              max="200"
              step="0.01"
              placeholder="e.g. 4.2"
              value={psa}
              onChange={e => setPsa(e.target.value)}
              autoFocus
              required
            />
          </label>
          {errorMsg && <p style={styles.errorText}>{errorMsg}</p>}
          <div style={styles.actions}>
            <button style={styles.btnPrimary} type="submit" disabled={loading}>
              {loading ? 'Saving…' : 'Save PSA Result'}
            </button>
            <button style={styles.btnGhost} type="button" onClick={reset}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {state === STATES.PSA_SAVED && (
        <div style={styles.card}>
          <p style={styles.successText}>
            ✓ PSA saved successfully. The patient's record is now complete and de-identified.
          </p>
          <p style={styles.hint}>Session ref: <strong>{session?.sessionRef ?? session?.id}</strong></p>
          <button style={styles.btnPrimary} onClick={reset}>Enter another result</button>
        </div>
      )}

      {state === STATES.ERROR && (
        <div style={styles.card}>
          <p style={styles.errorText}>{errorMsg || 'An unexpected error occurred.'}</p>
          <button style={styles.btnGhost} onClick={reset}>Try again</button>
        </div>
      )}
    </div>
  );
}

const styles = {
  root: {
    maxWidth: 480,
    margin: '2rem auto',
    padding: '1.5rem',
    fontFamily: 'Arial, sans-serif',
  },
  heading: {
    fontSize: '1.25rem',
    fontWeight: 700,
    color: '#028090',
    marginBottom: '0.5rem',
  },
  hint: {
    fontSize: '0.875rem',
    color: '#555',
    marginBottom: '1.5rem',
    lineHeight: 1.5,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#222',
  },
  input: {
    padding: '0.625rem 0.75rem',
    fontSize: '1rem',
    border: '1px solid #ccc',
    borderRadius: 6,
    outline: 'none',
  },
  btnPrimary: {
    padding: '0.625rem 1.25rem',
    background: '#028090',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnGhost: {
    padding: '0.625rem 1.25rem',
    background: 'transparent',
    color: '#028090',
    border: '1px solid #028090',
    borderRadius: 6,
    fontSize: '0.95rem',
    cursor: 'pointer',
  },
  actions: {
    display: 'flex',
    gap: '0.75rem',
  },
  card: {
    padding: '1rem',
    background: '#f7f7f7',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  sessionInfo: {
    padding: '0.75rem',
    background: '#e0f4f6',
    borderRadius: 6,
    marginBottom: '0.5rem',
  },
  sessionLabel: {
    fontSize: '0.75rem',
    color: '#028090',
    fontWeight: 700,
    margin: 0,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  sessionRef: {
    fontSize: '1.1rem',
    fontWeight: 700,
    color: '#1a1a1a',
    margin: '0.25rem 0 0',
    fontFamily: 'monospace',
  },
  sessionMeta: {
    fontSize: '0.8rem',
    color: '#555',
    margin: '0.25rem 0 0',
  },
  successText: {
    color: '#1b5e20',
    fontWeight: 600,
    fontSize: '0.95rem',
  },
  errorText: {
    color: '#b71c1c',
    fontSize: '0.9rem',
  },
};
