# ePSA Screening Tool

Clinical kiosk application for community prostate cancer screening events. Runs on tablets at point-of-care; no Firebase or cloud auth required.

Built by the Urology AI Lab, Icahn School of Medicine at Mount Sinai — Ashutosh K. Tewari, MD.

---

## What it does

**Kiosk (`/`)** — Patient-facing Part 1 questionnaire (demographics, family history, symptoms). PSA is not collected at the event. On completion, the patient receives a printed card with an `EP-YYYYMMDD-XXXX` reference code. The session is saved on the device only — nothing is uploaded.

**Admin (`/admin`)** — PIN-gated staff portal. Staff can:
- View all saved sessions
- Enter PSA + PI-RADS results once lab values return (stored against the EP ref on the device)
- Export sessions as JSON
- Download a **REDCap CSV** of consented sessions and upload it with REDCap's Data Import Tool

---

## Architecture

```
Browser (kiosk / tablet)
│
├── Part 1 form → localStorage (this device only)
└── /admin → "REDCap CSV" download → staff upload via REDCap Data Import Tool
```

There is no cloud database, no proxy and no REDCap API token. The browser
makes no network calls beyond Mount Sinai Entra sign-in for `/admin`
(enforced by `test/noUpload.test.mjs` and the page CSP).

---

## Environment variables

| Variable | Description |
|---|---|
| `VITE_AZURE_CLIENT_ID` / `VITE_AZURE_TENANT_ID` | Entra app registration for `/admin` sign-in (public identifiers) |

---

## REDCap import

1. In `/admin` → Saved Sessions, click **REDCap CSV**. The first click exports
   consented sessions not yet exported; when none are new it re-exports all
   consented sessions. Sessions where the patient declined are never included.
2. In REDCap: **Applications → Data Import Tool**, upload the CSV, review, import.
   Columns match `redcap_data_dictionary_clinical_mode.csv`; `record_id` is the
   `EP-` session ref, so re-importing updates the same record.

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
- **Consent gate** — sessions with `consented: false` are never included in the REDCap export
- **Admin PIN** — rotate `VITE_CLINICAL_ADMIN_PIN` periodically; redeploy to update
- **No cloud storage** — sessions never leave the device except as a CSV staff download and import into REDCap
- **Idle reset** — 90 s of inactivity triggers a 15 s countdown then full reset, protecting the next patient's privacy
