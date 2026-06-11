/**
 * Programmatic jsPDF generators for:
 *   1. QR Code Poster  — generateQrPosterPdf()
 *   2. Clinical Screening Form — generateClinicalFormPdf()
 *
 * Both produce a single letter-size (612 × 792 pt) page.
 */

import QRCode from 'qrcode';
import jsPDF from 'jspdf';

// ── Brand palette ──────────────────────────────────────────────────────────
const NAVY   = [33,  32, 112];   // #212070 MS navy
const CYAN   = [6,  171, 235];   // #06ABEB MS cyan
const DARK   = [0,    0,  45];   // #00002D near-black
const GRAY   = [110, 110, 119];  // #6E6E77
const LGRAY  = [232, 232, 234];  // #E8E8EA line colour
const WHITE  = [255, 255, 255];
const CYANLT = [232, 247, 253];  // #E8F7FD cyan-10

const APP_URL = (() => {
  if (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_PUBLIC_APP_URL)
    return `${import.meta.env.VITE_PUBLIC_APP_URL.replace(/\/$/, '')}/?mode=bus`;
  if (typeof window !== 'undefined' && window?.location?.origin) {
    const o = window.location.origin;
    if (!o.includes('localhost') && !o.includes('127.0.0.1')) return `${o}/?mode=bus`;
  }
  return 'https://epsa.millionstrongmen.com/?mode=bus';
})();

// ── Helpers ────────────────────────────────────────────────────────────────

