# ePSA Screening Tool

Clinical kiosk application for community prostate cancer screening events. Runs on tablets at point-of-care; no Firebase or cloud auth required.

Built by the Urology AI Lab, Icahn School of Medicine at Mount Sinai — Ashutosh K. Tewari, MD.

---

## What it does

**Kiosk (`/`)** — Patient-facing Part 1 questionnaire (demographics, family history, symptoms). PSA is not collected at the event. On completion, the patient receives a printed card with an `EP-YYYYMMDD-XXXX` reference code. The session is saved to the device and synced to Turso (cloud SQLite).

**Admin (`/admin`)** — PIN-gated staff portal. Staff can:
- View all saved sessions
- Enter PSA + PI-RADS results once lab values return (stored against the EP ref in Turso)
- Push/pull sessions to the cloud
- Export sessions as JSON
- Submit to REDCap (via Cloudflare Worker proxy)

**Cross-tool handoff** — When a patient later opens the main [ePSA Calculator](https://github.com/Urology-AI/e-psa-calculator) and enters their `EP-` ref, the full session (Part 1 + any PSA/PI-RADS entered by staff) loads automatically for Part 2 risk calculation.

---

## Architecture

```
Browser (kiosk / tablet)
│
├── Part 1 form → localStorage
├── localStorage → Turso (cloud SQLite) via @libsql/client
└── /admin → REDCap via Cloudflare Worker proxy (token never in frontend)

Turso
└── clinical_sessions table
    ├── session_ref (EP-YYYYMMDD-XXXX)
    ├── full_record (JSON)
    └── consented (boolean)
```

Secrets are injected at build time via CI environment variables and never committed to the repository.

---

## Environment variables

Set these in Vercel (or GitHub Actions secrets). They are baked into the JS bundle at build time.

| Variable | Description |
|---|---|
| `VITE_TURSO_URL` | Turso database URL (`libsql://...`) |
| `VITE_TURSO_AUTH_TOKEN` | Turso auth token — scope to this database only, not a root token |
| `VITE_CLINICAL_ADMIN_PIN` | PIN for the `/admin` route (default `1234` if unset — always override in production) |
| `VITE_REDCAP_PROXY_URL` | URL of the Cloudflare Worker REDCap proxy |

---

## REDCap proxy (Cloudflare Worker)

The REDCap API token never lives in the frontend. A Cloudflare Worker acts as a proxy:

```
Browser → POST /  →  Worker → REDCap API
```

Worker source is in `worker/redcap-proxy.js`. Deploy with:

```bash
cd worker
npx wrangler deploy
# Set secrets:
npx wrangler secret put REDCAP_TOKEN
npx wrangler secret put REDCAP_API_URL
npx wrangler secret put ALLOWED_ORIGIN   # your deployed app URL
```

---

## Deploy to Vercel

1. Import the repo in [vercel.com/new](https://vercel.com/new)
2. Framework preset: **Vite**
3. Add environment variables in the Vercel dashboard (see table above)
4. Deploy — both `/` (kiosk) and `/admin` routes are served from `dist/index.html` and `dist/admin/index.html` respectively

`vercel.json` in this repo handles routing so both paths work correctly.

---

## Local development

```bash
npm install

# Create .env.local with your secrets (never commit this file):
cp .env.example .env.local

npm run dev
# Kiosk: http://localhost:5173
# Admin: http://localhost:5173/admin
```

---

## Kiosk setup (tablet)

1. Open the deployed URL in Chrome or Safari
2. Add to Home Screen (iOS) or Install as PWA (Android/Chrome) — the manifest configures fullscreen portrait mode
3. Set the device to Guided Access / Kiosk mode to prevent patients from leaving the app
4. The app auto-resets after 90 seconds of inactivity — no manual reset needed between patients

---

## Security notes

- **No PHI in URLs** — session refs are non-identifying codes
- **Consent gate** — sessions with `consented: false` are never pushed to Turso
- **Admin PIN** — rotate `VITE_CLINICAL_ADMIN_PIN` periodically; redeploy to update
- **Turso token** — use a database-scoped token, not a root/org token
- **REDCap token** — lives only in Cloudflare Worker secrets, never in the browser bundle
- **Idle reset** — 90 s of inactivity triggers a 15 s countdown then full reset, protecting the next patient's privacy
