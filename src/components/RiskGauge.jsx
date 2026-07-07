import React, { useState, useEffect } from 'react';

export default function RiskGauge({ score = 0, size = 120, strokeWidth = 10 }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const r = (size / 2) - strokeWidth;
  const arcDeg = 240;
  const circumference = Math.PI * 2 * r;
  const arcLen = (arcDeg / 360) * circumference;
  const gapLen = circumference - arcLen;
  const fillPct = Math.min(score, 100) / 100;
  const fillLen = fillPct * arcLen;
  const dashOffset = arcLen - fillLen;

  const scoreColor = score >= 60 ? '#e5534b' : score >= 30 ? '#f0b429' : '#3fb950';
  const rotation = 150;
  const angleRad = ((rotation + fillPct * arcDeg) * Math.PI) / 180;
  const flareX = (size / 2) + r * Math.cos(angleRad);
  const flareY = (size / 2) + r * Math.sin(angleRad);

  const riskLabel = score >= 60 ? 'HIGH RISK' : score >= 30 ? 'MEDIUM RISK' : 'LOW RISK';

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size * 0.72 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
      >
        <defs>
          <filter id="score-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur-wide" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur-tight" />
            <feMerge>
              <feMergeNode in="blur-wide" />
              <feMergeNode in="blur-tight" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="flare-bloom" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="outer" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="inner" />
            <feMerge>
              <feMergeNode in="outer" />
              <feMergeNode in="inner" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="high-risk-grad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#991b1b" />
            <stop offset="50%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#f87171" />
          </linearGradient>
          <linearGradient id="med-risk-grad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#b45309" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
          <linearGradient id="low-risk-grad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#047857" />
            <stop offset="50%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
        </defs>
        <style>{`
          @keyframes shimmer-sweep {
            0%   { stroke-dashoffset: ${arcLen}; }
            100% { stroke-dashoffset: -${arcLen}; }
          }
          @keyframes shimmer-sweep-slow {
            0%   { stroke-dashoffset: ${arcLen * 0.6}; opacity: 0; }
            15%  { opacity: 1; }
            85%  { opacity: 0.6; }
            100% { stroke-dashoffset: -${arcLen * 1.4}; opacity: 0; }
          }
          @keyframes corona-pulse {
            0%, 100% { r: 5px;   opacity: 0.55; }
            40%       { r: 8px;   opacity: 0.90; }
            70%       { r: 6.5px; opacity: 0.75; }
          }
          @keyframes corona-outer-pulse {
            0%, 100% { r: 10px; opacity: 0.10; }
            50%       { r: 16px; opacity: 0.25; }
          }
          @keyframes halo-breathe {
            0%, 100% { opacity: 0.06; stroke-width: ${strokeWidth + 4}px; }
            50%       { opacity: 0.14; stroke-width: ${strokeWidth + 10}px; }
          }
        `}</style>
        
        {/* Track arc */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLen} ${gapLen}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
        />
        
        {/* Fill arc */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={`url(#${score >= 60 ? 'high-risk-grad' : score >= 30 ? 'med-risk-grad' : 'low-risk-grad'})`}
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLen} ${gapLen}`}
          strokeDashoffset={visible ? dashOffset : arcLen}
          strokeLinecap="round"
          filter="url(#score-glow)"
          transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)', transitionDelay: '150ms' }}
        />

        {/* Ambient halo */}
        {visible && (
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none"
            stroke={scoreColor}
            strokeDasharray={`${fillLen} ${gapLen + (arcLen - fillLen)}`}
            strokeLinecap="round"
            transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
            style={{
              animation: 'halo-breathe 4s ease-in-out infinite',
              filter: `blur(6px)`,
              opacity: 0.12,
              strokeWidth: strokeWidth + 8,
            }}
          />
        )}

        {/* Shimmers */}
        {visible && (
          <>
            <circle
              cx={size / 2} cy={size / 2} r={r}
              fill="none"
              stroke="rgba(255,255,255,0.30)"
              strokeWidth={strokeWidth - 4}
              strokeDasharray={`8 ${arcLen}`}
              strokeLinecap="round"
              transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
              style={{ animation: 'shimmer-sweep 2.6s linear infinite' }}
            />
            <circle
              cx={size / 2} cy={size / 2} r={r}
              fill="none"
              stroke={scoreColor}
              strokeWidth={strokeWidth + 2}
              strokeDasharray={`30 ${arcLen}`}
              strokeLinecap="round"
              transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
              filter="url(#score-glow)"
              style={{ animation: 'shimmer-sweep-slow 5s ease-in-out infinite' }}
            />
          </>
        )}

        {/* Flare */}
        {visible && (
          <>
            <circle
              cx={flareX}
              cy={flareY}
              fill={scoreColor}
              filter="url(#flare-bloom)"
              style={{ animation: 'corona-outer-pulse 3.5s ease-in-out infinite' }}
            />
            <circle
              cx={flareX}
              cy={flareY}
              fill="#ffffff"
              style={{ animation: 'corona-pulse 2s ease-in-out infinite' }}
            />
          </>
        )}
      </svg>

      {/* Internal Value Text Overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
        <span className="text-3xl font-black font-mono tracking-tight" style={{ color: scoreColor }}>
          {score}%
        </span>
        <span className="text-[7px] text-slate-550 font-bold uppercase tracking-widest mt-0.5">
          {riskLabel}
        </span>
      </div>
    </div>
  );
}
