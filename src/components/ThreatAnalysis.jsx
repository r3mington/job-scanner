import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BrainCircuit } from 'lucide-react';

const BUBBLE_FLOAT_CLASSES = [
  'animate-[float_5s_ease-in-out_infinite]',
  'animate-[float_6s_ease-in-out_infinite]',
  'animate-[float_7s_ease-in-out_infinite]',
  'animate-[float_8s_ease-in-out_infinite]',
];

const CRITICAL_FLAGS = new Set([
  'Passport/ID Control',
  'Upfront Fees',
  'Immediate Travel Pressure',
  'Housing Compound Isolation',
  'Suspect Location Hub'
]);

const CARD_W = 218;
const CARD_H = 34;

function ThreatBubbles({ spans, showHighlights }) {
  if (!showHighlights || !spans || spans.length === 0) return null;
  const unique = Array.from(new Map(spans.map(s => [s.red_flag, s])).values());
  return (
    <div className="flex flex-wrap gap-2">
      {unique.map((span, i) => {
        const isHigh = CRITICAL_FLAGS.has(span.red_flag);
        return (
          <span
            key={span.red_flag}
            className={`${BUBBLE_FLOAT_CLASSES[i % BUBBLE_FLOAT_CLASSES.length]} inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full border cursor-default select-none bg-slate-900 text-slate-400 border-slate-700`}
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isHigh ? 'bg-red-500' : 'bg-amber-500'}`} />
            {span.red_flag}
          </span>
        );
      })}
    </div>
  );
}

function highlightWords(text, spans, showHighlights, isTranslationActive, hoveredKey, setHoveredKey) {
  if (!text) return '';
  if (!showHighlights || !spans || spans.length === 0) {
    return <span className="whitespace-pre-wrap select-text">{text}</span>;
  }

  const sortedSpans = [...spans]
    .map(span => ({
      snippet: isTranslationActive ? span.translated_snippet : span.original_snippet,
      flag: span.red_flag,
    }))
    .filter(s => s.snippet && s.snippet.trim().length > 0)
    .sort((a, b) => b.snippet.length - a.snippet.length);

  if (sortedSpans.length === 0) {
    return <span className="whitespace-pre-wrap select-text">{text}</span>;
  }

  const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = sortedSpans.map(s => `(${escapeRegExp(s.snippet)})`).join('|');
  if (!pattern) return <span className="whitespace-pre-wrap select-text">{text}</span>;

  const regex = new RegExp(pattern, 'gi');
  const parts = text.split(regex);
  if (parts.length <= 1) {
    return <span className="whitespace-pre-wrap select-text">{text}</span>;
  }

  const isAnyHovered = hoveredKey !== null;

  return (
    <span className="whitespace-pre-wrap select-text leading-7">
      {parts.map((part, index) => {
        if (!part) return null;
        const matchedSpan = sortedSpans.find(s => s.snippet.toLowerCase() === part.toLowerCase());
        if (matchedSpan) {
          const isHigh = CRITICAL_FLAGS.has(matchedSpan.flag);
          const isCurrentHovered = hoveredKey === matchedSpan.flag;
          
          let highlightClass = "";
          if (isAnyHovered) {
            if (isCurrentHovered) {
              highlightClass = isHigh
                ? 'text-white border-b-2 border-red-500 bg-transparent scale-[1.02] shadow-[0_0_12px_rgba(239,68,68,0.15)]'
                : 'text-white border-b-2 border-amber-500 bg-transparent scale-[1.02] shadow-[0_0_12px_rgba(245,158,11,0.12)]';
            } else {
              highlightClass = 'text-slate-650 border-transparent bg-transparent opacity-25';
            }
          } else {
            highlightClass = isHigh
              ? 'text-white border-b-2 border-red-500/80 bg-transparent'
              : 'text-white border-b border-amber-500/70 bg-transparent';
          }

          return (
            <span
              key={index}
              data-threat-key={matchedSpan.flag}
              onMouseEnter={() => setHoveredKey(matchedSpan.flag)}
              onMouseLeave={() => setHoveredKey(null)}
              className={`inline px-0.5 font-medium transition-all duration-200 cursor-pointer ${highlightClass}`}
            >
              {part}
            </span>
          );
        }
        return (
          <span
            key={index}
            className={`transition-all duration-200 ${isAnyHovered ? 'opacity-25 text-slate-650' : ''}`}
          >
            {part}
          </span>
        );
      })}
    </span>
  );
}

export default function ThreatAnalysis({
  originalText,
  ocrText,
  translatedText,
  normalizedTextVal,
  suspiciousSpans = [],
  detectedLanguage,
  isTranslated,
  showHighlights,
  setShowHighlights,
  activeTabInput,
  setActiveTabInput,
  hoveredKey,
  setHoveredKey
}) {
  const [annotationCards, setAnnotationCards] = useState([]);
  const [containerMinHeight, setContainerMinHeight] = useState(300);

  const textContainerRef = useRef(null);
  const cardsPhysicsRef = useRef([]);

  const computeAnnotations = useCallback(() => {
    const container = textContainerRef.current;
    if (!container || !showHighlights || activeTabInput === 'normalized') {
      setAnnotationCards([]);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const containerW = containerRect.width;

    const spanElements = container.querySelectorAll('[data-threat-key]');
    const raw = [];

    spanElements.forEach((el, index) => {
      const key = el.getAttribute('data-threat-key');
      const rect = el.getBoundingClientRect();
      const dotX = rect.left - containerRect.left + rect.width / 2;
      const dotY = rect.top - containerRect.top + rect.height / 2;
      const isHigh = CRITICAL_FLAGS.has(key);
      const span = suspiciousSpans.find(s => s.red_flag === key);

      raw.push({ key, uniqueKey: `${key}-${index}`, dotX, dotY, isHigh, span });
    });

    if (raw.length === 0) {
      setAnnotationCards([]);
      return;
    }

    const ys = raw.map(item => item.dotY - CARD_H / 2);
    let containerHeight = 350;

    for (let step = 0; step < 100; step++) {
      let shifted = false;
      const minDistance = CARD_H + 8;
      for (let i = 0; i < ys.length; i++) {
        for (let j = i + 1; j < ys.length; j++) {
          const dy = ys[j] - ys[i];
          const dist = Math.abs(dy);
          if (dist < minDistance) {
            const overlap = minDistance - dist;
            const push = overlap / 2;
            const dir = dy >= 0 ? 1 : -1;
            ys[j] += push * dir;
            ys[i] -= push * dir;
            shifted = true;
          }
        }
      }
      if (!shifted) break;
    }

    for (let i = 0; i < ys.length; i++) {
      if (ys[i] < 12) ys[i] = 12;
      const bottomBound = ys[i] + CARD_H + 12;
      if (bottomBound > containerHeight) {
        containerHeight = bottomBound;
      }
    }

    const positioned = raw.map((item, i) => {
      const cardY = ys[i];
      const cardX = Math.min(containerW * 0.65 + 16, containerW - CARD_W - 6);
      return { ...item, cardX, cardY, floatIdx: i };
    });

    setAnnotationCards(positioned);
    setContainerMinHeight(containerHeight);
  }, [suspiciousSpans, showHighlights, activeTabInput]);

  const handleDragStart = useCallback((key, event) => {
    if (event.target.closest('button, input, select, a')) return;
    event.preventDefault();

    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;

    const card = cardsPhysicsRef.current.find(c => c.key === key);
    if (!card) return;

    card.isDragging = true;
    card.dragStartX = clientX - card.x;
    card.dragStartY = clientY - card.y;

    const handleMouseMove = (e) => {
      const curX = e.touches ? e.touches[0].clientX : e.clientX;
      const curY = e.touches ? e.touches[0].clientY : e.clientY;
      card.x = curX - card.dragStartX;
      card.y = curY - card.dragStartY;
    };

    const handleMouseUp = () => {
      card.isDragging = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleMouseMove);
    window.addEventListener('touchend', handleMouseUp);
  }, []);

  useEffect(() => {
    cardsPhysicsRef.current = annotationCards.map(card => {
      const existing = cardsPhysicsRef.current.find(c => c.key === card.uniqueKey);
      return {
        key: card.uniqueKey,
        realKey: card.key,
        element: existing?.element || null,
        dotX: card.dotX,
        dotY: card.dotY,
        x: existing ? existing.x : card.cardX,
        y: existing ? existing.y : card.cardY,
        vx: existing ? existing.vx : 0,
        vy: existing ? existing.vy : 0,
        targetX: card.cardX,
        targetY: card.cardY,
        isDragging: existing ? existing.isDragging : false,
        dragStartX: existing ? existing.dragStartX : 0,
        dragStartY: existing ? existing.dragStartY : 0,
        isHigh: card.isHigh,
      };
    });
  }, [annotationCards]);

  useEffect(() => {
    let animId;
    const runPhysics = () => {
      const container = textContainerRef.current;
      if (!container) {
        animId = requestAnimationFrame(runPhysics);
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const containerW = containerRect.width;
      const containerH = containerMinHeight;

      const cards = cardsPhysicsRef.current;
      const numCards = cards.length;

      for (let i = 0; i < numCards; i++) {
        const card = cards[i];
        card.h = card.element ? card.element.offsetHeight : (card.realKey === hoveredKey ? 180 : 34);
      }

      const k = 0.08;
      const damping = 0.8;
      for (let i = 0; i < numCards; i++) {
        const card = cards[i];
        if (!card.isDragging) {
          const ax = (card.targetX - card.x) * k;
          const ay = (card.targetY - card.y) * k;
          card.vx = (card.vx + ax) * damping;
          card.vy = (card.vy + ay) * damping;
          card.x += card.vx;
          card.y += card.vy;
        } else {
          card.vx = 0;
          card.vy = 0;
        }
      }

      const minGapX = 12;
      const minGapY = 12;
      const boxW = CARD_W + minGapX;

      for (let step = 0; step < 4; step++) {
        for (let i = 0; i < numCards; i++) {
          for (let j = i + 1; j < numCards; j++) {
            const A = cards[i];
            const B = cards[j];

            const hA = A.h;
            const hB = B.h;

            const dx = B.x - A.x;
            const centerA_Y = A.y + hA / 2;
            const centerB_Y = B.y + hB / 2;
            const dy = centerB_Y - centerA_Y;

            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            const boxH = (hA + hB) / 2 + minGapY;

            if (absDx < boxW && absDy < boxH) {
              const overlapX = boxW - absDx;
              const overlapY = boxH - absDy;

              if (overlapX < overlapY) {
                const pushX = overlapX * 0.25;
                const dir = dx > 0 ? 1 : -1;
                if (!B.isDragging) B.x += pushX * dir * 0.5;
                if (!A.isDragging) A.x -= pushX * dir * 0.5;
              } else {
                const pushY = overlapY * 0.25;
                const dir = dy > 0 ? 1 : -1;
                if (!B.isDragging) B.y += pushY * dir * 0.5;
                if (!A.isDragging) A.y -= pushY * dir * 0.5;
              }
            }
          }
        }
      }

      const margin = 8;
      const maxX = containerW - CARD_W - margin;

      for (let i = 0; i < numCards; i++) {
        const card = cards[i];
        const hCard = card.h;
        const maxY = containerH - hCard - margin;

        if (card.x < margin) { card.x = margin; card.vx = 0; }
        if (card.x > maxX) { card.x = maxX; card.vx = 0; }
        if (card.y < margin) { card.y = margin; card.vy = 0; }
        if (card.y > maxY) { card.y = maxY; card.vy = 0; }

        if (card.element) {
          card.element.style.left = `${card.x}px`;
          card.element.style.top = `${card.y}px`;
        }

        const pathEl = document.getElementById(`path-${card.key}`);
        if (pathEl) {
          pathEl.setAttribute('d', `M ${card.dotX + 3},${card.dotY} C ${card.dotX + 40},${card.dotY} ${card.x - 40},${card.y + hCard / 2} ${card.x},${card.y + hCard / 2}`);
        }
      }

      animId = requestAnimationFrame(runPhysics);
    };

    animId = requestAnimationFrame(runPhysics);
    return () => cancelAnimationFrame(animId);
  }, [containerMinHeight, hoveredKey]);

  useEffect(() => {
    const t = setTimeout(computeAnnotations, 100);
    return () => clearTimeout(t);
  }, [computeAnnotations]);

  useEffect(() => {
    const el = textContainerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(computeAnnotations);
    obs.observe(el);
    return () => obs.disconnect();
  }, [computeAnnotations]);

  return (
    <div id="section-threat" data-nav-section className="scroll-mt-32 rounded overflow-hidden border border-slate-800" style={{ background: '#111318' }}>
      <div className="h-px bg-amber-500/60 w-full" />

      <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-200 flex items-center gap-2 text-sm tracking-tight">
            <BrainCircuit className="w-4 h-4 text-slate-500" />
            Threat Analysis
            {suspiciousSpans.length > 0 && (
              <span className="ml-1 text-[9px] font-mono font-semibold text-slate-400 border border-slate-700 px-1.5 py-0.5 rounded-sm tracking-wider">
                {suspiciousSpans.length} flagged
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Hover flagged phrases to view threat intelligence.</p>
        </div>

        <button
          onClick={() => setShowHighlights(prev => !prev)}
          className="text-[11px] font-semibold text-slate-400 hover:text-slate-200 transition-colors border border-slate-800 hover:border-slate-700 px-3 py-1.5 rounded"
        >
          {showHighlights ? 'Hide Highlights' : 'Show Highlights'}
        </button>
      </div>

      {suspiciousSpans.length > 0 && showHighlights && (
        <div className="border-b border-slate-800/60 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-3">Detected Threats</p>
          <ThreatBubbles spans={suspiciousSpans} showHighlights={showHighlights} />
        </div>
      )}

      <div className="border-b border-slate-800 px-4 py-2.5 flex flex-wrap gap-2 items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
          {isTranslated ? (
            <span className="flex items-center gap-1.5">
              <BrainCircuit className="w-3 h-3" />
              Translated from {detectedLanguage}
            </span>
          ) : (
            <span>Language: {detectedLanguage}</span>
          )}
        </div>
        <div className="flex bg-slate-900/60 border border-slate-800 p-0.5 rounded text-xs">
          {['original', ...(isTranslated ? ['translation'] : []), 'normalized'].map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTabInput(tab)}
              className={`px-3 py-1.5 rounded-sm font-semibold capitalize transition-all ${
                activeTabInput === tab
                  ? 'bg-slate-800 text-slate-200 shadow-sm'
                  : 'text-slate-500 hover:text-slate-400'
              }`}
            >
              {tab === 'translation' ? 'Translation' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={textContainerRef}
        className="relative rounded border border-slate-800/80 overflow-hidden"
        style={{
          minHeight: `${containerMinHeight}px`,
          background: '#10141f',
          backgroundImage: `repeating-linear-gradient(
            transparent,
            transparent 27px,
            rgba(255,255,255,0.032) 27px,
            rgba(255,255,255,0.032) 28px
          )`,
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04), inset 0 4px 20px rgba(0,0,0,0.4)',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 0,
            overflow: 'hidden',
          }}
        >
          <span style={{
            fontSize: '7rem',
            fontWeight: 900,
            fontFamily: 'monospace',
            letterSpacing: '0.25em',
            color: 'rgba(255,255,255,0.028)',
            transform: 'rotate(-30deg)',
            userSelect: 'none',
            whiteSpace: 'nowrap',
          }}>EXHIBIT</span>
        </div>

        <div style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: '2rem',
          width: '1px',
          background: 'rgba(239, 68, 68, 0.22)',
          pointerEvents: 'none',
          zIndex: 1,
        }} />

        <div className="relative w-[65%] pl-12 pr-6 py-5" style={{ zIndex: 2 }}>
          {activeTabInput === 'original' && (
            <div className="text-sm leading-7 whitespace-pre-wrap select-text font-mono text-slate-300">
              {highlightWords(originalText || ocrText || 'No input text provided.', suspiciousSpans, showHighlights, false, hoveredKey, setHoveredKey)}
            </div>
          )}
          {isTranslated && activeTabInput === 'translation' && (
            <div className="text-sm leading-7 whitespace-pre-wrap select-text font-mono text-slate-300">
              {highlightWords(translatedText || 'No translation available.', suspiciousSpans, showHighlights, true, hoveredKey, setHoveredKey)}
            </div>
          )}
          {activeTabInput === 'normalized' && (
            <div className="text-xs text-slate-500 font-mono leading-6 whitespace-pre-wrap select-text">
              {normalizedTextVal || 'No normalized text generated.'}
            </div>
          )}
        </div>

        {showHighlights && annotationCards.length > 0 && activeTabInput !== 'normalized' && (
          <>
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ overflow: 'visible', zIndex: 10 }}
            >
              <defs>
                <filter id="dot-glow" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              {annotationCards.map(card => {
                const isCurrentHovered = hoveredKey === card.key;
                const isAnyHovered = hoveredKey !== null;
                const strokeOpacity = isAnyHovered ? (isCurrentHovered ? 0.95 : 0.08) : 0.45;

                return (
                  <g
                    key={card.uniqueKey + '-svg'}
                    style={{ opacity: strokeOpacity, transition: 'opacity 0.25s ease' }}
                  >
                    <circle
                      cx={card.dotX} cy={card.dotY} r="8"
                      fill={card.isHigh ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.07)'}
                    />
                    <circle
                      cx={card.dotX} cy={card.dotY} r="5"
                      fill={card.isHigh ? 'rgba(239,68,68,0.14)' : 'rgba(245,158,11,0.12)'}
                    />
                    <circle
                      cx={card.dotX} cy={card.dotY} r="3"
                      fill={card.isHigh ? '#ef4444' : '#f59e0b'}
                      filter="url(#dot-glow)"
                    />
                    <path
                      id={`path-${card.uniqueKey}`}
                      d={`M ${card.dotX + 3},${card.dotY} C ${card.dotX + 40},${card.dotY} ${card.cardX - 40},${card.cardY + CARD_H / 2} ${card.cardX},${card.cardY + CARD_H / 2}`}
                      fill="none"
                      stroke={card.isHigh ? 'rgba(239,68,68,0.45)' : 'rgba(245,158,11,0.40)'}
                      strokeWidth="1.2"
                      strokeDasharray="3,4"
                      className="connector-dash"
                    />
                  </g>
                );
              })}
            </svg>

            {annotationCards.map(card => {
              const isCurrentHovered = hoveredKey === card.key;
              const isAnyHovered = hoveredKey !== null;
              const cardOpacity = isAnyHovered ? (isCurrentHovered ? 1.0 : 0.15) : 1.0;

              return (
                <div
                  key={card.uniqueKey}
                  data-card-key={card.key}
                  ref={el => {
                    const c = cardsPhysicsRef.current.find(p => p.key === card.uniqueKey);
                    if (c) c.element = el;
                  }}
                  onMouseDown={e => handleDragStart(card.uniqueKey, e)}
                  onTouchStart={e => handleDragStart(card.uniqueKey, e)}
                  onMouseEnter={() => setHoveredKey(card.key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  className={`annotation-card float-card-${card.floatIdx % 6} absolute cursor-grab active:cursor-grabbing select-none transition-all duration-200`}
                  style={{
                    left: card.cardX,
                    top: card.cardY,
                    width: CARD_W,
                    height: isCurrentHovered ? 'auto' : 34,
                    zIndex: isCurrentHovered ? 30 : 20,
                    opacity: cardOpacity,
                    filter: isAnyHovered && !isCurrentHovered ? 'grayscale(80%) opacity(70%)' : 'none'
                  }}
                >
                  <div className="absolute left-0 top-1/2 -translate-y-1/2" style={{ left: -7, zIndex: 1 }}>
                    <div className={`w-0 h-0 border-t-[7px] border-b-[7px] border-r-[8px] border-t-transparent border-b-transparent ${
                      card.isHigh ? 'border-r-red-500/30' : 'border-r-amber-500/25'
                    }`} />
                  </div>
                  <div className={`relative rounded-lg overflow-hidden shadow-2xl shadow-black/70 ring-1 ring-white/5 border-l-[3px] w-full h-full ${
                    card.isHigh ? 'border-l-red-500' : 'border-l-amber-400'
                  }`} style={{ background: 'linear-gradient(160deg, #0d1520 0%, #0a0f18 100%)' }}>
                    <div className={`px-3 pt-2.5 pb-2 ${
                      isCurrentHovered 
                        ? `border-b ${card.isHigh ? 'border-red-900/40' : 'border-amber-900/30'}`
                        : ''
                    }`}>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          card.isHigh ? 'bg-red-500' : 'bg-amber-400'
                        }`} />
                        <span className={`text-[9px] font-black uppercase tracking-widest ${
                          card.isHigh ? 'text-red-400' : 'text-amber-400'
                        }`}>{card.key}</span>
                      </div>
                    </div>
                    {isCurrentHovered && (
                      <div className="px-3 py-2.5">
                        <p className="text-[10.5px] text-slate-400 leading-[1.5]">
                          {card.span?.detailed_explanation || card.span?.explanation}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
