/**
 * Admin Dashboard - Standalone Entry Point
 * Auth: Microsoft SSO via MSAL (Azure AD / Mount Sinai identity)
 */

import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import AdminDashboard from './components/AdminDashboard';
import AdminLogin from './components/admin/AdminLogin';
import { msalAuthService } from './services/msalAuthService';
import './index.css';

const AdminApp = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading]             = useState(true);
  const [adminUser, setAdminUser]             = useState(null);

  useEffect(() => {
    // Initialize MSAL once; it will pick up any returning redirect or
    // restore the active account from sessionStorage (page reload).
    msalAuthService.initializeMsal().then(() => {
      if (msalAuthService.isAdminAuthenticated()) {
        setAdminUser(msalAuthService.getCurrentAdmin());
        setIsAuthenticated(true);
      }
      setIsLoading(false);
    });
  }, []);

  const handleLoginSuccess = (user) => {
    setAdminUser(user);
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    const result = await msalAuthService.logoutAdmin();
    if (result.success) {
      setAdminUser(null);
      setIsAuthenticated(false);
    }
  };

  if (isLoading) {
    return (
      <div className="admin-loading">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Initializing admin dashboard…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AdminLogin onLoginSuccess={handleLoginSuccess} />;
  }

  return <AdminDashboard onLogout={handleLogout} adminUser={adminUser} />;
};

const root = createRoot(document.getElementById('root'));
root.render(<AdminApp />);
