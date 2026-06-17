/**
 * Session list for admin — HIPAA compliant: only session IDs and timestamps.
 * Data is loaded via Cloud Function so no PHI is ever sent to the client.
 */

import React, { useState, useEffect } from 'react';
import { Key, Search, Download, ShieldCheck } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { adminFunctions } from '../../config/adminFirebase';
import './UserManagement.css';

const UserManagement = () => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setLoading(true);
    setError(null);
    try {
      const listSessions = httpsCallable(adminFunctions, 'listSessionsForAdmin');
      const result = await listSessions({ limit: 200 });
      const data = (result.data && result.data.sessions) || [];
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading sessions:', err);
      setError(err.message || 'Failed to load sessions. Ensure you are signed in as an admin.');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = sessions.filter(s =>
    (s.sessionId || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportCsv = () => {
    const headers = ['Session ID', 'Created', 'Last Login'];
    const rows = filtered.map(s => [
      s.sessionId || '',
      s.createdAt || '',
      s.lastLoginAt || '',
    ]);
    const csv = [headers.join(','), ...rows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sessions-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  if (loading) {
    return (
      <div className="user-management">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading sessions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="user-management">
        <div className="user-management-header">
          <div className="header-content">
            <div className="header-title">
              <Key size={28} />
              <h2>Sessions</h2>
            </div>
          </div>
        </div>
        <div className="user-management-content">
          <div className="no-results">
            <p className="error-message">{error}</p>
            <button type="button" className="action-btn" onClick={loadSessions}>Retry</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="user-management">
      <div className="user-management-header">
        <div className="header-content">
          <div className="header-title">
            <Key size={28} />
            <h2>Sessions</h2>
          </div>
          <div className="header-stats">
            <div className="stat-item">
              <span className="stat-number">{sessions.length}</span>
              <span className="stat-label">Total Sessions</span>
            </div>
          </div>
        </div>
        <p className="hipaa-note">
          <ShieldCheck size={16} />
          HIPAA compliant: only session IDs and timestamps are shown. No PHI is displayed or transmitted.
        </p>
      </div>

      <div className="user-management-content">
        <div className="user-controls">
          <div className="search-filter-group">
            <div className="search-box">
              <Search size={18} />
              <input
                type="text"
                placeholder="Search by session ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <button className="export-btn" onClick={exportCsv}>
            <Download size={16} />
            Export CSV
          </button>
        </div>

        <div className="users-table">
          <div className="table-header">
            <div className="table-row">
              <div className="table-cell">Session ID</div>
              <div className="table-cell">Created</div>
              <div className="table-cell">Last Login</div>
            </div>
          </div>
          <div className="table-body">
            {filtered.map(session => (
              <div key={session.id} className="table-row">
                <div className="table-cell session-id">
                  <Key size={14} />
                  <span>{session.sessionId}</span>
                </div>
                <div className="table-cell">
                  {formatDate(session.createdAt)}
                </div>
                <div className="table-cell">
                  {formatDate(session.lastLoginAt)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {filtered.length === 0 && (
          <div className="no-results">
            <Key size={48} />
            <h3>No sessions found</h3>
            <p>Try adjusting your search</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserManagement;
