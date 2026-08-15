# Workers

## `turso-proxy.js` — lives here

The clinical sessions proxy. Holds the Turso credential as a Worker secret so
it never reaches the browser. Every route requires a verified Mount Sinai Entra
token.

The Worker bundles `@libsql/client`, so dependencies must be installed first —
deploying from a bare checkout fails with "Could not resolve @libsql/client/web":

```
npm install
wrangler deploy --config worker/wrangler.turso.toml
```

Secrets are set separately and are never in the repo:

```
wrangler secret put TURSO_URL        --config worker/wrangler.turso.toml
wrangler secret put TURSO_AUTH_TOKEN --config worker/wrangler.turso.toml
```

Until those are set every route returns 503 *after* authenticating — the
identity check runs first, so an anonymous caller always sees 401.

## `redcap-proxy` — lives in the admin dashboard repo

**Not here.** A Worker named `epsa-redcap-proxy` used to be defined in *both*
this repo and `epsa-admin-dashboard`, from two source files that had drifted
apart — only one of them had rate limiting. Both deployed to the same
Cloudflare account under the same name, so whichever shipped last silently
replaced the other, and which behaviour was live depended on deploy order.

The canonical copy now lives in `epsa-admin-dashboard/worker/redcap-proxy.js`,
which is the repo with CI and the Cloudflare credentials to deploy it. This
app still *calls* it — see `VITE_REDCAP_PROXY_URL` — it just no longer defines
or deploys it.

Do not re-add a `redcap-proxy.js` here. If it needs changing, change it there.
