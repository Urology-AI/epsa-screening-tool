/**
 * Admin Dashboard - Separate Standalone Application
 * Completely separate from the main ePSA frontend
 */

import React, { useState, useEffect } from 'react';
import {
  Calculator, BarChart3, Settings, Users, Database, TrendingUp,
  AlertTriangle, CheckCircle, LogOut, Menu, X, Home, Activity,
  Server, Clock, Shield, ShieldCheck, Zap
} from 'lucide-react';
import CalculatorAdmin from './admin/CalculatorAdmin';
import InsightsDashboard from './admin/InsightsDashboard';
import UserManagement from './admin/UserManagement';
import SystemStatus from './admin/SystemStatus';
import AdminManagement from './admin/AdminManagement';
import SinaiResearch from './admin/SinaiResearch';
import ClinicalSessionsAdmin from './admin/ClinicalSessionsAdmin';
import VVPanel from './admin/VVPanel';
import { getCalculatorConfig, saveCalculatorConfig, refreshCalculatorConfig } from '../utils/dynamicCalculator';
import { getAdminInsightsData } from '../services/adminAnalyticsService';
import { trackAdminEvent } from '../services/adminAnalyticsService';
import './AdminDashboard.css';

const AdminDashboard = ({ onLogout, adminUser }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [calculatorConfig, setCalculatorConfig] = useState(() => getCalculatorConfig());
  const [insights, setInsights] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    loadDashboardData();
    (async () => {
      const refreshed = await refreshCalculatorConfig();
      if (refreshed) {
        setCalculatorConfig(refreshed);
      }
    })();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadDashboardData = async () => {
    try {
      const insightsData = await getAdminInsightsData('30d');
      setInsights(insightsData);
      
      await trackAdminEvent('ADMIN_LOGIN', { 
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        connectionStatus: insightsData?.connectionStatus || 'unknown'
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      
      setInsights({
        error: error.message,
        usage: { totalUses: 0, uniqueUsers: 0, part1ToPart2Rate: '0%' },
        outcomes: { totalOutcomes: 0, cancerRate: 0 },
        performance: { modelAccuracy: 'N/A', calibration: 'N/A' },
        recommendations: [{
          type: 'warning',
          priority: 'high',
          message: 'Firebase connection failed',
          action: 'Check console for details and verify Firebase configuration'
        }]
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveConfig = async (config) => {
    const saved = await saveCalculatorConfig(config);
    if (saved) {
      setCalculatorConfig(config);
      await trackAdminEvent('CONFIG_UPDATED', { 
        configVersion: config.version,
        timestamp: new Date().toISOString()
      });
      alert('Calculator configuration saved successfully!');
    } else {
      alert('Failed to save configuration');
    }
  };

  const renderActiveContent = () => {
    switch (activeTab) {
      case 'calculator':
        return (
          <CalculatorAdmin 
            onSave={handleSaveConfig}
            onClose={() => {}}
          />
        );
      case 'analytics':
        return (
          <InsightsDashboard 
            onClose={() => {}}
          />
        );
      case 'users':
        return <AdminManagement />;
      case 'sinai':
        return <SinaiResearch />;
      case 'clinical':
        return <ClinicalSessionsAdmin />;
      case 'vv':
        return <VVPanel />;
      case 'system':
        return <SystemStatus insights={insights} />;
      default:
        return <OverviewSection insights={insights} />;
    }
  };

  const OverviewSection = ({ insights }) => (
    <div className="overview-section">
      <h2>System Overview</h2>
      
      <div className="overview-grid">
        <div className="overview-card">
          <div className="card-header">
            <Calculator size={24} />
            <h3>Calculator Status</h3>
          </div>
          <div className="card-content">
            <div className="status-item">
              <span>Model Version:</span>
              <span className="value">{calculatorConfig.version}</span>
            </div>
            <div className="status-item">
              <span>Active Variables:</span>
              <span className="value">{calculatorConfig.part1.variables.length}</span>
            </div>
            <div className="status-item">
              <span>Status:</span>
              <span className="value status-active">
                <CheckCircle size={16} style={{ marginRight: '4px' }} />
                Active
              </span>
            </div>
          </div>
        </div>

        <div className="overview-card">
          <div className="card-header">
            <TrendingUp size={24} />
            <h3>Recent Activity</h3>
          </div>
          <div className="card-content">
            <div className="status-item">
              <span>Total Uses:</span>
              <span className="value">{insights?.usage?.totalUses || 0}</span>
            </div>
            <div className="status-item">
              <span>Unique Users:</span>
              <span className="value">{insights?.usage?.uniqueUsers || 0}</span>
            </div>
            <div className="status-item">
              <span>Conversion Rate:</span>
              <span className="value">{insights?.usage?.part1ToPart2Rate || '0%'}</span>
            </div>
          </div>
        </div>

        <div className="overview-card">
          <div className="card-header">
            <Database size={24} />
            <h3>Data Collection</h3>
          </div>
          <div className="card-content">
            <div className="status-item">
              <span>Outcomes Tracked:</span>
              <span className="value">{insights?.outcomes?.totalOutcomes || 0}</span>
            </div>
            <div className="status-item">
              <span>Cancer Detection:</span>
              <span className="value">{insights?.outcomes?.cancerRate || 0}%</span>
            </div>
            <div className="status-item">
              <span>Collection Status:</span>
              <span className="value status-active">
                <Activity size={16} style={{ marginRight: '4px' }} />
                Active
              </span>
            </div>
          </div>
        </div>

        <div className="overview-card">
          <div className="card-header">
            <AlertTriangle size={24} />
            <h3>System Health</h3>
          </div>
          <div className="card-content">
            <div className="status-item">
              <span>Model Performance:</span>
              <span className="value status-good">
                <Zap size={16} style={{ marginRight: '4px' }} />
                Good
              </span>
            </div>
            <div className="status-item">
              <span>Last Update:</span>
              <span className="value">
                <Clock size={16} style={{ marginRight: '4px' }} />
                {currentTime.toLocaleTimeString()}
              </span>
            </div>
            <div className="status-item">
              <span>Storage:</span>
              <span className="value status-good">
                <Database size={16} style={{ marginRight: '4px' }} />
                Healthy
              </span>
            </div>
          </div>
        </div>
      </div>

      {insights?.recommendations?.length > 0 && (
        <div className="recommendations-section">
          <h3>Recommendations</h3>
          {insights.recommendations.map((rec, idx) => (
            <div key={idx} className={`recommendation ${rec.type} ${rec.priority}`}>
              {rec.type === 'warning' ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
              <div>
                <strong>{rec.message}</strong>
                <p>{rec.action}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="admin-dashboard loading">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      {/* Header */}
      <header className="admin-header">
        <div className="header-left">
          <button 
            className="menu-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <div className="header-wordmark">
            <div className="header-logo-mark">MS</div>
            <div className="header-wordmark-text">
              <span className="hw-institution">Mount Sinai</span>
              <span className="hw-app">ePSA Research Portal</span>
            </div>
          </div>
        </div>
        <div className="header-right">
          <div className="admin-user-info">
            <span className="user-email">{adminUser?.email}</span>
            <span className="user-role">Admin</span>
          </div>
          <span className="current-time">{currentTime.toLocaleString()}</span>
          <button className="logout-btn" onClick={onLogout}>
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </header>

      <div className="admin-layout">
        {/* Sidebar */}
        <aside className={`admin-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <nav className="admin-nav">
            <button 
              className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <Home size={20} />
              <span>Overview</span>
            </button>
            
            <button 
              className={`nav-item ${activeTab === 'calculator' ? 'active' : ''}`}
              onClick={() => setActiveTab('calculator')}
            >
              <Calculator size={20} />
              <span>Calculator Admin</span>
            </button>
            
            <button 
              className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
              onClick={() => setActiveTab('analytics')}
            >
              <BarChart3 size={20} />
              <span>Analytics</span>
            </button>
            
            <button
              className={`nav-item ${activeTab === 'users' ? 'active' : ''}`}
              onClick={() => setActiveTab('users')}
            >
              <Users size={20} />
              <span>User Management</span>
            </button>

            <button
              className={`nav-item ${activeTab === 'sinai' ? 'active' : ''}`}
              onClick={() => setActiveTab('sinai')}
            >
              <Shield size={20} />
              <span>Mount Sinai Research</span>
            </button>

            <button
              className={`nav-item ${activeTab === 'vv' ? 'active' : ''}`}
              onClick={() => setActiveTab('vv')}
            >
              <ShieldCheck size={20} />
              <span>Verification &amp; Validation</span>
            </button>

            <button
              className={`nav-item ${activeTab === 'clinical' ? 'active' : ''}`}
              onClick={() => setActiveTab('clinical')}
            >
              <Database size={20} />
              <span>Clinical Sessions</span>
            </button>

            <button
              className={`nav-item ${activeTab === 'system' ? 'active' : ''}`}
              onClick={() => setActiveTab('system')}
            >
              <Server size={20} />
              <span>System Status</span>
            </button>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="admin-main">
          {renderActiveContent()}
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
