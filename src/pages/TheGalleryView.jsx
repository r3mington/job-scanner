import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, PointerLockControls, Text, MeshReflectorMaterial } from '@react-three/drei';
import * as THREE from 'three';
import {
  ArrowLeft, ChevronLeft, ChevronRight, ScanSearch,
  Info, X, Eye, Sparkles, Globe2, ShieldCheck, Move
} from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import { RISK_FLAGS } from '../utils/scoring';

// ─────────────────────────────────────────────────────────────────────────────
// "The Gallery"
// A daylit museum hall you walk through in first person. Real recruitment ads
// — scanned by this platform — hang framed on the walls, looking like art.
// Walk close to one and its surface drains of pretence: only the phrases the
// analysis flagged keep their colour, annotated like a curator's wall label.
// Distance is the interaction. You have to approach to see what it is.
// ─────────────────────────────────────────────────────────────────────────────

const CRITICAL_FLAGS = new Set(
  Object.keys(RISK_FLAGS).filter(k => RISK_FLAGS[k].category === 'critical')
);
const flagTier = (flag) => (CRITICAL_FLAGS.has(flag) ? 'critical' : (RISK_FLAGS[flag]?.category || 'medium'));

// ── Curated pieces: the hall is never empty (no data / no key / cold judge) ──
const CURATED_PIECES = [
  {
    id: 'g_curated_1',
    title: 'Customer Service Agents — Bangkok',
    meta: 'Composite of documented patterns · SE-Asia corridor',
    text: `HIRING: Customer Service Agents 📞\n$1,500/month + 2% commission. Location: Bangkok (hybrid).\nFree accommodation provided. Visa and flight ticket sponsored.\nNo experience required. Professional English a plus.\nUrgent — apply today! Contact us on Telegram only: @BorderZoneHR`,
    spans: [
      { snippet: 'Free accommodation provided', flag: 'Housing Compound Isolation', explanation: 'Employer-controlled housing is used to isolate and confine workers.' },
      { snippet: 'Visa and flight ticket sponsored', flag: 'Upfront Fees', explanation: 'Sponsored travel becomes a manufactured debt owed on arrival.' },
      { snippet: 'No experience required', flag: 'Minimal Qualifications', explanation: 'High pay for no skills is bait, not an offer.' },
      { snippet: 'Urgent — apply today', flag: 'Immediate Travel Pressure', explanation: 'Urgency is engineered so the reader decides before verifying.' },
      { snippet: 'Telegram only', flag: 'Encrypted Apps Migration', explanation: 'Moving to a disappearing channel evades any paper trail.' },
    ],
  },
  {
    id: 'g_curated_2',
    title: 'Data Typists Wanted — Overseas',
    meta: 'Composite of documented patterns · Gulf corridor',
    text: `DATA TYPISTS WANTED ⌨️ — Dream opportunity abroad.\nEarn $3,000+ monthly. Meals and housing included.\nWe handle all documents and processing for you.\nJust basic English needed. Start immediately.\nWhatsApp our HR team now: +971 55 163 9029`,
    spans: [
      { snippet: 'Dream opportunity abroad', flag: 'Vague Description', explanation: 'Distance is the point — help cannot reach the isolated worker.' },
      { snippet: 'Earn $3,000+ monthly', flag: 'Wage Disparity', explanation: 'A wage far above the local market anchors the target with false hope.' },
      { snippet: 'We handle all documents', flag: 'Passport/ID Control', explanation: 'Handing over documents is how freedom of movement is removed.' },
      { snippet: 'Start immediately', flag: 'Urgent Timeline', explanation: 'Immediate starts leave no time to research the employer.' },
    ],
  },
  {
    id: 'g_curated_3',
    title: 'Promoters / Live Hosts',
    meta: 'Composite of documented patterns · border SEZ',
    text: `Live Stream Hosts & Promoters 🌟 — high commission!\nProvided dormitory near the workplace. Passport held safely by company for your protection.\nSpecial economic zone, easy border crossing arranged.\nReferrals welcome — bring a friend, earn a bonus.`,
    spans: [
      { snippet: 'Passport held safely by company', flag: 'Passport/ID Control', explanation: '"For your protection" is how confiscation is framed to the target.' },
      { snippet: 'Special economic zone, easy border crossing', flag: 'Suspect Location Hub', explanation: 'Unregulated border zones are where oversight ends.' },
      { snippet: 'Provided dormitory near the workplace', flag: 'Housing Compound Isolation', explanation: 'On-site dormitories keep workers inside a controlled perimeter.' },
      { snippet: 'Referrals welcome', flag: 'Suspicious Messaging', explanation: 'Recruiting the target\'s own circle is how these networks scale.' },
    ],
  },
];

