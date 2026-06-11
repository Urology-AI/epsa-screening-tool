/**
 * Calculator Configuration System
 * Allows dynamic adjustment of ePSA model weights
 * Stores configuration in Firebase for easy updates
 */

export const DEFAULT_CALCULATOR_CONFIG = {
  version: '1.0.1',
  part1: {
    modelType: 'binned_v1',
    // Part 1 now uses a point-based score (no logistic weights); intercept/calibration are unused.
    intercept: 0,
    // Align with engine default: 22.5% probability ≈ raw-score screening gate (see epsaEngine)
    recommendThreshold: 0.225,
    calibration: {
      slope: 1.0,
      interceptShift: 0.0
    },
    encodings: {
      raceBlackValues: ['black', 'african american', 'black or african american', 'black/aa', 'black/african american', 'african-american'],
      ageBins: [
        { min: 18, max: 49, label: '40-49' },
        { min: 50, max: 59, label: '50-59' },
        { min: 60, max: 69, label: '60-69' },
        { min: 70, max: 120, label: '70+' }
      ],
      bmiBins: [
        { min: 0, max: 24.999, label: '<25' },
        { min: 25, max: 29.999, label: '25-29.9' },
        { min: 30, max: 200, label: '>=30' }
      ],
      ipssSeverity: [
        { min: 0, max: 7, label: 'mild' },
        { min: 8, max: 19, label: 'moderate' },
        { min: 20, max: 35, label: 'severe' }
      ]
    },
    variables: [
      { id: 'age_50_59',                 name: 'age_50_59',                 weight:  0.515273, type: 'binary' },
      { id: 'age_60_69',                 name: 'age_60_69',                 weight:  0.267338, type: 'binary' },
      { id: 'age_70_plus',               name: 'age_70_plus',               weight:  0.112174, type: 'binary' },
      { id: 'bmi_25_29_9',               name: 'bmi_25_29_9',               weight:  1.109121, type: 'binary' },
      { id: 'bmi_ge_30',                 name: 'bmi_ge_30',                 weight:  0.479419, type: 'binary' },
      { id: 'ipss_moderate',             name: 'ipss_moderate',             weight: -0.572095, type: 'binary' },
      { id: 'ipss_severe',               name: 'ipss_severe',               weight: -0.054009, type: 'binary' },
      { id: 'exercise_some',             name: 'exercise_some',             weight:  0.040351, type: 'binary' },
      { id: 'exercise_none',             name: 'exercise_none',             weight:  0.419234, type: 'binary' }, // corrected from 0.000000 (copy-paste error); training run 2026-06-02
      { id: 'raceBlack',                 name: 'raceBlack',                 weight:  0.744867, type: 'binary' },
      { id: 'fhBinary',                  name: 'fhBinary',                  weight: -0.647446, type: 'binary' },
      { id: 'age60plus_x_ipss_moderate', name: 'age60plus_x_ipss_moderate', weight: -0.105186, type: 'binary' },
      { id: 'age60plus_x_ipss_severe',   name: 'age60plus_x_ipss_severe',   weight: -0.129447, type: 'binary' }
    ],
    riskCutoffs: {
      lower:    { threshold: 0.23, label: 'Below 23%', color: '#27AE60' },
      moderate: { threshold: 0.39, label: '23%–39%',   color: '#D4AF37' },
      higher:   { threshold: 1.0,  label: 'Above 39%', color: '#C0392B' }
    }
  },
  part2: {
    modelType: 'unified_logistic_v1',
    // Outcome: GG≥2 (AUA/SUO 2023/2026 definition of clinically significant PCa, p.4)
    targetLabel: 'Clinically significant cancer risk (GG≥2)',
    calibration: { slope: 1.0, interceptShift: 0.0 },

    thresholds: { low: 0.2583, moderate: 0.2892, high: 0.2987 },

    models: {
      // Base model — logPSA only. Retained from prior GG≥3 run (AUC 0.378 on GG≥2 — below chance).
      base: {
        intercept: -1.438927,
        variables: [
          { id: 'logPSA', weight: +0.188130, type: 'continuous' }
        ]
      },
      // MRI model — updated 2026-06-02: dummy-variable logistic regression, N=96, GG≥2 outcome.
      // AUC OOF 0.591. PIRADS 4 (0.968) and 5 (1.255) now properly separated (were near-identical at 0.368/0.368).
      mri: {
        intercept: 0.356742,
        variables: [
          { id: 'logPSA',   weight: -0.017489, type: 'continuous' },
          { id: 'pirads_3', weight: -0.061356, type: 'binary' },
          { id: 'pirads_4', weight: +0.967766, type: 'binary' },
          { id: 'pirads_5', weight: +1.255289, type: 'binary' }
        ]
      }
    }
  },
  validation: {
    minAge: 18,
    maxAge: 120,
    minBMI: 15,
    maxBMI: 60,
    minPSA: 0,
    maxPSA: 1000
  }
};

