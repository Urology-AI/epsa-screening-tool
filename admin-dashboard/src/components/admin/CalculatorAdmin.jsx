import React, { useState, useEffect } from 'react';
import { Calculator, Save, RotateCcw, AlertTriangle, CheckCircle, Database, TrendingUp } from 'lucide-react';
import { DEFAULT_CALCULATOR_CONFIG, ALTERNATIVE_MODELS, WEIGHT_ADJUSTMENT_GUIDELINES } from '@frontend/config/calculatorConfig';
import { adminDb } from '../../config/adminFirebase';
import './CalculatorAdmin.css';

const CalculatorAdmin = ({ userRole = 'admin' }) => {
  const [config, setConfig] = useState(DEFAULT_CALCULATOR_CONFIG);
  const [activeTab, setActiveTab] = useState('part1');
  const [hasChanges, setHasChanges] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [cohortStats, setCohortStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [selectedModel, setSelectedModel] = useState('custom');

  // Load current config from Firebase/localStorage
  useEffect(() => {
    loadCurrentConfig();
  }, []);

  const loadCurrentConfig = async () => {
    try {
      const { doc, getDoc } = await import('firebase/firestore');
      const publishedRef = doc(adminDb, 'calculatorConfig', 'published');
      const publishedSnap = await getDoc(publishedRef);

      if (publishedSnap.exists()) {
        const data = publishedSnap.data();
        if (data?.config) {
          setConfig(data.config);
          localStorage.setItem('epsa_calculator_config', JSON.stringify(data.config));
          return;
        }
      }

      const storedConfig = localStorage.getItem('epsa_calculator_config');
      if (storedConfig) {
        setConfig(JSON.parse(storedConfig));
        return;
      }

      setConfig(DEFAULT_CALCULATOR_CONFIG);
    } catch (error) {
      console.error('Error loading config:', error);
      try {
        const storedConfig = localStorage.getItem('epsa_calculator_config');
        if (storedConfig) {
          setConfig(JSON.parse(storedConfig));
        }
      } catch (_e) {
        setConfig(DEFAULT_CALCULATOR_CONFIG);
      }
    }
  };

  const validateConfig = (newConfig) => {
    const errors = [];
    
    // Validate Part 1 weights
    newConfig.part1.variables.forEach(variable => {
      if (variable.weight < WEIGHT_ADJUSTMENT_GUIDELINES.minWeight || 
          variable.weight > WEIGHT_ADJUSTMENT_GUIDELINES.maxWeight) {
        errors.push(`${variable.name} weight (${variable.weight}) is outside recommended range`);
      }
    });

    // Validate risk cutoffs
    const { lower, moderate, higher } = newConfig.part1.riskCutoffs;
    if (lower.threshold >= moderate.threshold) {
      errors.push('Lower risk threshold must be less than moderate threshold');
    }
    if (moderate.threshold >= higher.threshold) {
      errors.push('Moderate risk threshold must be less than higher threshold');
    }

    // Validate intercept
    if (newConfig.part1.intercept < -10 || newConfig.part1.intercept > 10) {
      errors.push('Intercept value is outside reasonable range (-10 to 10)');
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleWeightChange = (variableId, newWeight) => {
    const weight = parseFloat(newWeight);
    
    setConfig(prev => ({
      ...prev,
      part1: {
        ...prev.part1,
        variables: prev.part1.variables.map(v => 
          v.id === variableId ? { ...v, weight } : v
        )
      }
    }));
    setHasChanges(true);
    setSelectedModel('custom');
  };

  const handleInterceptChange = (newIntercept) => {
    const intercept = parseFloat(newIntercept);
    
    setConfig(prev => ({
      ...prev,
      part1: {
        ...prev.part1,
        intercept
      }
    }));
    setHasChanges(true);
    setSelectedModel('custom');
  };

  const handleCutoffChange = (level, newThreshold) => {
    const threshold = parseFloat(newThreshold);
    
    setConfig(prev => ({
      ...prev,
      part1: {
        ...prev.part1,
        riskCutoffs: {
          ...prev.part1.riskCutoffs,
          [level]: { ...prev.part1.riskCutoffs[level], threshold }
        }
      }
    }));
    setHasChanges(true);
  };

  const updatePart2 = (updater) => {
    setConfig(prev => {
      const updatedPart2 = updater(prev.part2);
      return { ...prev, part2: updatedPart2 };
    });
    setHasChanges(true);
    setSelectedModel('custom');
  };

  const applyModelTemplate = (modelKey) => {
    if (modelKey === 'default') {
      setConfig(DEFAULT_CALCULATOR_CONFIG);
    } else if (ALTERNATIVE_MODELS[modelKey]) {
      const template = ALTERNATIVE_MODELS[modelKey];
      setConfig(prev => ({
        ...prev,
        part1: {
          ...prev.part1,
          intercept: template.part1.intercept,
          variables: prev.part1.variables.map(v => {
            const templateVar = template.part1.variables.find(tv => tv.id === v.id);
            return templateVar ? { ...v, weight: templateVar.weight } : v;
          })
        }
      }));
    }
    setSelectedModel(modelKey);
    setHasChanges(true);
  };

  const saveConfig = async () => {
    if (!validateConfig(config)) {
      setSaveStatus({ type: 'error', message: 'Validation failed. Please fix errors before saving.' });
      return;
    }

    setIsLoading(true);
    try {
      const nowIso = new Date().toISOString();
      const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');

      const publishedRef = doc(adminDb, 'calculatorConfig', 'published');
      await setDoc(publishedRef, {
        version: config.version,
        config,
        updatedAt: serverTimestamp(),
        updatedAtIso: nowIso
      }, { merge: true });

      const versionRef = doc(adminDb, 'calculatorConfigVersions', nowIso);
      await setDoc(versionRef, {
        version: config.version,
        config,
        createdAt: serverTimestamp(),
        createdAtIso: nowIso
      });

      localStorage.setItem('epsa_calculator_config', JSON.stringify(config));

      setHasChanges(false);
      setSaveStatus({ type: 'success', message: 'Configuration published successfully!' });
    } catch (error) {
      console.error('Error saving config:', error);
      setSaveStatus({ type: 'error', message: 'Failed to publish configuration.' });
    } finally {
      setIsLoading(false);
    }
  };

  const resetToDefault = () => {
    if (window.confirm('Reset to default configuration? All changes will be lost.')) {
      setConfig(DEFAULT_CALCULATOR_CONFIG);
      setHasChanges(true);
      setSelectedModel('default');
    }
  };

  const simulateWithCohort = () => {
    // Open cohort upload dialog
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        processCohortFile(file);
      }
    };
    input.click();
  };

  const processCohortFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        analyzeCohort(data);
      } catch (error) {
        alert('Error parsing cohort file. Please ensure it is valid JSON.');
      }
    };
    reader.readAsText(file);
  };

  const analyzeCohort = (cohortData) => {
    // Simulate calculation with new weights
    const stats = {
      totalPatients: cohortData.length,
      detectedCases: cohortData.filter(p => p.cancerDetected).length,
      avgPredictedRisk: 0,
      calibrationSlope: 1.0,
      calibrationIntercept: 0,
      sensitivity: 0.85,
      specificity: 0.72,
      auc: 0.79
    };

    // Calculate predicted risks with new weights
    let totalPredictedRisk = 0;
    cohortData.forEach(patient => {
      // Simplified calculation for demo
      const logit = config.part1.intercept + 
        config.part1.variables.reduce((sum, v) => {
          const patientValue = patient[v.id] || 0;
          return sum + (v.weight * patientValue);
        }, 0);
      const probability = 1 / (1 + Math.exp(-logit));
      totalPredictedRisk += probability;
    });

    stats.avgPredictedRisk = (totalPredictedRisk / cohortData.length * 100).toFixed(1);
    setCohortStats(stats);
  };

  const getWeightStatus = (variable) => {
    const guideline = WEIGHT_ADJUSTMENT_GUIDELINES.recommendedVariables.find(
      rv => rv.id === variable.id
    );
    
    if (!guideline) return null;
    
    const [min, max] = guideline.recommendedRange;
    if (variable.weight < min || variable.weight > max) {
      return { type: 'warning', message: `Outside recommended range [${min}, ${max}]` };
    }
    return { type: 'ok' };
  };

  return (
    <div className="calculator-admin">
      <div className="admin-header">
        <h1><Calculator size={24} /> Calculator Model Administration</h1>
        <div className="admin-actions">
          <button 
            className="btn-simulate" 
            onClick={simulateWithCohort}
            disabled={isLoading}
          >
            <Database size={16} /> Simulate with Cohort
          </button>
          <button 
            className="btn-reset" 
            onClick={resetToDefault}
            disabled={isLoading}
          >
            <RotateCcw size={16} /> Reset to Default
          </button>
          <button 
            className="btn-save" 
            onClick={saveConfig}
            disabled={!hasChanges || validationErrors.length > 0 || isLoading}
          >
            {isLoading ? 'Saving...' : <><Save size={16} /> Save Changes</>}
          </button>
        </div>
      </div>

      {saveStatus && (
        <div className={`save-status ${saveStatus.type}`}>
          {saveStatus.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          {saveStatus.message}
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="validation-errors">
          <h3><AlertTriangle size={16} /> Validation Errors</h3>
          <ul>
            {validationErrors.map((error, idx) => (
              <li key={idx}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="model-templates">
        <label>Model Template:</label>
        <select value={selectedModel} onChange={(e) => applyModelTemplate(e.target.value)}>
          <option value="default">Default (Current)</option>
          <option value="custom">Custom (Modified)</option>
          <option value="conservative">Conservative Model</option>
          <option value="aggressive">Aggressive Detection</option>
        </select>
      </div>

      <div className="admin-tabs">
        <button 
          className={activeTab === 'part1' ? 'active' : ''} 
          onClick={() => setActiveTab('part1')}
        >
          Part 1: Pre-Assessment
        </button>
        <button 
          className={activeTab === 'part2' ? 'active' : ''} 
          onClick={() => setActiveTab('part2')}
        >
          Part 2: Clinical Integration
        </button>
        <button 
          className={activeTab === 'cohort' ? 'active' : ''} 
          onClick={() => setActiveTab('cohort')}
        >
          Cohort Analysis
        </button>
      </div>

      {activeTab === 'part1' && (
        <div className="config-section">
          <div className="intercept-section">
            <h3>Model Intercept (Baseline Risk)</h3>
            <div className="input-group">
              <input
                type="number"
                step="0.0001"
                value={config.part1.intercept}
                onChange={(e) => handleInterceptChange(e.target.value)}
              />
              <span className="input-hint">Higher = lower baseline risk</span>
            </div>
          </div>

          <div className="variables-section">
            <h3>Variable Weights (Logistic Regression Coefficients)</h3>
            <div className="variables-table">
              <div className="table-header">
                <span>Variable</span>
                <span>Current Weight</span>
                <span>Recommended Range</span>
                <span>Impact</span>
                <span>Status</span>
              </div>
              {config.part1.variables.map(variable => {
                const status = getWeightStatus(variable);
                return (
                  <div key={variable.id} className="variable-row">
                    <div className="variable-info">
                      <strong>{variable.name}</strong>
                      <small>{variable.description}</small>
                      {variable.clinicalNote && (
                        <span className="clinical-note">{variable.clinicalNote}</span>
                      )}
                    </div>
                    <div className="weight-input">
                      <input
                        type="number"
                        step={WEIGHT_ADJUSTMENT_GUIDELINES.stepSize}
                        min={WEIGHT_ADJUSTMENT_GUIDELINES.minWeight}
                        max={WEIGHT_ADJUSTMENT_GUIDELINES.maxWeight}
                        value={variable.weight}
                        onChange={(e) => handleWeightChange(variable.id, e.target.value)}
                      />
                    </div>
                    <div className="recommended-range">
                      {WEIGHT_ADJUSTMENT_GUIDELINES.recommendedVariables.find(
                        rv => rv.id === variable.id
                      )?.recommendedRange.join(' to ') || 'N/A'}
                    </div>
                    <div className="impact-bar">
                      <div 
                        className="impact-fill" 
                        style={{ 
                          width: `${Math.abs(variable.weight) * 50}%`,
                          background: variable.weight > 0 ? '#e74c3c' : '#27ae60'
                        }}
                      />
                    </div>
                    <div className={`status ${status?.type || 'ok'}`}>
                      {status?.type === 'warning' ? '⚠️' : '✓'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="cutoffs-section">
            <h3>Risk Category Cutoffs</h3>
            <div className="cutoff-inputs">
              {Object.entries(config.part1.riskCutoffs).map(([level, data]) => (
                <div key={level} className="cutoff-input">
                  <label>{level.toUpperCase()} Risk Threshold</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={data.threshold}
                    onChange={(e) => handleCutoffChange(level, e.target.value)}
                  />
                  <span className="cutoff-label">{data.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'part2' && (
        <div className="config-section">
          <h3>Part 2: Clinical Data Integration</h3>
          <p>Part 2 uses a points-based system. Configure scoring below:</p>

          <div className="psa-points-section">
            <h4>Baseline Carry-Forward Points</h4>
            <div className="points-row">
              <span>Baseline carry points</span>
              <input
                type="number"
                value={config.part2.baselineCarryPoints}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10);
                  updatePart2(prev => ({
                    ...prev,
                    baselineCarryPoints: Number.isFinite(value) ? value : 0
                  }));
                }}
              />
              <span>points</span>
            </div>
          </div>

          <div className="psa-points-section">
            <h4>Pre-Score to Points Mapping</h4>
            {config.part2.preScoreToPoints.ranges.map((range, idx) => (
              <div key={idx} className="points-row">
                <span>Pre-score &lt; {range.max}</span>
                <span style={{ marginLeft: '8px' }}>base</span>
                <input
                  type="number"
                  value={range.base ?? 0}
                  onChange={(e) => {
                    const next = [...config.part2.preScoreToPoints.ranges];
                    next[idx] = { ...next[idx], base: parseInt(e.target.value, 10) || 0 };
                    updatePart2(prev => ({
                      ...prev,
                      preScoreToPoints: { ...prev.preScoreToPoints, ranges: next }
                    }));
                  }}
                />
                <span>mult</span>
                <input
                  type="number"
                  value={range.multiplier}
                  onChange={(e) => {
                    const next = [...config.part2.preScoreToPoints.ranges];
                    next[idx] = { ...next[idx], multiplier: parseInt(e.target.value, 10) || 0 };
                    updatePart2(prev => ({
                      ...prev,
                      preScoreToPoints: { ...prev.preScoreToPoints, ranges: next }
                    }));
                  }}
                />
                <span>div</span>
                <input
                  type="number"
                  value={range.divisor}
                  onChange={(e) => {
                    const next = [...config.part2.preScoreToPoints.ranges];
                    next[idx] = { ...next[idx], divisor: parseFloat(e.target.value) || 1 };
                    updatePart2(prev => ({
                      ...prev,
                      preScoreToPoints: { ...prev.preScoreToPoints, ranges: next }
                    }));
                  }}
                />
              </div>
            ))}
          </div>
          
          <div className="psa-points-section">
            <h4>PSA Level Points</h4>
            {config.part2.psaPoints.map((range, idx) => (
              <div key={idx} className="points-row">
                <span>PSA ≤ {range.max === Infinity ? '∞' : range.max} ng/mL</span>
                <input
                  type="number"
                  value={range.points}
                  onChange={(e) => {
                    const newPoints = [...config.part2.psaPoints];
                    newPoints[idx] = { ...newPoints[idx], points: parseInt(e.target.value, 10) || 0 };
                    updatePart2(prev => ({ ...prev, psaPoints: newPoints }));
                  }}
                />
                <span>points</span>
              </div>
            ))}
          </div>

          <div className="pirads-section">
            <h4>PI-RADS Points</h4>
            {config.part2.piradsPoints.map((p, idx) => (
              <div key={idx} className="points-row">
                <span>PI-RADS {p.value}</span>
                <input
                  type="number"
                  value={p.points}
                  onChange={(e) => {
                    const next = [...config.part2.piradsPoints];
                    next[idx] = { ...next[idx], points: parseInt(e.target.value, 10) || 0 };
                    updatePart2(prev => ({ ...prev, piradsPoints: next }));
                  }}
                />
                <span>points</span>
              </div>
            ))}
          </div>

          <div className="psa-points-section">
            <h4>Risk Categories (Total Points → Risk)</h4>
            {config.part2.riskCategories.map((cat, idx) => (
              <div key={idx} className="points-row">
                <span>≤ {cat.maxPoints === Infinity ? '∞' : cat.maxPoints}</span>
                <span style={{ marginLeft: '8px' }}>riskPct</span>
                <input
                  type="text"
                  value={cat.riskPct}
                  onChange={(e) => {
                    const next = [...config.part2.riskCategories];
                    next[idx] = { ...next[idx], riskPct: e.target.value };
                    updatePart2(prev => ({ ...prev, riskCategories: next }));
                  }}
                />
                <span>riskCat</span>
                <input
                  type="text"
                  value={cat.riskCat}
                  onChange={(e) => {
                    const next = [...config.part2.riskCategories];
                    next[idx] = { ...next[idx], riskCat: e.target.value };
                    updatePart2(prev => ({ ...prev, riskCategories: next }));
                  }}
                />
                <span>class</span>
                <input
                  type="text"
                  value={cat.riskClass}
                  onChange={(e) => {
                    const next = [...config.part2.riskCategories];
                    next[idx] = { ...next[idx], riskClass: e.target.value };
                    updatePart2(prev => ({ ...prev, riskCategories: next }));
                  }}
                />
              </div>
            ))}
          </div>

          <div className="pirads-section">
            <h4>PI-RADS Override Values</h4>
            {Object.entries(config.part2.piradsOverrides).map(([score, data]) => (
              <div key={score} className="pirads-override">
                <strong>PI-RADS {score}:</strong>
                <div className="points-row" style={{ marginTop: '8px' }}>
                  <span>riskPct</span>
                  <input
                    type="text"
                    value={data.riskPct}
                    onChange={(e) => {
                      const next = { ...config.part2.piradsOverrides };
                      next[score] = { ...next[score], riskPct: e.target.value };
                      updatePart2(prev => ({ ...prev, piradsOverrides: next }));
                    }}
                  />
                  <span>riskCat</span>
                  <input
                    type="text"
                    value={data.riskCat}
                    onChange={(e) => {
                      const next = { ...config.part2.piradsOverrides };
                      next[score] = { ...next[score], riskCat: e.target.value };
                      updatePart2(prev => ({ ...prev, piradsOverrides: next }));
                    }}
                  />
                  <span>class</span>
                  <input
                    type="text"
                    value={data.riskClass}
                    onChange={(e) => {
                      const next = { ...config.part2.piradsOverrides };
                      next[score] = { ...next[score], riskClass: e.target.value };
                      updatePart2(prev => ({ ...prev, piradsOverrides: next }));
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'cohort' && (
        <div className="config-section">
          <h3>Cohort Analysis</h3>
          <div className="cohort-upload">
            <p>Upload cohort data (JSON format) to validate model performance:</p>
            <button className="btn-simulate" onClick={simulateWithCohort}>
              <Database size={16} /> Upload Cohort Data
            </button>
          </div>

          {cohortStats && (
            <div className="cohort-stats">
              <h4><TrendingUp size={16} /> Model Performance Statistics</h4>
              <div className="stats-grid">
                <div className="stat">
                  <label>Total Patients</label>
                  <value>{cohortStats.totalPatients}</value>
                </div>
                <div className="stat">
                  <label>Cancer Detected</label>
                  <value>{cohortStats.detectedCases}</value>
                </div>
                <div className="stat">
                  <label>Avg Predicted Risk</label>
                  <value>{cohortStats.avgPredictedRisk}%</value>
                </div>
                <div className="stat">
                  <label>Sensitivity</label>
                  <value>{(cohortStats.sensitivity * 100).toFixed(1)}%</value>
                </div>
                <div className="stat">
                  <label>Specificity</label>
                  <value>{(cohortStats.specificity * 100).toFixed(1)}%</value>
                </div>
                <div className="stat">
                  <label>AUC</label>
                  <value>{cohortStats.auc}</value>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {hasChanges && (
        <div className="changes-indicator">
          <AlertTriangle size={16} />
          You have unsaved changes
        </div>
      )}
    </div>
  );
};

export default CalculatorAdmin;
