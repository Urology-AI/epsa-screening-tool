import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { generateQrPosterPdf } from '../utils/generateClinicalPdfs';
import './QrCodePoster.css';

const APP_URL = (() => {
  if (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_PUBLIC_APP_URL)
    return `${import.meta.env.VITE_PUBLIC_APP_URL.replace(/\/$/, '')}/?mode=bus`;
  if (typeof window !== 'undefined' && window?.location?.origin) {
    const o = window.location.origin;
    if (!o.includes('localhost') && !o.includes('127.0.0.1')) return `${o}/?mode=bus`;
  }
  return 'https://epsa.millionstrongmen.com/?mode=bus';
})();

export default function QrCodePoster({ onBack }) {
  const canvasRef = useRef(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, APP_URL, {
      width: 280, margin: 2, errorCorrectionLevel: 'H',
      color: { dark: '#212070', light: '#ffffff' },
    });
  }, []);

  async function handleDownload() {
    setGenerating(true);
    try { await generateQrPosterPdf(); }
    finally { setGenerating(false); }
  }

  return (
    <div className="qrp-root">
      {/* screen-only toolbar */}
      <div className="qrp-toolbar no-print">
        <button type="button" className="qrp-back" onClick={onBack}>← Back</button>
        <button type="button" className="qrp-print-btn" onClick={handleDownload} disabled={generating}>
          {generating ? 'Generating…' : 'Download PDF Poster'}
        </button>
      </div>

      {/* preview poster */}
      <div className="qrp-poster">
        <div className="qrp-header">
          <img src="/sinai_dark.png" alt="Mount Sinai" className="qrp-logo"
            onError={e => { e.target.style.display = 'none'; }} />
          <div className="qrp-header-text">
            <div className="qrp-initiative">Million Strong Men Initiative</div>
            <div className="qrp-app-name">ePSA</div>
            <div className="qrp-tagline">Electronic Prostate Specific Awareness</div>
          </div>
        </div>

        <div className="qrp-body">
          <h1 className="qrp-headline">Free Prostate Cancer Screening</h1>
          <p className="qrp-sub">Take our 12-question risk assessment — it takes about 1 minute.</p>
          <div className="qrp-qr-wrap">
            <canvas ref={canvasRef} className="qrp-canvas" />
          </div>
          <p className="qrp-scan-label">Scan with your phone camera to begin</p>
          <p className="qrp-url">{APP_URL}</p>
        </div>

        <div className="qrp-services">
          <div className="qrp-service">PSA Blood Test</div>
          <div className="qrp-divider" />
          <div className="qrp-service">Bladder Health Scan</div>
          <div className="qrp-divider" />
          <div className="qrp-service">Nurse Consultation</div>
        </div>

        <div className="qrp-footer">
          <span>Walk-ins welcome · No appointment needed</span>
          <span className="qrp-footer-dot">·</span>
          <span>Questions? Call <strong>646-531-8092</strong></span>
        </div>

        <p className="qrp-disclaimer">
          ePSA is a screening aid developed at Icahn School of Medicine at Mount Sinai.
          Not a diagnosis. Results should be discussed with a physician. AUA/SUO 2026 · NCCN 2024.
        </p>
      </div>
    </div>
  );
}
