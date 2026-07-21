/**
 * phoneHash.js — Privacy-preserving phone number hashing for mobile bus PSA linkage.
 *
 * WHY THIS EXISTS:
 * Mobile bus patients complete the ePSA questionnaire on-site but PSA results
 * return 3–5 days later from the lab. To match the PSA result to the correct
 * session without storing any patient identifier, we:
 *   1. Hash the patient's phone number using SHA-256 at the point of collection
 *   2. Store only the hash alongside the session — never the phone number itself
 *   3. When PSA returns, staff re-enter the phone number → same hash → match found
 *   4. PSA is entered, hash is deleted from the session record
 *
 * PRIVACY PROPERTIES:
 * - SHA-256 is a one-way function — the phone number cannot be recovered from the hash
 * - A salt (EPSA_PHONE_SALT) is mixed in to prevent rainbow table attacks
 * - The hash is deleted after PSA linkage is complete
 * - No phone number is ever written to localStorage, Turso, or REDCap
 *
 * IRB NOTE:
 * The hash exists only during the window between survey completion and PSA entry.
 * Once PSA is entered and the hash is removed, the record is fully de-identified.
 * Application logs (timestamps, session IDs) are maintained separately by IT as
 * operational records and are not part of the research dataset.
 */

// Salt prevents rainbow table attacks on the hash.
// This does not need to be secret — it just needs to be consistent across
// all devices used at mobile bus events (i.e. the same value everywhere).
const SALT = 'epsa-mobile-bus-v1';

/**
 * Normalize a phone number to digits only before hashing.
 * "+1 (212) 555-0100" → "12125550100"
 * Ensures consistent hash regardless of how the number is typed.
 */
function normalizePhone(phone) {
  return String(phone).replace(/\D/g, '');
}

/**
 * Hash a phone number using SHA-256.
 * Returns a hex string (64 chars).
 * Uses the Web Crypto API — available in all modern browsers, no library needed.
 *
 * @param {string} phone - Raw phone number (any format)
 * @returns {Promise<string>} - SHA-256 hex hash
 */
export async function hashPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized || normalized.length < 7) {
    throw new Error('Phone number too short to hash safely');
  }
  const input = `${SALT}:${normalized}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Check whether a phone number matches a stored hash.
 *
 * @param {string} phone - Phone number entered by staff
 * @param {string} storedHash - Hash stored on the session
 * @returns {Promise<boolean>}
 */
export async function phoneMatchesHash(phone, storedHash) {
  if (!storedHash) return false;
  const hash = await hashPhone(phone);
  return hash === storedHash;
}
