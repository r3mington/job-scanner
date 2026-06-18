import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase, mapRecordToDb, mapDbToRecord, uploadBase64Image } from '../utils/supabaseClient';
import { calculateRiskScore, getRiskLevel, RISK_FLAGS } from '../utils/scoring';
import { ShieldAlert, CheckCircle, AlertTriangle, Save, ArrowLeft, Loader2, MapPin, TrendingUp, BrainCircuit, Columns, Copy, X, MessageSquare, ChevronDown, ChevronUp, Eye, EyeOff, Image as ImageIcon, FileText, PhoneCall, Layers, Globe } from 'lucide-react';
import { analyzeJobPosting } from '../services/geminiService';
import { getMedianSalary } from '../utils/countryMedians';
import { getCleanContactValue } from './DashboardView';
import { useAuth } from '../context/AuthContext';
import { calculateSimilarity, computeWordDiff } from '../utils/similarity';

const BUBBLE_FLOAT_CLASSES = [
  'threat-bubble-1', 'threat-bubble-2', 'threat-bubble-3', 'threat-bubble-4',
  'threat-bubble-5', 'threat-bubble-6', 'threat-bubble-7', 'threat-bubble-8'
];

const CRITICAL_FLAGS = new Set(['Passport/ID Control', 'Upfront Fees', 'Immediate Travel Pressure', 'Housing Compound Isolation', 'Suspect Location Hub']);

const LOADING_STEPS = [
  "Acquiring and registering flyer media...",
  "Parsing text segments via OCR engine...",
  "Translating linguistic structures...",
  "Calculating comparative wage anomalies...",
  "Auditing high-risk location parameters...",
  "Compiling parsed intelligence..."
];

const CARD_W = 218;
const CARD_H = 34;

