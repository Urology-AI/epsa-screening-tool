/**
 * Single source of the caller's Mount Sinai Entra token.
 *
 * Both the Turso proxy and the REDCap proxy require a verified Entra token on
 * every route, so the provider lives here rather than being duplicated per
 * service. AppShell installs it once after sign-in completes.
 *
 * There is deliberately no fallback. If no provider is installed, or the token
 * has expired, calls fail closed with a message the user can act on — rather
 * than silently degrading to an unauthenticated request that the Worker would
 * reject with an opaque 401.
 */

let authTokenProvider = null;

export function setAuthTokenProvider(fn) {
  authTokenProvider = fn;
}

/**
 * The ID token, not the Graph access token: the Workers check
 * `aud === AZURE_CLIENT_ID`, and a Graph access token carries Graph's audience
 * instead and would be rejected. AppShell is responsible for supplying the
 * right one.
 */
export async function getAuthToken() {
  if (!authTokenProvider) {
    throw new Error('Not signed in. This action requires Mount Sinai sign-in.');
  }
  const token = await authTokenProvider();
  if (!token) {
    throw new Error('Your session has expired. Please sign in again.');
  }
  return token;
}

/** True when a provider is installed — i.e. someone is signed in. */
export function hasAuthToken() {
  return authTokenProvider !== null;
}
