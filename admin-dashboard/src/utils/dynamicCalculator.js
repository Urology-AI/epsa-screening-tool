/**
 * Dynamic ePSA Calculator
 * Reads configuration from calculatorConfig.js
 * Allows real-time model adjustments without code changes
 * Current ePSA calculator is the default configuration
 */

import { DEFAULT_CALCULATOR_CONFIG } from '@frontend/config/calculatorConfig';
import {
  calculateDynamicEPsa as calculateDynamicEPsaEngine,
  calculateDynamicEPsaPost as calculateDynamicEPsaPostEngine,
  validateInputs,
} from '@frontend/utils/epsaEngine';

export const CALCULATOR_CONFIG_STORAGE_KEY = 'epsa_calculator_config';
export const CALCULATOR_CONFIG_DOC_PATH = { collection: 'calculatorConfig', doc: 'published' };

// Get current config (from localStorage or default)
export const getCalculatorConfig = () => {
  try {
    const stored = localStorage.getItem(CALCULATOR_CONFIG_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Error loading calculator config:', error);
  }
  return DEFAULT_CALCULATOR_CONFIG;
};

// Refresh config from Firestore published doc (if Firebase is configured)
// Returns the loaded config, or null if refresh failed.
export const refreshCalculatorConfig = async () => {
  try {
    const firebaseModule = await import('../config/firebase');
    const firestoreDb = firebaseModule.db;

    if (!firestoreDb) {
      return null;
    }

    const { doc, getDoc } = await import('firebase/firestore');
    const ref = doc(firestoreDb, CALCULATOR_CONFIG_DOC_PATH.collection, CALCULATOR_CONFIG_DOC_PATH.doc);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      return null;
    }

    const data = snap.data();
    const publishedConfig = data?.config;
    if (!publishedConfig) {
      return null;
    }

    localStorage.setItem(CALCULATOR_CONFIG_STORAGE_KEY, JSON.stringify(publishedConfig));
    return publishedConfig;
  } catch (error) {
    console.warn('Failed to refresh calculator config from Firestore:', error);
    return null;
  }
};

// Save config to localStorage (and Firebase in production)
export const saveCalculatorConfig = async (config) => {
  try {
    localStorage.setItem(CALCULATOR_CONFIG_STORAGE_KEY, JSON.stringify(config));
    
    // Store version history
    const versions = JSON.parse(localStorage.getItem('epsa_config_versions') || '[]');
    versions.push({
      version: config.version,
      timestamp: new Date().toISOString(),
      config: JSON.parse(JSON.stringify(config))
    });
    localStorage.setItem('epsa_config_versions', JSON.stringify(versions.slice(-20))); // Keep last 20
    
    return true;
  } catch (error) {
    console.error('Error saving config:', error);
    return false;
  }
};

// Get version history for rollback
export const getConfigVersions = () => {
  try {
    return JSON.parse(localStorage.getItem('epsa_config_versions') || '[]');
  } catch (error) {
    return [];
  }
};

// Rollback to specific version
export const rollbackToVersion = (versionTimestamp) => {
  const versions = getConfigVersions();
  const targetVersion = versions.find(v => v.timestamp === versionTimestamp);
  
  if (targetVersion) {
    saveCalculatorConfig(targetVersion.config);
    return targetVersion.config;
  }
  return null;
};

// Dynamic Part 1 Calculator
export const calculateDynamicEPsa = (formData, customConfig = null) => {
  const config = customConfig || getCalculatorConfig();
  return calculateDynamicEPsaEngine(formData, config);
};

// Dynamic Part 2 Calculator
export const calculateDynamicEPsaPost = (preResult, postData, customConfig = null) => {
  const config = customConfig || getCalculatorConfig();
  return calculateDynamicEPsaPostEngine(preResult, postData, config);
};

export { validateInputs };

// A/B Testing: Get model variant for user
export const getModelVariant = (userId, availableVariants = ['control', 'variant_a', 'variant_b']) => {
  // Deterministic assignment based on userId
  const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const index = hash % availableVariants.length;
  return availableVariants[index];
};

// Get config for A/B variant
export const getVariantConfig = (variant) => {
  const baseConfig = getCalculatorConfig();
  
  switch (variant) {
    case 'variant_a':
      // More aggressive detection
      return {
        ...baseConfig,
        version: `${baseConfig.version}-aggressive`,
        part1: {
          ...baseConfig.part1,
          riskCutoffs: {
            ...baseConfig.part1.riskCutoffs,
            lower: { ...baseConfig.part1.riskCutoffs.lower, threshold: 0.05 },
            moderate: { ...baseConfig.part1.riskCutoffs.moderate, threshold: 0.15 }
          }
        }
      };
    case 'variant_b':
      // More conservative
      return {
        ...baseConfig,
        version: `${baseConfig.version}-conservative`,
        part1: {
          ...baseConfig.part1,
          riskCutoffs: {
            lower: { ...baseConfig.part1.riskCutoffs.lower, threshold: 0.12 },
            moderate: { ...baseConfig.part1.riskCutoffs.moderate, threshold: 0.25 }
          }
        }
      };
    default:
      return baseConfig;
  }
};

// Export functions
export default {
  getCalculatorConfig,
  saveCalculatorConfig,
  getConfigVersions,
  rollbackToVersion,
  calculateDynamicEPsa,
  calculateDynamicEPsaPost,
  getModelVariant,
  getVariantConfig
};