async function loadImageAsDataUrl(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

function setColor(doc, rgb, type = 'text') {
  if (type === 'text') doc.setTextColor(...rgb);
  else if (type === 'fill') doc.setFillColor(...rgb);
  else doc.setDrawColor(...rgb);
}

// Draw a filled rounded rectangle
function roundRect(doc, x, y, w, h, r, fillRgb, strokeRgb) {
  if (fillRgb) { setColor(doc, fillRgb, 'fill'); }
  if (strokeRgb) { setColor(doc, strokeRgb, 'draw'); }
  const style = fillRgb && strokeRgb ? 'FD' : fillRgb ? 'F' : 'S';
  doc.roundedRect(x, y, w, h, r, r, style);
}

// Draw a radio circle + label
function radioOption(doc, x, y, label, r = 3.5) {
  setColor(doc, LGRAY, 'draw');
  doc.setLineWidth(0.8);
  doc.circle(x + r, y - r * 0.4, r, 'S');
  setColor(doc, DARK, 'text');
  doc.text(label, x + r * 2 + 4, y);
}

// Draw a text input underline
function inputLine(doc, x, y, w) {
  setColor(doc, LGRAY, 'draw');
  doc.setLineWidth(0.75);
  doc.line(x, y, x + w, y);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. QR POSTER
// ─────────────────────────────────────────────────────────────────────────────
export async function generateQrPosterPdf() {
  const doc = new jsPDF('portrait', 'pt', 'letter');
  const W = 612, H = 792;

  const [logoData, qrData] = await Promise.all([
    loadImageAsDataUrl('/sinai_dark.png'),
    QRCode.toDataURL(APP_URL, {
      width: 600, margin: 1, errorCorrectionLevel: 'H',
      color: { dark: '#212070', light: '#ffffff' },
    }),
  ]);

  // ── Navy header band ──────────────────────────────────────────────────────
  setColor(doc, NAVY, 'fill');
  doc.rect(0, 0, W, 152, 'F');

  if (logoData) {
    // Inverted logo (white) on navy — draw and tint white via blend
    doc.addImage(logoData, 'PNG', 30, 16, 108, 36);
  }

  setColor(doc, WHITE, 'text');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('MILLION STRONG MEN INITIATIVE', W / 2, 24, { align: 'center' });

  doc.setFontSize(56);
  doc.text('ePSA', W / 2, 88, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.text('Electronic Prostate Specific Awareness', W / 2, 112, { align: 'center' });

  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255, 0.65);
  doc.text('Icahn School of Medicine at Mount Sinai', W / 2, 132, { align: 'center' });

  // Thin accent line at bottom of header
  setColor(doc, CYAN, 'fill');
  doc.rect(0, 148, W, 4, 'F');

  // ── Headline ──────────────────────────────────────────────────────────────
  setColor(doc, DARK, 'text');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.text('Free Prostate Cancer Screening', W / 2, 186, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  setColor(doc, GRAY, 'text');
  doc.text('Take our 12-question risk assessment — it takes about 1 minute.', W / 2, 208, { align: 'center' });

  // ── QR code ───────────────────────────────────────────────────────────────
  const QR = 210;
  const qx = (W - QR) / 2, qy = 228;

  // White card with subtle border
  roundRect(doc, qx - 16, qy - 16, QR + 32, QR + 32, 12, WHITE, LGRAY);
  doc.addImage(qrData, 'PNG', qx, qy, QR, QR);

  // ── Scan label ────────────────────────────────────────────────────────────
  setColor(doc, NAVY, 'text');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Scan with your phone camera to begin', W / 2, 476, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setColor(doc, GRAY, 'text');
  doc.text(APP_URL, W / 2, 494, { align: 'center' });

  // ── Services strip ────────────────────────────────────────────────────────
  const SY = 514;
  setColor(doc, CYANLT, 'fill');
  doc.rect(0, SY, W, 44, 'F');
  setColor(doc, [194, 234, 250], 'draw');
  doc.setLineWidth(0.75);
  doc.line(0, SY, W, SY);
  doc.line(0, SY + 44, W, SY + 44);

  setColor(doc, [5, 144, 199], 'text');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('PSA Blood Test   ·   Bladder Health Scan   ·   Nurse Consultation', W / 2, SY + 27, { align: 'center' });

  // ── Footer ────────────────────────────────────────────────────────────────
  const FY = 578;
  setColor(doc, DARK, 'text');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Walk-ins welcome · No appointment needed', W / 2, FY, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Questions? Call 646-531-8092', W / 2, FY + 20, { align: 'center' });

  // Thin rule
  setColor(doc, LGRAY, 'draw');
  doc.setLineWidth(0.5);
  doc.line(72, FY + 34, W - 72, FY + 34);

  // ── Disclaimer ────────────────────────────────────────────────────────────
  setColor(doc, GRAY, 'text');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(
    'ePSA is a screening aid developed at Icahn School of Medicine at Mount Sinai. Not a diagnosis. Results should be discussed with a physician.',
    W / 2, FY + 50, { align: 'center', maxWidth: 480 },
  );
  doc.text('AUA/SUO 2026 · NCCN 2024 · Mount Sinai IRB Study STUDY-14-00050', W / 2, FY + 62, { align: 'center' });

  // ── Bottom institution strip ───────────────────────────────────────────────
  setColor(doc, NAVY, 'fill');
  doc.rect(0, H - 30, W, 30, 'F');
  setColor(doc, WHITE, 'text');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Icahn School of Medicine at Mount Sinai — Urology Department', W / 2, H - 11, { align: 'center' });

  doc.save('ePSA-QR-Poster.pdf');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. CLINICAL SCREENING FORM
// ─────────────────────────────────────────────────────────────────────────────
export async function generateClinicalFormPdf() {
  const doc = new jsPDF('portrait', 'pt', 'letter');
  const W = 612, H = 792;
  const ML = 36, MR = 36;  // margins
  const CW = (W - ML - MR - 24) / 2;  // column width (gap = 24)
  const COL_R = ML + CW + 24;           // right column x

  const [logoData, qrData] = await Promise.all([
    loadImageAsDataUrl('/sinai_dark.png'),
    QRCode.toDataURL(APP_URL, {
      width: 200, margin: 1, errorCorrectionLevel: 'M',
      color: { dark: '#212070', light: '#ffffff' },
    }),
  ]);

  // ── Navy header band ──────────────────────────────────────────────────────
  setColor(doc, NAVY, 'fill');
  doc.rect(0, 0, W, 72, 'F');
  setColor(doc, CYAN, 'fill');
  doc.rect(0, 68, W, 4, 'F');

  if (logoData) doc.addImage(logoData, 'PNG', ML, 14, 90, 30);

  setColor(doc, WHITE, 'text');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('ePSA Clinical Screening Form', W / 2, 34, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Quick-Entry Prostate Cancer Risk Assessment · Icahn School of Medicine at Mount Sinai', W / 2, 52, { align: 'center' });

  // ── Patient info bar ──────────────────────────────────────────────────────
  const PIY = 78;
  setColor(doc, [245, 245, 247], 'fill');
  doc.rect(0, PIY, W, 28, 'F');
  setColor(doc, LGRAY, 'draw');
  doc.setLineWidth(0.5);
  doc.line(0, PIY + 28, W, PIY + 28);

  setColor(doc, DARK, 'text');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Patient / Participant:', ML, PIY + 11);
  inputLine(doc, ML + 92, PIY + 13, 140);

  doc.text('Date:', ML + 250, PIY + 11);
  inputLine(doc, ML + 268, PIY + 13, 80);

  doc.text('Clinician:', ML + 370, PIY + 11);
  inputLine(doc, ML + 408, PIY + 13, 90);

  // QR code (small, top-right corner of header region) — for patients to scan
  const QR_SM = 50;
  doc.addImage(qrData, 'PNG', W - MR - QR_SM, PIY + 33, QR_SM, QR_SM);
  setColor(doc, GRAY, 'text');
  doc.setFontSize(6);
  doc.text('Scan to use\non your phone', W - MR - QR_SM - 2, PIY + 46, { align: 'right' });

  // ── Layout helpers ────────────────────────────────────────────────────────
  const OPT_INDENT = 8;
  const OPT_H = 11;     // height per option line
  const Q_GAP = 7;      // gap between questions
  const SEC_H = 16;     // section header height
  const Q_LABEL_H = 11; // question label height
  const INPUT_H = 16;   // height of a text input field

  // Section label
  function sectionLabel(x, y, text) {
    setColor(doc, NAVY, 'fill');
    doc.rect(x, y, CW, SEC_H, 'F');
    setColor(doc, WHITE, 'text');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text(text.toUpperCase(), x + 4, y + 10.5);
    return y + SEC_H + 4;
  }

  // Question with options (vertical list of radio buttons)
  function question(x, y, num, label, options) {
    setColor(doc, DARK, 'text');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(`${num}.`, x, y);
    doc.text(label, x + 12, y);

    setColor(doc, DARK, 'text');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    let oy = y + Q_LABEL_H + 1;
    for (const opt of options) {
      radioOption(doc, x + OPT_INDENT, oy, opt);
      oy += OPT_H;
    }
    return oy + Q_GAP;
  }

  // Question with text input line
  function questionInput(x, y, num, label, placeholder = '') {
    setColor(doc, DARK, 'text');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(`${num}.`, x, y);
    doc.text(label, x + 12, y);

    if (placeholder) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      setColor(doc, GRAY, 'text');
      doc.text(placeholder, x + OPT_INDENT, y + Q_LABEL_H + 3);
    }
    inputLine(doc, x + OPT_INDENT, y + Q_LABEL_H + INPUT_H, CW - OPT_INDENT - 4);
    return y + Q_LABEL_H + INPUT_H + Q_GAP + 4;
  }

  // ── LEFT COLUMN ───────────────────────────────────────────────────────────
  let ly = 114;

  ly = sectionLabel(ML, ly, 'About You');

  ly = questionInput(ML, ly, 1, 'Age', 'years (18 – 99)');

  ly = question(ML, ly, 2, 'Race / Ethnicity', [
    'Black / African American',
    'American Indian / Alaska Native',
    'Asian',
    'Native Hawaiian / Pacific Islander',
    'White',
    'Unknown / Prefer not to say',
  ]);

  ly = question(ML, ly, '2b', 'Hispanic / Latino origin', [
    'Yes — Hispanic / Latino',
    'Not Hispanic / Latino',
    'Unknown',
  ]);

  ly = sectionLabel(ML, ly, 'Family & Genetic Risk');

  ly = question(ML, ly, 3, 'First-degree family history of prostate cancer', [
    'No first-degree relatives',
    'One first-degree relative',
    'Two or more relatives',
    'Unknown',
  ]);

  ly = question(ML, ly, 12, 'Germline / BRCA genetic mutation', [
    'No known mutation',
    'Yes — BRCA1, BRCA2, ATM, Lynch, or other',
    'Unknown / Not tested',
  ]);

  ly = sectionLabel(ML, ly, 'Body Measurements');

  ly = questionInput(ML, ly, 5, 'Height', '_____ ft  _____ in    OR    _____ cm');
  questionInput(ML, ly, 6, 'Weight', '_____ lbs    OR    _____ kg');

  // ── RIGHT COLUMN ──────────────────────────────────────────────────────────
  let ry = 114;

  ry = sectionLabel(COL_R, ry, 'Urinary Symptoms');

  ry = question(COL_R, ry, 4, 'Urinary quality of life (IPSS-QoL)', [
    '0 — Delighted',
    '1 — Pleased',
    '2 — Mostly satisfied',
    '3 — Mixed feelings',
    '4 — Mostly dissatisfied',
    '5 — Unhappy',
    '6 — Terrible',
  ]);

  ry = sectionLabel(COL_R, ry, 'Lifestyle');

  ry = question(COL_R, ry, 7, 'Exercise frequency', [
    'Regular (≥ 3×/week)',
    'Some (1 – 2×/week)',
    'Little or none',
  ]);

  ry = question(COL_R, ry, 8, 'Smoking history', [
    'Never smoked',
    'Former smoker',
    'Current smoker',
  ]);

  ry = question(COL_R, ry, 9, 'Dietary pattern', [
    'Western',
    'Mediterranean',
    'Indian / South Asian',
    'DASH',
    'Plant-based / Vegan',
    'Pescatarian',
    'Low-carb / Keto',
    'Other',
  ]);

  ry = sectionLabel(COL_R, ry, 'Health History');

  ry = question(COL_R, ry, 10, 'Major comorbidities (HTN, hyperlipidemia, CAD, DM)', [
    'None',
    'One condition',
    'Two or more',
  ]);

  question(COL_R, ry, 11, 'Erectile function — SHIM/IIEF-5', [
    'Severe dysfunction',
    'Moderate dysfunction',
    'Mild-to-moderate',
    'Mild dysfunction',
    'No dysfunction',
  ]);

  // ── Vertical divider between columns ─────────────────────────────────────
  setColor(doc, LGRAY, 'draw');
  doc.setLineWidth(0.5);
  doc.line(ML + CW + 12, 114, ML + CW + 12, H - 32);

  // ── Footer ────────────────────────────────────────────────────────────────
  setColor(doc, NAVY, 'fill');
  doc.rect(0, H - 24, W, 24, 'F');
  setColor(doc, WHITE, 'text');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(
    'Educational use only · Not a substitute for physician evaluation · AUA/SUO 2026 · NCCN 2024 · epsa.millionstrongmen.com',
    W / 2, H - 8, { align: 'center' },
  );

  doc.save('ePSA-Clinical-Screening-Form.pdf');
}
