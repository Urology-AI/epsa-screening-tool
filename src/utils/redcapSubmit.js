/**
 * REDCap submission for the screening tool via serverless proxy.
 * Fields match redcap_data_dictionary_clinical_mode.csv exactly.
 *
 * SECURITY: The REDCap API token must NEVER appear in frontend code or VITE_* env vars.
 * All REDCap calls are proxied through the Cloudflare Worker in worker/ which holds
 * the token as a Worker secret (wrangler secret put REDCAP_TOKEN). Only non-sensitive
 * record data is sent to the proxy; the token never reaches the browser.
 *
 * Set VITE_REDCAP_PROXY_URL to the deployed worker URL. When unset, submission
 * is skipped and reported as a failure so callers fall back gracefully.
 */

/**
 * Build a record matching the clinical mode instrument.
 * formData is the shape produced by ClinicalModeFlow handleSubmit.
 */
function buildClinicalRecord(formData, sessionRef) {
  // chemical_exposure in form: no | agent_orange | wtc_911 | other_chemical
  // CSV only has: no | yes | unknown
  const chemRaw = formData.chemicalExposure;
  const chemical_exposure =
    chemRaw === 'no' ? 'no'
    : chemRaw === 'unknown' ? 'unknown'
    : chemRaw ? 'yes'
    : undefined;

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
    race_epsa: formData.race,

    // clinical_inputs — Family & Genetic Risk
    family_history:  formData.familyHistory,  // 0 | 1 | 2 | unknown
    genetic_risk:    formData.brcaStatus,     // yes | no | unknown
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
  };

  // Drop undefined / null / empty
  const clean = {};
  for (const [k, v] of Object.entries(record)) {
    if (v !== undefined && v !== null && v !== '') clean[k] = v;
  }
  return clean;
}

/**
 * Submit a screening record to REDCap via the proxy worker.
 * Returns { success: true } or { success: false, error: string }.
 */
export async function submitToRedcap(formData, sessionRef) {
  const proxyUrl = import.meta.env.VITE_REDCAP_PROXY_URL;
  if (!proxyUrl) {
    return { success: false, error: 'REDCap proxy not configured' };
  }

  const record = buildClinicalRecord(formData, sessionRef);

  try {
    const res = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record }),
    });
    if (!res.ok) {
      throw new Error(`Proxy returned HTTP ${res.status}`);
    }
    return { success: true };
  } catch (err) {
    console.error('REDCap submit failed:', err);
    return { success: false, error: err?.message || 'Submission failed' };
  }
}
