// Logo.jsx — Sentinel AI brand mark v3
// Precisely matches the approved fragmented-hexagon mockup:
//   • Flat-top hexagon (horizontal top/bottom edges, pointed left/right vertices)
//   • Z-shaped zig-zag fracture from top edge to bottom edge
//   • Thin amber scan line at vertical midpoint
//   • Bold wordmark to the right
//
// Props:
//   height       – rendered height in px  (width auto-scales via viewBox aspect ratio)
//   showWordmark – show "Sentinel AI" text (default: true)
//   className    – passthrough className

import { useId } from 'react';

export default function Logo({ height = 48, showWordmark = true, className = '' }) {
  // useId() can contain colons which are invalid in SVG id values — strip them.
  const uid    = useId().replace(/:/g, '');
  const clipId = `sai-hex-${uid}`;

  // ── FLAT-TOP HEXAGON ─────────────────────────────────────────────────
  // Center (50, 50), radius 43 in a 100×100 coordinate space.
  // Flat-top vertices (clockwise from top-left):
  //   Top-left    (50 − 43/2,  50 − 43·√3/2) = (28.5, 12.8) → (29, 13)
  //   Top-right   (50 + 43/2,  50 − 43·√3/2) = (71.5, 12.8) → (72, 13)
  //   Right       (50 + 43,    50)             = (93,   50)
  //   Bottom-right(71.5,        87.2)          → (72,   87)
  //   Bottom-left (28.5,        87.2)          → (29,   87)
  //   Left        (50 − 43,    50)             = ( 7,   50)
  const HEX = '29,13 72,13 93,50 72,87 29,87 7,50';

  // ── Z-CRACK GEOMETRY ─────────────────────────────────────────────────
  // Segment 1 (top→right):   (38,13) → (58,40)  — down-right
  // Segment 2 (right→left):  (58,40) → (30,61)  — down-left  (the long zig)
  // Segment 3 (left→bottom): (30,61) → (46,87)  — down-right
  const CRACK = '38,13 58,40 30,61 46,87';

  // ── VIEWBOX ──────────────────────────────────────────────────────────
  // Icon-only → 100×100 square; with wordmark → widen to fit text.
  const vbW = showWordmark ? 340 : 100;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${vbW} 100`}
      height={height}
      width="auto"
      fill="none"
      className={className}
      aria-label="Sentinel AI"
      role="img"
    >
      <defs>
        {/* Clip everything drawn over the hex to stay inside its boundary */}
        <clipPath id={clipId}>
          <polygon points={HEX} />
        </clipPath>
      </defs>

      {/* ── HEXAGON FILL ─────────────────────────────────────────────── */}
      <polygon points={HEX} fill="#f59e0b" />

      {/* ── FRACTURE + SCAN LINE (clipped inside hex) ────────────────── */}
      <g clipPath={`url(#${clipId})`}>

        {/* Z-shaped crack: three connected segments forming a lightning-bolt */}
        <polyline
          points={CRACK}
          stroke="#111318"
          strokeWidth="5.5"
          strokeLinecap="butt"
          strokeLinejoin="miter"
          strokeMiterlimit="10"
          fill="none"
        />

        {/* Horizontal amber scan line at vertical midpoint (y = 50) */}
        <line
          x1="7"  y1="50"
          x2="93" y2="50"
          stroke="#ffe380"
          strokeWidth="1.5"
          opacity="0.8"
        />

      </g>

      {/* ── WORDMARK ─────────────────────────────────────────────────── */}
      {showWordmark && (
        <text
          x="110"
          y="66"
          fontFamily="'Inter', 'Segoe UI', 'Helvetica Neue', sans-serif"
          fontSize="38"
          fontWeight="700"
          fill="#f59e0b"
          letterSpacing="-0.5"
        >
          Sentinel AI
        </text>
      )}
    </svg>
  );
}