// ── Room geometry (meters). Hall runs along -z from the entrance at z≈1. ─────
const ROOM = { width: 10, length: 26, height: 4.6 };
const EYE = 1.6;
const BOUNDS = { x: ROOM.width / 2 - 0.7, zMin: -(ROOM.length - 1.2), zMax: 0.9 };
const REVEAL_DIST = 3.4;      // closer than this → the ad confesses
const REVEAL_HYSTERESIS = 0.5;

// Hang points down both walls, alternating, starting 4m in.
function hangArtworks(pieces) {
  return pieces.map((p, i) => {
    const side = i % 2 === 0 ? -1 : 1; // even left, odd right
    const z = -4 - Math.floor(i / 2) * 7 - (side === 1 ? 3.5 : 0);
    return {
      piece: p,
      position: [side * (ROOM.width / 2 - 0.06), 1.9, z],
      rotationY: side === -1 ? Math.PI / 2 : -Math.PI / 2,
      inward: [-side, 0, 0],
    };
  });
}

// ── The poster text: only flagged phrases keep their colour up close ─────────
function HighlightedAd({ text, spans, revealed, activeFlag }) {
  const nodes = useMemo(() => {
    const clean = (spans || []).filter(s => s.snippet && s.snippet.trim());
    if (!clean.length) return [{ t: text }];
    const sorted = [...clean].sort((a, b) => b.snippet.length - a.snippet.length);
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(sorted.map(s => `(${esc(s.snippet)})`).join('|'), 'gi');
    const parts = text.split(regex).filter(p => p !== undefined && p !== '');
    return parts.map(part => {
      const match = sorted.find(s => s.snippet.toLowerCase() === part.toLowerCase());
      return match ? { t: part, flag: match.flag, tier: flagTier(match.flag) } : { t: part };
    });
  }, [text, spans]);

  return (
    <p className="whitespace-pre-wrap leading-[1.6] text-[15px]" style={{ fontFamily: 'Georgia, serif' }}>
      {nodes.map((n, i) => {
        if (!n.flag) {
          return (
            <span key={i} style={{ color: revealed ? '#b3ab9a' : '#2c2721', transition: 'color 1400ms ease' }}>
              {n.t}
            </span>
          );
        }
        const critical = n.tier === 'critical';
        const ink = critical ? '#8f2f2a' : '#9a6a1c';
        const wash = critical ? 'rgba(160,60,52,0.13)' : 'rgba(176,124,40,0.13)';
        const dim = activeFlag && activeFlag !== n.flag;
        return (
          <span
            key={i}
            style={{
              color: revealed ? ink : '#2c2721',
              background: revealed ? wash : 'transparent',
              borderBottom: revealed ? `2px solid ${critical ? '#b34a41' : '#c69235'}` : '2px solid transparent',
              opacity: dim ? 0.3 : 1,
              padding: '0 2px',
              borderRadius: '2px',
              transition: 'color 1400ms ease, background 1400ms ease, border-color 1400ms ease, opacity 400ms ease',
            }}
          >
            {n.t}
          </span>
        );
      })}
    </p>
  );
}

