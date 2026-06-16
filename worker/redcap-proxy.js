/**
 * Cloudflare Worker — REDCap proxy for ePSA Screening Tool.
 *
 * Deploy:
 *   wrangler deploy
 *
 * Secrets (set once, never in code):
 *   wrangler secret put REDCAP_TOKEN
 *   wrangler secret put REDCAP_API_URL   # e.g. https://redcap.mountsinai.org/api/
 *   wrangler secret put ALLOWED_ORIGIN   # e.g. https://urology-ai.github.io
 *
 * The worker accepts POST { record: {...} }, forwards to REDCap, returns { success }.
 */

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '';

    const corsHeaders = {
      'Access-Control-Allow-Origin': allowed || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    // Enforce origin allowlist in production
    if (allowed && origin && !origin.startsWith(allowed)) {
      return new Response('Forbidden', { status: 403, headers: corsHeaders });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const record = body?.record;
    if (!record || typeof record !== 'object') {
      return new Response(JSON.stringify({ error: 'Missing record payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = env.REDCAP_TOKEN;
    const url = env.REDCAP_API_URL;

    if (!token || !url) {
      return new Response(JSON.stringify({ error: 'REDCap not configured on server' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const params = new URLSearchParams({
      token,
      content: 'record',
      format: 'json',
      type: 'flat',
      data: JSON.stringify([record]),
      returnContent: 'ids',
    });

    const redcapRes = await fetch(url, {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const redcapBody = await redcapRes.text();
    console.log('REDCap response:', redcapRes.status, redcapBody.slice(0, 200));

    if (!redcapRes.ok || redcapBody.startsWith('ERROR') || redcapBody.trimStart().startsWith('<')) {
      const isHtml = redcapBody.trimStart().startsWith('<');
      const errorMsg = isHtml
        ? 'REDCap API URL is misconfigured (received HTML login page instead of API response)'
        : redcapBody || `REDCap returned HTTP ${redcapRes.status}`;
      console.error('REDCap error:', redcapRes.status, errorMsg);
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  },
};
