import React, { useState, useEffect } from 'react';

/* ─── Shared PSA Testing Priority Gauge ───
 * Used to show PSA testing priority.
 * Canonical source: e-psa/frontend/src/components/RiskGauge.jsx — mirror
 * any change there (Phase 2 shared-component audit).
 *
 * Props:
 *   score      — 0-100 numeric; controls needle position
 *   tierKey    — 'low' | 'intermediate' | 'elevated' (active arc)
 *   tierLabel  — caption shown below the gauge
 *   tiers      — optional [{ key, label, color }] overrides
 *   showCaption — when true (the default), also renders the big
 *     plain-language result badge above the tier legend.
 *
 * Tier colors intentionally match the --risk-lower/--risk-moderate/
 * --risk-higher tokens in App.css (and the guideline banners elsewhere on
 * the results screens), so the whole page tells one consistent
 * green → amber → red story at a glance.
 */
const DEFAULT_TIERS = [
  { key: 'low',          label: 'Lower Priority',      color: '#1B7A4A' },
  { key: 'intermediate', label: 'Consider Discussion', color: '#C97B00' },
  { key: 'elevated',     label: 'Strong Candidate',    color: '#C0392B' },
];

const RiskGauge = ({ score, tierKey, tierLabel, tiers = DEFAULT_TIERS, showCaption = true }) => {
  const [animScore, setAnimScore] = useState(0);
  const [ripple, setRipple]       = useState(false);
  const [labelsIn, setLabelsIn]   = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setAnimScore(score), 60);
    // Needle animation is 2.5s + 60ms delay; fire ripple just after it settles
    const t2 = setTimeout(() => setRipple(true),  2700);
    const t3 = setTimeout(() => setRipple(false), 3400);
    // Labels fade in after the arc is visible
    const t4 = setTimeout(() => setLabelsIn(true), 400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [score]);

  const cx = 140, cy = 130, r = 100, strokeW = 22;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const arcPath = (startDeg, endDeg) => {
    const x1 = cx + r * Math.cos(toRad(startDeg));
    const y1 = cy - r * Math.sin(toRad(startDeg));
    const x2 = cx + r * Math.cos(toRad(endDeg));
    const y2 = cy - r * Math.sin(toRad(endDeg));
    const large = Math.abs(startDeg - endDeg) > 180 ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 0 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };

  const needleLen = r - strokeW - 2;
  const clampedAnim = Math.min(100, Math.max(0, Number(animScore) || 0));
  const svgRotate = (clampedAnim / 100) * 180 - 90;

  // Theme-neutral translucent track: light enough not to muddy the color
  // bands, but visible on both light and dark surfaces.
  const trackColor = 'rgba(148, 163, 184, 0.30)';
  const [low, mid, high] = tiers;
  const activeColor =
    tierKey === low.key  ? low.color  :
    tierKey === high.key ? high.color :
    mid.color;
  const caption = tierLabel || 'Risk';

  const isLow  = tierKey === low.key;
  const isMid  = tierKey === mid.key;
  const isHigh = tierKey === high.key;

  return (
    <figure className="risk-gauge-figure" aria-label={`PSA testing priority: ${caption}`}>
      <svg viewBox="0 0 280 145" xmlns="http://www.w3.org/2000/svg" className="risk-gauge-svg" aria-hidden="true">

        {/* Track — same angular range and rounded caps as the color bands
            drawn on top of it, so no mismatched edges peek out. */}
        <path d={arcPath(180, 0)} fill="none" stroke={trackColor} strokeWidth={strokeW} strokeLinecap="round" />

        {/* Glow halo behind active arc */}
        {isLow  && <path d={arcPath(180, 123)} fill="none" stroke={low.color}  strokeWidth={strokeW + 10} strokeLinecap="round" opacity="0.18" />}
        {isMid  && <path d={arcPath(119, 61)}  fill="none" stroke={mid.color}  strokeWidth={strokeW + 10} strokeLinecap="round" opacity="0.18" />}
        {isHigh && <path d={arcPath(57, 0)}    fill="none" stroke={high.color} strokeWidth={strokeW + 10} strokeLinecap="round" opacity="0.18" />}

        {/* Arc segments — rounded caps read as a friendlier, less "clinical dial" shape */}
        <path d={arcPath(180, 123)} fill="none" stroke={low.color}  strokeWidth={strokeW} strokeLinecap="round"
          opacity={isLow  ? '1' : '0.32'}
          style={{ transition: 'opacity 0.5s ease' }} />
        <path d={arcPath(119, 61)}  fill="none" stroke={mid.color}  strokeWidth={strokeW} strokeLinecap="round"
          opacity={isMid  ? '1' : '0.32'}
          style={{ transition: 'opacity 0.5s ease' }} />
        <path d={arcPath(57, 0)}    fill="none" stroke={high.color} strokeWidth={strokeW} strokeLinecap="round"
          opacity={isHigh ? '1' : '0.32'}
          style={{ transition: 'opacity 0.5s ease' }} />

        {/* Needle shadow + needle — colored to match the tier it points into */}
        <g
          style={{
            transform: `rotate(${svgRotate}deg)`,
            transformOrigin: `${cx}px ${cy}px`,
            transition: 'transform 2.5s cubic-bezier(0.34, 1.3, 0.64, 1)',
          }}
        >
          <line x1={cx} y1={cy + 2} x2={cx} y2={cy - needleLen + 2} stroke="rgba(0,0,0,0.14)" strokeWidth="5" strokeLinecap="round" />
          <line x1={cx} y1={cy}     x2={cx} y2={cy - needleLen}       stroke={activeColor}     strokeWidth="3.5" strokeLinecap="round"
            style={{ transition: 'stroke 0.4s ease' }} />
        </g>

        {/* Hub ripple ring (fires after needle settles, scales from hub center) */}
        {ripple && (
          <circle cx={cx} cy={cy} r="10" fill="none" stroke={activeColor} strokeWidth="2.5"
            style={{
              animation: 'risk-gauge-ripple 0.65s ease-out both',
              transformOrigin: `${cx}px ${cy}px`,
            }} />
        )}

        {/* Hub */}
        <circle cx={cx} cy={cy} r="9" fill="#fff" stroke={activeColor} strokeWidth="2.5" style={{ transition: 'stroke 0.4s ease' }} />
        <circle cx={cx} cy={cy} r="3.5" fill={activeColor} style={{ transition: 'fill 0.4s ease' }} />
      </svg>

      {/* Big, plain-language result badge — the one thing a patient needs to
          read at a glance. Opt-in via showCaption (see prop docs above). */}
      {showCaption && (
        <figcaption className="risk-gauge-badge" style={{ background: `${activeColor}17`, color: activeColor, borderColor: `${activeColor}45` }}>
          {caption}
        </figcaption>
      )}

      {/* Tier legend — staggered fade-in; active tier gets a filled pill */}
      <div className="risk-gauge-labels">
        {tiers.map((t, i) => (
          <span
            key={t.key}
            className={`risk-gauge-range-pill ${tierKey === t.key ? 'risk-gauge-range-pill--active' : ''}`}
            style={{
              color: tierKey === t.key ? '#fff' : t.color,
              background: tierKey === t.key ? t.color : 'transparent',
              borderColor: t.color,
              opacity: labelsIn ? undefined : 0,
              transition: `opacity 0.4s ease ${0.5 + i * 0.1}s, background 0.3s ease, color 0.3s ease`,
            }}
          >
            {t.label}
          </span>
        ))}
      </div>
    </figure>
  );
};

export default RiskGauge;