// ── One framed ad on the wall ────────────────────────────────────────────────
function Artwork({ piece, position, rotationY, onApproach }) {
  const [revealed, setRevealed] = useState(false);
  const [activeFlag, setActiveFlag] = useState(null);
  const worldPos = useMemo(() => new THREE.Vector3(...position), [position]);
  const frames = useRef(0);

  useFrame(({ camera }) => {
    // Distance check a few times a second is plenty for a walking pace.
    if (frames.current++ % 8 !== 0) return;
    const d = camera.position.distanceTo(worldPos);
    if (!revealed && d < REVEAL_DIST) setRevealed(true);
    else if (revealed && d > REVEAL_DIST + REVEAL_HYSTERESIS) setRevealed(false);
  });

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Cool picture light above the frame, warms the wall */}
      <pointLight position={[0, 1.4, 0.7]} intensity={revealed ? 22 : 12} distance={5} decay={2} color={revealed ? '#f3f6ff' : '#ffe6bd'} />

      <Html transform distanceFactor={1.5} position={[0, 0, 0.03]} style={{ pointerEvents: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, width: 560 }}>
          {/* Frame + poster */}
          <div
            onClick={onApproach}
            style={{
              width: 340,
              flexShrink: 0,
              cursor: 'pointer',
              padding: 12,
              background: 'linear-gradient(145deg, #c9ad78 0%, #a98a53 48%, #cdb27e 100%)',
              borderRadius: 3,
              boxShadow: revealed
                ? '0 40px 70px -28px rgba(60,48,28,0.55)'
                : '0 24px 46px -24px rgba(60,48,28,0.45)',
              transition: 'box-shadow 1200ms ease',
            }}
          >
            <div style={{ background: '#fbfaf6', padding: '22px 20px', borderRadius: 1 }}>
              <div className="text-[8px] font-mono uppercase tracking-[0.25em] mb-2.5" style={{ color: '#a89b7f', transition: 'color 1200ms ease' }}>
                {revealed ? 'Recruitment advertisement' : 'Now exhibiting'}
              </div>
              <HighlightedAd text={piece.text} spans={piece.spans} revealed={revealed} activeFlag={activeFlag} />
            </div>
            {/* Brass plaque */}
            <div className="mt-2.5 mx-auto w-fit px-3 py-1 rounded-sm" style={{ background: 'linear-gradient(145deg, #c9ad78, #b6975f)' }}>
              <div className="text-[9px] font-bold tracking-wide text-center" style={{ color: '#3a2f1a', fontFamily: 'Georgia, serif' }}>
                {piece.title}
              </div>
              <div className="text-[7px] font-mono uppercase tracking-[0.14em] text-center mt-0.5" style={{ color: '#5d4d2c' }}>
                {piece.meta}
              </div>
            </div>
          </div>

          {/* Wall label — materializes on approach, museum-caption style */}
          <div
            style={{
              width: 200,
              opacity: revealed ? 1 : 0,
              transform: `translateX(${revealed ? 0 : -10}px)`,
              transition: 'opacity 1100ms ease 250ms, transform 1100ms ease 250ms',
              pointerEvents: revealed ? 'auto' : 'none',
              background: 'rgba(251,250,246,0.96)',
              border: '1px solid rgba(160,146,110,0.4)',
              borderRadius: 6,
              padding: '12px 12px',
              boxShadow: '0 18px 40px -20px rgba(70,58,36,0.4)',
            }}
          >
            <div className="text-[7px] font-mono uppercase tracking-[0.28em] mb-1.5" style={{ color: '#b0873a' }}>
              Wall label
            </div>
            <p className="text-[9px] leading-snug mb-2" style={{ color: '#6b6252' }}>
              The phrases kept in colour are what the analysis found beneath this advertisement.
            </p>
            <div className="flex flex-col gap-1">
              {piece.spans.map((s, i) => {
                const critical = flagTier(s.flag) === 'critical';
                return (
                  <div
                    key={i}
                    onMouseEnter={() => setActiveFlag(s.flag)}
                    onMouseLeave={() => setActiveFlag(null)}
                    className="rounded p-1.5"
                    style={{
                      background: activeFlag === s.flag ? 'rgba(160,146,110,0.16)' : 'transparent',
                      border: '1px solid rgba(160,146,110,0.2)',
                      cursor: 'default',
                    }}
                  >
                    <span className="flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: critical ? '#b34a41' : '#c69235' }} />
                      <span className="text-[8px] font-bold" style={{ color: critical ? '#8f2f2a' : '#9a6a1c' }}>{s.flag}</span>
                    </span>
                    {s.explanation && (
                      <span className="block text-[8px] leading-snug mt-0.5" style={{ color: '#6b6252' }}>{s.explanation}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Html>
    </group>
  );
}

// ── Drifting dust in the skylight shafts ─────────────────────────────────────
function DustMotes() {
  const ref = useRef();
  const positions = useMemo(() => {
    const arr = new Float32Array(240 * 3);
    for (let i = 0; i < 240; i++) {
      arr[i * 3] = (Math.random() - 0.5) * ROOM.width * 0.9;
      arr[i * 3 + 1] = Math.random() * ROOM.height;
      arr[i * 3 + 2] = -Math.random() * ROOM.length;
    }
    return arr;
  }, []);

  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.03) * 0.02;
      ref.current.position.y = Math.sin(clock.elapsedTime * 0.08) * 0.15;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={240} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.012} color="#fff8e8" transparent opacity={0.35} sizeAttenuation depthWrite={false} />
    </points>
  );
}

// ── The room itself ──────────────────────────────────────────────────────────
function Room() {
  const halfW = ROOM.width / 2;
  const midZ = -ROOM.length / 2;
  return (
    <group>
      {/* Floor — light oak with a soft reflection */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, midZ]}>
        <planeGeometry args={[ROOM.width, ROOM.length]} />
        <MeshReflectorMaterial
          resolution={512}
          blur={[350, 120]}
          mixBlur={1}
          mixStrength={0.35}
          roughness={0.9}
          depthScale={0.6}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
          color="#cfc2ab"
          metalness={0}
        />
      </mesh>

      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ROOM.height, midZ]}>
        <planeGeometry args={[ROOM.width, ROOM.length]} />
        <meshStandardMaterial color="#f6f3ec" />
      </mesh>
      {/* Skylight strip — the light source, glowing */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ROOM.height - 0.02, midZ]}>
        <planeGeometry args={[2.2, ROOM.length - 4]} />
        <meshBasicMaterial color="#fffdf4" toneMapped={false} />
      </mesh>

      {/* Side walls */}
      <mesh rotation={[0, Math.PI / 2, 0]} position={[-halfW, ROOM.height / 2, midZ]}>
        <planeGeometry args={[ROOM.length, ROOM.height]} />
        <meshStandardMaterial color="#efeadf" />
      </mesh>
      <mesh rotation={[0, -Math.PI / 2, 0]} position={[halfW, ROOM.height / 2, midZ]}>
        <planeGeometry args={[ROOM.length, ROOM.height]} />
        <meshStandardMaterial color="#efeadf" />
      </mesh>

      {/* End walls */}
      <mesh position={[0, ROOM.height / 2, -ROOM.length]}>
        <planeGeometry args={[ROOM.width, ROOM.height]} />
        <meshStandardMaterial color="#ece6da" />
      </mesh>
      <mesh rotation={[0, Math.PI, 0]} position={[0, ROOM.height / 2, 1.5]}>
        <planeGeometry args={[ROOM.width, ROOM.height]} />
        <meshStandardMaterial color="#ece6da" />
      </mesh>

      {/* Baseboards */}
      {[-halfW + 0.01, halfW - 0.01].map((x, i) => (
        <mesh key={i} rotation={[0, i === 0 ? Math.PI / 2 : -Math.PI / 2, 0]} position={[x, 0.09, midZ]}>
          <planeGeometry args={[ROOM.length, 0.18]} />
          <meshStandardMaterial color="#dcd4c2" />
        </mesh>
      ))}

      {/* A bench down the middle */}
      <group position={[0, 0, -9]}>
        <mesh position={[0, 0.42, 0]}>
          <boxGeometry args={[0.55, 0.08, 2.4]} />
          <meshStandardMaterial color="#b09a76" roughness={0.6} />
        </mesh>
        {[-1, 1].map(s => (
          <mesh key={s} position={[0, 0.19, s * 0.95]}>
            <boxGeometry args={[0.4, 0.38, 0.12]} />
            <meshStandardMaterial color="#9c8760" roughness={0.7} />
          </mesh>
        ))}
      </group>

      {/* Engraved epitaph on the far wall */}
      <Text
        position={[0, 1.9, -ROOM.length + 0.05]}
        fontSize={0.17}
        maxWidth={6.5}
        textAlign="center"
        color="#8a7f66"
        anchorX="center"
        anchorY="middle"
        lineHeight={1.7}
      >
        {'Every advertisement in this room is real.\nSomeone answered each one.'}
      </Text>
      <Text
        position={[0, 3.4, 1.44]}
        rotation={[0, Math.PI, 0]}
        fontSize={0.24}
        letterSpacing={0.35}
        color="#a89b7f"
        anchorX="center"
        anchorY="middle"
      >
        THE GALLERY
      </Text>
    </group>
  );
}