const TAKE_ACTIONS = [
  {
    id: 'poster',
    title: 'Generate Investigation Poster (PDF)',
    description: 'Create a downloadable PDF poster summarizing the ad, risk score, and highlighted key threat indicators. Fully translated/localized.',
    icon: FileText,
    badge: 'PDF REPORT',
    ctaText: 'Generate Poster',
  },
  {
    id: 'contact',
    title: 'Contact Potential Trafficker',
    description: 'Access recommended next steps, customized decoy conversation templates, and secure evidence gathering documentation guidelines.',
    icon: PhoneCall,
    badge: 'EVIDENCE',
    ctaText: 'Initiate Contact',
  },
  {
    id: 'related',
    title: 'View Related Ads from Same Poster',
    description: 'Scan historical ads matching this advertiser ID, layout style, or contact details to track campaign scale and networks.',
    icon: Layers,
    badge: 'CROSS-INTEL',
    ctaText: 'Find Matches',
  }
];

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
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 flex-shrink-0 ${isHigh ? 'bg-red-500' : 'bg-amber-500'}`} />
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
                ? 'text-red-400 border-b-2 border-red-500 bg-red-500/10 scale-[1.02] shadow-[0_0_12px_rgba(239,68,68,0.25)]'
                : 'text-amber-400 border-b-2 border-amber-500 bg-amber-400/10 scale-[1.02] shadow-[0_0_12px_rgba(245,158,11,0.2)]';
            } else {
              highlightClass = 'text-slate-600 border-transparent bg-transparent opacity-25';
            }
          } else {
            highlightClass = isHigh
              ? 'text-red-300 border-b-2 border-red-500/80 bg-red-500/10'
              : 'text-amber-300 border-b border-amber-500/70 bg-amber-400/10';
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

export default function ReviewScan() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    job_title: '',
    employer_identity: '',
    salary_range: '',
    location: '',
    industry: '',
    contact_method: ''
  });
  
  const [activeFlags, setActiveFlags] = useState([]);
  const [ocrText, setOcrText] = useState(null);
  const [aiReview, setAiReview] = useState('');
  const [parsedSalaryUsd, setParsedSalaryUsd] = useState(null);
  const [locationCountry, setLocationCountry] = useState(null);
  const [detectedLanguage, setDetectedLanguage] = useState('English');
  const [isTranslated, setIsTranslated] = useState(false);
  const [translatedText, setTranslatedText] = useState(null);
  const [activeTabInput, setActiveTabInput] = useState('original');
  const [normalizedText, setNormalizedText] = useState('');
  const [similarScans, setSimilarScans] = useState([]);
  const [comparisonTarget, setComparisonTarget] = useState(null);
  const [notes, setNotes] = useState('');
  const [sourcePlatform, setSourcePlatform] = useState('unspecified');
  const [sourceUrl, setSourceUrl] = useState('unspecified');
  const [ingestionMethod, setIngestionMethod] = useState('Analyst Upload');
  const [postDate, setPostDate] = useState('unspecified');
  const [isSourceExpanded, setIsSourceExpanded] = useState(false);
  const [isNotesExpanded, setIsNotesExpanded] = useState(false);
  const [suspiciousSpans, setSuspiciousSpans] = useState([]);
  const [showHighlights, setShowHighlights] = useState(true);
  const [isImageExpanded, setIsImageExpanded] = useState(false);
  const [annotationCards, setAnnotationCards] = useState([]);
  const [containerMinHeight, setContainerMinHeight] = useState(100);
  const [hoveredKey, setHoveredKey] = useState(null);
  const [loadingStepIdx, setLoadingStepIdx] = useState(0);
  const [predictedPlaybook, setPredictedPlaybook] = useState([]);
  const [isPlaybookExpanded, setIsPlaybookExpanded] = useState(false);
  const [expandedPlaybookRows, setExpandedPlaybookRows] = useState(new Set());
  const [scoreBarsVisible, setScoreBarsVisible] = useState(false);
  const [activeActionToast, setActiveActionToast] = useState(null);
  const textContainerRef = useRef(null);

  useEffect(() => {
    if (!loading) return;
    setLoadingStepIdx(0);
    const interval = setInterval(() => {
      setLoadingStepIdx(prev => (prev < LOADING_STEPS.length - 1 ? prev + 1 : prev));
    }, 3300);
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    if (!activeActionToast) return;
    const timer = setTimeout(() => setActiveActionToast(null), 3000);
    return () => clearTimeout(timer);
  }, [activeActionToast]);
  
  // Extract inputs from navigation state (image or text)
  const scanInput = location.state;
  const normalizedTextVal = normalizedText || '';

  // --- Annotation card positioning ---
  const computeAnnotations = useCallback(() => {
    const container = textContainerRef.current;
    if (!container || !showHighlights || suspiciousSpans.length === 0) {
      setAnnotationCards([]);
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const containerW = containerRect.width;

    const els = container.querySelectorAll('[data-threat-key]');
    const seen = new Set();
    const raw = [];

    els.forEach(el => {
      const key = el.getAttribute('data-threat-key');
      if (seen.has(key)) return;
      seen.add(key);
      const rect = el.getBoundingClientRect();
      raw.push({
        key,
        dotX: rect.left - containerRect.left + rect.width / 2,
        dotY: rect.top - containerRect.top + rect.height / 2,
        span: suspiciousSpans.find(s => s.red_flag === key),
        isHigh: CRITICAL_FLAGS.has(key),
      });
    });

    raw.sort((a, b) => a.dotY - b.dotY);

    const numItems = raw.length;
    const cardElements = container.querySelectorAll('.annotation-card');

    let totalCardsHeight = 0;
    if (cardElements.length > 0) {
      cardElements.forEach(el => {
        totalCardsHeight += el.offsetHeight;
      });
    } else {
      totalCardsHeight = numItems > 0 ? (numItems - 1) * 34 + (hoveredKey ? 180 : 34) : 0;
    }

    // Measure the natural height of the text content inside the container
    const textEl = container.querySelector('.text-sm, .text-xs');
    const textHeight = textEl ? textEl.scrollHeight : 100;

    const minRequiredHeight = totalCardsHeight + (numItems - 1) * 16 + 40;
    const containerHeight = Math.max(textHeight + 40, minRequiredHeight);

    // Initialize positions at ideal Y (centered on the dot)
    let ys = raw.map(item => {
      const cardEl = Array.from(cardElements).find(e => e.getAttribute('data-card-key') === item.key);
      const h = cardEl ? cardEl.offsetHeight : (item.key === hoveredKey ? 180 : 34);
      return item.dotY - h / 2;
    });

    // Run a relaxation loop to space target coordinates using actual dynamic heights
    const minGap = 16;
    for (let iter = 0; iter < 100; iter++) {
      for (let i = 0; i < numItems - 1; i++) {
        const cardElA = Array.from(cardElements).find(e => e.getAttribute('data-card-key') === raw[i].key);
        const cardElB = Array.from(cardElements).find(e => e.getAttribute('data-card-key') === raw[i + 1].key);
        const hA = cardElA ? cardElA.offsetHeight : (raw[i].key === hoveredKey ? 180 : 34);
        const hB = cardElB ? cardElB.offsetHeight : (raw[i + 1].key === hoveredKey ? 180 : 34);

        const overlap = (ys[i] + hA + minGap) - ys[i + 1];
        if (overlap > 0) {
          ys[i] -= overlap / 2;
          ys[i + 1] += overlap / 2;
        }
      }
      if (ys[0] < 16) {
        const shift = 16 - ys[0];
        for (let i = 0; i < numItems; i++) {
          ys[i] += shift;
        }
      }
    }

    const positioned = raw.map((item, i) => {
      const cardY = ys[i];
      const cardX = Math.min(containerW * 0.65 + 16, containerW - CARD_W - 6);
      return { ...item, cardX, cardY, floatIdx: i };
    });

    setAnnotationCards(positioned);
    setContainerMinHeight(containerHeight);
  }, [suspiciousSpans, showHighlights, activeTabInput, hoveredKey]);

  const cardsPhysicsRef = useRef([]);

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
      const existing = cardsPhysicsRef.current.find(c => c.key === card.key);
      return {
        key: card.key,
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

      // Read actual heights from the DOM first
      for (let i = 0; i < numCards; i++) {
        const card = cards[i];
        card.h = card.element ? card.element.offsetHeight : (card.key === hoveredKey ? 180 : 34);
      }

      // 1. Spring force to target position
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

      // 2. Resolve card overlap collisions (using dynamic measured heights)
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

      // 3. Render directly to DOM elements
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

  useEffect(() => {
    if (!user || !normalizedTextVal) return;

    const fetchSimilarScans = async () => {
      try {
        const { data, error } = await supabase
          .from('scans')
          .select('*')
          .eq('user_id', user.id);

        if (error) throw error;

        if (data) {
          const processed = data
            .map(scan => {
              const record = mapDbToRecord(scan);
              const similarity = calculateSimilarity(normalizedTextVal, record.normalizedText || '');
              return { ...record, similarity };
            })
            // Filter out the current scan being reviewed and keep similarities above 40%
            .filter(item => item.id !== scanInput?.id && item.similarity > 0.40)
            .sort((a, b) => b.similarity - a.similarity);

          setSimilarScans(processed);
        }
      } catch (err) {
        console.error('Failed to fetch similar scans:', err);
      }
    };

    fetchSimilarScans();
  }, [user, normalizedTextVal, scanInput?.id]);

  useEffect(() => {
    if (!scanInput) {
      navigate('/');
      return;
    }

    if (scanInput.isExistingScan) {
      // Viewing/Editing an existing history record
      setFormData(scanInput.extractedData);
      setActiveFlags(scanInput.activeFlags || []);
      setOcrText(scanInput.ocrText || null);
      setAiReview(scanInput.aiReview || '');
      setParsedSalaryUsd(scanInput.parsedSalaryUsd || null);
      setLocationCountry(scanInput.locationCountry || null);
      setDetectedLanguage(scanInput.detectedLanguage || 'English');
      setIsTranslated(scanInput.isTranslated || false);
      setTranslatedText(scanInput.translatedText || null);
      setNormalizedText(scanInput.normalizedText || '');
      setNotes(scanInput.notes || '');
      setSourcePlatform(scanInput.sourcePlatform || 'unspecified');
      setSourceUrl(scanInput.sourceUrl || 'unspecified');
      setIngestionMethod(scanInput.ingestionMethod || 'Analyst Upload');
      setPostDate(scanInput.postDate || 'unspecified');
      setSuspiciousSpans(scanInput.extractedData?.suspicious_spans || []);
      setPredictedPlaybook(scanInput.extractedData?.predicted_playbook || []);
      setLoading(false);
    } else {
      // New scan - call Gemini API
      setSourcePlatform(scanInput.sourcePlatform || 'unspecified');
      setSourceUrl(scanInput.sourceUrl || 'unspecified');
      setIngestionMethod(scanInput.ingestionMethod || 'Analyst Upload');
      setPostDate(scanInput.postDate || 'unspecified');
      performScan();
    }
  }, [scanInput, navigate]);

  const performScan = async () => {
    try {
      setLoading(true);
      const startTime = Date.now();
      const apiKey = profile?.gemini_api_key || localStorage.getItem('gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY;
      const modelName = profile?.gemini_model || localStorage.getItem('gemini_model');
      
      if (!apiKey) {
        throw new Error('Please configure your Gemini API Key in Settings first.');
      }

      // Check for duplicate in database before calling Gemini API
      if (scanInput.text && user) {
        try {
          const { data: dupData } = await supabase
            .from('scans')
            .select('*')
            .eq('original_text', scanInput.text)
            .eq('user_id', user.id)
            .limit(1);

          if (dupData && dupData.length > 0) {
            const dupScan = dupData[0];
            
            // Enforce minimum 20s scan time even for cached duplicate results
            const elapsed = Date.now() - startTime;
            if (elapsed < 20000) {
              await new Promise(resolve => setTimeout(resolve, 20000 - elapsed));
            }

            setFormData(dupScan.extracted_data);
            setActiveFlags(dupScan.active_flags || []);
            setOcrText(dupScan.ocr_text || null);
            setAiReview(dupScan.ai_review || '');
            setParsedSalaryUsd(dupScan.parsed_salary_usd || null);
            setLocationCountry(dupScan.location_country || null);
            setDetectedLanguage(dupScan.detected_language || 'English');
            setIsTranslated(dupScan.is_translated || false);
            setTranslatedText(dupScan.translated_text || null);
            setNormalizedText(dupScan.normalized_text || '');
            setNotes(dupScan.notes || '');
            setSuspiciousSpans(dupScan.extracted_data?.suspicious_spans || []);
            setPredictedPlaybook(dupScan.extracted_data?.predicted_playbook || []);
            setLoading(false);
            return;
          }
        } catch (dbErr) {
          console.warn('Failed to check duplicate scan, proceeding with Gemini API:', dbErr);
        }
      }

      const result = await analyzeJobPosting(apiKey, modelName, {
        text: scanInput.text,
        imageBase64: scanInput.image
      });

      // Enforce minimum 20s scan time for Gemini API call
      const elapsed = Date.now() - startTime;
      if (elapsed < 20000) {
        await new Promise(resolve => setTimeout(resolve, 20000 - elapsed));
      }

      setFormData({
        job_title: result.job_title || '',
        employer_identity: result.employer_identity || '',
        salary_range: result.salary_range || '',
        location: result.location || '',
        industry: result.industry || '',
        contact_method: result.contact_method || ''
      });
      
      setActiveFlags(result.detected_red_flags || []);
      setOcrText(result.raw_ocr_text || null);
      setAiReview(result.ai_review || '');
      setParsedSalaryUsd(result.parsed_salary_usd || null);
      setLocationCountry(result.location_country || null);
      setDetectedLanguage(result.detected_language || 'English');
      setIsTranslated(result.is_translated || false);
      setTranslatedText(result.translated_text || null);
      setNormalizedText(result.normalized_text || '');
      setSuspiciousSpans(result.suspicious_spans || []);
      setPredictedPlaybook(result.predicted_playbook || []);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Verification scan failed. Please check your API key and network.');
    } finally {
      setLoading(false);
    }
  };

  const handleFlagToggle = (flag) => {
    setActiveFlags(prev => 
      prev.includes(flag) ? prev.filter(f => f !== flag) : [...prev, flag]
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const scoreResult = calculateRiskScore(activeFlags, {
        parsedSalaryUsd,
        locationCountry,
        detectedLanguage,
        contactMethod: formData.contact_method
      });
      const score = scoreResult.score;
      const level = getRiskLevel(score);

      // Handle uploading image if raw Base64
      let imageUrl = scanInput.image || scanInput.originalImage || null;
      if (imageUrl && imageUrl.startsWith('data:image/')) {
        try {
          imageUrl = await uploadBase64Image(imageUrl);
        } catch (uploadErr) {
          console.error("Image upload failed, saving record anyway:", uploadErr);
        }
      }

      const record = {
        timestamp: scanInput.isExistingScan ? scanInput.timestamp : Date.now(),
        jobTitle: formData.job_title,
        employer: formData.employer_identity,
        riskScore: score,
        riskLevel: level.label,
        extractedData: {
          ...formData,
          suspicious_spans: suspiciousSpans,
          predicted_playbook: predictedPlaybook
        },
        activeFlags: activeFlags,
        originalImage: imageUrl,
        originalText: scanInput.text || scanInput.originalText,
        ocrText: ocrText,
        aiReview: aiReview,
        parsedSalaryUsd: parsedSalaryUsd,
        locationCountry: locationCountry,
        detectedLanguage: detectedLanguage,
        isTranslated: isTranslated,
        translatedText: translatedText,
        userId: user?.id || null,
        normalizedText: normalizedText || '',
        notes: notes || '',
        sourcePlatform: sourcePlatform || 'unspecified',
        sourceUrl: sourceUrl || 'unspecified',
        ingestionMethod: ingestionMethod || 'Analyst Upload',
        postDate: postDate || 'unspecified'
      };

      const mappedRecord = mapRecordToDb(record);

      if (scanInput.isExistingScan && scanInput.id) {
        const { error: dbErr } = await supabase
          .from('scans')
          .update(mappedRecord)
          .eq('id', scanInput.id);
        if (dbErr) throw dbErr;
      } else {
        const { error: dbErr } = await supabase
          .from('scans')
          .insert(mappedRecord);
        if (dbErr) throw dbErr;
      }

      navigate('/history');
    } catch (err) {
      console.error('Failed to save:', err);
      alert('Failed to save to database: ' + (err.message || err.toString()));
    } finally {
      setSaving(false);
    }
  };

  const getPlaybookData = () => {
    if (predictedPlaybook && predictedPlaybook.length > 0) {
      return predictedPlaybook;
    }
    const playbook = [];
    let stageNum = 1;
    
    if (activeFlags.includes('Encrypted Apps Migration') || activeFlags.includes('Suspicious Messaging')) {
      playbook.push({
        phase: `Stage ${stageNum++}: Channel Migration`,
        tactic: "Recruiter requests to move conversation away from recruitment platforms (e.g. to Telegram/WhatsApp) to avoid audit logs.",
        red_flag_indicator: "Insistence on shifting to private messengers; deletion of previous messages or use of auto-delete features."
      });
    }
    if (activeFlags.includes('Upfront Fees')) {
      playbook.push({
        phase: `Stage ${stageNum++}: Financial Squeeze`,
        tactic: "Demands deposits or processing fees for passport registry, security clearance, or travel bookings.",
        red_flag_indicator: "Requests for upfront payments via crypto, Western Union, or personal bank accounts prior to contract signing."
      });
    }
    if (activeFlags.includes('Passport/ID Control') || activeFlags.includes('Immediate Travel Pressure')) {
      playbook.push({
        phase: `Stage ${stageNum++}: Administrative Isolation`,
        tactic: "Demands high-res passport pages, national ID copies, or physical passports for visa/ticket pre-processing.",
        red_flag_indicator: "Reluctance to use official consulate submission systems; refusing to let the candidate hold their own passport."
      });
    }
    if (activeFlags.includes('Housing Compound Isolation') || activeFlags.includes('Suspect Location Hub')) {
      playbook.push({
        phase: `Stage ${stageNum++}: Compound Custody`,
        tactic: "Arranges a private shuttle pickup at the arrival airport under a 'company shuttle' guise, taking the candidate straight into an isolated economic zone compound.",
        red_flag_indicator: "Private vehicles refusing public drop-offs; armed guards, barbed wire, and confiscation of devices/documents upon entry."
      });
    }
    if (activeFlags.includes('Wage Disparity') || activeFlags.includes('Labor Abuse / High Pressure')) {
      playbook.push({
        phase: `Stage ${stageNum++}: Coerced Labor Shift`,
        tactic: "Once in the compound, the recruiter informs the candidate that the job has changed (e.g. to chat agent) and demands payment of 'debts' or entry into 12-16 hour daily scamming operations.",
        red_flag_indicator: "Immediate change in job responsibilities, restriction of physical movement, or threats of physical violence."
      });
    }
    
    return playbook;
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#0a0f18] text-slate-300">
        <div className="max-w-xl w-full border border-slate-800 rounded-2xl bg-[#0f1420] overflow-hidden shadow-2xl relative">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-emerald-500/80 animate-pulse" />
          
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-800 bg-[#0c101a] flex justify-between items-center">
            <h3 className="font-mono text-xs uppercase tracking-widest text-emerald-500 font-bold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Veritas Scan Core: Active Audit
            </h3>
            <span className="font-mono text-[10px] text-slate-500">SYS_REV_v1.02</span>
          </div>

          <div className="p-6 flex flex-col md:flex-row gap-6 items-center">
            {/* Left: Scanning Document Box */}
            <div className="relative w-44 h-56 bg-slate-950/80 border border-slate-800 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center shadow-inner">
              {scanInput?.image || scanInput?.originalImage ? (
                <img
                  src={scanInput.image || scanInput.originalImage}
                  alt="Scanning Target"
                  className="w-full h-full object-cover opacity-30 blur-[0.5px]"
                />
              ) : (
                // Simulated text document outline
                <div className="w-full h-full p-4 flex flex-col gap-2 opacity-25">
                  <div className="h-3 bg-slate-800 rounded w-3/4 animate-pulse" />
                  <div className="h-3 bg-slate-800 rounded w-5/6 animate-pulse" />
                  <div className="h-3 bg-slate-850 rounded w-2/3 animate-pulse" />
                  <div className="h-3 bg-slate-850 rounded w-1/2 animate-pulse" />
                  <div className="h-3 bg-slate-800 rounded w-3/4 animate-pulse" />
                  <div className="h-3 bg-slate-800 rounded w-5/6 animate-pulse" />
                </div>
              )}

              {/* Bounding Box Reticles */}
              <div className="absolute top-4 left-4 w-6 h-6 border-t border-l border-emerald-500/60 animate-pulse" />
              <div className="absolute top-4 right-4 w-6 h-6 border-t border-r border-emerald-500/60 animate-pulse" />
              <div className="absolute bottom-4 left-4 w-6 h-6 border-b border-l border-emerald-500/60 animate-pulse" />
              <div className="absolute bottom-4 right-4 w-6 h-6 border-b border-r border-emerald-500/60 animate-pulse" />

              {/* Glowing horizontal Laser Bar */}
              <div className="absolute left-0 w-full h-[3px] bg-emerald-400 shadow-[0_0_10px_#10b981,0_0_20px_#10b981] animate-laser-sweep" />
            </div>

            {/* Right: Tactical Steps Progress Log */}
            <div className="flex-1 w-full space-y-4 font-mono text-xs">
              <div className="space-y-2">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Scanning Tasks</p>
                <div className="space-y-2 bg-slate-950/40 p-4 border border-slate-900 rounded-lg">
                  {LOADING_STEPS.map((step, idx) => {
                    const isDone = idx < loadingStepIdx;
                    const isActive = idx === loadingStepIdx;
                    return (
                      <div
                        key={idx}
                        className={`flex items-center justify-between transition-colors duration-300 ${
                          isDone ? 'text-emerald-500/80' : isActive ? 'text-slate-200 font-bold' : 'text-slate-600'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {isDone ? (
                            <span className="text-[9px] bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 text-emerald-400 font-bold">OK</span>
                          ) : isActive ? (
                            <span className="text-[9px] bg-emerald-500/20 px-1.5 py-0.5 rounded border border-emerald-500/30 text-emerald-400 animate-pulse font-bold">RUN</span>
                          ) : (
                            <span className="text-[9px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-slate-650 font-bold">WAIT</span>
                          )}
                          <span className="truncate max-w-[200px]">{step}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Live console message */}
              <div className="p-3 bg-slate-950/80 border border-slate-900 rounded-lg text-[10px] text-emerald-500/90 leading-normal flex items-center gap-1.5">
                <span className="text-slate-600">&gt;</span> 
                <span className="animate-pulse">SYS_AUDIT_LOG: {LOADING_STEPS[loadingStepIdx]}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <AlertTriangle className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Analysis Failed</h2>
        <p className="text-red-600 dark:text-red-400 mb-6">{error}</p>
        <button 
          onClick={() => navigate(scanInput?.isExistingScan ? '/history' : '/')}
          className="bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-6 py-2 rounded-lg font-medium"
        >
          Go Back
        </button>
      </div>
    );
  }

  const scoreResult = calculateRiskScore(activeFlags, {
    parsedSalaryUsd,
    locationCountry,
    detectedLanguage,
    contactMethod: formData.contact_method
  });
  const score = scoreResult.score;
  const scoreDetails = scoreResult.details;
  const riskInfo = getRiskLevel(score);

  // Sticky intel bar derived values
  const stickyScoreColor = score >= 60 ? 'text-red-400 bg-red-500/10 border-red-500/30' : score >= 30 ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';

  return (
    <div className="flex flex-col flex-1 p-4 max-w-4xl w-full mx-auto space-y-6">
      
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Review Analysis</h1>
      </div>

      {/* Sticky intel bar */}
      <div className="sticky top-0 z-40 -mx-4 px-4 py-2 flex items-center justify-between gap-3 backdrop-blur-md border-b" style={{ background: 'rgba(10,12,18,0.88)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <span className="text-xs font-mono font-bold text-slate-400 truncate">
          {formData.job_title ? `▸ ${formData.job_title}` : '▸ Ad Review'}
          {formData.location ? <span className="text-slate-600 font-normal"> · {formData.location}</span> : null}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {suspiciousSpans.length > 0 && (
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border text-amber-400 bg-amber-500/10 border-amber-500/30">
              {suspiciousSpans.length} flags
            </span>
          )}
          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${stickyScoreColor}`}>
            RISK {score}
          </span>
        </div>
      </div>

      {/* Interactive Ad Analysis — Tactical threat card */}
      <div className="rounded-xl overflow-hidden border border-slate-800" style={{background: '#111318'}}>
        {/* 1px amber classification stripe at very top */}
        <div className="h-px bg-amber-500/60 w-full" />

        {/* Card header — flat, no glow */}
        <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap gap-3 items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-200 flex items-center gap-2 text-sm tracking-tight">
              <BrainCircuit className="w-4 h-4 text-slate-500" />
              Threat Analysis
              {suspiciousSpans.length > 0 && (
                <span className="ml-1 text-[10px] font-semibold text-slate-500 border border-slate-700 px-2 py-0.5 rounded-full tracking-widest">
                  {suspiciousSpans.length} flagged
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-600 mt-0.5">Hover flagged phrases to view threat intelligence.</p>
          </div>

          {/* Highlight Toggle — plain text switch */}
          <button
            onClick={() => setShowHighlights(prev => !prev)}
            className="text-[11px] font-semibold text-slate-600 hover:text-slate-400 transition-colors border border-slate-800 hover:border-slate-700 px-3 py-1.5 rounded-lg"
          >
            {showHighlights ? 'Hide Highlights' : 'Show Highlights'}
          </button>
        </div>

        {/* Floating Threat Chip Zone */}
        {suspiciousSpans.length > 0 && showHighlights && (
          <div className="border-b border-slate-800/60 px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-3">Detected Threats</p>
            <ThreatBubbles spans={suspiciousSpans} showHighlights={showHighlights} />
          </div>
        )}

        {/* Tab Bar */}
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
          <div className="flex bg-slate-900/60 border border-slate-800 p-0.5 rounded-lg text-xs">
            {['original', ...(isTranslated ? ['translation'] : []), 'normalized'].map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTabInput(tab)}
                className={`px-3 py-1.5 rounded-md font-semibold capitalize transition-all ${
                  activeTabInput === tab
                    ? 'bg-slate-800 text-slate-200 shadow-sm'
                    : 'text-slate-600 hover:text-slate-400'
                }`}
              >
                {tab === 'translation' ? 'Translation' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Text Body + Annotation Overlay — Forensic evidence document, dark edition */}
        <div
          ref={textContainerRef}
          className="relative"
          style={{
            minHeight: `${containerMinHeight}px`,
            background: '#0c0f16',
            backgroundImage: `repeating-linear-gradient(
              transparent,
              transparent 27px,
              rgba(255,255,255,0.032) 27px,
              rgba(255,255,255,0.032) 28px
            )`,
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04), inset 0 4px 20px rgba(0,0,0,0.4)',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          {/* Forensic EXHIBIT watermark */}
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

          {/* Left margin rule */}
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
                {highlightWords(ocrText || scanInput?.text || scanInput?.originalText || 'No input text provided.', suspiciousSpans, showHighlights, false, hoveredKey, setHoveredKey)}
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

          {/* Annotation Overlay — SVG connectors + floating cards */}
          {showHighlights && annotationCards.length > 0 && activeTabInput !== 'normalized' && (
            <>
              {/* SVG bezier dotted connectors */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ overflow: 'visible', zIndex: 10 }}
              >
                <defs>
                  {/* Pulse ring filter for source dots */}
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
                      key={card.key + '-svg'}
                      style={{ opacity: strokeOpacity, transition: 'opacity 0.25s ease' }}
                    >
                      {/* Outer halo ring */}
                      <circle
                        cx={card.dotX} cy={card.dotY} r="8"
                        fill={card.isHigh ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.07)'}
                      />
                      {/* Mid ring */}
                      <circle
                        cx={card.dotX} cy={card.dotY} r="5"
                        fill={card.isHigh ? 'rgba(239,68,68,0.14)' : 'rgba(245,158,11,0.12)'}
                      />
                      {/* Core dot */}
                      <circle
                        cx={card.dotX} cy={card.dotY} r="3"
                        fill={card.isHigh ? '#ef4444' : '#f59e0b'}
                        filter="url(#dot-glow)"
                      />
                      {/* Bezier connector — thicker, more opaque */}
                      <path
                        id={`path-${card.key}`}
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
 
              {/* Floating annotation cards */}
              {annotationCards.map(card => {
                const isCurrentHovered = hoveredKey === card.key;
                const isAnyHovered = hoveredKey !== null;
                const cardOpacity = isAnyHovered ? (isCurrentHovered ? 1.0 : 0.15) : 1.0;

                return (
                  <div
                    key={card.key}
                    data-card-key={card.key}
                    ref={el => {
                      const c = cardsPhysicsRef.current.find(p => p.key === card.key);
                      if (c) c.element = el;
                    }}
                    onMouseDown={e => handleDragStart(card.key, e)}
                    onTouchStart={e => handleDragStart(card.key, e)}
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
                  {/* Left-pointing callout arrow */}
                  <div className="absolute left-0 top-1/2 -translate-y-1/2" style={{ left: -7, zIndex: 1 }}>
                    <div className={`w-0 h-0 border-t-[7px] border-b-[7px] border-r-[8px] border-t-transparent border-b-transparent ${
                      card.isHigh ? 'border-r-red-500/30' : 'border-r-amber-500/25'
                    }`} />
                  </div>
                  <div className={`relative rounded-lg overflow-hidden shadow-2xl shadow-black/70 ring-1 ring-white/5 border-l-[3px] w-full h-full ${
                    card.isHigh ? 'border-l-red-500' : 'border-l-amber-400'
                  }`} style={{ background: 'linear-gradient(160deg, #0d1520 0%, #0a0f18 100%)' }}>
                    {/* Header */}
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
                    {/* Body */}
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


      {/* Trafficker Playbook — compact summary-first (Option C) */}
      {getPlaybookData().length > 0 && (
        <div className="rounded-2xl overflow-hidden border border-slate-800/80" style={{background:'#111318'}}>
          {/* Collapsed summary bar — always visible */}
          <button
            type="button"
            onClick={() => setIsPlaybookExpanded(p => !p)}
            className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-red-500/5 dark:hover:bg-red-950/10 transition-colors"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <ShieldAlert className="w-4 h-4 text-red-500 flex-shrink-0" />
              <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                <span className="font-bold text-red-500">{getPlaybookData().length} predicted exploitation stages</span>
                <span className="text-slate-400 dark:text-slate-500 font-normal"> detected based on current indicators</span>
              </span>
            </div>
            <span className="flex items-center gap-1 text-xs text-red-400 font-semibold flex-shrink-0 font-mono">
              {isPlaybookExpanded ? 'Hide' : 'View Playbook'}
              {isPlaybookExpanded
                ? <ChevronUp className="w-3.5 h-3.5" />
                : <ChevronDown className="w-3.5 h-3.5" />}
            </span>
          </button>

          {/* Slide-down panel */}
          {isPlaybookExpanded && (
            <div className="border-t border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/80">
              {getPlaybookData().map((step, idx) => {
                const isRowOpen = expandedPlaybookRows.has(idx);
                // Extract a short stage label from the phase string e.g. "Stage 1: Contact" -> "Contact"
                const stageLabel = step.phase?.replace(/^Stage \d+:\s*/i, '') || step.phase;
                // Severity: first 2 stages are higher risk
                const isHighSeverity = idx < 2;
                return (
                  <div key={idx} className="select-text">
                    {/* Compact row */}
                    <div className="flex items-start gap-3 px-4 py-3">
                      {/* Severity bar */}
                      <div className={`w-[3px] self-stretch rounded-full flex-shrink-0 mt-0.5 ${
                        isHighSeverity ? 'bg-red-500' : 'bg-amber-500'
                      }`} />

                      {/* Step number */}
                      <span className={`text-[10px] font-bold font-mono flex-shrink-0 mt-0.5 ${
                        isHighSeverity ? 'text-red-400' : 'text-amber-400'
                      }`}>
                        {String(idx + 1).padStart(2, '0')}
                      </span>

                      {/* Stage label + tactic summary */}
                      <div className="flex-1 min-w-0">
                        <span className={`text-[9px] font-bold uppercase tracking-widest font-mono ${
                          isHighSeverity ? 'text-red-400' : 'text-amber-400'
                        }`}>{stageLabel}</span>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">{step.tactic}</p>
                      </div>

                      {/* Per-row details toggle */}
                      <button
                        type="button"
                        onClick={() => setExpandedPlaybookRows(prev => {
                          const next = new Set(prev);
                          next.has(idx) ? next.delete(idx) : next.add(idx);
                          return next;
                        })}
                        className="flex-shrink-0 text-[10px] font-mono font-semibold text-slate-400 hover:text-amber-400 transition-colors mt-0.5 whitespace-nowrap"
                      >
                        {isRowOpen ? '− hide' : '+ watch for'}
                      </button>
                    </div>

                    {/* Inline indicator detail */}
                    {isRowOpen && (
                      <div className="px-4 pb-3 ml-[calc(3px+12px+20px+12px)]">
                        <p className="text-[11px] text-amber-500/90 dark:text-amber-400/80 leading-relaxed bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2">
                          {step.red_flag_indicator}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}


      {/* Take Action Operational Dashboard */}
      <div className="rounded-2xl overflow-hidden border border-slate-800/80 p-5" style={{background:'#111318'}}>
        <div className="border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
          <h3 className="font-bold text-slate-800 dark:text-slate-200">Take Action</h3>
          <p className="text-xs text-slate-500 mt-1">Operational next steps and evidence-gathering tools for analysts.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TAKE_ACTIONS.map(action => {
            const Icon = action.icon;
            return (
              <div 
                key={action.id} 
                className="bg-slate-50/50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between transition-all duration-350 hover:scale-[1.02] hover:shadow-[0_0_15px_rgba(16,185,129,0.06)] hover:border-emerald-500/30 group"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="p-2 bg-slate-100 dark:bg-slate-950 rounded-lg text-slate-600 dark:text-slate-400 group-hover:text-emerald-500 group-hover:bg-emerald-500/5 transition-all duration-300">
                      <Icon className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                    </div>
                    <span className="text-[9px] font-black font-mono tracking-wider bg-slate-100 dark:bg-slate-950 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800/80">
                      {action.badge}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-3 select-text leading-snug">
                    {action.title}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed select-text">
                    {action.description}
                  </p>
                </div>
                
                <button
                  type="button"
                  onClick={() => setActiveActionToast({
                    title: action.title,
                    description: "This action workflow is configured. Functional integrations will be added in a future update."
                  })}
                  className="mt-4 w-full py-2 bg-slate-100 hover:bg-emerald-500/10 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/30 text-slate-600 hover:text-emerald-500 dark:text-slate-400 dark:hover:text-emerald-400 text-xs font-mono font-bold rounded-lg transition-all duration-200 tracking-wider flex items-center justify-center gap-1.5 active:scale-95"
                >
                  {action.ctaText}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Action Feedback Toast */}
      {activeActionToast && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-slate-900 border border-emerald-500/30 text-white rounded-xl shadow-2xl p-4 flex items-start gap-3 animate-fade-in">
          <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 animate-pulse" />
          <div className="flex-1">
            <h4 className="text-xs font-bold font-mono text-emerald-400 uppercase tracking-wider">{activeActionToast.title}</h4>
            <p className="text-[11px] text-slate-400 mt-1">{activeActionToast.description}</p>
          </div>
          <button 
            type="button"
            onClick={() => setActiveActionToast(null)} 
            className="text-slate-500 hover:text-slate-300 transition-colors p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Collapsible reference flyer image box */}
      {(scanInput?.image || scanInput?.originalImage) && (
        <div className="rounded-2xl overflow-hidden border border-slate-800/80" style={{background:'#111318'}}>
          <button
            type="button"
            onClick={() => setIsImageExpanded(!isImageExpanded)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-slate-500" />
              <div>
                <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Original Flyer Reference Image</h4>
                <p className="text-xs text-slate-500 mt-0.5">Click to view the raw uploaded image flyer</p>
              </div>
            </div>
            {isImageExpanded ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
          </button>
          
          {isImageExpanded && (
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 flex justify-center">
              <img
                src={scanInput.image || scanInput.originalImage}
                alt="Raw Flyer"
                className="w-full max-w-sm mx-auto rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 object-contain max-h-96"
              />
            </div>
          )}
        </div>
      )}



      {/* Similar Job Postings Section */}
      {similarScans.length > 0 && (
        <div className="rounded-2xl overflow-hidden border border-slate-800/80" style={{background:'#111318'}}>
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-200">Similar Job Ads Detected</h3>
              <p className="text-xs text-slate-500 mt-1">Found potential matches or template re-use in your history.</p>
            </div>
            <span className="bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 text-xs px-2.5 py-1 rounded-full font-bold">
              {similarScans.length} similar ad{similarScans.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto">
            {similarScans.map((scan) => {
              const pct = Math.round(scan.similarity * 100);
              return (
                <div key={scan.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white truncate">
                        {scan.jobTitle || 'Unknown Job'}
                      </span>
                      <span className="text-xs text-slate-400 truncate">
                        ({scan.employer || 'Unknown Employer'})
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Scanned on {new Date(scan.timestamp).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-xs font-bold px-2 py-1 rounded ${
                      pct >= 80 ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400' :
                      pct >= 60 ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400' :
                      'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}>
                      {pct}% Match
                    </span>
                    <button
                      type="button"
                      onClick={() => setComparisonTarget(scan)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                    >
                      <Columns className="w-3.5 h-3.5" />
                      Compare Diff
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Risk Score Widget — Radial Gauge */}
      {(() => {
        const gaugeSize = 180;
        const strokeW = 14;
        const r = (gaugeSize / 2) - strokeW;
        // Arc spans 240 degrees (from 150° to 390°/30°)
        const arcDeg = 240;
        const circumference = Math.PI * 2 * r;
        const arcLen = (arcDeg / 360) * circumference;
        const gapLen = circumference - arcLen;
        // dashoffset: fill proportion based on score
        const fillPct = Math.min(score, 100) / 100;
        const fillLen = fillPct * arcLen;
        const dashOffset = arcLen - fillLen;
        const scoreColor = score >= 60 ? '#ef4444' : score >= 30 ? '#f59e0b' : '#10b981';
        const scoreGlow = score >= 60 ? 'rgba(239,68,68,0.35)' : score >= 30 ? 'rgba(245,158,11,0.30)' : 'rgba(16,185,129,0.30)';
        const scoreBorder = score >= 60 ? 'border-red-800/40' : score >= 30 ? 'border-amber-800/40' : 'border-emerald-800/40';
        // rotation so arc starts at bottom-left
        const rotation = 150;
        return (
          <div className={`rounded-2xl overflow-hidden border ${scoreBorder}`} style={{background:'#111318'}}>
            {/* Gauge hero */}
            <div className="px-5 pt-5 pb-3 flex items-center gap-6">
              {/* SVG Radial Arc */}
              <div className="relative flex-shrink-0" style={{width: gaugeSize, height: gaugeSize * 0.72}}>
                {!scoreBarsVisible && (
                  <span className="sr-only" ref={el => { if (el) requestAnimationFrame(() => setScoreBarsVisible(true)); }} />
                )}
                <svg
                  width={gaugeSize}
                  height={gaugeSize}
                  viewBox={`0 0 ${gaugeSize} ${gaugeSize}`}
                  style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
                >
                  <defs>
                    <filter id="score-glow">
                      <feGaussianBlur stdDeviation="4" result="blur"/>
                      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                  </defs>
                  {/* Track arc */}
                  <circle
                    cx={gaugeSize/2} cy={gaugeSize/2} r={r}
                    fill="none"
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth={strokeW}
                    strokeDasharray={`${arcLen} ${gapLen}`}
                    strokeDashoffset={0}
                    strokeLinecap="round"
                    transform={`rotate(${rotation} ${gaugeSize/2} ${gaugeSize/2})`}
                  />
                  {/* Fill arc */}
                  <circle
                    cx={gaugeSize/2} cy={gaugeSize/2} r={r}
                    fill="none"
                    stroke={scoreColor}
                    strokeWidth={strokeW}
                    strokeDasharray={`${arcLen} ${gapLen}`}
                    strokeDashoffset={scoreBarsVisible ? dashOffset : arcLen}
                    strokeLinecap="round"
                    filter="url(#score-glow)"
                    transform={`rotate(${rotation} ${gaugeSize/2} ${gaugeSize/2})`}
                    style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.34,1.56,0.64,1)', transitionDelay: '150ms' }}
                  />
                  {/* Center score label */}
                  <text
                    x={gaugeSize/2} y={gaugeSize/2 + 2}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize="40" fontWeight="900" fontFamily="monospace"
                    fill="white"
                  >{score}</text>
                  <text
                    x={gaugeSize/2} y={gaugeSize/2 + 26}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize="9" fontWeight="700" fontFamily="monospace"
                    fill={scoreColor}
                    letterSpacing="3"
                  >{riskInfo.label.toUpperCase()}</text>
                </svg>
              </div>

              {/* Breakdown bars */}
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest mb-2">Risk Breakdown</p>
                {scoreDetails && scoreDetails.length > 0 ? (
                  <div className="space-y-1.5">
                    {[...scoreDetails].sort((a, b) => b.weight - a.weight).map((detail, idx) => {
                      const maxWeight = Math.max(...scoreDetails.map(d => d.weight));
                      const pct = Math.round((detail.weight / maxWeight) * 100);
                      const isCritical = CRITICAL_FLAGS.has(detail.name);
                      const barColor = detail.isSalaryAnomaly || detail.isCrossBorderMismatch
                        ? '#f59e0b' : isCritical ? '#ef4444' : '#f87171';
                      return (
                        <div key={detail.name} className="flex items-center gap-2">
                          <span className="text-[10px] w-[46%] flex-shrink-0 truncate text-slate-400 font-mono">{detail.name}</span>
                          <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all ease-out"
                              style={{
                                width: scoreBarsVisible ? `${pct}%` : '0%',
                                background: barColor,
                                transitionDuration: '600ms',
                                transitionDelay: `${150 + idx * 60}ms`,
                              }}
                            />
                          </div>
                          <span className="text-[9px] font-mono text-slate-500 w-5 text-right flex-shrink-0">+{detail.weight}</span>
                        </div>
                      );
                    })}
                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-800">
                      <span className="text-[10px] text-slate-600 uppercase tracking-widest font-mono">Total (capped)</span>
                      <span className="text-xs font-black font-mono" style={{color: scoreColor}}>{score} / 100</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-600 font-mono">No risk triggers detected.</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* AI Review Widget */}
      {aiReview && (
        <div className="rounded-2xl overflow-hidden border border-indigo-900/40" style={{background:'#111318'}}>
          <div className="p-4 border-b border-indigo-900/30 bg-indigo-500/5 flex items-center gap-2">
             <BrainCircuit className="w-4 h-4 text-indigo-400" />
             <h3 className="font-bold text-slate-200 text-sm">AI Scam Analysis</h3>
          </div>
          <div className="p-4 text-sm text-slate-400 leading-relaxed border-l-2 border-indigo-500/30 ml-4 mr-4 mt-0 pl-3">
             {aiReview}
          </div>
        </div>
      )}

      {/* Analyst Comments & Notes Widget */}
      <div className="rounded-2xl overflow-hidden border border-slate-800/80" style={{background:'#111318'}}>
        <button
          type="button"
          onClick={() => setIsNotesExpanded(prev => !prev)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-emerald-500" />
            <div>
              <h3 className="font-bold text-slate-200 text-sm">Analyst Notes & Case Comments</h3>
              <p className="text-xs text-slate-600 mt-0.5">
                {notes ? 'Click to view/edit existing comments' : 'Click to add internal investigation comments'}
              </p>
            </div>
          </div>
          {isNotesExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </button>

        {isNotesExpanded && (
          <div className="p-4 border-t border-slate-800">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter details about associated syndicates, Telegram channels, recruiter identities, or general investigation notes..."
              rows={4}
              className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-300 focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/30 transition-all outline-none resize-y placeholder:text-slate-600 font-mono"
            />
          </div>
        )}
      </div>

      {/* Source & Ingestion Metadata Widget */}
      <div className="rounded-2xl overflow-hidden border border-slate-800/80" style={{background:'#111318'}}>
        <button
          type="button"
          onClick={() => setIsSourceExpanded(prev => !prev)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <div>
              <h3 className="font-bold text-slate-200 text-sm">Source & Ingestion Context</h3>
              <p className="text-xs text-slate-650 mt-0.5">
                Review platform, URL, ingestion method, and original post date
              </p>
            </div>
          </div>
          {isSourceExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </button>

        {isSourceExpanded && (
          <div className="p-4 border-t border-slate-800 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Source Platform */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                  Source Platform
                </label>
                <select
                  value={sourcePlatform}
                  onChange={(e) => setSourcePlatform(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all font-mono"
                >
                  <option value="unspecified">Unspecified</option>
                  <option value="Facebook">Facebook</option>
                  <option value="Telegram">Telegram</option>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Line">Line</option>
                  <option value="WeChat">WeChat</option>
                  <option value="TikTok">TikTok</option>
                  <option value="LinkedIn">LinkedIn</option>
                  <option value="Craigslist">Craigslist</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Ingestion Method */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                  Ingestion Method
                </label>
                <select
                  value={ingestionMethod}
                  onChange={(e) => setIngestionMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all font-mono"
                >
                  <option value="Analyst Upload">Analyst Upload</option>
                  <option value="Web Scraper">Web Scraper</option>
                  <option value="API Feed">API Feed</option>
                  <option value="Community Tip Line">Community Tip Line</option>
                </select>
              </div>
            </div>

            {/* Source URL */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                Source URL Link
              </label>
              <input
                type="text"
                value={sourceUrl === 'unspecified' ? '' : sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value || 'unspecified')}
                placeholder="Unspecified URL"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-350 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all font-mono"
              />
            </div>

            {/* Post Date */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                Post Date
              </label>
              <input
                type="text"
                value={postDate === 'unspecified' ? '' : postDate}
                onChange={(e) => setPostDate(e.target.value || 'unspecified')}
                placeholder="Unspecified Date (e.g. YYYY-MM-DD)"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-350 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all font-mono"
              />
            </div>
          </div>
        )}
      </div>

      {/* Extracted Data Form */}
      <div className="rounded-2xl overflow-hidden border border-slate-800/80" style={{background:'#111318'}}>
        <div className="p-4 border-b border-slate-800">
           <h3 className="font-bold text-slate-200 text-sm">Extracted Details</h3>
           <p className="text-xs text-slate-600 mt-1">Tap fields to correct any inaccuracies.</p>
        </div>
        <div className="p-4 space-y-4">
           {Object.keys(formData).map(key => (
             <div key={key}>
               <div className="flex items-center justify-between mb-1.5">
                 <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                   {key.replace('_', ' ')}
                 </label>
                 {key === 'location' && formData[key] && (
                    <a 
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formData[key])}`}
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1"
                    >
                      <MapPin className="w-3 h-3" /> View Map
                    </a>
                 )}
                 {key === 'contact_method' && formData[key] && (() => {
                      const deepLink = getContactDeepLink(formData[key]);
                      const cleanContact = getCleanContactValue ? getCleanContactValue(formData[key]) : formData[key];
                      return (
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          {deepLink && (
                            <a 
                              href={deepLink.url}
                              className={`text-[10px] flex items-center gap-1 font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border transition-colors ${
                                deepLink.platform === 'Telegram' 
                                  ? 'bg-sky-50 dark:bg-sky-950/20 text-sky-655 dark:text-sky-400 border-sky-200 dark:border-sky-900/40 hover:bg-sky-100' 
                                  : 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-655 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40 hover:bg-emerald-100'
                              }`}
                            >
                              Open {deepLink.platform}
                            </a>
                          )}
                          {cleanContact && (
                            <button
                              type="button"
                              onClick={() => navigate(`/trafficker/${encodeURIComponent(cleanContact)}`)}
                              className="text-[10px] flex items-center gap-1 font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-900/40 hover:bg-purple-100 transition-colors"
                            >
                              Dossier Profile ➔
                            </button>
                          )}
                        </div>
                      );
                   })()}
               </div>
               <input
                 type="text"
                 value={formData[key] || ''}
                 onChange={(e) => setFormData({...formData, [key]: e.target.value})}
                 className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none"
               />
               
               {/* Salary Delta Logic */}
               {key === 'salary_range' && parsedSalaryUsd && locationCountry && (
                 (() => {
                   const median = getMedianSalary(locationCountry);
                   if (!median) return null;
                   
                   const diff = parsedSalaryUsd - median;
                   const percentDiff = Math.round((diff / median) * 100);
                   const isHigh = percentDiff > 50; // Arbitrary threshold for "too good to be true"
                   
                   return (
                     <div className={`mt-2 text-xs flex items-start gap-1.5 p-2 rounded-lg border ${isHigh ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/30 text-amber-700 dark:text-amber-400' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'}`}>
                       <TrendingUp className="w-4 h-4 flex-shrink-0 mt-0.5" />
                       <div>
                         Estimated at <strong>${parsedSalaryUsd.toLocaleString()} USD/yr</strong>.<br/>
                         {percentDiff > 0 ? `+${percentDiff}%` : `${percentDiff}%`} compared to median in {locationCountry} (${median.toLocaleString()} USD).
                         {isHigh && " Be cautious of unusually high salaries."}
                       </div>
                     </div>
                   );
                 })()
               )}
              </div>
            ))}

            {/* Original Language Field */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Original Language
              </label>
              <input
                type="text"
                value={detectedLanguage}
                readOnly
                className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-500 dark:text-slate-400 outline-none cursor-not-allowed"
              />
            </div>
         </div>
       </div>

      {/* Risk Flags Override */}
      <div className="rounded-2xl overflow-hidden border border-slate-800/80 mb-6" style={{background:'#111318'}}>
        <div className="p-4 border-b border-slate-800">
           <h3 className="font-bold text-slate-200 text-sm">Risk Indicators</h3>
           <p className="text-xs text-slate-600 mt-1">Check triggers you've discovered to recalculate the score.</p>
        </div>
        <div className="p-2 divide-y divide-slate-100 dark:divide-slate-800/50">
           {Object.keys(RISK_FLAGS).map(flag => (
             <label key={flag} className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg transition-colors">
               <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{flag}</span>
               <input
                 type="checkbox"
                 checked={activeFlags.includes(flag)}
                 onChange={() => handleFlagToggle(flag)}
                 className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 bg-slate-100 dark:bg-slate-800 dark:border-slate-600"
               />
             </label>
           ))}
        </div>
      </div>

      {/* Raw OCR Text */}
      {ocrText && (
        <div className="rounded-2xl overflow-hidden border border-slate-800/80 mb-6" style={{background:'#111318'}}>
          <div className="p-4 border-b border-slate-800">
             <h3 className="font-bold text-slate-200 text-sm">Image OCR Output</h3>
             <p className="text-xs text-slate-600 mt-1">Full text extracted from the image by the AI.</p>
          </div>
          <div className="p-4 bg-slate-50 dark:bg-slate-950">
             <div className="text-sm font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
               {ocrText}
             </div>
          </div>
        </div>
      )}

      {/* Save FAB */}
      <div className="fixed bottom-[72px] left-0 right-0 p-4 max-w-screen-md mx-auto pointer-events-none flex justify-end">
        <button 
          onClick={handleSave}
          disabled={saving}
          className="pointer-events-auto bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg rounded-full px-6 py-3 font-bold flex items-center gap-2 active:scale-95 transition-all"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          Save to History
        </button>
      </div>

      {/* Side-by-Side Diff Modal */}
      {comparisonTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[85vh] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-lg">
                  <Columns className="w-5 h-5 text-emerald-600" />
                  Side-by-Side Ad Comparison
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Comparing current ad with historical scan from {new Date(comparisonTarget.timestamp).toLocaleDateString()} ({Math.round(comparisonTarget.similarity * 100)}% match)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setComparisonTarget(null)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Content - Side by Side Scrollable Panels */}
            <div className="flex-1 overflow-hidden grid grid-cols-2 divide-x divide-slate-200 dark:divide-slate-800">
              {/* Left Panel: Historical Ad */}
              <div className="flex flex-col h-full overflow-hidden">
                <div className="p-3 bg-slate-50/30 dark:bg-slate-900/30 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase">Historical Scan</span>
                  <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded font-mono truncate max-w-[200px]">
                    {comparisonTarget.jobTitle || 'Unknown'}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 font-sans text-sm leading-relaxed text-slate-700 dark:text-slate-300 bg-slate-50/10 dark:bg-slate-950/10 whitespace-pre-wrap select-text">
                  {(() => {
                    const diffs = computeWordDiff(comparisonTarget.originalText || comparisonTarget.ocrText || '', scanInput?.text || scanInput?.originalText || ocrText || '');
                    return diffs
                      .filter(d => d.type !== 'added')
                      .map((d, index) => (
                        <span 
                          key={index} 
                          className={d.type === 'removed' ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 font-bold px-0.5 rounded border-b border-red-300 dark:border-red-800' : ''}
                        >
                          {d.value}
                        </span>
                      ));
                  })()}
                </div>
              </div>

              {/* Right Panel: Current Ad */}
              <div className="flex flex-col h-full overflow-hidden">
                <div className="p-3 bg-slate-50/30 dark:bg-slate-900/30 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase">Current Scan</span>
                  <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded font-mono truncate max-w-[200px]">
                    {formData.job_title || 'Current'}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 font-sans text-sm leading-relaxed text-slate-700 dark:text-slate-300 bg-slate-50/10 dark:bg-slate-950/10 whitespace-pre-wrap select-text">
                  {(() => {
                    const diffs = computeWordDiff(comparisonTarget.originalText || comparisonTarget.ocrText || '', scanInput?.text || scanInput?.originalText || ocrText || '');
                    return diffs
                      .filter(d => d.type !== 'removed')
                      .map((d, index) => (
                        <span 
                          key={index} 
                          className={d.type === 'added' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold px-0.5 rounded border-b border-emerald-300 dark:border-emerald-800' : ''}
                        >
                          {d.value}
                        </span>
                      ));
                  })()}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setComparisonTarget(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-sm font-bold rounded-xl shadow-sm transition-colors"
              >
                Close Comparison
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// Helper to parse standardized contact details and build native macOS protocol links
function getContactDeepLink(value) {
  if (!value) return null;
  const str = value.trim();

  // 1. Standardized Telegram formats
  if (str.startsWith('Telegram: @')) {
    const username = str.substring(11).trim();
    return { url: `tg://resolve?domain=${username}`, platform: 'Telegram', label: `@${username}` };
  }
  if (str.startsWith('Telegram Invite:')) {
    const invite = str.substring(16).trim();
    return { url: `tg://join?invite=${invite}`, platform: 'Telegram', label: 'Invite Link' };
  }

  // 2. Standardized WhatsApp formats
  if (str.startsWith('WhatsApp:')) {
    const number = str.substring(9).replace(/[^0-9]/g, '');
    return { url: `whatsapp://send?phone=${number}`, platform: 'WhatsApp', label: `+${number}` };
  }

  // 3. Fallback regex checks for non-standard or user-edited values
  // Telegram username / links
  const tgUserMatch = str.match(/(?:t\.me\/|tg:\/\/resolve\?domain=)([a-zA-Z0-9_]{5,32})/i);
  if (tgUserMatch) {
    return { url: `tg://resolve?domain=${tgUserMatch[1]}`, platform: 'Telegram', label: `@${tgUserMatch[1]}` };
  }
  const tgInviteMatch = str.match(/(?:t\.me\/\+|tg:\/\/join\?invite=)([a-zA-Z0-9_-]+)/i);
  if (tgInviteMatch) {
    return { url: `tg://join?invite=${tgInviteMatch[1]}`, platform: 'Telegram', label: 'Invite Link' };
  }
  const tgRawUser = str.match(/^@([a-zA-Z0-9_]{5,32})$/);
  if (tgRawUser) {
    return { url: `tg://resolve?domain=${tgRawUser[1]}`, platform: 'Telegram', label: `@${tgRawUser[1]}` };
  }

  // WhatsApp links/numbers
  const waMatch = str.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)([0-9]+)/i);
  if (waMatch) {
    return { url: `whatsapp://send?phone=${waMatch[1]}`, platform: 'WhatsApp', label: `+${waMatch[1]}` };
  }
  
  return null;
}
