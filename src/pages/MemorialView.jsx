import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

// Fallback phrases in case the database is empty or unreachable
const FALLBACK_PHRASES = [
  "Free accommodation provided",
  "Visa and flight ticket sponsored",
  "High salary guaranteed",
  "No experience required",
  "Family-friendly environment",
  "Apply today",
  "Safe and legal work abroad",
  "Meals included",
  "Good commission available",
  "We take care of everything",
  "Just bring yourself",
  "Online interview available",
  "Urgent hiring now",
  "Extra income for your family",
  "Help your family back home",
  "Work in a friendly team",
  "Accommodation near workplace",
  "Fast processing guaranteed",
  "No passport needed",
  "Dream opportunity abroad",
  "Trusted company",
  "High demand. Apply now.",
  "Hundreds hired monthly",
  "Start immediately",
  "Benefits included",
  "We sponsor everything",
  "Document processing included",
  "Work with us today",
  "Earn more than you imagined",
  "Door to door pickup available",
  "Safe environment for workers",
  "Send your resume now",
  "Immediate placement",
  "International opportunity",
  "Work abroad legally",
  "No upfront cost",
  "Flight arranged by company",
  "Training provided",
  "Great team atmosphere",
];

function extractPhrases(texts) {
  const phrases = new Set();

  texts.forEach((text) => {
    if (!text || typeof text !== 'string') return;

    const segments = text.split(/[\n\r.!?|•\-–—/\\:;]+/);
    segments.forEach((seg) => {
      const cleaned = seg
        .trim()
        .replace(/[^\w\s$%+@#&']/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const words = cleaned.split(/\s+/).filter((w) => w.length > 1);

      if (
        words.length >= 2 &&
        words.length <= 8 &&
        cleaned.length >= 8 &&
        cleaned.length <= 60
      ) {
        // Exclude purely numeric or very generic fragments
        if (!/^\d[\d\s]*$/.test(cleaned) && !/^https?:\/\//i.test(cleaned)) {
          phrases.add(cleaned);
        }
      }
    });
  });

  return [...phrases];
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function MemorialView() {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const particlesRef = useRef([]);
  const phrasesRef = useRef(FALLBACK_PHRASES);
  const navigate = useNavigate();
  const [scanCount, setScanCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showText, setShowText] = useState(false);

  // Fetch real text from the database
  useEffect(() => {
    async function fetchData() {
      try {
        const { data, error } = await supabase
          .from('scans')
          .select('original_text, normalized_text, ocr_text')
          .limit(500);

        if (!error && data && data.length > 0) {
          setScanCount(data.length);
          const texts = data.flatMap((s) =>
            [s.original_text, s.normalized_text, s.ocr_text].filter(Boolean)
          );
          const extracted = extractPhrases(texts);
          const combined = shuffleArray(
            extracted.length > 30
              ? extracted
              : [...extracted, ...FALLBACK_PHRASES]
          );
          phrasesRef.current = combined;
        }
      } catch (e) {
        console.warn('Could not load scans for memorial view:', e);
      } finally {
        setLoading(false);
        // Fade in the bottom text after a small delay for atmosphere
        setTimeout(() => setShowText(true), 2000);
      }
    }
    fetchData();
  }, []);

  // Canvas animation
  useEffect(() => {
    if (loading) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const phrases = phrasesRef.current;
    const PARTICLE_COUNT = 60;

    function createParticle(atBottom = true) {
      const w = canvas.width;
      const h = canvas.height;
      const text = phrases[Math.floor(Math.random() * phrases.length)];
      const fontSize = 10 + Math.floor(Math.random() * 6);
      const targetOpacity = 0.35 + Math.random() * 0.45;

      return {
        text,
        x: w * 0.04 + Math.random() * (w * 0.92),
        y: atBottom ? h + 30 + Math.random() * 200 : h * 0.1 + Math.random() * h * 0.85,
        opacity: atBottom ? 0 : Math.random() * targetOpacity * 0.8,
        targetOpacity,
        fadingIn: true,
        speed: 0.18 + Math.random() * 0.32,
        driftBase: (Math.random() - 0.5) * 0.05,
        fontSize,
        phase: Math.random() * Math.PI * 2,
        dissolveThreshold: 0.14 + Math.random() * 0.1,
      };
    }

    // Spawn initial particles: some already on screen, some at bottom
    particlesRef.current = Array.from({ length: PARTICLE_COUNT }, (_, i) =>
      createParticle(i > Math.floor(PARTICLE_COUNT * 0.45))
    );

    let lastTime = performance.now();

    function animate(time) {
      const rawDt = time - lastTime;
      lastTime = time;
      const dt = Math.min(rawDt / 16.67, 3); // normalize to ~60fps

      // Subtle gradient background (near-black with very slight blue tint)
      ctx.fillStyle = 'rgba(5, 7, 11, 0.18)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      particlesRef.current.forEach((p, i) => {
        // Drift upward with gentle sinusoidal horizontal sway
        p.y -= p.speed * dt;
        p.x += (p.driftBase + Math.sin(time * 0.00018 + p.phase) * 0.035) * dt;

        // Keep within horizontal bounds
        const textWidth = p.fontSize * p.text.length * 0.55;
        if (p.x < -textWidth) p.x = canvas.width + textWidth * 0.5;
        if (p.x > canvas.width + textWidth) p.x = -textWidth * 0.5;

        // Fade in from bottom
        if (p.fadingIn) {
          p.opacity += 0.004 * dt;
          if (p.opacity >= p.targetOpacity) {
            p.opacity = p.targetOpacity;
            p.fadingIn = false;
          }
        }

        // Fade out as particle approaches the top of the screen
        if (!p.fadingIn) {
          const heightRatio = 1 - p.y / canvas.height;
          if (heightRatio > 0.2) {
            const fadeProgress = (heightRatio - 0.2) / 0.8;
            p.opacity = p.targetOpacity * (1 - Math.pow(fadeProgress, 1.8));
          }
        }

        // Draw or respawn
        if (p.opacity > 0.004) {
          ctx.save();
          ctx.font = `${p.fontSize}px monospace`;

          const isDissolving = p.opacity < p.dissolveThreshold;

          if (isDissolving) {
            // Letter-by-letter dissolve with jitter
            const dissolveFactor = 1 - p.opacity / p.dissolveThreshold;
            const jitterAmount = dissolveFactor * 7;
            let charX = p.x;
            for (const char of p.text) {
              const jx = (Math.random() - 0.5) * jitterAmount;
              const jy = (Math.random() - 0.5) * jitterAmount * 0.5;
              ctx.fillStyle = `rgba(195, 210, 225, ${p.opacity})`;
              ctx.fillText(char, charX + jx, p.y + jy);
              charX += ctx.measureText(char).width;
            }
          } else {
            ctx.fillStyle = `rgba(195, 210, 225, ${p.opacity})`;
            ctx.fillText(p.text, p.x, p.y);
          }

          ctx.restore();
        } else {
          // Respawn at the bottom
          particlesRef.current[i] = createParticle(true);
        }
      });

      animFrameRef.current = requestAnimationFrame(animate);
    }

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [loading]);

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ background: '#050709' }}
    >
      {/* Canvas layer */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Back button — subtle, top left */}
      <button
        onClick={() => navigate(-1)}
        className="absolute top-5 left-5 z-20 flex items-center gap-1.5 text-slate-700 hover:text-slate-400 transition-all duration-500 font-mono text-[10px] uppercase tracking-widest"
      >
        <ArrowLeft className="w-3 h-3" />
        Back
      </button>

      {/* Memorial text — bottom center, fades in slowly */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center pb-12 px-6"
        style={{
          opacity: showText ? 1 : 0,
          transition: 'opacity 3s ease-in',
        }}
      >
        <div className="w-24 h-px mb-8" style={{ background: 'rgba(100, 116, 139, 0.25)' }} />

        <p
          className="text-center font-mono text-[11px] uppercase leading-loose tracking-[0.18em]"
          style={{ color: 'rgba(100, 116, 139, 0.7)' }}
        >
          These words were real.
          <br />
          They were written to trap someone
          <br />
          who had nothing left to lose.
        </p>

        {scanCount > 0 && (
          <p
            className="mt-6 font-mono text-[9px] uppercase tracking-[0.15em]"
            style={{ color: 'rgba(71, 85, 105, 0.5)' }}
          >
            Compiled from {scanCount} analyzed postings
          </p>
        )}
      </div>
    </div>
  );
}