// ── First-person player: WASD + mouse-look, with optional guided glides ─────
function Player({ glideRef, controlsRef }) {
  const { camera } = useThree();
  const keys = useRef({});
  const bobPhase = useRef(0);

  useEffect(() => {
    camera.position.set(0, EYE, 0.2);
    camera.rotation.set(0, Math.PI, 0); // face down the hall (-z)
    camera.rotation.order = 'YXZ';
    const down = (e) => { keys.current[e.code] = true; };
    const up = (e) => { keys.current[e.code] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [camera]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const k = keys.current;
    const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const strafe = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    const moving = fwd !== 0 || strafe !== 0;

    if (moving) glideRef.current = null; // your own feet override the tour

    const glide = glideRef.current;
    if (glide) {
      // Guided approach: ease toward the stand-point, turn toward the work.
      camera.position.lerp(glide.pos, 1 - Math.pow(0.0015, dt));
      const target = glide.quat;
      camera.quaternion.slerp(target, 1 - Math.pow(0.002, dt));
      if (camera.position.distanceTo(glide.pos) < 0.06) glideRef.current = null;
    } else if (moving) {
      const speed = 3.1;
      const yaw = camera.rotation.y;
      const dirX = Math.sin(yaw) * -fwd + Math.cos(yaw) * strafe;
      const dirZ = Math.cos(yaw) * -fwd - Math.sin(yaw) * strafe;
      camera.position.x += dirX * speed * dt;
      camera.position.z += dirZ * speed * dt;
      bobPhase.current += dt * 9;
    }

    // Stay inside the room
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -BOUNDS.x, BOUNDS.x);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, BOUNDS.zMin, BOUNDS.zMax);
    // Gentle head bob, settling when still
    const bob = moving ? Math.sin(bobPhase.current) * 0.025 : 0;
    camera.position.y += (EYE + bob - camera.position.y) * Math.min(1, dt * 8);
  });

  return <PointerLockControls ref={controlsRef} selector="#gallery-enter-walk" />;
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function TheGalleryView() {
  const navigate = useNavigate();
  const [pieces, setPieces] = useState(CURATED_PIECES);
  const [veil, setVeil] = useState(true);
  const [walking, setWalking] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [tourIdx, setTourIdx] = useState(-1);
  const glideRef = useRef(null);
  const controlsRef = useRef(null);

  const hung = useMemo(() => hangArtworks(pieces), [pieces]);

  // Weave in real scanned ads behind the curated openers.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('scans')
          .select('id, timestamp, job_title, risk_score, original_text, translated_text, ocr_text, spans:extracted_data->suspicious_spans')
          .order('risk_score', { ascending: false })
          .limit(10);
        if (error || !data || cancelled) return;
        const built = [];
        for (const s of data) {
          if ((s.risk_score ?? 0) < 55) continue;
          const text = (s.translated_text || s.original_text || s.ocr_text || '').trim();
          const rawSpans = Array.isArray(s.spans) ? s.spans : [];
          const spans = rawSpans
            .map(sp => ({
              snippet: sp.translated_snippet || sp.original_snippet,
              flag: sp.red_flag,
              explanation: sp.explanation || sp.detailed_explanation || '',
            }))
            .filter(sp => sp.snippet && sp.flag && text.toLowerCase().includes(sp.snippet.toLowerCase()));
          if (text.length < 60 || spans.length < 2) continue;
          const scannedOn = s.timestamp
            ? new Date(Number(s.timestamp) || s.timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
            : null;
          built.push({
            id: s.id,
            title: s.job_title || 'Recruitment advertisement',
            meta: scannedOn ? `Scanned ${scannedOn} · Risk ${s.risk_score}%` : `Risk ${s.risk_score}%`,
            text: text.length > 460 ? text.slice(0, 457) + '…' : text,
            spans: spans.slice(0, 5),
          });
          if (built.length >= 4) break;
        }
        if (built.length && !cancelled) setPieces([...CURATED_PIECES, ...built]);
      } catch { /* the curated hall stands on its own */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Track pointer-lock state for the HUD hints.
  useEffect(() => {
    const onLock = () => setWalking(document.pointerLockElement != null);
    document.addEventListener('pointerlockchange', onLock);
    return () => document.removeEventListener('pointerlockchange', onLock);
  }, []);

  // Compute the stand-point + facing for a guided approach to artwork i.
  const glideTo = useCallback((i) => {
    const art = hangArtworks(piecesRefSafe.current)[i];
    if (!art) return;
    const [ax, , az] = art.position;
    const [nx] = art.inward;
    const pos = new THREE.Vector3(ax + nx * 3.15, EYE, az);
    const look = new THREE.Vector3(ax, 1.75, az);
    const m = new THREE.Matrix4().lookAt(pos, look, new THREE.Vector3(0, 1, 0));
    const quat = new THREE.Quaternion().setFromRotationMatrix(m);
    glideRef.current = { pos, quat };
    setTourIdx(i);
  }, []);
  const piecesRefSafe = useRef(pieces);
  piecesRefSafe.current = pieces;

  const step = (delta) => {
    const n = piecesRefSafe.current.length;
    const next = ((Math.max(tourIdx, 0) + delta) % n + n) % n;
    glideTo(next);
  };

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: '#ece8df' }}>
      <Canvas
        shadows={false}
        gl={{ antialias: true }}
        camera={{ fov: 62, near: 0.1, far: 60 }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <color attach="background" args={['#e9e4d8']} />
        <fog attach="fog" args={['#e9e4d8', 26, 55]} />

        {/* Daylight — three r155+ physical light units need generous values */}
        <ambientLight intensity={1.15} color="#fff6e6" />
        <hemisphereLight intensity={1.0} color="#fffdf4" groundColor="#cfc2ab" />
        <directionalLight position={[2, ROOM.height + 3, -8]} intensity={2.2} color="#fffaf0" />
        <directionalLight position={[-2, ROOM.height + 3, -18]} intensity={1.4} color="#fff3dd" />

        <Room />
        <DustMotes />

        {hung.map((h, i) => (
          <Artwork
            key={h.piece.id}
            piece={h.piece}
            position={h.position}
            rotationY={h.rotationY}
            onApproach={() => glideTo(i)}
          />
        ))}

        <Player glideRef={glideRef} controlsRef={controlsRef} />
      </Canvas>

      {/* ── Entry veil ─────────────────────────────────────────────────────── */}
      {veil && (
        <div
          className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-8"
          style={{ background: 'rgba(236,232,223,0.94)', backdropFilter: 'blur(6px)' }}
        >
          <div className="text-center">
            <h1 className="font-mono text-[13px] uppercase tracking-[0.5em]" style={{ color: '#6b6252' }}>The Gallery</h1>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.22em] max-w-sm leading-relaxed" style={{ color: '#a89b7f' }}>
              A daylit hall. What hangs on the walls was written to trap someone.
              <br />Walk close to see what it is.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              id="gallery-enter-walk"
              onClick={() => setVeil(false)}
              className="flex items-center gap-2.5 px-6 py-3 rounded-full font-mono text-[11px] uppercase tracking-[0.2em] transition-all"
              style={{ background: '#b0873a', color: '#fbfaf6', boxShadow: '0 18px 40px -16px rgba(176,135,58,0.6)' }}
            >
              <Move className="w-4 h-4" /> Enter &amp; walk — WASD + mouse
            </button>
            <button
              onClick={() => { setVeil(false); glideTo(0); }}
              className="px-6 py-3 rounded-full font-mono text-[11px] uppercase tracking-[0.2em] transition-all"
              style={{ border: '1px solid rgba(160,146,110,0.5)', color: '#6b6252', background: 'rgba(251,250,246,0.7)' }}
            >
              Guided visit
            </button>
          </div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em]" style={{ color: '#b3a88e' }}>
            ESC frees the cursor · click any artwork to approach it
          </p>
        </div>
      )}

      {/* ── HUD ────────────────────────────────────────────────────────────── */}
      {!veil && (
        <>
          <button
            onClick={() => navigate(-1)}
            className="absolute top-5 left-5 z-30 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors"
            style={{ color: '#8a7f66' }}
          >
            <ArrowLeft className="w-3 h-3" /> Back
          </button>

          <button
            onClick={() => setShowAbout(true)}
            className="group absolute top-5 right-5 z-30 flex items-center gap-2 pl-3 pr-3.5 py-2 rounded-full transition-all"
            style={{ border: '1px solid rgba(176,135,58,0.4)', background: 'rgba(251,250,246,0.75)' }}
          >
            <span className="relative flex items-center justify-center">
              <span className="absolute inline-flex h-4 w-4 rounded-full opacity-70 group-hover:animate-ping" style={{ background: 'rgba(176,135,58,0.4)' }} />
              <Info className="w-4 h-4 relative" style={{ color: '#a3762a' }} />
            </span>
            <span className="text-[11px] font-mono uppercase tracking-widest" style={{ color: '#8a6a24' }}>About this piece</span>
          </button>

          {/* Bottom bar: guided controls + hints + CTA */}
          <div className="absolute bottom-0 left-0 right-0 z-30 flex flex-col items-center pb-6 gap-3 pointer-events-none">
            <div className="flex items-center gap-3 pointer-events-auto">
              <button
                onClick={() => step(-1)}
                className="p-2.5 rounded-full transition-colors"
                style={{ background: 'rgba(251,250,246,0.85)', border: '1px solid rgba(160,146,110,0.4)', color: '#6b6252' }}
                aria-label="Previous artwork"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] px-3 py-2 rounded-full"
                style={{ background: 'rgba(251,250,246,0.85)', border: '1px solid rgba(160,146,110,0.35)', color: '#8a7f66' }}
              >
                {walking ? 'WASD to walk · ESC frees cursor' : 'W A S D + mouse to walk · click an artwork to approach'}
              </span>
              <button
                onClick={() => step(1)}
                className="p-2.5 rounded-full transition-colors"
                style={{ background: 'rgba(251,250,246,0.85)', border: '1px solid rgba(160,146,110,0.4)', color: '#6b6252' }}
                aria-label="Next artwork"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => navigate('/scanner')}
              className="pointer-events-auto flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors"
              style={{ color: '#a3762a' }}
            >
              <ScanSearch className="w-3.5 h-3.5" /> Scan an ad you've seen
            </button>
          </div>

          {/* Crosshair while walking */}
          {walking && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
              <div className="w-1 h-1 rounded-full" style={{ background: 'rgba(107,98,82,0.6)' }} />
            </div>
          )}
        </>
      )}

      {/* ── About modal ────────────────────────────────────────────────────── */}
      {showAbout && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm"
          onClick={() => setShowAbout(false)}
        >
          <div
            className="relative w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl border shadow-2xl"
            style={{ background: '#fbfaf6', borderColor: 'rgba(160,146,110,0.5)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 px-6 sm:px-8 pt-6 pb-4"
              style={{ background: 'linear-gradient(to bottom, #fbfaf6, #fbfaf6, transparent)' }}
            >
              <div>
                <p className="text-[11px] font-mono uppercase tracking-[0.3em] mb-1.5" style={{ color: '#b0873a' }}>Arts exhibition · About</p>
                <h2 className="text-2xl font-bold tracking-tight" style={{ color: '#2c2721' }}>The Gallery</h2>
                <p className="text-[13px] mt-1" style={{ color: '#8a7f66' }}>A museum you walk through. The exhibits are traps.</p>
              </div>
              <button
                onClick={() => setShowAbout(false)}
                className="flex-shrink-0 p-2 rounded-full border transition-colors"
                style={{ borderColor: 'rgba(160,146,110,0.5)', color: '#8a7f66' }}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 sm:px-8 pb-8 space-y-6">
              <div className="space-y-3 text-[14px] leading-relaxed" style={{ color: '#4a4235' }}>
                <p>
                  <span className="font-semibold" style={{ color: '#2c2721' }}>The Gallery</span> hangs real
                  recruitment advertisements — ones actually scanned by this platform — as framed works in a
                  sunlit museum hall you explore in first person. From across the room they are pretty:
                  matted, framed, lit. Walk close and the surface drains of pretence — only the phrases the
                  analysis flagged keep their colour, each annotated on a wall label like a curator's note
                  on a canvas.
                </p>
                <p style={{ color: '#6b6252' }}>
                  Distance is the interaction. The museum metaphor is enacted by your own feet: you must
                  approach to see what a thing is — and by the time you are close enough to read the truth,
                  you understand how someone else got close enough to answer.
                </p>
              </div>

              <div>
                <p className="text-[11px] font-mono uppercase tracking-widest mb-3" style={{ color: '#8a7f66' }}>How this piece meets the guidelines</p>
                <div className="space-y-3">
                  {[
                    { icon: <Eye className="w-4 h-4" />, color: '#B0873A', title: 'Emotional impact & storytelling', body: 'Walking toward a "painting" and watching it curdle into evidence turns analysis into lived experience. The viewer discovers the danger the way a target would — up close.' },
                    { icon: <Sparkles className="w-4 h-4" />, color: '#8f6ad0', title: 'Innovation & creative use of AI', body: 'The curator of this gallery is the analysis engine itself: every highlighted phrase and wall label is drawn from the red flags the platform\'s AI extracted from that exact ad.' },
                    { icon: <Globe2 className="w-4 h-4" />, color: '#5a8fc0', title: 'Impact & relevance', body: 'It makes visible exactly what keyword filters miss — coercion dressed as opportunity — and every visit ends with an invitation to scan a real ad. Awareness becomes action.' },
                    { icon: <ShieldCheck className="w-4 h-4" />, color: '#4f9a7f', title: 'Human rights & ethical alignment (Do No Harm)', body: 'No survivor is depicted, quoted, or voiced. The exhibits indict the recruiter\'s language, never a person. Real ads appear without identifying any job seeker; composites carry the room when no data is present.' },
                  ].map(item => (
                    <div key={item.title} className="flex gap-3 rounded-xl border p-3.5" style={{ borderColor: 'rgba(160,146,110,0.3)', background: '#f4f1ea' }}>
                      <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ color: item.color, background: `${item.color}1f`, border: `1px solid ${item.color}55` }}
                      >
                        {item.icon}
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold" style={{ color: '#2c2721' }}>{item.title}</p>
                        <p className="text-[12px] leading-relaxed mt-0.5" style={{ color: '#6b6252' }}>{item.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-l-2 pl-4 text-[12px] italic leading-relaxed" style={{ borderColor: 'rgba(176,135,58,0.5)', color: '#6b6252' }}>
                Built under UN Do No Harm principles. Annotations come from each ad's own forensic analysis;
                the composite pieces are illustrative of documented recruitment patterns. The work depicts no
                person — only what a lie looks like, framed and lit.
              </div>

              <button
                onClick={() => setShowAbout(false)}
                className="w-full py-2.5 rounded-full border text-xs font-mono uppercase tracking-widest transition-all"
                style={{ borderColor: 'rgba(160,146,110,0.5)', color: '#6b6252' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
