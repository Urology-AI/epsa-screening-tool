import React, { useState, useEffect } from 'react';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ScatterChart, Scatter, ReferenceLine, AreaChart, Area
} from 'recharts';
import { 
  TrendingUp, Users, Activity, AlertTriangle, CheckCircle, Calendar, Download, RefreshCw,
  Target, BarChart2, PieChart, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { getAdminInsightsData, exportAdminAnalyticsData } from '../../services/adminAnalyticsService';
import './InsightsDashboard.css';

const InsightsDashboard = ({ userRole = 'admin' }) => {
  const [timeRange, setTimeRange] = useState('30d');
  const [insights, setInsights] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    loadInsights();
  }, [timeRange]);

  const loadInsights = async () => {
    setIsLoading(true);
    try {
      const data = await getAdminInsightsData(timeRange);
      setInsights(data);
    } catch (error) {
      console.error('Error loading insights:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async (format) => {
    const data = await exportAdminAnalyticsData(format);
    if (data) {
      const blob = new Blob([data], { type: format === 'csv' ? 'text/csv' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `epsa-insights-${timeRange}.${format}`;
      a.click();
    }
  };

  if (isLoading) {
    return (
      <div className="insights-dashboard loading">
        <div className="loading-spinner">Loading insights...</div>
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="insights-dashboard error">
        <AlertTriangle size={48} />
        <h3>Unable to load insights</h3>
        <p>Check your connection and try again</p>
        <button onClick={loadInsights}>Retry</button>
      </div>
    );
  }

  return (
    <div className="insights-dashboard">
      <div className="dashboard-header">
        <h1><TrendingUp size={24} /> ePSA Insights Dashboard</h1>
        <div className="header-controls">
          <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="1y">Last Year</option>
          </select>
          <button onClick={loadInsights}><RefreshCw size={16} /></button>
          <div className="export-dropdown">
            <button>Export <Download size={16} /></button>
            <div className="export-options">
              <button onClick={() => handleExport('csv')}>CSV</button>
              <button onClick={() => handleExport('json')}>JSON</button>
            </div>
          </div>
        </div>
      </div>

      {insights.recommendations?.length > 0 && (
        <div className="recommendations-banner">
          {insights.recommendations.map((rec, idx) => (
            <div key={idx} className={`recommendation ${rec.type} ${rec.priority}`}>
              {rec.type === 'warning' ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
              <div className="rec-content">
                <strong>{rec.message}</strong>
                <span>{rec.action}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="dashboard-tabs">
        <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>
          <Activity size={16} /> Overview
        </button>
        <button className={activeTab === 'performance' ? 'active' : ''} onClick={() => setActiveTab('performance')}>
          <Target size={16} /> Model Performance
        </button>
        <button className={activeTab === 'trends' ? 'active' : ''} onClick={() => setActiveTab('trends')}>
          <TrendingUp size={16} /> Trends
        </button>
        <button className={activeTab === 'calibration' ? 'active' : ''} onClick={() => setActiveTab('calibration')}>
          <BarChart2 size={16} /> Calibration
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="overview-section">
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-icon"><Users size={24} /></div>
              <div className="metric-value">{insights.usage?.totalUses || 0}</div>
              <div className="metric-label">Total Uses</div>
              <div className="metric-change">
                <ArrowUpRight size={14} /> +12% vs last period
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-icon"><Activity size={24} /></div>
              <div className="metric-value">{insights.usage?.uniqueUsers || 0}</div>
              <div className="metric-label">Unique Users</div>
            </div>
            <div className="metric-card">
              <div className="metric-icon"><Target size={24} /></div>
              <div className="metric-value">{insights.usage?.part1ToPart2Rate || '0%'}</div>
              <div className="metric-label">Part 1→2 Conversion</div>
            </div>
            <div className="metric-card">
              <div className="metric-icon"><CheckCircle size={24} /></div>
              <div className="metric-value">{insights.outcomes?.totalOutcomes || 0}</div>
              <div className="metric-label">Biopsy Outcomes</div>
            </div>
            <div className="metric-card highlight">
              <div className="metric-icon"><AlertTriangle size={24} /></div>
              <div className="metric-value">{insights.outcomes?.cancerRate || 0}%</div>
              <div className="metric-label">Cancer Detection Rate</div>
            </div>
            <div className="metric-card">
              <div className="metric-icon"><Calendar size={24} /></div>
              <div className="metric-value">{insights.usage?.avgSessionDuration || 0}m</div>
              <div className="metric-label">Avg Session Duration</div>
            </div>
          </div>

          <div className="charts-row">
            <div className="chart-container">
              <h3>Hourly Usage Distribution</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={Object.entries(insights.usage?.hourlyDistribution || {}).map(([hour, count]) => ({ hour, count }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#00578B" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-container">
              <h3>Outcome Distribution</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  {/* Simple representation - would use actual pie chart */}
                  <div className="outcome-legend">
                    <div className="outcome-item">
                      <span className="color-box" style={{background: '#e74c3c'}}></span>
                      Cancer Detected: {insights.outcomes?.cancerDetected || 0}
                    </div>
                    <div className="outcome-item">
                      <span className="color-box" style={{background: '#27ae60'}}></span>
                      No Cancer: {insights.outcomes?.noCancer || 0}
                    </div>
                    <div className="outcome-item">
                      <span className="color-box" style={{background: '#f39c12'}}></span>
                      Pending: {insights.outcomes?.pending || 0}
                    </div>
                  </div>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'performance' && insights.modelPerformance && (
        <div className="performance-section">
          <div className="performance-metrics">
            <div className="perf-metric">
              <label>Sensitivity</label>
              <value>{insights.modelPerformance.sensitivity}%</value>
              <small>True positive rate</small>
            </div>
            <div className="perf-metric">
              <label>Specificity</label>
              <value>{insights.modelPerformance.specificity}%</value>
              <small>True negative rate</small>
            </div>
            <div className="perf-metric">
              <label>PPV</label>
              <value>{insights.modelPerformance.ppv}%</value>
              <small>Positive predictive value</small>
            </div>
            <div className="perf-metric">
              <label>NPV</label>
              <value>{insights.modelPerformance.npv}%</value>
              <small>Negative predictive value</small>
            </div>
            <div className="perf-metric highlight">
              <label>AUC</label>
              <value>{insights.modelPerformance.auc}</value>
              <small>Discrimination power</small>
            </div>
            <div className="perf-metric">
              <label>Brier Score</label>
              <value>{insights.modelPerformance.brierScore}</value>
              <small>Calibration quality</small>
            </div>
          </div>

          <div className="confusion-matrix">
            <h3>Confusion Matrix</h3>
            <div className="matrix-grid">
              <div className="matrix-cell header"></div>
              <div className="matrix-cell header">Predicted High Risk</div>
              <div className="matrix-cell header">Predicted Low Risk</div>
              
              <div className="matrix-cell header">Actual Cancer</div>
              <div className="matrix-cell tp">
                TP: {insights.modelPerformance.confusionMatrix?.truePositives || 0}
              </div>
              <div className="matrix-cell fn">
                FN: {insights.modelPerformance.confusionMatrix?.falseNegatives || 0}
              </div>
              
              <div className="matrix-cell header">No Cancer</div>
              <div className="matrix-cell fp">
                FP: {insights.modelPerformance.confusionMatrix?.falsePositives || 0}
              </div>
              <div className="matrix-cell tn">
                TN: {insights.modelPerformance.confusionMatrix?.trueNegatives || 0}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'trends' && insights.trends && (
        <div className="trends-section">
          <div className="chart-large">
            <h3>Weekly Trends</h3>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={insights.trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Area 
                  yAxisId="left"
                  type="monotone" 
                  dataKey="usage" 
                  stroke="#00578B" 
                  fill="#00578B" 
                  fillOpacity={0.3}
                  name="Usage"
                />
                <Area 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="cancerRate" 
                  stroke="#e74c3c" 
                  fill="#e74c3c" 
                  fillOpacity={0.3}
                  name="Cancer Rate %"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-large">
            <h3>Predicted vs Actual Risk</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  type="number" 
                  dataKey="predictedRisk" 
                  name="Predicted Risk %" 
                  domain={[0, 100]}
                />
                <YAxis 
                  type="number" 
                  dataKey="actual" 
                  name="Actual Outcome" 
                  domain={[0, 1]}
                  tickFormatter={(v) => v === 1 ? 'Cancer' : 'No Cancer'}
                />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                <Scatter 
                  name="Outcomes" 
                  data={[]} // Would be populated with actual outcome data
                  fill="#00578B"
                />
                <ReferenceLine y={0.5} stroke="#666" strokeDasharray="3 3" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === 'calibration' && insights.modelPerformance && (
        <div className="calibration-section">
          <div className="calibration-stats">
            <div className="cal-stat">
              <label>Calibration Slope</label>
              <value>{insights.modelPerformance.calibrationSlope}</value>
              <small>Ideal: 1.0</small>
            </div>
            <div className="cal-stat">
              <label>Calibration Intercept</label>
              <value>{insights.modelPerformance.calibrationIntercept}</value>
              <small>Ideal: 0.0</small>
            </div>
            <div className="cal-stat">
              <label>Current Status</label>
              <value className={parseFloat(insights.modelPerformance.calibrationSlope) > 0.9 && parseFloat(insights.modelPerformance.calibrationSlope) < 1.1 ? 'good' : 'warning'}>
                {parseFloat(insights.modelPerformance.calibrationSlope) > 0.9 && parseFloat(insights.modelPerformance.calibrationSlope) < 1.1 ? 'Well Calibrated' : 'Needs Recalibration'}
              </value>
            </div>
          </div>

          <div className="calibration-chart">
            <h3>Calibration Plot (Predicted vs Observed)</h3>
            <ResponsiveContainer width="100%" height={350}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  type="number" 
                  dataKey="predicted" 
                  name="Predicted Probability %" 
                  domain={[0, 100]}
                />
                <YAxis 
                  type="number" 
                  dataKey="observed" 
                  name="Observed Frequency %" 
                  domain={[0, 100]}
                />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                <ReferenceLine x={0} y={0} stroke="#000" />
                <ReferenceLine x={100} y={100} stroke="#000" />
                <ReferenceLine segment={[{x: 0, y: 0}, {x: 100, y: 100}]} stroke="#27ae60" strokeDasharray="3 3" label="Perfect Calibration" />
                <Scatter 
                  name="Deciles" 
                  data={[]} // Would be populated
                  fill="#00578B"
                />
              </ScatterChart>
            </ResponsiveContainer>
            <p className="calibration-note">
              Points on the green diagonal line indicate perfect calibration. 
              Points below the line indicate over-prediction (predicted risk higher than observed). 
              Points above indicate under-prediction.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default InsightsDashboard;
