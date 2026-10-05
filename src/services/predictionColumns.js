/**
 * Prediction-side columns for prospective validation.
 *
 * Pure (no import.meta, no network) so it can be unit-tested with `node --test`.
 * Reads only scalar engine outputs — never the patient-facing message text —
 * and never anything from the form. Runs after de-identification, on a session
 * that already passed the `consented` gate.
 *
 * Outcomes (PSA result, biopsy Grade Group, pathology) are deliberately NOT
 * here: they are collected later and must stay separate from predictions.
 */

export const PREDICTION_COLS = [
  'engine_version', 'guideline_version', 'model_hash',
  'model1_version', 'model2_version',
  'part1_score', 'recommend_psa', 'psa_recommend_reason',
  'part2_tier_key', 'part2_risk_cat',
  'mri_recommended', 'mri_recommend_reason',
  'biopsy_recommended', 'biopsy_reason',
];

const str = (v) => (typeof v === 'string' && v !== '' ? v : null);
const int = (v) => (Number.isFinite(v) ? Math.round(v) : null);
const flag = (v) => (v === true ? 1 : v === false ? 0 : null);

/** First 16 hex chars of SHA-256 over the engine config: identifies the exact weights/thresholds in use. */
export async function hashConfig(config, subtle = globalThis.crypto?.subtle) {
  if (!subtle) return null;
  const buf = await subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(config ?? null)));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

export function predictionColumns(engineResult, postResult, modelHash = null) {
  const r1 = engineResult ?? {};
  const r2 = postResult ?? {};
  return {
    engine_version: str(r1.engineVersion) ?? str(r2.engineVersion),
    guideline_version: str(r1.guidelineVersion) ?? str(r2.guidelineVersion),
    model_hash: modelHash,
    model1_version: str(r1.modelVersion),
    model2_version: str(r2.modelVersion),
    part1_score: int(r1.score),
    recommend_psa: flag(r1.recommendPSA),
    psa_recommend_reason: str(r1.psaRecommendReason),
    part2_tier_key: str(r2.epsaTierKey),
    part2_risk_cat: str(r2.riskCat),
    mri_recommended: flag(r2.mriRecommended),
    mri_recommend_reason: str(r2.mriRecommendReason),
    biopsy_recommended: flag(r2.biopsyRecommended),
    biopsy_reason: str(r2.biopsyReason),
  };
}
