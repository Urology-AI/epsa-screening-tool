/**
 * Shared form helpers used by both ClinicalModeFlow (fast/proxy mode)
 * and Part1Form (full mode). Centralises the mappings so both flows
 * produce identical formData shapes for the engine and REDCap.
 */

export const FH_MAP = { none: 0, one: 1, two_plus: 2, unknown: 'unknown' };
export const DIET_MAP = { red_meat: 'western', mixed: 'other', plant: 'plant-based' };

/**
 * Maps the single IPSS Quality-of-Life question (0–6) to a 7-item IPSS
 * array used by the engine. Clinical Mode uses this proxy; Part1Form
 * collects each of the 7 items individually.
 *
 * Calibrated against Barry et al. (J Urol 1992) median IPSS total by QoL
 * response, and against the engine's severity bins (mild 0–7, moderate
 * 8–19, severe 20–35 — see calculatorConfig.js `ipssSeverity`):
 *   QoL 0–1 (Delighted/Pleased)     → total 0  (mild)
 *   QoL 2   (Mostly Satisfied)      → total 7  (mild)
 *   QoL 3   (Mixed)                 → total 14 (moderate)
 *   QoL 4   (Mostly Dissatisfied)   → total 21 (severe)
 *   QoL 5–6 (Unhappy/Terrible)      → total 35 (severe)
 *
 * Previously QoL 3 and 4 both mapped to total 21, incorrectly classifying
 * QoL 3 ("Mixed") as severe instead of moderate — this matters because the
 * engine scores IPSS moderate (8–19) and severe (20–35) as distinct bins
 * with different weights, not just a single ">= 8" cutoff.
 */
export function deriveIpssFromQol(qol) {
  const q = Number(qol);
  if (q <= 1) return [0, 0, 0, 0, 0, 0, 0];
  if (q === 2) return [1, 1, 1, 1, 1, 1, 1];
  if (q === 3) return [2, 2, 2, 2, 2, 2, 2];
  if (q === 4) return [3, 3, 3, 3, 3, 3, 3];
  return [5, 5, 5, 5, 5, 5, 5];
}

/**
 * Expands a single SHIM score (1–5) into the 5-item array the engine
 * expects. Clinical Mode collects one question; Part1Form collects all 5.
 */
export function expandShimSingle(val) {
  const v = Number(val);
  return [v, v, v, v, v];
}

/* ─── BMI helpers ─── */
function calcBmi(ft, inch, lbs) {
  const inches = (parseFloat(ft) || 0) * 12 + (parseFloat(inch) || 0);
  const w = parseFloat(lbs);
  return inches && w ? (703 * w) / (inches * inches) : null;
}
function calcBmiMetric(cm, kg) {
  const h = parseFloat(cm), w = parseFloat(kg);
  return h && w ? w / ((h / 100) * (h / 100)) : null;
}
export function deriveBmi(a, mH, mW) {
  if (mH && mW) return calcBmiMetric(a.heightCm, a.weightKg);
  if (!mH && !mW) return calcBmi(a.heightFt, a.heightIn, a.weightLbs);
  const inches = mH ? (parseFloat(a.heightCm) || 0) / 2.54
    : (parseFloat(a.heightFt) || 0) * 12 + (parseFloat(a.heightIn) || 0);
  const lbs = mW ? (parseFloat(a.weightKg) || 0) * 2.20462 : parseFloat(a.weightLbs);
  return inches && lbs ? (703 * lbs) / (inches * inches) : null;
}


/**
 * Builds the engine's formData from the kiosk questionnaire answers.
 * Shared by the live flow and the admin Import Wizard so a re-scored import
 * is identical to what the kiosk would have produced.
 */
export function buildClinicalFormData(answers, metricH, metricW) {
  const bmi = deriveBmi(answers, metricH, metricW);
  // BRCA1/2 germline mutations are also the driver behind hereditary breast and
  // pancreatic cancer syndromes. A reported family history of either — without a
  // confirmed negative or positive genetic test — is treated as an elevated,
  // BRCA-associated risk signal (same scoring bucket the engine already uses for
  // "other_elevated" hereditary findings), per AUA/NCCN guidance on hereditary risk.
  const hasBrcaLinkedFamilyHistory = answers.familyHistoryBreastCancer === 'yes'
    || answers.familyHistoryPancreaticCancer === 'yes';
  const effectiveBrcaStatus = (answers.brca === 'yes' || answers.brca === 'no')
    ? answers.brca
    : (hasBrcaLinkedFamilyHistory ? 'other_elevated' : answers.brca);
  return {
    age: parseInt(answers.age),
    race: answers.race,
    ethnicity: answers.ethnicity || null,
    familyHistory: FH_MAP[answers.familyHistory] ?? 0,
    familyHistoryBreastCancer: answers.familyHistoryBreastCancer ?? 'unknown',
    familyHistoryPancreaticCancer: answers.familyHistoryPancreaticCancer ?? 'unknown',
    ipss: deriveIpssFromQol(answers.qol),
    ipssQol: answers.qol,
    shim: expandShimSingle(answers.shim),
    dietPattern: answers.diet || 'other',
    exercise: answers.exercise,
    smoking: answers.smoking,
    bmi: bmi ? parseFloat(bmi.toFixed(1)) : 22,
    heightFt: answers.heightFt,
    heightIn: answers.heightIn,
    heightCm: answers.heightCm,
    weightLbs: answers.weightLbs,
    weightKg: answers.weightKg,
    metricH,
    metricW,
    brcaStatus: effectiveBrcaStatus,
    inflammationHistory: answers.inflammation === 'yes' ? 1 : 0,
    chemicalExposure: answers.chemicalExposure ?? 'no',
    comorbidityScore: Number(answers.comorbidities) || 0,
    hypertension: null, hyperlipidemia: null, coronaryArteryDisease: null, diabetes: null,
  };
}
