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

  const record = {
    record_id: sessionRef ?? `cm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,

    // patient_info
    age:  formData.age,
    race: formData.race,

    // clinical_inputs — Family & Genetic Risk
    family_history: formData.familyHistory,   // 0 | 1 | 2 | unknown
    genetic_risk:   formData.brcaStatus,      // yes | no | unknown

    // clinical_inputs — Body
    bmi: formData.bmi != null ? parseFloat(String(formData.bmi)).toFixed(1) : undefined,

    // clinical_inputs — Lifestyle
    exercise:         formData.exercise,
    smoking:          formData.smoking,
    chemical_exposure,
    diet_pattern:     formData.dietPattern,
    comorbidities:    formData.comorbidityScore ?? 0,  // 0 | 1 | 2

    // symptom_scores
    ipss_qol:             formData.ipssQol,   // 0–6  (IPSS Q8)
    erection_confidence:  formData.shim?.[0], // 1–5  (SHIM Q1)
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