export const ALTERNATIVE_MODELS = {
  'conservative': {
    name: 'Conservative Model',
    description: 'Lower weights for screening hesitancy',
    part1: {
      intercept: -4.5,
      variables: [
        { id: 'age', weight: 0.04 },
        { id: 'raceBlack', weight: 0.02 },
        { id: 'bmi', weight: 0.015 },
        { id: 'ipssTotal', weight: 0.02 },
        { id: 'exerciseCode', weight: 0.5 },
        { id: 'fhBinary', weight: 0.7 },
        { id: 'shimTotal', weight: 0.03 }
      ]
    }
  },
  'aggressive': {
    name: 'Aggressive Detection Model',
    description: 'Higher sensitivity for early detection',
    part1: {
      intercept: -3.2,
      variables: [
        { id: 'age', weight: 0.05 },
        { id: 'raceBlack', weight: 0.035 },
        { id: 'bmi', weight: 0.025 },
        { id: 'ipssTotal', weight: 0.035 },
        { id: 'exerciseCode', weight: 0.65 },
        { id: 'fhBinary', weight: 1.0 },
        { id: 'shimTotal', weight: 0.04 }
      ]
    }
  }
};

export const COHORT_ANALYSIS_FIELDS = [
  'patientId',
  'age',
  'race',
  'bmi',
  'familyHistory',
  'psaLevel',
  'biopsyResult',
  'cancerDetected',
  'gleasonScore',
  'tStage',
  'ipssTotal',
  'shimTotal',
  'exerciseLevel',
  'smokingStatus',
  'brcaStatus',
  'diabetes',
  'hypertension',
  'medications',
  'previousBiopsy',
  'mriFindings',
  'piradsScore'
];

/* ─── PSA Recommendation Banner Config ───────────────────────────────────────
 * Serialisable data only (no React components). Icon key is resolved in
 * Part1Results.jsx via PSA_BANNER_ICONS map. See Part1Results for full config.
 * ──────────────────────────────────────────────────────────────────────────── */
export const PSA_BANNER_CONFIG_DATA = {
  high_risk_early_screening: {
    bg: '#fef2f2', border: '#dc2626', iconColor: '#dc2626',
    label: 'PSA SCREENING RECOMMENDED — HIGH-RISK PROFILE', labelColor: '#991b1b',
    iconKey: 'alert-circle',
    source: 'AUA, NCCN, and ERUS guidelines all support earlier screening for men with Black ancestry or a hereditary genetic mutation. AUA is the most explicit about starting from age 40.',
  },
  family_history_override: {
    bg: '#fef2f2', border: '#dc2626', iconColor: '#dc2626',
    label: 'PSA SCREENING RECOMMENDED — FAMILY HISTORY', labelColor: '#991b1b',
    iconKey: 'alert-circle',
    source: 'AUA, NCCN, and ERUS guidelines all support earlier screening for men with a first-degree family history of prostate cancer. AUA is the most explicit about starting from age 40.',
  },
  score_threshold: {
    bg: '#fffbeb', border: '#d97706', iconColor: '#d97706',
    label: 'PSA SCREENING RECOMMENDED', labelColor: '#92400e',
    iconKey: 'alert-triangle',
    source: 'Model-based recommendation — ePSA score exceeds the model threshold. This goes beyond AUA/NCCN/ERUS average-risk screening criteria, which use only age, race, family history, and germline mutations.',
  },
  age_guideline_50_69: {
    bg: '#eff6ff', border: '#2563eb', iconColor: '#2563eb',
    label: 'PSA SCREENING RECOMMENDED', labelColor: '#1e40af',
    iconKey: 'info',
    source: 'AUA/SUO guideline Statement 6 — regular PSA screening every 2–4 years for people aged 50–69.',
  },
  baseline_psa_45_50: {
    bg: '#eff6ff', border: '#2563eb', iconColor: '#2563eb',
    label: 'BASELINE PSA DISCUSSION RECOMMENDED', labelColor: '#1e40af',
    iconKey: 'info',
    source: 'AUA/SUO guideline Statement 4 — a baseline PSA test may be offered to people aged 45–50.',
  },
  not_recommended: {
    bg: '#f0fdf4', border: '#16a34a', iconColor: '#16a34a',
    label: 'PSA NOT CURRENTLY RECOMMENDED', labelColor: '#166534',
    iconKey: 'check-circle',
    source: 'Your score is below the screening threshold. Follow standard age-based guidance from AUA, NCCN, and ERUS.',
  },
};

export const WEIGHT_ADJUSTMENT_GUIDELINES = {
  minWeight: -2.0,
  maxWeight: 2.0,
  stepSize: 0.001,
  clinicalValidationRequired: true,
  minCohortSize: 100,
  recommendedVariables: [
    { id: 'age', recommendedRange: [0.03, 0.06] },
    { id: 'raceBlack', recommendedRange: [0.02, 0.05] },
    { id: 'bmi', recommendedRange: [0.01, 0.03] },
    { id: 'ipssTotal', recommendedRange: [-0.05, 0.05] },
    { id: 'exerciseCode', recommendedRange: [0.4, 0.8] },
    { id: 'fhBinary', recommendedRange: [0.6, 1.2] },
    { id: 'shimTotal', recommendedRange: [0.02, 0.05] }
  ]
};
