/**
 * System Status Component
 * Modern system monitoring interface
 */

import React from 'react';
import { Server, Database, Activity, AlertTriangle, CheckCircle, Clock, Wifi, HardDrive } from 'lucide-react';
import './SystemStatus.css';

const SystemStatus = ({ insights }) => {
  return (
    <div className="system-status">
      <div className="system-status-header">
        <div className="header-content">
          <div className="header-title">
            <Server size={28} />
            <h2>System Status</h2>
          </div>
        </div>
      </div>

      <div className="system-status-content">
        <div className="status-overview">
          <div className="status-card">
            <div className="card-icon">
              <Server size={32} />
            </div>
            <div className="card-content">
              <h3>Server Health</h3>
              <p>All systems operational</p>
              <span className="status-indicator active">Online</span>
            </div>
          </div>

          <div className="status-card">
            <div className="card-icon">
              <Database size={32} />
            </div>
            <div className="card-content">
              <h3>Database Status</h3>
              <p>Firebase connection stable</p>
              <span className="status-indicator active">Connected</span>
            </div>
          </div>

          <div className="status-card">
            <div className="card-icon">
              <Activity size={32} />
            </div>
            <div className="card-content">
              <h3>API Performance</h3>
              <p>Response times optimal</p>
              <span className="status-indicator active">Healthy</span>
            </div>
          </div>

          <div className="status-card">
            <div className="card-icon">
              <Wifi size={32} />
            </div>
            <div className="card-content">
              <h3>Network Status</h3>
              <p>All endpoints reachable</p>
              <span className="status-indicator active">Connected</span>
            </div>
          </div>
        </div>

        <div className="monitoring-section">
          <div className="section-header">
            <AlertTriangle size={20} />
            <h3>System Monitoring</h3>
          </div>
          
          <div className="monitoring-grid">
            <div className="monitor-item">
              <Clock size={16} />
              <span>Uptime: 99.9%</span>
            </div>
            <div className="monitor-item">
              <HardDrive size={16} />
              <span>Storage: 45% used</span>
            </div>
            <div className="monitor-item">
              <Activity size={16} />
              <span>CPU: 23% average</span>
            </div>
            <div className="monitor-item">
              <Database size={16} />
              <span>Queries: 1.2k/min</span>
            </div>
          </div>
        </div>

        <div className="coming-soon-section">
          <div className="placeholder-card">
            <div className="card-icon">
              <Activity size={48} />
            </div>
            <h3>Advanced Monitoring Coming Soon</h3>
            <p>Real-time system monitoring and alerting features are being developed</p>
            
            <div className="features-list">
              <div className="feature-item">
                <CheckCircle size={16} />
                <span>Real-time performance metrics</span>
              </div>
              <div className="feature-item">
                <CheckCircle size={16} />
                <span>Automated error detection</span>
              </div>
              <div className="feature-item">
                <CheckCircle size={16} />
                <span>Custom alert configurations</span>
              </div>
              <div className="feature-item">
                <CheckCircle size={16} />
                <span>Historical data analysis</span>
              </div>
            </div>
          </div>
        </div>

        {insights && (
          <div className="insights-section">
            <div className="section-header">
              <Database size={20} />
              <h3>Current Insights</h3>
            </div>
            <div className="insights-data">
              <pre>{JSON.stringify(insights, null, 2)}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SystemStatus;
