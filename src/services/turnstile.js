/**
 * Cloudflare Turnstile — proof-of-humanity for the public upload route.
 *
 * The Worker's /public/session route is deliberately unauthenticated: a member
 * of the public completing a screening at epsa.mssm.edu has no Mount Sinai
 * login. Rate limiting bounds how fast one address can post; Turnstile is what
 * makes automated abuse expensive in the first place.
 *
 * The token is only ever a signal to the server. It is verified against
 * Cloudflare's siteverify API inside the Worker — nothing here is trusted, and
 * skipping this module simply produces an upload the Worker rejects (once
 * TURNSTILE_SECRET_KEY is set) or records as unverified (until then).
 *
 * The site key is public by design and ships in the bundle.
 */

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** How long to wait for a token before giving up, including any interaction. */
const TOKEN_TIMEOUT_MS = 60_000;

let scriptPromise = null;

export function isTurnstileConfigured() {
  return !!SITE_KEY;
}

function loadScript() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (window.turnstile) return resolve();
    const el = document.createElement('script');
    el.src = SCRIPT_URL;
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('turnstile_script_blocked'));
    document.head.appendChild(el);
  });
  return scriptPromise;
}

/**
 * Container for the widget.
 *
 * Kept off-screen until Cloudflare decides a visible challenge is needed. A
 * Managed widget passes silently for almost all real visitors, so showing a
 * box to every patient would be friction for nothing — but if an interactive
 * challenge IS required, the widget must be on screen and reachable, or the
 * flow would hang with no way to complete it.
 */
function makeContainer() {
  const host = document.createElement('div');
  host.setAttribute('data-turnstile-host', '');
  Object.assign(host.style, {
    position: 'fixed',
    inset: '0',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.45)',
    zIndex: '10000',
  });

  const inner = document.createElement('div');
  Object.assign(inner.style, {
    background: '#fff',
    padding: '1.25rem',
    borderRadius: '12px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
    textAlign: 'center',
  });

  const label = document.createElement('p');
  label.textContent = 'Just checking you are a person — this takes a moment.';
  Object.assign(label.style, {
    margin: '0 0 0.75rem', font: '500 0.9rem/1.4 system-ui, sans-serif', color: '#111',
  });

  const slot = document.createElement('div');
  inner.append(label, slot);
  host.append(inner);
  document.body.appendChild(host);
  return { host, slot };
}

/**
 * Resolve with a fresh Turnstile token, or null when Turnstile is not
 * configured for this deployment.
 *
 * Called at submit time, not page load: tokens are single-use and expire in
 * about five minutes, so one minted when the questionnaire opened would often
 * be stale by the time a patient finishes answering.
 */
export async function getTurnstileToken() {
  if (!SITE_KEY) return null;

  await loadScript();

  const { host, slot } = makeContainer();
  let widgetId;
  let settled = false;

  const cleanup = () => {
    try { if (widgetId !== undefined) window.turnstile.remove(widgetId); } catch { /* already gone */ }
    host.remove();
  };

  return new Promise((resolve, reject) => {
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      fn(arg);
    };

    const timer = setTimeout(
      () => finish(reject, new Error('turnstile_timeout')),
      TOKEN_TIMEOUT_MS,
    );

    try {
      widgetId = window.turnstile.render(slot, {
        sitekey: SITE_KEY,
        // Run the challenge when execute() is called rather than on render,
        // so the timeout above covers the whole attempt.
        execution: 'execute',
        appearance: 'interaction-only',
        callback: (token) => finish(resolve, token),
        'error-callback': () => finish(reject, new Error('turnstile_error')),
        'timeout-callback': () => finish(reject, new Error('turnstile_timeout')),
        // Only reveal the overlay if a human actually has to do something.
        'before-interactive-callback': () => { host.style.display = 'flex'; },
        'after-interactive-callback': () => { host.style.display = 'none'; },
      });
      window.turnstile.execute(widgetId);
    } catch (err) {
      finish(reject, err instanceof Error ? err : new Error('turnstile_render_failed'));
    }
  });
}
