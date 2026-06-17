/**
 * Admin Management Component
 * View and manage admin users
 */

import React, { useState, useEffect } from 'react';
import { Users, Shield, Clock, AlertCircle, CheckCircle, X, Plus, Trash2 } from 'lucide-react';
import { firebaseAdminAuthService } from '../../services/firebaseAdminAuthService';
import './AdminManagement.css';

const AdminManagement = () => {
  const [admins, setAdmins] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');

  useEffect(() => {
    loadAdminUsers();
  }, []);

  const loadAdminUsers = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await firebaseAdminAuthService.getAllAdminUsers();
      
      if (result.success) {
        setAdmins(result.admins);
      } else {
        setError(result.error);
      }
    } catch (error) {
      setError('Failed to load admin users');
      console.error('Error loading admin users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeactivateAdmin = async (uid, email) => {
    if (!window.confirm(`Are you sure you want to deactivate admin access for ${email}?`)) {
      return;
    }

    try {
      const result = await firebaseAdminAuthService.deactivateAdminUser(uid);
      
      if (result.success) {
        await loadAdminUsers(); // Refresh the list
      } else {
        alert('Failed to deactivate admin: ' + result.error);
      }
    } catch (error) {
      alert('Error deactivating admin');
      console.error('Error deactivating admin:', error);
    }
  };

  const handleAddAdmin = async () => {
    if (!newAdminEmail) {
      alert('Please enter an email address');
      return;
    }

    try {
      // This would typically be done via a secure backend service
      // For now, we'll show a message about the process
      alert(`To add ${newAdminEmail} as admin:\n\n1. User must first login with email OTP\n2. System will auto-create admin account\n3. You can then manage their permissions\n\nThis ensures only verified users can become admins.`);
      
      setNewAdminEmail('');
      setShowAddAdmin(false);
    } catch (error) {
      alert('Error adding admin');
      console.error('Error adding admin:', error);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const getStatusBadge = (isActive) => {
    return (
      <span className={`status-badge ${isActive ? 'active' : 'inactive'}`}>
        {isActive ? <CheckCircle size={14} /> : <X size={14} />}
        {isActive ? 'Active' : 'Inactive'}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="admin-management loading">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading admin users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-management">
      <div className="admin-management-header">
        <div className="header-content">
          <div className="header-title">
            <Users size={24} />
            <h2>Admin User Management</h2>
          </div>
          <button 
            className="add-admin-btn"
            onClick={() => setShowAddAdmin(true)}
          >
            <Plus size={16} />
            Add Admin
          </button>
        </div>
        
        <div className="authorization-info">
          <Shield size={16} />
          <p>
            Admin authorization is verified through Firebase using multiple methods:
            Firestore admins collection, Firebase Custom Claims, and verified email domains.
          </p>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      <div className="admin-users-grid">
        {admins.length === 0 ? (
          <div className="no-admins">
            <Users size={48} />
            <h3>No Admin Users Found</h3>
            <p>
              Admin users will be automatically created when authorized users first login.
              Initially, only hardcoded admin emails are authorized.
            </p>
          </div>
        ) : (
          admins.map((admin) => (
            <div key={admin.uid} className="admin-user-card">
              <div className="admin-user-header">
                <div className="admin-info">
                  <h3>{admin.email}</h3>
                  <p>UID: {admin.uid}</p>
                </div>
                {getStatusBadge(admin.isActive)}
              </div>
              
              <div className="admin-user-details">
                <div className="detail-item">
                  <Shield size={16} />
                  <span>Role: {admin.role || 'admin'}</span>
                </div>
                
                <div className="detail-item">
                  <Clock size={16} />
                  <span>Created: {formatDate(admin.createdAt)}</span>
                </div>
                
                <div className="detail-item">
                  <Clock size={16} />
                  <span>Last Login: {formatDate(admin.lastLogin)}</span>
                </div>
                
                <div className="detail-item">
                  <Users size={16} />
                  <span>Login Count: {admin.loginCount || 0}</span>
                </div>
              </div>
              
              <div className="admin-permissions">
                <h4>Permissions:</h4>
                <div className="permission-tags">
                  {(admin.permissions || []).map((permission, index) => (
                    <span key={index} className="permission-tag">
                      {permission.replace('_', ' ')}
                    </span>
                  ))}
                </div>
              </div>
              
              <div className="admin-user-actions">
                {admin.isActive && (
                  <button 
                    className="deactivate-btn"
                    onClick={() => handleDeactivateAdmin(admin.uid, admin.email)}
                  >
                    <Trash2 size={16} />
                    Deactivate
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {showAddAdmin && (
        <div className="add-admin-modal">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Add New Admin</h3>
              <button 
                className="close-btn"
                onClick={() => setShowAddAdmin(false)}
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="modal-body">
              <p>
                To add a new admin user, they must first login with their email through the admin login.
                The system will automatically create an admin account for authorized users.
              </p>
              
              <div className="form-group">
                <label>Admin Email (for reference)</label>
                <input
                  type="email"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="admin@example.com"
                />
              </div>
            </div>
            
            <div className="modal-actions">
              <button 
                className="cancel-btn"
                onClick={() => setShowAddAdmin(false)}
              >
                Cancel
              </button>
              <button 
                className="confirm-btn"
                onClick={handleAddAdmin}
              >
                Understand Process
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminManagement;
