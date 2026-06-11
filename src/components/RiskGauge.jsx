import React, { useState, useEffect } from 'react';

/* ─── Shared PSA Testing Priority Gauge ───
 * Used by Part 1 and Part 2 results to show PSA testing priority.
 * Props:
 *   score      — 0-100 numeric; controls needle position
 *   tierKey    — 'low' | 'intermediate' | 'elevated' (active arc)
 *   tierLabel  — caption shown below the gauge
 *   tiers      — optional [{ key, label, color }] overrides
 */
const DEFAULT_TIERS = [
  { key: 'low',          label: 'Lower Priority',      color: '#16a34a' },
  { key: 'intermediate', label: 'Consider Discussion', color: '#2563eb' },
  { key: 'elevated',     label: 'Strong Candidate',    color: '#b45309' }, // darkened from #d97706 for WCAG AA contrast
];

const RiskGauge = ({ score, tierKey, tierLabel, tiers = DEFAULT_TIERS }) => {
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

  const trackColor = '#e2eaf2';
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

        {/* Track */}
        <path d={arcPath(182, -2)} fill="none" stroke={trackColor} strokeWidth={strokeW + 6} strokeLinecap="butt" />

        {/* Glow halo behind active arc */}
        {isLow  && <path d={arcPath(180, 122)} fill="none" stroke={low.color}  strokeWidth={strokeW + 10} strokeLinecap="butt" opacity="0.18" />}
        {isMid  && <path d={arcPath(118, 62)}  fill="none" stroke={mid.color}  strokeWidth={strokeW + 10} strokeLinecap="butt" opacity="0.18" />}
        {isHigh && <path d={arcPath(58, 0)}    fill="none" stroke={high.color} strokeWidth={strokeW + 10} strokeLinecap="butt" opacity="0.18" />}

        {/* Arc segments */}
        <path d={arcPath(180, 122)} fill="none" stroke={low.color}  strokeWidth={strokeW} strokeLinecap="butt"
          opacity={isLow  ? '1' : '0.28'}
          style={{ transition: 'opacity 0.5s ease' }} />
        <path d={arcPath(118, 62)}  fill="none" stroke={mid.color}  strokeWidth={strokeW} strokeLinecap="butt"
          opacity={isMid  ? '1' : '0.28'}
          style={{ transition: 'opacity 0.5s ease' }} />
        <path d={arcPath(58, 0)}    fill="none" stroke={high.color} strokeWidth={strokeW} strokeLinecap="butt"
          opacity={isHigh ? '1' : '0.28'}
          style={{ transition: 'opacity 0.5s ease' }} />

        {/* Needle shadow + needle */}
        <g
          style={{
            transform: `rotate(${svgRotate}deg)`,
            transformOrigin: `${cx}px ${cy}px`,
            transition: 'transform 2.5s cubic-bezier(0.34, 1.3, 0.64, 1)',
          }}
        >
          <line x1={cx} y1={cy + 2} x2={cx} y2={cy - needleLen + 2} stroke="rgba(0,0,0,0.10)" strokeWidth="4" strokeLinecap="round" />
          <line x1={cx} y1={cy}     x2={cx} y2={cy - needleLen}       stroke="#1e3a5f"          strokeWidth="3" strokeLinecap="round" />
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
        <circle cx={cx} cy={cy} r="8" fill="#1e3a5f" />
        <circle cx={cx} cy={cy} r="4.5" fill="#fff" />
      </svg>

      {/* Tier labels — staggered fade-in */}
      <div className="risk-gauge-labels">
        {tiers.map((t, i) => (
          <span
            key={t.key}
            className={`risk-gauge-range-pill ${tierKey === t.key ? 'risk-gauge-range-pill--active' : ''}`}
            style={{
              color: t.color,
              opacity: labelsIn ? undefined : 0,
              transition: `opacity 0.4s ease ${0.5 + i * 0.1}s`,
            }}
          >
            {t.label}
          </span>
        ))}
      </div>

      <figcaption className="risk-gauge-caption" style={{ color: activeColor }}>{caption}</figcaption>
    </figure>
  );
};

export default RiskGauge;
