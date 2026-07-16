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
