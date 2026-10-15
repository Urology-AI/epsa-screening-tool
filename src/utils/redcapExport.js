/**
 * REDCap export for the screening tool — a CSV for REDCap's Data Import Tool.
 * Fields match redcap_data_dictionary_clinical_mode.csv exactly.
 *
 * Nothing is transmitted from here: sessions live in this device's
 * localStorage, and staff upload the downloaded CSV into REDCap themselves.
 * No API token, proxy or cloud database is involved.
 */

/**
 * Build a record matching the clinical mode instrument.
 * formData is the shape produced by ClinicalModeFlow handleSubmit.
 */
// REDCap coded value maps (data dictionary field → app value → REDCap code)
const RACE_MAP = {
  'white':           1,
  'african-american': 2,
  'hispanic':        3,
  'asian':           4,
  'mixed':           5,
  'american-indian': 6,
  'native-hawaiian': 6,
  'other':           6,
};

// 'other_elevated'/'lynch'/'other_unknown' cover cases where no confirmed genetic
// test was done, but a BRCA-linked family history (breast/pancreatic cancer) or
// other hereditary signal elevates risk — treated as positive/elevated for REDCap.
const GENETIC_RISK_MAP = {
  'yes':            1,
  'positive':       1,
  'lynch':          1,
  'other_elevated': 1,
  'no':             2,
  'negative':       2,
  'unknown':        3,
  'other_unknown':  3,
};

// chemical_exposure: app uses 'no'/'wtc_911'; REDCap uses 'none'/'nine_eleven'
const CHEM_MAP = {
  'no':             'none',
  'none':           'none',
  'agent_orange':   'agent_orange',
  'wtc_911':        'nine_eleven',
  'nine_eleven':    'nine_eleven',
  'other_chemical': 'other_chemical',
  'unknown':        'unknown',
};

// family_history: app sends 'unknown' string; REDCap uses 3
const FAMILY_MAP = {
  0: 0, 1: 1, 2: 2,
  'unknown': 3,
};

function buildClinicalRecord(formData, sessionRef, checklistData) {
  const chemical_exposure = CHEM_MAP[formData.chemicalExposure] ?? undefined;

  // Convert height/weight to both unit systems for REDCap
  const heightFt  = formData.metricH ? undefined : (parseFloat(formData.heightFt) || undefined);
  const heightIn  = formData.metricH ? undefined : (parseFloat(formData.heightIn) || 0);
  const heightCm  = formData.metricH
    ? (parseFloat(formData.heightCm) || undefined)
    : (heightFt != null ? Math.round(((heightFt * 12) + heightIn) * 2.54) : undefined);
  const weightLbs = formData.metricW ? undefined : (parseFloat(formData.weightLbs) || undefined);
  const weightKg  = formData.metricW
    ? (parseFloat(formData.weightKg) || undefined)
    : (weightLbs != null ? parseFloat((weightLbs * 0.453592).toFixed(1)) : undefined);

  const record = {
    record_id: sessionRef ?? `cm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,

    // patient_info
    age:       formData.age,
    race_epsa: RACE_MAP[formData.race] ?? undefined,

    // clinical_inputs — Family & Genetic Risk
    family_history:  FAMILY_MAP[formData.familyHistory] ?? undefined,
    genetic_risk:    GENETIC_RISK_MAP[formData.brcaStatus] ?? undefined,
    inflammation_hx: formData.inflammationHistory,

    // clinical_inputs — Body (separate height/weight fields)
    height_ft:  heightFt,
    height_in:  heightIn,
    height_cm:  heightCm,
    weight_lbs: weightLbs,
    weight_kg:  weightKg,

    // clinical_inputs — Lifestyle
    exercise:         formData.exercise,
    smoking:          formData.smoking,
    chemical_exposure,
    diet_pattern:     formData.dietPattern,
    comorbidities:    formData.comorbidityScore ?? 0,  // 0 | 1 | 2

    // symptom_scores
    quality_of_life:     formData.ipssQol,   // 0–6  (IPSS Q8)
    erection_confidence: formData.shim?.[0], // 1–5  (SHIM Q1)

    // clinician impact checklist
    clinician_influence:     checklistData?.influence ?? '',
    clinician_action:        checklistData?.action ?? '',
    clinician_notes:         checklistData?.notes ?? '',
    clinician_checklist_at:  checklistData ? (checklistData.savedAt ?? new Date().toISOString()) : '',
  };

  // Drop undefined / null / empty
  const clean = {};
  for (const [k, v] of Object.entries(record)) {
    if (v !== undefined && v !== null && v !== '') clean[k] = v;
  }
  return clean;
}

/** Sessions the patient declined to share are never exported. Legacy
 *  sessions without the flag (consented == null) are included. */
export function isRedcapEligible(session) {
  return session.consented !== false && !!session.formData;
}

function csvCell(v) {
  const str = String(v);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** One REDCap import row per session; header is record_id then every field used. */
export function buildRedcapCsv(sessions) {
  const records = sessions.map((s) =>
    buildClinicalRecord(s.formData, s.sessionRef ?? s.id, s.checklistData),
  );
  const cols = ['record_id'];
  for (const r of records) {
    for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  }
  const lines = [cols.join(',')];
  for (const r of records) lines.push(cols.map((c) => (r[c] === undefined ? '' : csvCell(r[c]))).join(','));
  return lines.join('\r\n') + '\r\n';
}

export function downloadRedcapCsv(sessions, filename) {
  const blob = new Blob([buildRedcapCsv(sessions)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `epsa_redcap_import_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
