import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

function getKnotStyle(score) {
  const size = 8 + (score / 100) * 56; // 8px → 64px
  if (score >= 70) return { size, color: '#ef4444', glow: 'rgba(239,68,68,0.5)', rings: 3 };
  if (score >= 40) return { size, color: '#f59e0b', glow: 'rgba(245,158,11,0.35)', rings: 2 };
  return { size, color: '#334155', glow: 'rgba(51,65,85,0.2)', rings: 1 };
}

function Knot({ scan, yPos }) {
  const [hovered, setHovered] = useState(false);
  const score = scan.risk_score ?? 0;
  const k = getKnotStyle(score);
  const half = k.size / 2;

  return (
    <div
      className="absolute"
      style={{ top: `${yPos}px`, left: '50%', transform: 'translate(-50%, -50%)', zIndex: hovered ? 20 : 10 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Outer rings for high-risk knots (simulate tight winding) */}
      {k.rings >= 3 && (
        <div
          className="absolute rounded-full"
          style={{
            width: k.size + 12,
            height: k.size + 12,
            top: -6,
            left: -6,
            border: `1px solid ${k.color}`,
            opacity: 0.15,
          }}
        />
      )}
      {k.rings >= 2 && (
        <div
          className="absolute rounded-full"
          style={{
            width: k.size + 6,
            height: k.size + 6,
            top: -3,
            left: -3,
            border: `1px solid ${k.color}`,
            opacity: 0.25,
          }}
        />
      )}

      {/* Main knot */}
      <div
        style={{
          width: k.size,
          height: k.size,
          borderRadius: '50%',
          background: `radial-gradient(circle at 35% 35%, ${k.color}cc, ${k.color}66)`,
          boxShadow: hovered
            ? `0 0 ${k.size * 1.2}px ${k.glow}, 0 0 ${k.size * 0.4}px ${k.glow}`
            : `0 0 ${k.size * 0.4}px ${k.glow}`,
          border: `1px solid ${k.color}55`,
          transition: 'box-shadow 0.25s ease, transform 0.25s ease',
          transform: hovered ? 'scale(1.12)' : 'scale(1)',
          cursor: 'default',
        }}
      />

      {/* Inner highlight dot */}
      <div
        style={{
          position: 'absolute',
          width: Math.max(2, k.size * 0.22),
          height: Math.max(2, k.size * 0.22),
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.25)',
          top: k.size * 0.2,
          left: k.size * 0.25,
          pointerEvents: 'none',
        }}
      />

      {/* Tooltip */}
      {hovered && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: half + 16,
            top: -half,
            background: '#0a0c12',
            border: '1px solid rgba(100,116,139,0.25)',
            padding: '10px 14px',
            borderRadius: 4,
            minWidth: 200,
            maxWidth: 260,
          }}
        >
          <p
            className="font-mono text-[11px] font-bold truncate"
            style={{ color: '#cbd5e1' }}
          >
            {scan.job_title || 'Unknown Position'}
          </p>
          {scan.employer && (
            <p className="font-mono text-[9px] mt-0.5 truncate" style={{ color: '#64748b' }}>
              {scan.employer}
            </p>
          )}
          {scan.location_country && (
            <p className="font-mono text-[9px]" style={{ color: '#475569' }}>
              {scan.location_country}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-800">
            <span
              className="font-mono text-[9px] font-bold uppercase tracking-wider"
              style={{ color: k.color }}
            >
              {score}/100
            </span>
            <span className="font-mono text-[9px]" style={{ color: '#475569' }}>
              {scan.risk_level || '—'}
            </span>
          </div>
          {scan.timestamp && (
            <p className="font-mono text-[8px] mt-1" style={{ color: '#334155' }}>
              {new Date(scan.timestamp).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function RopeView() {
  const navigate = useNavigate();
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEnd, setShowEnd] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await supabase
          .from('scans')
          .select('id, timestamp, job_title, employer, risk_score, risk_level, location_country')
          .order('timestamp', { ascending: true });
        setScans(data || []);
      } catch (e) {
        console.warn('RopeView: could not load scans', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (loading || !endRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setShowEnd(true); },
      { threshold: 0.6 }
    );
    obs.observe(endRef.current);
    return () => obs.disconnect();
  }, [loading]);

  const SPACING = 90;
  const TOP_PADDING = 160;
  const BOTTOM_PADDING = 200;
  const totalHeight = TOP_PADDING + scans.length * SPACING + BOTTOM_PADDING;

  return (
    <div
      className="fixed inset-0 overflow-y-auto overflow-x-hidden"
      style={{ background: '#050709', fontFamily: 'monospace' }}
    >
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="fixed top-5 left-5 z-30 flex items-center gap-1.5 transition-colors text-[10px] uppercase tracking-widest"
        style={{ color: 'rgba(71,85,105,0.7)' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(148,163,184,0.9)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(71,85,105,0.7)')}
      >
        <ArrowLeft className="w-3 h-3" />
        Back
      </button>

      {/* Title */}
      <div className="fixed top-5 right-5 z-30 text-right pointer-events-none">
        <p className="text-[8px] uppercase tracking-widest" style={{ color: 'rgba(51,65,85,0.8)' }}>
          Arts Exhibition
        </p>
        <p className="text-[10px] mt-0.5" style={{ color: 'rgba(71,85,105,0.6)' }}>
          🪢 The Rope
        </p>
      </div>

      {loading ? (
        <div
          className="flex items-center justify-center h-screen text-[11px] uppercase tracking-widest"
          style={{ color: 'rgba(51,65,85,0.8)' }}
        >
          Loading…
        </div>
      ) : (
        <div className="relative mx-auto" style={{ width: '100%', height: `${totalHeight}px` }}>

          {/* Rope line — SVG full height */}
          <svg
            className="absolute inset-0 w-full pointer-events-none"
            style={{ height: '100%' }}
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Main rope strand */}
            <line
              x1="50%"
              y1="0"
              x2="50%"
              y2="100%"
              stroke="rgba(71,85,105,0.2)"
              strokeWidth="2"
            />
            {/* Slight twist texture */}
            <line
              x1="50%"
              y1="0"
              x2="50%"
              y2="100%"
              stroke="rgba(100,116,139,0.08)"
              strokeWidth="5"
              strokeDasharray="3 18"
              strokeDashoffset="0"
            />
          </svg>

          {/* Intro label */}
          <div
            className="absolute text-center pointer-events-none"
            style={{ top: 60, left: 0, right: 0 }}
          >
            <p
              className="text-[9px] uppercase tracking-[0.25em]"
              style={{ color: 'rgba(51,65,85,0.7)' }}
            >
              {scans.length} postings · oldest to newest · scroll down
            </p>
          </div>

          {/* Knots */}
          {scans.map((scan, i) => (
            <Knot
              key={scan.id}
              scan={scan}
              yPos={TOP_PADDING + i * SPACING}
            />
          ))}

          {/* End text */}
          <div
            ref={endRef}
            className="absolute text-center pointer-events-none"
            style={{
              bottom: 60,
              left: 0,
              right: 0,
              opacity: showEnd ? 1 : 0,
              transition: 'opacity 2.5s ease-in',
            }}
          >
            <div
              className="mx-auto mb-6"
              style={{
                width: 1,
                height: 40,
                background: 'rgba(71,85,105,0.2)',
              }}
            />
            <p
              className="text-[11px] uppercase tracking-[0.22em]"
              style={{ color: 'rgba(71,85,105,0.55)' }}
            >
              This rope has no end.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
