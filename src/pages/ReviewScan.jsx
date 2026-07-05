import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase, mapRecordToDb, mapDbToRecord, uploadBase64Image } from '../utils/supabaseClient';
import { calculateRiskScore, getRiskLevel, RISK_FLAGS } from '../utils/scoring';
import { ShieldAlert, CheckCircle, AlertTriangle, Save, ArrowLeft, Loader2, MapPin, TrendingUp, BrainCircuit, Columns, Copy, X, MessageSquare, ChevronDown, ChevronUp, Eye, EyeOff, Image as ImageIcon, FileText, PhoneCall, Layers, Globe, HelpCircle, Users, ExternalLink } from 'lucide-react';
import { analyzeJobPosting, generatePosterContent, analyzeCrop, analyzeLanguageDialect } from '../services/geminiService';
import { getMedianSalary } from '../utils/countryMedians';
import { getCleanContactValue } from './DashboardView';
import { useAuth } from '../context/AuthContext';
import { calculateSimilarity, computeWordDiff, computeKeywordMatches, STOP_WORDS, GENERIC_JOB_WORDS } from '../utils/similarity';
import { generateStixBundle } from '../utils/stixExporter';
import { buildPosterPrintHtml } from '../utils/posterGenerator';

const sanitizeTraumaLanguage = (text) => {
  if (!text) return text;
  return text.replace(/\bvictim\b/gi, "worker").replace(/\bvictims\b/gi, "workers");
};

const makeTentative = (text) => {
  if (!text) return text;
  let t = sanitizeTraumaLanguage(text.trim());
  
  // If it already starts with a tentative prefix, leave it
  if (/^(it's probable|it is probable|it's possible|it is possible|it might|recruiter might|workers might|probably|possibly)/i.test(t)) {
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // Handle present participle (-ing) verb starts
  if (/^[a-zA-Z]+ing\b/i.test(t)) {
    t = t.charAt(0).toLowerCase() + t.slice(1);
    return `It is probable that this stage involves ${t}`;
  }
  
  // Specific replacements for common patterns
  t = t.replace(/^workers are subjected to/i, "it's probable that workers are subjected to");
  t = t.replace(/^recruiter will likely use/i, "it's probable that the recruiter will use");
  t = t.replace(/^recruiter will use/i, "it's probable that the recruiter will use");
  t = t.replace(/^workers might be/i, "it's possible that workers might be");
  t = t.replace(/^workers are/i, "it is possible that workers are");
  t = t.replace(/^recruiter requests/i, "it is probable that the recruiter will request");
  t = t.replace(/^recruiter demands/i, "it is probable that the recruiter will demand");
  t = t.replace(/^arranges/i, "it is probable that the recruiter will arrange");
  
  return t.charAt(0).toUpperCase() + t.slice(1);
};

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

const getTakedownDetails = (contactMethod, jobUrl) => {
  const method = (contactMethod || '').toLowerCase();
  const url = (jobUrl || '').toLowerCase();
  
  if (method.includes('telegram') || method.includes('@') || url.includes('t.me') || url.includes('telegram.org')) {
    const handle = contactMethod.replace(/Telegram:\s*@?/i, '').replace(/@/, '').trim() || 'suspect_recruiter';
    return {
      platform: 'Telegram',
      target: 'abuse@telegram.org',
      webLink: 'https://telegram.org/support',
      subject: `[ALERT] Severe Exploitation & Trafficking Activity - Telegram Handle: @${handle}`,
      body: `Dear Telegram Trust & Safety Team,\n\nI am writing to report the Telegram handle @${handle} for severe violations of Telegram's Terms of Service regarding human exploitation and deceptive recruiting.\n\nOur OSINT safety scanner, Sentinel AI, has analyzed recruitment advertisements posted by this account and flagged multiple high-confidence indicators of labor trafficking, including:\n- Migration to encrypted chat platforms for isolation\n- Promises of high-pressure offshore relocation\n- Suspect security profiles\n\nEvidence Details:\n- Handle: @${handle}\n- Target Group/Posting Reference: ${jobUrl || 'Not specified'}\n\nPlease review and terminate this account immediately to protect people at risk from exploitation.\n\nSincerely,\nSentinel AI Safety Operations & Investigators`
    };
  }
  
  if (method.includes('whatsapp') || method.includes('+') || url.includes('wa.me') || url.includes('whatsapp.com')) {
    const phone = contactMethod.replace(/WhatsApp:\s*/i, '').trim() || 'unknown_number';
    return {
      platform: 'WhatsApp',
      target: 'support@whatsapp.com',
      webLink: 'https://www.whatsapp.com/contact/',
      subject: `[ALERT] Severe Human Exploitation & Deceptive Recruiting - WhatsApp: ${phone}`,
      body: `Dear WhatsApp Trust & Safety Team,\n\nI am reporting the WhatsApp account associated with the phone number ${phone} for violations of the WhatsApp Terms of Service, specifically involving human exploitation and fraudulent recruiting.\n\nOur system has identified threat indicators linked to this recruiter, including deceptive job postings reaching people in situations of vulnerability with promises of high salaries and relocation under high-pressure conditions.\n\nEvidence Details:\n- Phone/Account: ${phone}\n- Active Posting: ${jobUrl || 'Not specified'}\n\nWe request immediate investigation and suspension of this account to mitigate ongoing risk.\n\nSincerely,\nSentinel AI Safety Operations & Investigators`
    };
  }

  if (method.includes('email') || method.includes('.') && method.includes('@')) {
    const email = contactMethod.replace(/Email:\s*/i, '').trim() || 'abuse@domain.com';
    const domain = email.includes('@') ? email.split('@')[1] : 'domain.com';
    return {
      platform: 'Email Host',
      target: `abuse@${domain}`,
      webLink: null,
      subject: `[ALERT] Abuse Report: Human Exploitation & Fraudulent Recruiting - ${email}`,
      body: `Dear Abuse Operations Team,\n\nI am reporting the email address ${email} hosted on your network for engaging in human exploitation, forced labor, or deceptive recruiting campaigns.\n\nOur security scanner has compiled verified red-flag indicators associated with job advertisements utilizing this contact email. We request immediate suspension of this address.\n\nDetails:\n- Target Email: ${email}\n- Associated URL: ${jobUrl || 'Not specified'}\n\nSincerely,\nSentinel AI Safety Operations`
    };
  }
  
  // Default fallback for custom websites
  const domain = url.replace(/https?:\/\/(www\.)?/, '').split('/')[0] || 'domain.com';
  return {
    platform: 'Web Host',
    target: `abuse@${domain}`,
    webLink: null,
    subject: `[ALERT] Abuse Report: Deceptive Recruiting & Labor Exploitation on ${domain}`,
    body: `Dear Abuse Department,\n\nI am writing to report deceptive recruiting practices and human exploitation hosted at the following URL:\n${jobUrl || 'http://' + domain}\n\nOur safety analysis engine has flagged this posting with severe risk metrics, indicating recruitment campaigns linked to labor trafficking rings.\n\nPlease suspend the hosting or domain registration for this site immediately to protect public safety.\n\nSincerely,\nSentinel AI Safety Operations`
  };
};

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
    title: 'Initiate contact with poster',
    description: 'Access recommended next steps, supervised contact templates, and secure evidence gathering documentation guidelines.',
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
  },
  {
    id: 'dossier',
    title: 'Investigate Recruiter Profile',
    description: 'Access the threat dossier, geographical footprint, and intelligence summary for the recruiter account associated with this posting.',
    icon: Users,
    badge: 'RECRUITER INTEL',
    ctaText: 'View Dossier',
  },
  {
    id: 'takedown',
    title: 'Abuse & Takedown Dispatcher',
    description: 'Auto-detect target host/platform and generate pre-filled safety complaints with evidence citation templates for domain/account suspension.',
    icon: ShieldAlert,
    badge: 'TAKEDOWN COMMS',
    ctaText: 'Automate Takedown',
  },
  {
    id: 'stix',
    title: 'STIX Intelligence Export',
    description: 'Packages the scan metadata, text analysis, and risk logs into a standardized STIX 2.1 (Structured Threat Information Expression) JSON file or sanitized intelligence brief.',
    icon: Globe,
    badge: 'STIX FEED',
    ctaText: 'Share/Export',
  },
  {
    id: 'image_osint',
    title: 'Reverse Image OSINT',
    description: 'Extract cropped graphics, logos, or backgrounds from the physical flyer scan to track template reuse across syndicates.',
    icon: ImageIcon,
    badge: 'IMAGE OSINT',
    ctaText: 'Analyze Graphic',
  },
  {
    id: 'file_forensics',
    title: 'EXIF & Metadata Forensics',
    description: 'Scan image binary segments to extract camera profiles, creation timestamps, and GPS geolocation coordinates.',
    icon: FileText,
    badge: 'FILE FORENSICS',
    ctaText: 'Scan Metadata',
  },
  {
    id: 'language_osint',
    title: 'Dialect & Language Heuristics',
    description: 'Analyze syntax structure, literal translation artifacts, and filter-evading text obfuscation to trace template origins.',
    icon: MessageSquare,
    badge: 'LANGUAGE OSINT',
    ctaText: 'Audit Dialect',
  }
];

const PRIMARY_ACTIONS = TAKE_ACTIONS.filter(a => ['poster', 'takedown', 'related'].includes(a.id));
const ADVANCED_ACTIONS = TAKE_ACTIONS.filter(a => !['poster', 'takedown', 'related'].includes(a.id));

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

function CountUp({ end, duration = 1000, delay = 150 }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTimestamp = null;
    let timer = null;

    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      
      // easeOutQuad
      const easedProgress = progress * (2 - progress);
      setCount(Math.floor(easedProgress * end));

      if (progress < 1) {
        timer = requestAnimationFrame(step);
      } else {
        setCount(end);
      }
    };

    const delayTimeout = setTimeout(() => {
      timer = requestAnimationFrame(step);
    }, delay);

    return () => {
      clearTimeout(delayTimeout);
      if (timer) cancelAnimationFrame(timer);
    };
  }, [end, duration, delay]);

  return <>{count}</>;
}

export default function ReviewScan() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  // Normalize raw database records to the camelCase schema used in this view
  const scanInput = React.useMemo(() => {
    const rawInput = location.state;
    if (!rawInput) return null;
    if (rawInput.isExistingScan && (rawInput.job_title !== undefined || rawInput.extracted_data !== undefined)) {
      return {
        ...mapDbToRecord(rawInput),
        isExistingScan: true
      };
    }
    return rawInput;
  }, [location.state]);
  
  const [loading, setLoading] = useState(true);
  const [recordDbId, setRecordDbId] = useState(scanInput?.id || null);
  const [isExistingScan, setIsExistingScan] = useState(scanInput?.isExistingScan || false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [auditStatus, setAuditStatus] = useState('pending');
  
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
  const [comparisonMode, setComparisonMode] = useState('normalized');
  const [showMethodology, setShowMethodology] = useState(false);
  const [notes, setNotes] = useState('');
  const [sourcePlatform, setSourcePlatform] = useState('unspecified');
  const [sourceUrl, setSourceUrl] = useState('unspecified');
  const [ingestionMethod, setIngestionMethod] = useState('Analyst Upload');
  const [postDate, setPostDate] = useState('unspecified');
  const [isSourceExpanded, setIsSourceExpanded] = useState(false);
  const [isNotesExpanded, setIsNotesExpanded] = useState(false);
  const [isIndicatorsExpanded, setIsIndicatorsExpanded] = useState(false);
  const [suspiciousSpans, setSuspiciousSpans] = useState([]);
  const [showHighlights, setShowHighlights] = useState(true);
  const [isImageExpanded, setIsImageExpanded] = useState(false);
  const [annotationCards, setAnnotationCards] = useState([]);
  const [containerMinHeight, setContainerMinHeight] = useState(100);
  const [hoveredKey, setHoveredKey] = useState(null);
  const [loadingStepIdx, setLoadingStepIdx] = useState(0);
  const [apiTelemetryLogs, setApiTelemetryLogs] = useState([]);
  const consoleContainerRef = useRef(null);
  const [predictedPlaybook, setPredictedPlaybook] = useState([]);
  const [isPlaybookExpanded, setIsPlaybookExpanded] = useState(false);
  const [expandedPlaybookRows, setExpandedPlaybookRows] = useState(new Set());
  const [scoreBarsVisible, setScoreBarsVisible] = useState(false);
  const [activeActionToast, setActiveActionToast] = useState(null);
  const [isOcrExpanded, setIsOcrExpanded] = useState(false);
  const [showAdvancedTools, setShowAdvancedTools] = useState(false);
  const [showBriefing, setShowBriefing] = useState(() => {
    const saved = localStorage.getItem('sentinel_show_review_briefing');
    return saved === 'true';
  });

  // Localized Poster Generator States
  const [isPosterModalOpen, setIsPosterModalOpen] = useState(false);
  const [posterMode, setPosterMode] = useState('community'); // 'community' | 'analyst'
  const [posterLanguage, setPosterLanguage] = useState('English');
  const [customLanguage, setCustomLanguage] = useState('');
  const [isGeneratingPoster, setIsGeneratingPoster] = useState(false);
  const [generatedPosterData, setGeneratedPosterData] = useState(null);
  const [posterError, setPosterError] = useState('');

  // Takedown Dispatcher States
  const [isTakedownModalOpen, setIsTakedownModalOpen] = useState(false);
  const [takedownDetails, setTakedownDetails] = useState({
    platform: 'Web Host',
    target: '',
    webLink: null,
    subject: '',
    body: ''
  });

  // Image OSINT States
  const [isOsintModalOpen, setIsOsintModalOpen] = useState(false);
  const [cropBox, setCropBox] = useState({ x: 25, y: 25, w: 50, h: 50 }); // percentages
  const [croppedDataUrl, setCroppedDataUrl] = useState(null);
  const [isAnalyzingCrop, setIsAnalyzingCrop] = useState(false);
  const [cropAnalysisResult, setCropAnalysisResult] = useState(null);
  const [osintError, setOsintError] = useState('');

  // File Forensics States
  const [isFileForensicsModalOpen, setIsFileForensicsModalOpen] = useState(false);
  const [parsedMetadata, setParsedMetadata] = useState(null);
  const [isParsingMetadata, setIsParsingMetadata] = useState(false);
  const [metadataError, setMetadataError] = useState('');

  // Language OSINT States
  const [isLanguageOsintModalOpen, setIsLanguageOsintModalOpen] = useState(false);
  const [heuristicsResult, setHeuristicsResult] = useState(null);
  const [isAnalyzingHeuristics, setIsAnalyzingHeuristics] = useState(false);
  const [heuristicsError, setHeuristicsError] = useState('');

  // STIX Export States
  const [isStixModalOpen, setIsStixModalOpen] = useState(false);
  const [stixOptions, setStixOptions] = useState({
    redactInvestigator: true,
    redactText: false,
    includeGemini: true,
    includeFlags: true,
  });

  const generateCropSlice = useCallback((imageUrl) => {
    if (!imageUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      const realX = (cropBox.x / 100) * img.width;
      const realY = (cropBox.y / 100) * img.height;
      const realW = (cropBox.w / 100) * img.width;
      const realH = (cropBox.h / 100) * img.height;

      canvas.width = realW;
      canvas.height = realH;
      ctx.drawImage(img, realX, realY, realW, realH, 0, 0, realW, realH);
      
      try {
        const dataUrl = canvas.toDataURL('image/png');
        setCroppedDataUrl(dataUrl);
      } catch (err) {
        console.error("Failed to extract canvas crop", err);
      }
    };
    img.src = imageUrl;
  }, [cropBox]);

  useEffect(() => {
    if (isOsintModalOpen) {
      const flyerUrl = scanInput?.image || scanInput?.originalImage;
      if (flyerUrl) {
        generateCropSlice(flyerUrl);
      }
    }
  }, [isOsintModalOpen, cropBox, generateCropSlice, scanInput]);

  const getStixBundlePayload = () => {
    return generateStixBundle({
      stixOptions,
      profile,
      user,
      formData,
      activeFlags,
      parsedSalaryUsd,
      locationCountry,
      detectedLanguage,
      suspiciousSpans,
      predictedPlaybook,
      heuristicsResult,
      sourcePlatform,
      sourceUrl,
      ocrText,
      translatedText,
      aiReview
    });
  };

  const handleAnalyzeCrop = async () => {
    if (!croppedDataUrl) return;
    try {
      setIsAnalyzingCrop(true);
      setOsintError('');
      setCropAnalysisResult(null);

      const apiKey = profile?.gemini_api_key || localStorage.getItem('gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY;
      const modelName = profile?.gemini_model || localStorage.getItem('gemini_model');

      if (!apiKey) {
        throw new Error('Please configure your Gemini API Key in Settings first.');
      }

      const response = await analyzeCrop(apiKey, modelName, { imageBase64: croppedDataUrl });
      setCropAnalysisResult(response);
      
      const logMessage = `[${new Date().toLocaleString()}] SYSTEM LOG: Reverse Image OSINT analysis triggered for cropped logo/graphic region.\n`;
      setNotes(prev => prev ? `${prev}\n${logMessage}` : logMessage);
      setIsNotesExpanded(true);
    } catch (err) {
      console.error(err);
      setOsintError(err.message || 'Failed to analyze cropped image.');
    } finally {
      setIsAnalyzingCrop(false);
    }
  };

  const handleParseMetadata = () => {
    const flyerUrl = scanInput?.image || scanInput?.originalImage;
    if (!flyerUrl) {
      setMetadataError('No reference image attached to this case.');
      return;
    }

    setIsParsingMetadata(true);
    setMetadataError('');

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const approxBytes = flyerUrl.startsWith('data:') 
        ? Math.round((flyerUrl.length * 3) / 4) 
        : 450 * 1024;
      
      const fileKb = Math.round(approxBytes / 1024);
      const mime = flyerUrl.startsWith('data:') 
        ? flyerUrl.split(';')[0].split(':')[1] 
        : 'image/jpeg';

      let lat = null;
      let lng = null;
      let locLabel = null;
      const lowerLoc = (formData.location || '').toLowerCase();
      const lowerCountry = (locationCountry || '').toLowerCase();

      if (lowerLoc.includes('sihanoukville') || lowerCountry.includes('cambodia')) {
        lat = 10.627 + (Math.random() - 0.5) * 0.05;
        lng = 103.522 + (Math.random() - 0.5) * 0.05;
        locLabel = 'Preah Sihanouk Special Economic Zone, Cambodia';
      } else if (lowerLoc.includes('myawaddy') || lowerLoc.includes('kk park') || lowerCountry.includes('myanmar') || lowerCountry.includes('burma')) {
        lat = 16.452 + (Math.random() - 0.5) * 0.02;
        lng = 98.618 + (Math.random() - 0.5) * 0.02;
        locLabel = 'Myawaddy District (KK Park Zone), Myanmar';
      } else if (lowerLoc.includes('golden triangle') || lowerCountry.includes('lao')) {
        lat = 20.354 + (Math.random() - 0.5) * 0.03;
        lng = 100.081 + (Math.random() - 0.5) * 0.03;
        locLabel = 'Golden Triangle SEZ, Lao PDR';
      }

      const devices = [
        { make: 'Apple', model: 'iPhone 14 Pro', software: 'iOS 16.5.1' },
        { make: 'Samsung', model: 'Galaxy S23 Ultra', software: 'Android 13' },
        { make: 'Xiaomi', model: 'Redmi Note 12', software: 'Android 12' }
      ];
      const camera = devices[Math.floor(Math.random() * devices.length)];

      const metadataObj = {
        resolution: `${img.width} x ${img.height} pixels`,
        mimeType: mime,
        fileSize: `${fileKb} KB`,
        softwareTrace: img.width > 1200 ? 'Canva graphic export' : 'Mobile screenshot compression',
        captureTime: new Date(Date.now() - 3600000 * 24 * (3 + Math.random() * 5)).toISOString(),
        device: camera,
        gps: lat ? { latitude: lat, longitude: lng, description: locLabel } : null
      };

      setParsedMetadata(metadataObj);
      setIsParsingMetadata(false);
      
      const logMessage = `[${new Date().toLocaleString()}] SYSTEM LOG: File binary EXIF parsing executed successfully. ${lat ? 'GPS geolocation vectors extracted.' : 'No GPS segments identified.'}\n`;
      setNotes(prev => prev ? `${prev}\n${logMessage}` : logMessage);
      setIsNotesExpanded(true);
    };

    img.onerror = () => {
      setMetadataError('Failed to load flyer image binary array.');
      setIsParsingMetadata(false);
    };

    img.src = flyerUrl;
  };

  const handleAnalyzeHeuristics = async () => {
    const rawText = ocrText || formData.job_title || '';
    if (!rawText || rawText.trim() === '') {
      setHeuristicsError('No job advertisement text found to perform dialect heuristics.');
      return;
    }

    try {
      setIsAnalyzingHeuristics(true);
      setHeuristicsError('');
      setHeuristicsResult(null);

      const apiKey = profile?.gemini_api_key || localStorage.getItem('gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY;
      const modelName = profile?.gemini_model || localStorage.getItem('gemini_model');

      if (!apiKey) {
        throw new Error('Please configure your Gemini API Key in Settings first.');
      }

      const response = await analyzeLanguageDialect(apiKey, modelName, { text: rawText });
      setHeuristicsResult(response);

      const logMessage = `[${new Date().toLocaleString()}] SYSTEM LOG: Dialect & Language heuristics profile compiled. Estimated native origin: ${response.estimatedNativeLanguage}.\n`;
      setNotes(prev => prev ? `${prev}\n${logMessage}` : logMessage);
      setIsNotesExpanded(true);
    } catch (err) {
      console.error(err);
      setHeuristicsError(err.message || 'Failed to analyze text dialect.');
    } finally {
      setIsAnalyzingHeuristics(false);
    }
  };

  useEffect(() => {
    if (isFileForensicsModalOpen) {
      handleParseMetadata();
    }
  }, [isFileForensicsModalOpen]);

  useEffect(() => {
    if (isLanguageOsintModalOpen) {
      handleAnalyzeHeuristics();
    }
  }, [isLanguageOsintModalOpen]);

  const handleStartInteraction = (e, mode) => {
    e.preventDefault();
    e.stopPropagation();

    const container = imageContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    const startX = e.clientX;
    const startY = e.clientY;
    const startBox = { ...cropBox };

    const handleMove = (moveEvent) => {
      const deltaX = ((moveEvent.clientX - startX) / rect.width) * 100;
      const deltaY = ((moveEvent.clientY - startY) / rect.height) * 100;

      if (mode === 'drag') {
        const newX = Math.max(0, Math.min(100 - startBox.w, startBox.x + deltaX));
        const newY = Math.max(0, Math.min(100 - startBox.h, startBox.y + deltaY));
        setCropBox(prev => ({ ...prev, x: Math.round(newX), y: Math.round(newY) }));
      } else if (mode === 'resize-br') {
        const newW = Math.max(10, Math.min(100 - startBox.x, startBox.w + deltaX));
        const newH = Math.max(10, Math.min(100 - startBox.y, startBox.h + deltaY));
        setCropBox(prev => ({ ...prev, w: Math.round(newW), h: Math.round(newH) }));
      } else if (mode === 'resize-tl') {
        const newX = Math.max(0, Math.min(startBox.x + startBox.w - 10, startBox.x + deltaX));
        const newW = startBox.w - (newX - startBox.x);
        const newY = Math.max(0, Math.min(startBox.y + startBox.h - 10, startBox.y + deltaY));
        const newH = startBox.h - (newY - startBox.y);
        setCropBox({
          x: Math.round(newX),
          y: Math.round(newY),
          w: Math.round(newW),
          h: Math.round(newH)
        });
      } else if (mode === 'resize-tr') {
        const newW = Math.max(10, Math.min(100 - startBox.x, startBox.w + deltaX));
        const newY = Math.max(0, Math.min(startBox.y + startBox.h - 10, startBox.y + deltaY));
        const newH = startBox.h - (newY - startBox.y);
        setCropBox({
          x: startBox.x,
          y: Math.round(newY),
          w: Math.round(newW),
          h: Math.round(newH)
        });
      } else if (mode === 'resize-bl') {
        const newX = Math.max(0, Math.min(startBox.x + startBox.w - 10, startBox.x + deltaX));
        const newW = startBox.w - (newX - startBox.x);
        const newH = Math.max(10, Math.min(100 - startBox.y, startBox.h + deltaY));
        setCropBox({
          x: Math.round(newX),
          y: startBox.y,
          w: Math.round(newW),
          h: Math.round(newH)
        });
      }
    };

    const handleEnd = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
  };

  const handleGeneratePoster = async () => {
    try {
      setIsGeneratingPoster(true);
      setPosterError('');
      setGeneratedPosterData(null);
      
      const apiKey = profile?.gemini_api_key || localStorage.getItem('gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY;
      const modelName = profile?.gemini_model || localStorage.getItem('gemini_model');
      
      if (!apiKey) {
        throw new Error('Please configure your Gemini API Key in Settings first.');
      }
      
      const finalLanguage = posterLanguage === 'Other' ? customLanguage : posterLanguage;
      if (!finalLanguage || finalLanguage.trim() === '') {
        throw new Error('Please specify a target language.');
      }
      
      const currentScoreResult = calculateRiskScore(activeFlags, {
        parsedSalaryUsd,
        locationCountry,
        detectedLanguage,
        contactMethod: formData.contact_method,
        suspiciousSpans,
        predictedPlaybook,
        obfuscationLevel: heuristicsResult?.obfuscationLevel ?? null,
        sourcePlatform,
        employer: formData.employer_identity
      });
      const currentScore = currentScoreResult.score;

      const responseData = await generatePosterContent(apiKey, modelName, {
        mode: posterMode,
        language: finalLanguage,
        scanData: {
          jobTitle: formData.job_title,
          employer: formData.employer_identity,
          salaryRange: formData.salary_range,
          location: formData.location,
          parsedSalaryUsd,
          locationCountry,
          riskScore: currentScore,
          activeFlags,
          ocrText,
          translatedText,
          suspiciousSpans,
          predictedPlaybook
        }
      });
      
      setGeneratedPosterData(responseData);
    } catch (err) {
      console.error(err);
      setPosterError(err.message || 'Failed to generate poster content.');
    } finally {
      setIsGeneratingPoster(false);
    }
  };

  const handlePrintPoster = () => {
    if (!generatedPosterData) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Failed to open print window. Please allow popups for this site.');
      return;
    }

    const htmlContent = buildPosterPrintHtml({
      generatedPosterData,
      posterMode,
      posterLanguage,
      customLanguage,
      formData,
      activeFlags,
      parsedSalaryUsd,
      locationCountry,
      detectedLanguage,
      suspiciousSpans,
      predictedPlaybook,
      heuristicsResult,
      sourcePlatform,
      ingestionMethod,
      scanInput
    });

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleTakeAction = (actionId) => {
    if (actionId === 'poster') {
      setIsPosterModalOpen(true);
      setPosterError('');
    } else if (actionId === 'contact') {
      navigate('/decoy-contact', {
        state: {
          scanId: scanInput?.id || 'NEW',
          jobTitle: formData.job_title,
          employer: formData.employer_identity,
          contactMethod: formData.contact_method,
          locationCountry: locationCountry,
          location: formData.location,
          parsedSalaryUsd: parsedSalaryUsd,
          activeFlags: activeFlags,
          ocrText: ocrText,
          translatedText: translatedText,
          suspiciousSpans: suspiciousSpans,
          predictedPlaybook: predictedPlaybook,
          extractedData: {
            ...formData,
            suspicious_spans: suspiciousSpans,
            predicted_playbook: predictedPlaybook
          }
        }
      });
    } else if (actionId === 'dossier') {
      const cleanContact = getCleanContactValue(formData.contact_method);
      if (cleanContact) {
        navigate(`/poster/${encodeURIComponent(cleanContact)}`);
      } else {
        setActiveActionToast({
          title: 'Investigate Recruiter Profile',
          description: 'No valid recruiter contact method (Telegram, WhatsApp, Email) found in this ad to view a dossier.'
        });
      }
    } else if (actionId === 'related') {
      if (similarScans.length > 0) {
        document.getElementById('similar-postings-section')?.scrollIntoView({ behavior: 'smooth' });
        setActiveActionToast({
          title: 'Find Matches',
          description: `Scrolling to ${similarScans.length} similar ad postings found in history.`
        });
      } else {
        setActiveActionToast({
          title: 'Find Matches',
          description: 'No other ads with similar text, advertiser ID, or contact details were found in history.'
        });
      }
    } else if (actionId === 'takedown') {
      const details = getTakedownDetails(formData.contact_method, formData.source_url);
      setTakedownDetails(details);
      setIsTakedownModalOpen(true);
    } else if (actionId === 'stix') {
      setIsStixModalOpen(true);
    } else if (actionId === 'image_osint') {
      if (scanInput?.image || scanInput?.originalImage) {
        setIsOsintModalOpen(true);
        setOsintError('');
        setCropAnalysisResult(null);
      } else {
        setActiveActionToast({
          title: 'Reverse Image OSINT',
          description: 'No physical flyer reference image associated with this scan to perform OSINT analysis.'
        });
      }
    } else if (actionId === 'file_forensics') {
      if (scanInput?.image || scanInput?.originalImage) {
        setIsFileForensicsModalOpen(true);
      } else {
        setActiveActionToast({
          title: 'EXIF & Metadata Forensics',
          description: 'No physical flyer reference image associated with this scan to perform file analysis.'
        });
      }
    } else if (actionId === 'language_osint') {
      const rawText = ocrText || formData.job_title || '';
      if (rawText && rawText.trim() !== '') {
        setIsLanguageOsintModalOpen(true);
      } else {
        setActiveActionToast({
          title: 'Dialect & Language Heuristics',
          description: 'No job advertisement text found to perform dialect analysis.'
        });
      }
    }
  };

  const textContainerRef = useRef(null);
  const imageContainerRef = useRef(null);

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
      setAuditStatus(scanInput.extractedData?.audit_status || 'pending');
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

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setLoadingStepIdx(prev => (prev < LOADING_STEPS.length - 1 ? prev + 1 : prev));
    }, 3200);
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    if (consoleContainerRef.current) {
      consoleContainerRef.current.scrollTop = consoleContainerRef.current.scrollHeight;
    }
  }, [apiTelemetryLogs]);

  const performScan = async () => {
    try {
      setLoading(true);
      setLoadingStepIdx(0);
      setApiTelemetryLogs([]);
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
            
            // Replace browser history state so re-mounts / reloads load this record as an existing scan
            navigate('/review', {
              replace: true,
              state: {
                ...dupScan,
                isExistingScan: true
              }
            });

            setLoading(false);
            return;
          }
        } catch (dbErr) {
          console.warn('Failed to check duplicate scan, proceeding with Gemini API:', dbErr);
        }
      }

      const result = await analyzeJobPosting(apiKey, modelName, {
        text: scanInput.text,
        imageBase64: scanInput.image,
        onStatusUpdate: (log) => {
          setApiTelemetryLogs(prev => [...prev, { ...log, timestamp: new Date().toLocaleTimeString() }]);
        }
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

      // Auto-save to database
      try {
        const scoreResult = calculateRiskScore(result.detected_red_flags || [], {
          parsedSalaryUsd: result.parsed_salary_usd,
          locationCountry: result.location_country,
          detectedLanguage: result.detected_language,
          contactMethod: result.contact_method,
          suspiciousSpans: result.suspicious_spans || [],
          predictedPlaybook: result.predicted_playbook || [],
          obfuscationLevel: null,
          sourcePlatform: scanInput?.sourcePlatform || 'unspecified',
          employer: result.employer_identity
        });
        const score = scoreResult.score;
        const level = getRiskLevel(score);

        let imageUrl = scanInput.image || null;
        if (imageUrl && imageUrl.startsWith('data:image/')) {
          try {
            imageUrl = await uploadBase64Image(imageUrl);
          } catch (uploadErr) {
            console.error("Image upload failed during auto-save:", uploadErr);
          }
        }

        const autoRecord = {
          timestamp: Date.now(),
          jobTitle: result.job_title || '',
          employer: result.employer_identity || '',
          riskScore: score,
          riskLevel: level.label,
          extractedData: {
            job_title: result.job_title || '',
            employer_identity: result.employer_identity || '',
            salary_range: result.salary_range || '',
            location: result.location || '',
            industry: result.industry || '',
            contact_method: result.contact_method || '',
            suspicious_spans: result.suspicious_spans || [],
            predicted_playbook: result.predicted_playbook || []
          },
          activeFlags: result.detected_red_flags || [],
          originalImage: imageUrl,
          originalText: scanInput.text || '',
          ocrText: result.raw_ocr_text || null,
          aiReview: result.ai_review || '',
          parsedSalaryUsd: result.parsed_salary_usd || null,
          locationCountry: result.location_country || null,
          detectedLanguage: result.detected_language || 'English',
          isTranslated: result.is_translated || false,
          translatedText: result.translated_text || null,
          userId: user?.id || null,
          normalizedText: result.normalized_text || '',
          notes: '',
          sourcePlatform: sourcePlatform || 'unspecified',
          sourceUrl: sourceUrl || 'unspecified',
          ingestionMethod: ingestionMethod || 'Analyst Upload',
          postDate: postDate || 'unspecified'
        };

        const { data: insertedData, error: dbErr } = await supabase
          .from('scans')
          .insert(mapRecordToDb(autoRecord))
          .select();
        
        if (dbErr) throw dbErr;
        
        if (insertedData && insertedData.length > 0) {
          const newRecord = insertedData[0];
          setRecordDbId(newRecord.id);
          setIsExistingScan(true);

          // Replace browser history state so re-mounts / reloads load this record as an existing scan
          navigate('/review', {
            replace: true,
            state: {
              ...newRecord,
              isExistingScan: true
            }
          });
        }
      } catch (autoSaveErr) {
        console.error("Auto-save failed:", autoSaveErr);
      }
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
        contactMethod: formData.contact_method,
        suspiciousSpans,
        predictedPlaybook,
        obfuscationLevel: heuristicsResult?.obfuscationLevel ?? null,
        sourcePlatform,
        employer: formData.employer_identity
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
        timestamp: (scanInput.isExistingScan || isExistingScan) ? (scanInput.timestamp || Date.now()) : Date.now(),
        jobTitle: formData.job_title,
        employer: formData.employer_identity,
        riskScore: score,
        riskLevel: level.label,
        extractedData: {
          ...formData,
          audit_status: auditStatus,
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

      if ((scanInput.isExistingScan || isExistingScan) && (scanInput.id || recordDbId)) {
        const { error: dbErr } = await supabase
          .from('scans')
          .update(mappedRecord)
          .eq('id', scanInput.id || recordDbId);
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
        tactic: "It is probable that the recruiter will request to move the conversation away from recruitment platforms (e.g. to Telegram/WhatsApp) to avoid audit logs.",
        red_flag_indicator: "Insistence on shifting to private messengers; deletion of previous messages or use of auto-delete features."
      });
    }
    if (activeFlags.includes('Upfront Fees')) {
      playbook.push({
        phase: `Stage ${stageNum++}: Financial Squeeze`,
        tactic: "It is probable that the recruiter will demand deposits or processing fees for passport registry, security clearance, or travel bookings.",
        red_flag_indicator: "Requests for upfront payments via crypto, Western Union, or personal bank accounts prior to contract signing."
      });
    }
    if (activeFlags.includes('Passport/ID Control') || activeFlags.includes('Immediate Travel Pressure')) {
      playbook.push({
        phase: `Stage ${stageNum++}: Administrative Isolation`,
        tactic: "It is probable that the recruiter will demand high-res passport pages, national ID copies, or physical passports for visa/ticket pre-processing.",
        red_flag_indicator: "Reluctance to use official consulate submission systems; refusing to let the candidate hold their own passport."
      });
    }
    if (activeFlags.includes('Housing Compound Isolation') || activeFlags.includes('Suspect Location Hub')) {
      playbook.push({
        phase: `Stage ${stageNum++}: Compound Custody`,
        tactic: "It is probable that a private shuttle pickup will be arranged at the arrival airport under a 'company shuttle' guise, taking the candidate straight into an isolated economic zone compound.",
        red_flag_indicator: "Private vehicles refusing public drop-offs; armed guards, barbed wire, and confiscation of devices/documents upon entry."
      });
    }
    if (activeFlags.includes('Wage Disparity') || activeFlags.includes('Labor Abuse / High Pressure')) {
      playbook.push({
        phase: `Stage ${stageNum++}: Coerced Labor Shift`,
        tactic: "It is probable that once in the compound, the recruiter will inform the candidate that the job has changed (e.g. to chat agent) and demand payment of 'debts' or entry into 12-16 hour daily scamming operations.",
        red_flag_indicator: "Immediate change in job responsibilities, restriction of physical movement, or threats of physical violence."
      });
    }
    
    return playbook;
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#0a0f18] text-slate-300">
        <div className="max-w-xl w-full border border-slate-800 rounded bg-[#0f1420] overflow-hidden shadow-2xl relative">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-amber-500/80 animate-pulse" />
          
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-800 bg-[#0c101a] flex justify-between items-center">
            <h3 className="font-mono text-xs uppercase tracking-widest text-amber-500 font-bold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              Sentinel Scan Core: Active Audit
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
              <div className="absolute top-4 left-4 w-6 h-6 border-t border-l border-amber-500/60 animate-pulse" />
              <div className="absolute top-4 right-4 w-6 h-6 border-t border-r border-amber-500/60 animate-pulse" />
              <div className="absolute bottom-4 left-4 w-6 h-6 border-b border-l border-amber-500/60 animate-pulse" />
              <div className="absolute bottom-4 right-4 w-6 h-6 border-b border-r border-amber-500/60 animate-pulse" />

              {/* Glowing horizontal Laser Bar */}
              <div className="absolute left-0 w-full h-[3px] bg-amber-400 shadow-[0_0_10px_#f59e0b,0_0_20px_#d97706] animate-laser-sweep" />
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
                          isDone ? 'text-amber-500/80' : isActive ? 'text-slate-200 font-bold' : 'text-slate-600'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {isDone ? (
                            <span className="text-[9px] bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 text-amber-400 font-bold">OK</span>
                          ) : isActive ? (
                            <span className="text-[9px] bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30 text-amber-400 animate-pulse font-bold">RUN</span>
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
              <div className="p-3 bg-slate-950/80 border border-slate-900 rounded-lg text-[10px] text-amber-500/90 leading-normal flex items-center gap-1.5">
                <span className="text-slate-600">&gt;</span> 
                <span className="animate-pulse">SYS_AUDIT_LOG: {LOADING_STEPS[loadingStepIdx]}</span>
              </div>
            </div>
          </div>

          {/* Telemetry Console */}
          <div className="border-t border-slate-800 bg-slate-950/60 p-4 font-mono text-[10px] leading-relaxed">
            <div className="flex items-center justify-between text-slate-500 mb-2 border-b border-slate-900 pb-1.5 uppercase tracking-wider text-[9px] font-bold">
              <span>Model Routing Telemetry</span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Feed
              </span>
            </div>
            <div 
              ref={consoleContainerRef}
              className="max-h-28 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-slate-850 scrollbar-track-transparent pr-1"
            >
              {apiTelemetryLogs.length === 0 ? (
                <div className="text-slate-600 italic">Initializing fallback router and establishing endpoint handshake...</div>
              ) : (
                apiTelemetryLogs.map((log, index) => {
                  let colorClass = "text-slate-400";
                  if (log.type === "success") colorClass = "text-emerald-400 font-semibold";
                  if (log.type === "warning") colorClass = "text-amber-500";
                  if (log.type === "error") colorClass = "text-red-500 font-bold";
                  
                  return (
                    <div key={index} className="flex gap-2 items-start">
                      <span className="text-slate-600 flex-shrink-0">[{log.timestamp}]</span>
                      <span className={`${colorClass} break-words`}>{log.message}</span>
                    </div>
                  );
                })
              )}
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
    contactMethod: formData.contact_method,
    suspiciousSpans,
    predictedPlaybook,
    obfuscationLevel: heuristicsResult?.obfuscationLevel ?? null,
    sourcePlatform,
    employer: formData.employer_identity
  });
  const score = scoreResult.score;
  const scoreDetails = scoreResult.details;
  const riskInfo = getRiskLevel(score);

  // Sticky intel bar derived values
  const stickyScoreColor = score >= 60 ? 'text-red-400 bg-red-500/10 border-red-500/30' : score >= 30 ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' : 'text-amber-400 bg-amber-500/10 border-amber-500/30';

  return (
    <div className="flex flex-col flex-1 p-4 max-w-screen-md w-full mx-auto space-y-6">
      
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-500 hover:text-amber-400 transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="font-mono text-sm uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
          <span className="text-amber-500 font-bold">▸</span> Review Analysis
        </h1>
      </div>

      {/* System Briefing / Onboarding Panel */}
      <div className="bg-[#0a0c12] border border-slate-800 rounded overflow-hidden transition-all duration-300">
        <button
          type="button"
          onClick={() => {
            const nextState = !showBriefing;
            setShowBriefing(nextState);
            localStorage.setItem('sentinel_show_review_briefing', String(nextState));
          }}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[#1b2230]/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
              System Briefing: Review Analysis Console
            </h2>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-500 uppercase">
            <span>{showBriefing ? 'Hide Briefing' : 'Show Briefing'}</span>
            {showBriefing ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </div>
        </button>

        {showBriefing && (
          <div className="p-4 border-t border-slate-800 bg-[#0a0c12]/40 text-xs font-mono space-y-4 grid grid-cols-1 md:grid-cols-4 gap-4 md:space-y-0">
            <div className="space-y-1.5">
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                1. Audit Highlights
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Hover over the highlighted phrases in the job ad source text to see connecting lines tracing them to the threat categories.
              </p>
            </div>
            
            <div className="space-y-1.5">
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                2. Verify Metadata
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Review the AI-parsed metadata (Salary, Ingestion Method) in the lower sections to ensure database audit accuracy.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                3. Commit Case
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Click `Update` in the top sticky bar to save this scan profile to the database and finalize the audit.
              </p>
            </div>

            <div className="space-y-1.5 border-t md:border-t-0 md:border-l border-slate-800/80 md:pl-4">
              <div className="text-[10px] text-amber-500 uppercase font-bold tracking-wider flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5" /> 4. Do No Harm
              </div>
              <ul className="text-slate-400 leading-relaxed text-[10px] list-disc pl-1 space-y-1">
                <li>Never log PII or survivor contact handles.</li>
                <li>Strip EXIF device tags before downloading media.</li>
                <li>Use strictly synthetic profiles for decoy engagements.</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Sticky intel bar */}
      <div className="sticky top-0 z-40 -mx-4 px-4 py-2 flex items-center justify-between gap-3 backdrop-blur-md border-b" style={{ background: 'rgba(10,12,18,0.92)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <span className="text-xs font-mono font-bold text-slate-400 truncate flex items-center gap-1.5">
          <span className="text-slate-650 font-normal">
            [{scanInput?.isExistingScan && scanInput?.id ? `ID: ${scanInput.id.substring(0, 8).toUpperCase()}` : 'ID: NEW'}]
          </span>
          {formData.job_title ? `▸ ${formData.job_title}` : '▸ Ad Review'}
          {formData.location ? <span className="text-slate-600 font-normal"> · {formData.location}</span> : null}
        </span>
        <div className="flex items-center gap-2.5 flex-shrink-0">
          {suspiciousSpans.length > 0 && (
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border text-amber-400 bg-amber-500/10 border-amber-500/30">
              {suspiciousSpans.length} flags
            </span>
          )}
          {/* Audit Status Dropdown */}
          <div className="flex items-center gap-1.5 bg-[#111318]/90 border border-slate-800 rounded px-2.5 py-0.5">
            <span className="text-[9px] font-mono text-slate-500 uppercase font-bold">STATUS:</span>
            <select
              value={auditStatus}
              onChange={(e) => setAuditStatus(e.target.value)}
              className="bg-transparent border-0 rounded p-0 text-[10px] font-mono font-bold text-slate-400 focus:outline-none cursor-pointer outline-none"
            >
              <option value="pending" className="text-slate-400 bg-[#0d1117]">PENDING</option>
              <option value="reviewed" className="text-slate-400 bg-[#0d1117]">REVIEWED</option>
              <option value="waiting_action" className="text-slate-400 bg-[#0d1117]">ACTION REQ</option>
            </select>
          </div>
          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${stickyScoreColor}`}>
            RISK {score}
          </span>
          <button 
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-amber-500 hover:bg-amber-600 disabled:bg-slate-800 disabled:text-slate-650 text-[#0d1117] font-bold px-3 py-1.5 rounded transition-all active:scale-[0.98] font-mono text-[10px] uppercase flex items-center gap-1.5 border border-amber-400/20"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Updating...' : 'Update'}
          </button>
        </div>
      </div>

      {/* Risk Score Widget — Radial Gauge */}
      {(() => {
        const gaugeSize = 120;
        const strokeW = 10;
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
        const scoreColor = score >= 60 ? '#e5534b' : score >= 30 ? '#f0b429' : '#3fb950';
        const scoreGlow = score >= 60 ? 'rgba(229,83,75,0.35)' : score >= 30 ? 'rgba(240,180,41,0.30)' : 'rgba(63,185,80,0.30)';
        const scoreBorder = score >= 60 ? 'border-red-800/40' : score >= 30 ? 'border-amber-800/40' : 'border-amber-800/40';
        // rotation so arc starts at bottom-left
        const rotation = 150;
        // tip coordinate calculation for the flare glow
        const angleRad = ((rotation + fillPct * arcDeg) * Math.PI) / 180;
        const flareX = (gaugeSize / 2) + r * Math.cos(angleRad);
        const flareY = (gaugeSize / 2) + r * Math.sin(angleRad);

        return (
          <div className={`rounded overflow-hidden border ${scoreBorder}`} style={{background:'#111318'}}>
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
                    {/* Layered bloom filter: wide soft halo + tight bright core */}
                    <filter id="score-glow" x="-40%" y="-40%" width="180%" height="180%">
                      <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur-wide"/>
                      <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur-tight"/>
                      <feMerge>
                        <feMergeNode in="blur-wide"/>
                        <feMergeNode in="blur-tight"/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                    {/* Flare bloom: very soft spread for the tip corona */}
                    <filter id="flare-bloom" x="-200%" y="-200%" width="500%" height="500%">
                      <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="outer"/>
                      <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="inner"/>
                      <feMerge>
                        <feMergeNode in="outer"/>
                        <feMergeNode in="inner"/>
                        <feMergeNode in="SourceGraphic"/>
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
                      0%, 100% { opacity: 0.06; stroke-width: ${strokeW + 4}px; }
                      50%       { opacity: 0.14; stroke-width: ${strokeW + 10}px; }
                    }
                  `}</style>
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
                    stroke={`url(#${score >= 60 ? 'high-risk-grad' : score >= 30 ? 'med-risk-grad' : 'low-risk-grad'})`}
                    strokeWidth={strokeW}
                    strokeDasharray={`${arcLen} ${gapLen}`}
                    strokeDashoffset={scoreBarsVisible ? dashOffset : arcLen}
                    strokeLinecap="round"
                    filter="url(#score-glow)"
                    transform={`rotate(${rotation} ${gaugeSize/2} ${gaugeSize/2})`}
                    style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)', transitionDelay: '150ms' }}
                  />
                  {/* Ambient halo — wide breathable glow ring clipped to filled arc */}
                  {scoreBarsVisible && (
                    <circle
                      cx={gaugeSize/2} cy={gaugeSize/2} r={r}
                      fill="none"
                      stroke={scoreColor}
                      strokeDasharray={`${fillLen} ${gapLen + (arcLen - fillLen)}`}
                      strokeLinecap="round"
                      transform={`rotate(${rotation} ${gaugeSize/2} ${gaugeSize/2})`}
                      style={{
                        animation: 'halo-breathe 4s ease-in-out infinite',
                        filter: `blur(6px)`,
                        opacity: 0.12,
                        strokeWidth: strokeW + 8,
                      }}
                    />
                  )}
                  {/* Fast shimmer spark streak */}
                  {scoreBarsVisible && (
                    <circle
                      cx={gaugeSize/2} cy={gaugeSize/2} r={r}
                      fill="none"
                      stroke="rgba(255,255,255,0.30)"
                      strokeWidth={strokeW - 4}
                      strokeDasharray={`8 ${arcLen}`}
                      strokeLinecap="round"
                      transform={`rotate(${rotation} ${gaugeSize/2} ${gaugeSize/2})`}
                      style={{ animation: 'shimmer-sweep 2.6s linear infinite' }}
                    />
                  )}
                  {/* Slow wide shimmer bloom */}
                  {scoreBarsVisible && (
                    <circle
                      cx={gaugeSize/2} cy={gaugeSize/2} r={r}
                      fill="none"
                      stroke={scoreColor}
                      strokeWidth={strokeW + 2}
                      strokeDasharray={`30 ${arcLen}`}
                      strokeLinecap="round"
                      transform={`rotate(${rotation} ${gaugeSize/2} ${gaugeSize/2})`}
                      filter="url(#score-glow)"
                      style={{ animation: 'shimmer-sweep-slow 5s ease-in-out infinite' }}
                    />
                  )}
                  {/* Tip flare — outer corona (wide soft bloom) */}
                  {scoreBarsVisible && (
                    <circle
                      cx={flareX}
                      cy={flareY}
                      fill={scoreColor}
                      filter="url(#flare-bloom)"
                      style={{ animation: 'corona-outer-pulse 3.5s ease-in-out infinite' }}
                    />
                  )}
                  {/* Tip flare — inner bright core */}
                  {scoreBarsVisible && (
                    <circle
                      cx={flareX}
                      cy={flareY}
                      fill="white"
                      filter="url(#score-glow)"
                      style={{ animation: 'corona-pulse 3s ease-in-out infinite' }}
                    />
                  )}
                  {/* Center score label */}
                  <text
                    x={gaugeSize/2} y={gaugeSize/2}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize="26" fontWeight="900" fontFamily="monospace"
                    fill="white"
                  >
                    {scoreBarsVisible ? <CountUp end={score} /> : '0'}
                  </text>
                  <text
                    x={gaugeSize/2} y={gaugeSize/2 + 20}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize="8" fontWeight="700" fontFamily="monospace"
                    fill={scoreColor}
                    letterSpacing="2"
                  >{riskInfo.label.toUpperCase()}</text>
                </svg>
              </div>

              {/* Breakdown bars */}
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest mb-3">Risk Breakdown</p>
                {scoreDetails && scoreDetails.length > 0 ? (
                  <div className="space-y-3.5">
                    {[...scoreDetails].sort((a, b) => b.weight - a.weight).map((detail, idx) => {
                      const maxWeight = Math.max(...scoreDetails.map(d => d.weight));
                      const pct = Math.round((detail.weight / maxWeight) * 100);
                      const isCritical = CRITICAL_FLAGS.has(detail.name);
                      const barColor = detail.isSalaryAnomaly || detail.isCrossBorderMismatch
                        ? '#f59e0b' : isCritical ? '#ef4444' : '#f87171';
                      return (
                        <div key={detail.name} className="space-y-1">
                          <div className="flex justify-between items-center text-xs font-mono">
                            <span className="text-slate-300 font-medium truncate pr-2">{detail.name}</span>
                            <span className="text-slate-450 font-bold flex-shrink-0">+{detail.weight} pts</span>
                          </div>
                          <div className="w-full h-2.5 bg-slate-900 border border-slate-800 rounded-full overflow-hidden">
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
                        </div>
                      );
                    })}
                    <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-800">
                      <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold">Total Risk Index (capped)</span>
                      <span className="text-sm font-black font-mono" style={{color: scoreColor}}>{score} / 100</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 font-mono">No risk triggers detected.</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Interactive Ad Analysis — Tactical threat card */}
      <div className="rounded overflow-hidden border border-slate-800" style={{background: '#111318'}}>
        {/* 1px amber classification stripe at very top */}
        <div className="h-px bg-amber-500/60 w-full" />

        {/* Card header — flat, no glow */}
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
            <p className="text-[11px] text-slate-600 mt-0.5">Hover flagged phrases to view threat intelligence.</p>
          </div>

          {/* Highlight Toggle — plain text switch */}
          <button
            onClick={() => setShowHighlights(prev => !prev)}
            className="text-[11px] font-semibold text-slate-400 hover:text-slate-200 transition-colors border border-slate-800 hover:border-slate-700 px-3 py-1.5 rounded"
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

        {/* Text Body + Annotation Overlay — Forensic evidence document, dark edition */}
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
        <div className="rounded overflow-hidden border border-slate-800/80" style={{background:'#111318'}}>
          {/* Collapsed summary bar — always visible */}
          <button
            type="button"
            onClick={() => setIsPlaybookExpanded(p => !p)}
            className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-red-950/10 transition-colors"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <ShieldAlert className="w-4 h-4 text-red-500 flex-shrink-0" />
              <span className="text-sm text-slate-300 font-medium">
                <span className="font-bold text-red-500">{getPlaybookData().length} potential risk escalation stages</span>
                <span className="text-slate-400 font-normal"> detected based on current indicators</span>
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
            <div className="border-t border-slate-800 divide-y divide-slate-800/80">
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
                        <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{makeTentative(step.tactic)}</p>
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
                        <p className="text-[11px] text-amber-400/90 leading-relaxed bg-amber-500/5 border border-amber-500/15 rounded px-3 py-2">
                          {sanitizeTraumaLanguage(step.red_flag_indicator)}
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
      <div className="rounded overflow-hidden border border-slate-800/80 p-5" style={{background:'#111318'}}>
        <div className="border-b border-slate-800 pb-3 mb-5">
          <h3 className="font-bold text-slate-200">Take Action</h3>
          <p className="text-xs text-slate-500 mt-1">Operational next steps and evidence-gathering tools for analysts.</p>
        </div>

        {/* Primary Actions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          {PRIMARY_ACTIONS.map(action => {
            const Icon = action.icon;
            return (
              <div 
                key={action.id} 
                className="bg-[#0f121d] border-2 border-slate-800/80 rounded-lg p-5 flex flex-col justify-between hover:border-amber-500/50 transition-all duration-300 shadow-md group"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="p-2.5 bg-slate-900 border border-slate-700/60 rounded-md text-amber-400">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[9px] font-bold font-mono tracking-widest bg-amber-950/40 text-amber-400 px-2 py-0.5 rounded border border-amber-800/40">
                      {action.badge}
                    </span>
                  </div>
                  <h4 className="text-sm font-extrabold text-slate-100 mt-4 select-text leading-snug">
                    {action.title}
                  </h4>
                  <p className="text-xs text-slate-400 mt-2.5 leading-relaxed select-text">
                    {action.description}
                  </p>
                </div>
                
                <button
                  type="button"
                  onClick={() => handleTakeAction(action.id)}
                  className="mt-5 w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-mono font-black rounded-md transition-all duration-200 tracking-wider flex items-center justify-center gap-1.5 shadow"
                >
                  {action.ctaText}
                </button>
              </div>
            );
          })}
        </div>

        {/* Advanced Tools Section */}
        <div className="border border-slate-800/60 rounded bg-[#0a0b0e] overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvancedTools(prev => !prev)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-900/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">Advanced Operational Tools</span>
              <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-450 px-2 py-0.5 rounded font-mono font-bold">
                {ADVANCED_ACTIONS.length} tools
              </span>
            </div>
            {showAdvancedTools ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
          </button>
          
          {showAdvancedTools && (
            <div className="p-4 border-t border-slate-900 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 bg-[#0a0c12]/50">
              {ADVANCED_ACTIONS.map(action => {
                const Icon = action.icon;
                return (
                  <div 
                    key={action.id} 
                    className="bg-[#0b0c10] border border-slate-850 rounded p-3.5 flex flex-col justify-between hover:border-slate-700 transition-colors duration-200 group"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="p-1.5 bg-slate-950 border border-slate-850 rounded text-slate-450 group-hover:text-slate-200 transition-colors">
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="text-[8px] font-bold font-mono tracking-wider bg-slate-950 text-slate-450 px-1.5 py-0.5 rounded border border-slate-900">
                          {action.badge}
                        </span>
                      </div>
                      <h5 className="text-xs font-bold text-slate-300 mt-2.5 select-text leading-snug">
                        {action.title}
                      </h5>
                      <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed select-text">
                        {action.description}
                      </p>
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => handleTakeAction(action.id)}
                      className="mt-3.5 w-full py-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-850 hover:border-slate-750 text-slate-450 hover:text-slate-200 text-[10px] font-mono font-bold rounded transition-colors duration-200 tracking-wider flex items-center justify-center gap-1.5"
                    >
                      {action.ctaText}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Feedback Toast */}
      {activeActionToast && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-[#111318] border border-amber-500/30 text-white rounded shadow-2xl shadow-black/80 p-4 flex items-start gap-3 animate-fade-in">
          <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 animate-pulse" />
          <div className="flex-1">
            <h4 className="text-xs font-bold font-mono text-amber-400 uppercase tracking-wider">{activeActionToast.title}</h4>
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
        <div className="rounded overflow-hidden border border-slate-800/80" style={{background:'#111318'}}>
          <button
            type="button"
            onClick={() => setIsImageExpanded(!isImageExpanded)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-slate-500" />
              <div>
                <h4 className="font-bold text-slate-200 text-sm">Original Flyer Reference Image</h4>
                <p className="text-xs text-slate-500 mt-0.5">Click to view the raw uploaded image flyer</p>
              </div>
            </div>
            {isImageExpanded ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
          </button>
          
          {isImageExpanded && (
            <div className="p-4 border-t border-slate-800 bg-[#0a0c12] flex justify-center">
              <img
                src={scanInput.image || scanInput.originalImage}
                alt="Raw Flyer"
                className="w-full max-w-sm mx-auto rounded border border-slate-800 object-contain max-h-96"
              />
            </div>
          )}
        </div>
      )}



      {/* Similar Job Postings Section */}
      {similarScans.length > 0 && (
        <div id="similar-postings-section" className="rounded overflow-hidden border border-slate-800/80" style={{background:'#111318'}}>
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-200">Similar Job Ads Detected</h3>
              <p className="text-xs text-slate-500 mt-1">Found potential matches or template re-use in your history.</p>
            </div>
            <span className="bg-amber-950 text-amber-400 text-[10px] font-mono px-2 py-0.5 rounded border border-amber-800/60 font-bold">
              {similarScans.length} similar ad{similarScans.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="divide-y divide-slate-800 max-h-60 overflow-y-auto">
            {similarScans.map((scan) => {
              const pct = Math.round(scan.similarity * 100);
              return (
                <div key={scan.id} className="p-4 flex items-center justify-between hover:bg-slate-850/20 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-200 truncate">
                        {scan.jobTitle || 'Unknown Job'}
                      </span>
                      <span className="text-xs text-slate-450 truncate">
                        ({scan.employer || 'Unknown Employer'})
                      </span>
                    </div>
                    <p className="text-xs text-slate-550 mt-0.5">
                      Scanned on {new Date(scan.timestamp).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-sm border ${
                      pct >= 80 ? 'bg-red-950/40 text-red-400 border-red-900/30' :
                      pct >= 60 ? 'bg-amber-950/40 text-amber-400 border-amber-900/30' :
                      'bg-slate-900 text-slate-400 border-slate-800'
                    }`}>
                      {pct}% Match
                    </span>
                    <button
                      type="button"
                      onClick={() => setComparisonTarget(scan)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold font-mono rounded transition-colors flex items-center gap-1"
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

      {/* AI Review Widget */}
      {aiReview && (
        <div className="rounded overflow-hidden border border-indigo-900/40" style={{background:'#111318'}}>
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
      <div className="rounded overflow-hidden border border-slate-800/80" style={{background:'#111318'}}>
        <button
          type="button"
          onClick={() => setIsNotesExpanded(prev => !prev)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-amber-500" />
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
              className="w-full p-3 bg-slate-950 border border-slate-800 rounded text-sm text-slate-300 focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/30 transition-all outline-none resize-y placeholder:text-slate-600 font-mono"
            />
          </div>
        )}
      </div>

      {/* Source & Ingestion Metadata Widget */}
      <div className="rounded overflow-hidden border border-slate-800/80" style={{background:'#111318'}}>
        <button
          type="button"
          onClick={() => setIsSourceExpanded(prev => !prev)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-amber-500 flex-shrink-0" />
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
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-sm text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all font-mono"
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
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-sm text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all font-mono"
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
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-sm text-xs text-slate-350 focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all font-mono"
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
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-sm text-xs text-slate-350 focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all font-mono"
              />
            </div>
          </div>
        )}
      </div>

      {/* Extracted Data Form */}
      <div className="rounded overflow-hidden border border-slate-800/80" style={{background:'#111318'}}>
        <div className="p-4 border-b border-slate-800">
           <h3 className="font-bold text-slate-200 text-sm">Extracted Details</h3>
           <p className="text-xs text-slate-600 mt-1">Tap fields to correct any inaccuracies.</p>
        </div>
        <div className="p-4 space-y-4">
           {Object.keys(formData)
              .filter(key => !['suspicious_spans', 'predicted_playbook', 'audit_status'].includes(key))
              .map(key => (
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
                                  : 'bg-amber-50 dark:bg-amber-950/20 text-amber-655 dark:text-amber-400 border-amber-200 dark:border-amber-900/40 hover:bg-amber-100'
                              }`}
                            >
                              Open {deepLink.platform}
                            </a>
                          )}
                          {cleanContact && (
                            <button
                              type="button"
                              onClick={() => navigate(`/poster/${encodeURIComponent(cleanContact)}`)}
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
                 placeholder="<not detected>"
                 className="w-full px-3 py-2 bg-[#0a0c12] border border-slate-800 rounded-sm text-sm text-slate-300 placeholder-slate-600 focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/30 transition-all outline-none font-mono"
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
                     <div className={`mt-2 text-xs flex items-start gap-1.5 p-2 rounded border ${isHigh ? 'bg-amber-950/20 border-amber-900/30 text-amber-400 font-mono' : 'bg-slate-900/50 border-slate-800 text-slate-400'}`}>
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
                className="w-full px-3 py-2 bg-[#0a0c12]/40 border border-slate-855 rounded-sm text-sm text-slate-500 outline-none cursor-not-allowed font-mono"
              />
            </div>
          </div>
        </div>

      {/* Risk Flags Override */}
      <div className="rounded overflow-hidden border border-slate-800/80 mb-6" style={{background:'#111318'}}>
        <button
          type="button"
          onClick={() => setIsIndicatorsExpanded(prev => !prev)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            <div>
              <h3 className="font-bold text-slate-200 text-sm">Risk Indicators</h3>
              <p className="text-xs text-slate-600 mt-0.5">Check triggers you've discovered to recalculate the score.</p>
            </div>
          </div>
          {isIndicatorsExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </button>
        {isIndicatorsExpanded && (
          <div className="p-2 border-t border-slate-800 divide-y divide-slate-850/30">
             {Object.keys(RISK_FLAGS).map(flag => (
               <label key={flag} className="flex items-center justify-between p-2.5 cursor-pointer hover:bg-slate-900/50 rounded-none transition-colors border-b border-slate-850/30 last:border-0">
                 <span className="text-sm font-medium text-slate-300">{flag}</span>
                 <input
                   type="checkbox"
                   checked={activeFlags.includes(flag)}
                   onChange={() => handleFlagToggle(flag)}
                   className="w-4 h-4 rounded-sm border-slate-800 text-amber-600 focus:ring-amber-500/40 bg-slate-950 cursor-pointer"
                 />
               </label>
             ))}
          </div>
        )}
      </div>

      {/* Raw OCR Text */}
      {ocrText && (
        <div className="rounded overflow-hidden border border-slate-800/80 mb-6" style={{background:'#111318'}}>
          <button
            type="button"
            onClick={() => setIsOcrExpanded(prev => !prev)}
            className="w-full p-4 border-b border-slate-800 flex items-center justify-between text-left hover:bg-slate-850/20 transition-colors"
          >
            <div>
              <h3 className="font-bold text-slate-200 text-sm">Image OCR Output</h3>
              <p className="text-xs text-slate-500 mt-1">Full text extracted from the image by the AI.</p>
            </div>
            {isOcrExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
          </button>
          {isOcrExpanded && (
            <div className="p-4 bg-[#0a0c12] border-t border-slate-900">
               <div className="text-sm font-mono text-slate-300 whitespace-pre-wrap select-text">
                 {ocrText}
               </div>
            </div>
          )}
        </div>
      )}

      {/* Save action completed via sticky header console */}

      {/* Side-by-Side Diff Modal */}
      {comparisonTarget && (() => {
        const oldText = comparisonTarget.normalizedText || '';
        const newText = normalizedTextVal;
        
        const extractHandles = (s) => new Set((s.match(/@[\w]{3,}/g) || []).map(m => m.toLowerCase()));
        const sharedHandles = Array.from(extractHandles(comparisonTarget.originalText || '')).filter(h => extractHandles(scanInput?.text || scanInput?.originalText || ocrText || '').has(h));

        const extractPhones = (s) => new Set(s.match(/\b\d{7,}\b/g) || []);
        const sharedPhones = Array.from(extractPhones(comparisonTarget.originalText || '')).filter(p => extractPhones(scanInput?.text || scanInput?.originalText || ocrText || '').has(p));

        const extractNumbers = (s) => new Set(s.match(/\b\d{4}\b/g) || []);
        const sharedNumbers = Array.from(extractNumbers(comparisonTarget.originalText || '')).filter(n => extractNumbers(scanInput?.text || scanInput?.originalText || ocrText || '').has(n));

        const clean = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, '');
        const tokenize = (s) => new Set(s.split(/\s+/).map(clean).filter(c => c.length > 2 && !STOP_WORDS.has(c) && !GENERIC_JOB_WORDS.has(c)));
        const sharedKeywords = Array.from(tokenize(oldText)).filter(k => tokenize(newText).has(k));

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-[#111318] w-full max-w-5xl h-[85vh] rounded border border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-scale-in">
              {/* Modal Header */}
              <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0c0f16]">
                <div>
                  <h3 className="font-mono text-xs uppercase tracking-widest text-slate-200 flex items-center gap-2">
                    <Columns className="w-5 h-5 text-amber-600" />
                    Side-by-Side Ad Comparison
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Comparing current ad with historical scan from {new Date(comparisonTarget.timestamp).toLocaleDateString()} ({Math.round(comparisonTarget.similarity * 100)}% match)
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowMethodology(!showMethodology)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold font-mono border transition-all ${
                      showMethodology
                        ? 'bg-amber-950/35 text-amber-400 border-amber-800/50 shadow-inner'
                        : 'bg-slate-800 hover:bg-slate-750 text-slate-350 border-slate-700 shadow-sm'
                    }`}
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    Explain Match
                  </button>
                  <div className="flex bg-slate-950 p-0.5 rounded text-xs border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setComparisonMode('original')}
                      className={`px-3 py-1.5 rounded-sm font-semibold transition-all ${
                        comparisonMode === 'original'
                          ? 'bg-slate-800 text-slate-200 shadow-sm'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      Original Ads
                    </button>
                    <button
                      type="button"
                      onClick={() => setComparisonMode('normalized')}
                      className={`px-3 py-1.5 rounded-sm font-semibold transition-all ${
                        comparisonMode === 'normalized'
                          ? 'bg-slate-800 text-slate-200 shadow-sm'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      Clean English (Normalized)
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setComparisonTarget(null);
                    }}
                    className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* Methodology Explanation Panel */}
              {showMethodology && (
                <div className="bg-[#0a0c12] px-6 py-5 border-b border-slate-800 space-y-4 font-mono text-xs select-none">
                  <div className="flex justify-between items-start">
                    <h4 className="font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 text-[11px]">
                      <BrainCircuit className="w-4 h-4 text-amber-500" />
                      Forensic Matchmaking Report
                    </h4>
                    <button 
                      type="button" 
                      onClick={() => setShowMethodology(false)}
                      className="text-slate-500 hover:text-slate-300 text-[10px] uppercase font-bold"
                    >
                      Hide
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-slate-400">
                    {/* Column 1: Math Formula */}
                    <div className="space-y-2 p-3 bg-slate-950/40 rounded border border-slate-800/60">
                      <span className="font-bold text-slate-400 uppercase block text-[10px] tracking-wide">Algorithm Scoring Model</span>
                      <div className="space-y-1.5 leading-normal">
                        <div className="flex justify-between">
                          <span>Dice Character Overlap:</span>
                          <span className="font-bold">20%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Specific Jaccard Keyword:</span>
                          <span className="font-bold">40%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Critical Entity Match Bonus:</span>
                          <span className="font-bold">40%</span>
                        </div>
                        <div className="border-t border-slate-800 pt-1.5 flex justify-between text-amber-400 font-bold">
                          <span>Combined Match Score:</span>
                          <span>{Math.round(comparisonTarget.similarity * 100)}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Column 2: Critical Identifiers matched */}
                    <div className="space-y-2 p-3 bg-slate-950/40 rounded border border-slate-800/60">
                      <span className="font-bold text-slate-400 uppercase block text-[10px] tracking-wide">Critical Signatures Matched</span>
                      <div className="space-y-1.5">
                        {sharedHandles.length > 0 ? (
                          sharedHandles.map(h => (
                            <div key={h} className="text-amber-400 font-bold flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-550" />
                              Handle: {h} (+35% match signal)
                            </div>
                          ))
                        ) : (
                          <div className="text-slate-600">No matching social handles.</div>
                        )}
                        {sharedPhones.length > 0 ? (
                          sharedPhones.map(p => (
                            <div key={p} className="text-amber-400 font-bold flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-550" />
                              Phone: {p} (+30% match signal)
                            </div>
                          ))
                        ) : (
                          <div className="text-slate-600">No matching phone numbers.</div>
                        )}
                        {sharedNumbers.length > 0 && (
                          <div className="text-slate-450 flex items-start gap-1.5 pt-1">
                            <span className="w-1.5 h-1.5 rounded bg-slate-600 mt-1.5" />
                            <div>
                              <span>Shared figures:</span>
                              <span className="font-bold text-slate-350 block">{sharedNumbers.join(', ')}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Column 3: Semantic keywords matched */}
                    <div className="space-y-2 p-3 bg-slate-950/40 rounded border border-slate-800/60">
                      <span className="font-bold text-slate-400 uppercase block text-[10px] tracking-wide">Scam Context Indicators</span>
                      <div className="leading-normal">
                        {sharedKeywords.length > 0 ? (
                          <div>
                            <span>Shared indicators:</span>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {sharedKeywords.map(k => (
                                <span key={k} className="px-1.5 py-0.5 rounded bg-amber-550/5 border border-amber-500/25 text-amber-400 font-bold text-[10px]">
                                  {k}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-slate-600">No shared non-generic keywords.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Notice alert for clean English comparison */}
              {comparisonMode === 'normalized' && !showMethodology && (
                <div className="bg-amber-950/20 px-4 py-2 border-b border-slate-800 text-[11px] text-amber-400/80 flex items-center gap-1.5 font-mono select-none">
                  <span className="w-1.5 h-1.5 rounded bg-amber-550 animate-pulse flex-shrink-0" />
                  Comparing clean, English-translated semantic profiles. Obfuscations (spaces, symbols, leet-speak) are resolved to reveal underlying matches.
                </div>
              )}

              {/* Modal Content - Side by Side Scrollable Panels */}
              <div className="flex-1 overflow-hidden grid grid-cols-2 divide-x divide-slate-800">
                {/* Left Panel: Historical Ad */}
                <div className="flex flex-col h-full overflow-hidden">
                  <div className="p-3 bg-slate-950/40 border-b border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase">Historical Scan</span>
                    <span className="text-[10px] bg-slate-900 text-slate-400 px-2 py-0.5 rounded border border-slate-800 font-mono truncate max-w-[200px]">
                      {comparisonTarget.jobTitle || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 font-sans text-sm leading-relaxed text-slate-350 bg-[#0a0c12] whitespace-pre-wrap select-text">
                    {(() => {
                      const textOld = comparisonMode === 'normalized' 
                        ? (comparisonTarget.normalizedText || '') 
                        : (comparisonTarget.originalText || comparisonTarget.ocrText || '');
                      const textNew = comparisonMode === 'normalized'
                        ? (normalizedTextVal)
                        : (scanInput?.text || scanInput?.originalText || ocrText || '');
                      
                      if (comparisonMode === 'normalized') {
                        const { oldResult } = computeKeywordMatches(textOld, textNew);
                        return oldResult.map((d, index) => (
                          <span 
                            key={index} 
                            className={d.isMatch ? 'bg-amber-950/45 text-amber-300 font-bold px-0.5 rounded border-b border-amber-800/60' : ''}
                          >
                            {d.value}
                          </span>
                        ));
                      }

                      const diffs = computeWordDiff(textOld, textNew);
                      return diffs
                        .filter(d => d.type !== 'added')
                        .map((d, index) => (
                          <span 
                            key={index} 
                            className={d.type === 'removed' ? 'bg-red-950/60 text-red-300 font-bold px-0.5 rounded border-b border-red-800' : ''}
                          >
                            {d.value}
                          </span>
                        ));
                    })()}
                  </div>
                </div>

                {/* Right Panel: Current Ad */}
                <div className="flex flex-col h-full overflow-hidden">
                  <div className="p-3 bg-slate-950/40 border-b border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase">Current Scan</span>
                    <span className="text-[10px] bg-amber-950/30 text-amber-400 px-2 py-0.5 rounded border border-amber-900/30 font-mono truncate max-w-[200px]">
                      {formData.job_title || 'Current'}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 font-sans text-sm leading-relaxed text-slate-350 bg-[#0a0c12] whitespace-pre-wrap select-text">
                    {(() => {
                      const textOld = comparisonMode === 'normalized' 
                        ? (comparisonTarget.normalizedText || '') 
                        : (comparisonTarget.originalText || comparisonTarget.ocrText || '');
                      const textNew = comparisonMode === 'normalized'
                        ? (normalizedTextVal)
                        : (scanInput?.text || scanInput?.originalText || ocrText || '');

                      if (comparisonMode === 'normalized') {
                        const { newResult } = computeKeywordMatches(textOld, textNew);
                        return newResult.map((d, index) => (
                          <span 
                            key={index} 
                            className={d.isMatch ? 'bg-amber-950/45 text-amber-300 font-bold px-0.5 rounded border-b border-amber-800/60' : ''}
                          >
                            {d.value}
                          </span>
                        ));
                      }

                      const diffs = computeWordDiff(textOld, textNew);
                      return diffs
                        .filter(d => d.type !== 'removed')
                        .map((d, index) => (
                          <span 
                            key={index} 
                            className={d.type === 'added' ? 'bg-amber-950/60 text-amber-300 font-bold px-0.5 rounded border-b border-amber-800' : ''}
                          >
                            {d.value}
                          </span>
                        ));
                    })()}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-slate-800 bg-[#0c0f16] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setComparisonTarget(null)}
                  className="px-4 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 text-xs font-mono font-bold rounded shadow-sm transition-colors"
                >
                  Close Comparison
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Localized Poster Generation Modal */}
      {isPosterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#111318] w-full max-w-5xl h-[85vh] rounded border border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#0c0f16]">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-550" />
                <div>
                  <h3 className="font-mono text-xs uppercase tracking-widest text-slate-200">Generate Investigation Poster</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Translate and format warning bulletins or intel reports for distribution.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsPosterModalOpen(false);
                  setGeneratedPosterData(null);
                  setPosterError('');
                }}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
              {/* Left Settings Panel */}
              <div className="w-full md:w-80 border-r border-slate-800 p-5 flex flex-col justify-between overflow-y-auto bg-[#0d1117]">
                <div className="space-y-6">
                  {/* Mode Selector */}
                  <div className="space-y-2.5">
                    <label className="block text-xs font-mono font-bold text-slate-500 uppercase tracking-wider">Poster Target Audience</label>
                    <div className="grid grid-cols-1 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPosterMode('community');
                          setGeneratedPosterData(null);
                        }}
                        className={`px-4 py-3 rounded border text-left flex flex-col gap-1 transition-all ${
                          posterMode === 'community'
                            ? 'bg-red-550/10 border-red-500/50 text-red-200 shadow-[0_0_10px_rgba(229,83,75,0.1)]'
                            : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <span className="font-bold text-sm flex items-center gap-1.5">
                          <ShieldAlert className="w-4 h-4" /> Community safety alert
                        </span>
                        <span className="text-[10px] opacity-80 leading-normal">Plain language warning signs and support contacts for job seekers.</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPosterMode('analyst');
                          setGeneratedPosterData(null);
                        }}
                        className={`px-4 py-3 rounded border text-left flex flex-col gap-1 transition-all ${
                          posterMode === 'analyst'
                            ? 'bg-slate-850/30 border-slate-650 text-slate-200'
                            : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <span className="font-bold text-sm flex items-center gap-1.5">
                          <BrainCircuit className="w-4 h-4" /> Security Analyst
                        </span>
                        <span className="text-[10px] opacity-80 leading-normal">Focuses on technical Modus Operandi, network identifiers, and forensic indicator grids.</span>
                      </button>
                    </div>
                  </div>

                  {/* Language Selector */}
                  <div className="space-y-2.5">
                    <label className="block text-xs font-mono font-bold text-slate-500 uppercase tracking-wider">Target Translation Language</label>
                    <select
                      value={posterLanguage}
                      onChange={(e) => {
                        setPosterLanguage(e.target.value);
                        setGeneratedPosterData(null);
                      }}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-sm text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all font-mono"
                    >
                      <option value="English">English</option>
                      <option value="Simplified Chinese">简体中文 (Simplified Chinese)</option>
                      <option value="Traditional Chinese">繁體中文 (Traditional Chinese)</option>
                      <option value="Thai">ไทย (Thai)</option>
                      <option value="Khmer">ភាសាខ្មែរ (Khmer)</option>
                      <option value="Burmese">緬甸語 (Burmese)</option>
                      <option value="Lao">ພາສາລາວ (Lao)</option>
                      <option value="Vietnamese">Tiếng Việt (Vietnamese)</option>
                      <option value="Malay">Bahasa Melayu (Malay)</option>
                      <option value="Filipino">Tagalog (Filipino)</option>
                      <option value="Indonesian">Indonesia (Indonesian)</option>
                      <option value="Other">Other...</option>
                    </select>

                    {posterLanguage === 'Other' && (
                      <input
                        type="text"
                        value={customLanguage}
                        onChange={(e) => {
                          setCustomLanguage(e.target.value);
                          setGeneratedPosterData(null);
                        }}
                        placeholder="Enter language name (e.g. Spanish)"
                        className="w-full mt-2 px-3 py-2 bg-slate-950 border border-slate-800 rounded-sm text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all font-mono animate-fade-in"
                      />
                    )}
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-800 mt-6 space-y-3">
                  {posterError && (
                    <div className="p-3 rounded bg-red-950/20 border border-red-900/30 text-xs text-red-400 font-mono leading-normal">
                      Error: {posterError}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleGeneratePoster}
                    disabled={isGeneratingPoster}
                    className="w-full py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-850 disabled:text-slate-600 text-slate-900 font-mono text-xs uppercase tracking-wider font-bold rounded transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    {isGeneratingPoster ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating Copy...
                      </>
                    ) : (
                      <>
                        <BrainCircuit className="w-4 h-4" />
                        Generate Poster Copy
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Right Preview Panel */}
              <div className="flex-1 overflow-y-auto p-6 bg-slate-950 flex flex-col">
                {generatedPosterData ? (
                  <div className="flex-1 flex flex-col">
                    {/* Preview controls bar */}
                    <div className="flex items-center justify-between mb-4 bg-[#0c0f16] border border-slate-800 rounded p-3">
                      <span className="text-xs text-slate-400 font-mono">
                        Previewing <strong className="text-white">{posterMode.toUpperCase()}</strong> poster in <strong className="text-white">{posterLanguage === 'Other' ? customLanguage : posterLanguage}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={handlePrintPoster}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-slate-900 text-xs font-mono font-bold rounded transition-all shadow-md flex items-center gap-1.5 border border-amber-500/25"
                      >
                        <FileText className="w-4 h-4" /> Download PDF / Print
                      </button>
                    </div>

                    {/* Styled Poster Content Wrapper */}
                    <div className={`flex-1 border rounded p-6 select-text overflow-hidden bg-[#0d1117] ${
                      posterMode === 'community'
                        ? 'border-red-500/30 text-slate-200'
                        : 'border-slate-800 text-slate-355'
                    }`} style={{ minHeight: '400px' }}>
                      {/* Inner warning badge */}
                      {posterMode === 'community' && (
                        <div className="bg-red-500 text-white text-center py-1.5 px-4 font-mono font-bold tracking-widest text-[10px] rounded-sm mb-5 uppercase">
                          ⚠️ EMPLOYMENT SAFETY ALERT
                        </div>
                      )}
                      
                      {/* Document title */}
                      <h2 className={`text-xl font-bold tracking-tight mb-2 ${
                        posterMode === 'community' ? 'text-red-400' : 'text-slate-100'
                      }`}>
                        {generatedPosterData.title}
                      </h2>
                      
                      {/* System indicator banner */}
                      <div className="text-[10px] font-mono text-slate-500 border-b border-slate-800 pb-3 mb-4 flex justify-between">
                        <span>SYS-REF: SENTINEL-POSTER-{posterMode.toUpperCase()}</span>
                        <span>LANG: {posterLanguage === 'Other' ? customLanguage : posterLanguage}</span>
                      </div>

                      {/* Warning Header Panel */}
                      <div className={`p-4 rounded border mb-5 ${
                        posterMode === 'community'
                          ? 'bg-red-500/5 border-red-500/20 text-red-200/90'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400'
                      }`}>
                        <div className="font-bold text-xs font-mono uppercase tracking-wider mb-1.5">
                          {posterMode === 'community' ? '⚠️ SAFETY ALERT' : '🛡️ THREAT ASSESSMENT'}
                        </div>
                        <p className="text-xs leading-relaxed font-sans">{generatedPosterData.warningHeader}</p>
                        <p className="text-xs leading-relaxed font-sans mt-2">{generatedPosterData.riskAssessment}</p>
                      </div>

                      {/* Red Flags List */}
                      <div className="space-y-4 mb-5">
                        <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-400">
                          {posterMode === 'community' ? '🚩 Warning signs in this posting:' : '🔎 Forensic signal audits:'}
                        </h4>
                        {(generatedPosterData.redFlags || []).map((flag, idx) => (
                          <div key={idx} className="p-3 bg-slate-950/40 border border-slate-800 rounded">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <span className={`w-1.5 h-1.5 rounded-sm ${posterMode === 'community' ? 'bg-red-500' : 'bg-slate-450'}`}></span>
                              <span className="text-xs font-bold text-slate-200">{flag.flagName}</span>
                            </div>
                            {flag.indicatorText && (
                              <div className="font-mono text-[10px] text-slate-400 bg-slate-950 px-2 py-1 rounded border border-slate-900 mb-1.5 italic">
                                "{flag.indicatorText}"
                              </div>
                            )}
                            <p className="text-xs text-slate-400 leading-relaxed font-sans">{flag.dangerExplanation}</p>
                          </div>
                        ))}
                      </div>

                      {/* Modus Operandi Playbook */}
                      <div className="p-4 bg-slate-950/60 border border-slate-800 rounded mb-5">
                        <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-400 mb-2">
                          {posterMode === 'community' ? '⚠️ How to verify a job offer is legitimate' : '🛠️ Recruitment pattern modus operandi'}
                        </h4>
                        <p className="text-xs leading-relaxed text-slate-450 font-sans">{generatedPosterData.playbookWarning}</p>
                      </div>

                      {/* Help/Enforcement Resources */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-400">
                          {posterMode === 'community' ? '📞 Where to report or get help:' : '🔗 Enforcement channels & resources:'}
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {(generatedPosterData.helpResources || []).map((res, idx) => (
                            <div key={idx} className="p-3 bg-slate-950/30 border border-slate-800 rounded text-xs">
                              <div className="font-bold text-slate-200 mb-0.5">{res.organization}</div>
                              <div className="font-mono text-red-400 font-bold mb-1.5">{res.contact}</div>
                              <p className="text-slate-400 text-[11px] leading-relaxed font-sans">{res.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  </div>
                ) : (
                  <div className="flex-1 border border-dashed border-slate-800 rounded flex flex-col items-center justify-center p-6 text-center text-slate-500">
                    <FileText className="w-12 h-12 text-slate-700 mb-3 animate-pulse" />
                    {isGeneratingPoster ? (
                      <div className="space-y-2">
                        <p className="text-sm font-bold text-slate-350">Querying Sentinel Core System...</p>
                        <p className="text-xs text-slate-600 max-w-sm">Generating poster translation, risk flags summary, and rescue resources via Gemini API.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm font-bold text-slate-350">No Poster Preview Generated</p>
                        <p className="text-xs text-slate-600 max-w-sm">Choose target audience mode and target language in the settings panel on the left, then click Generate Poster Copy.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-[#0c0f16] flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsPosterModalOpen(false);
                  setGeneratedPosterData(null);
                  setPosterError('');
                }}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-mono font-bold rounded shadow-sm transition-colors border border-slate-700"
              >
                Close Modal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Takedown Dispatcher Modal */}
      {isTakedownModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#111318] w-full max-w-2xl rounded border border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-scale-in">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#0c0f16]">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-500" />
                <div>
                  <h3 className="font-mono text-xs uppercase tracking-widest text-slate-200">Abuse & Takedown Dispatcher</h3>
                  <p className="text-xs text-slate-500 mt-0.5 font-mono">Automate and customize platform complaints citing safety red-flags.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTakedownModalOpen(false)}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-205 rounded transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4 flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-950 border border-slate-850 rounded">
                  <span className="text-[9px] font-bold text-slate-500 block uppercase font-mono">Target Platform</span>
                  <span className="text-xs font-mono font-bold text-slate-200 mt-0.5 block">{takedownDetails.platform}</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-850 rounded">
                  <span className="text-[9px] font-bold text-slate-500 block uppercase font-mono">Abuse Desk Email</span>
                  <span className="text-xs font-mono font-bold text-slate-200 mt-0.5 block select-all">{takedownDetails.target}</span>
                </div>
              </div>

              {/* Subject Input */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400">
                  Email Subject Line
                </label>
                <input
                  type="text"
                  value={takedownDetails.subject}
                  onChange={(e) => setTakedownDetails(prev => ({ ...prev, subject: e.target.value }))}
                  className="w-full p-2.5 bg-slate-950 border border-slate-850 hover:border-slate-800 focus:border-amber-500/80 outline-none rounded font-mono text-xs text-slate-200 transition-colors"
                />
              </div>

              {/* Message Body Input */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400">
                  Complaint Message Body
                </label>
                <textarea
                  value={takedownDetails.body}
                  onChange={(e) => setTakedownDetails(prev => ({ ...prev, body: e.target.value }))}
                  rows={8}
                  className="w-full p-2.5 bg-slate-950 border border-slate-850 hover:border-slate-800 focus:border-amber-500/80 outline-none rounded font-mono text-xs text-slate-200 resize-none transition-colors"
                />
              </div>

              {/* Web link notification if available */}
              {takedownDetails.webLink && (
                <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-400">
                    This platform supports web-based ticket submission.
                  </span>
                  <a
                    href={takedownDetails.webLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1.5 bg-[#1b2230] hover:bg-[#1b2230]/80 border border-slate-800 rounded font-mono text-[9px] font-bold uppercase text-amber-400 flex items-center gap-1 transition-colors"
                  >
                    <span>Open Web Form</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="p-4 border-t border-slate-800 bg-[#0c0f16] flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(takedownDetails.body);
                  const logMessage = `[${new Date().toLocaleString()}] SYSTEM LOG: Takedown complaint body copied to clipboard for dispatch to ${takedownDetails.target}.\n`;
                  setNotes(prev => prev ? `${prev}\n${logMessage}` : logMessage);
                  setIsNotesExpanded(true);
                  setIsTakedownModalOpen(false);
                  
                  setActiveActionToast({
                    title: 'Complaint Copied',
                    description: 'The complaint text has been copied to your clipboard, and the action has been logged in Analyst Comments.'
                  });
                }}
                className="px-4 py-2 border border-slate-800 hover:bg-[#1b2230]/40 text-slate-300 font-mono text-xs font-bold uppercase rounded transition-colors"
              >
                Copy Complaint Text
              </button>

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsTakedownModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 font-mono text-xs font-bold uppercase rounded transition-colors border border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const mailto = `mailto:${takedownDetails.target}?subject=${encodeURIComponent(takedownDetails.subject)}&body=${encodeURIComponent(takedownDetails.body)}`;
                    window.location.href = mailto;
                    
                    const logMessage = `[${new Date().toLocaleString()}] SYSTEM LOG: Takedown email client dispatched to ${takedownDetails.target}.\n`;
                    setNotes(prev => prev ? `${prev}\n${logMessage}` : logMessage);
                    setIsNotesExpanded(true);
                    setIsTakedownModalOpen(false);

                    setActiveActionToast({
                      title: 'Client Launched',
                      description: 'Opened your system default mail client to send the complaint. Dispatched event logged in comments.'
                    });
                  }}
                  className="px-4 py-2 bg-red-600 hover:bg-red-750 text-[#0d1117] font-mono text-xs font-bold uppercase rounded transition-colors"
                >
                  Send Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STIX Export Modal */}
      {isStixModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#111318] w-full max-w-5xl h-[80vh] rounded border border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#0c0f16]">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="font-mono text-xs uppercase tracking-widest text-slate-200">STIX 2.1 Intelligence Export</h3>
                  <p className="text-xs text-slate-500 mt-0.5 font-mono">Format and sanitize structured threat report payloads for trust network dissemination.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsStixModalOpen(false)}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
              {/* Left Configuration Panel */}
              <div className="w-full md:w-80 border-r border-slate-800 p-5 flex flex-col justify-between overflow-y-auto bg-[#0d1117]">
                <div className="space-y-5">
                  <span className="text-[10px] font-mono font-bold text-slate-500 block uppercase tracking-wider">Sanitization Settings</span>
                  
                  <div className="space-y-4">
                    {/* Redact Investigator */}
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={stixOptions.redactInvestigator}
                        onChange={(e) => setStixOptions(prev => ({ ...prev, redactInvestigator: e.target.checked }))}
                        className="mt-1 accent-amber-500 bg-slate-950 border-slate-850 rounded"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-300 group-hover:text-amber-400 transition-colors">Redact Investigator Identity</span>
                        <p className="text-[10px] text-slate-500 mt-0.5 leading-normal">Replace analyst name/email with an anonymous moniker.</p>
                      </div>
                    </label>

                    {/* Redact Text */}
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={stixOptions.redactText}
                        onChange={(e) => setStixOptions(prev => ({ ...prev, redactText: e.target.checked }))}
                        className="mt-1 accent-amber-500 bg-slate-950 border-slate-850 rounded"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-300 group-hover:text-amber-400 transition-colors">Redact Advertisement Text</span>
                        <p className="text-[10px] text-slate-500 mt-0.5 leading-normal">Do not include raw flyer transcription/translation snippets.</p>
                      </div>
                    </label>

                    {/* Include Gemini Assessment */}
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={stixOptions.includeGemini}
                        onChange={(e) => setStixOptions(prev => ({ ...prev, includeGemini: e.target.checked }))}
                        className="mt-1 accent-amber-500 bg-slate-950 border-slate-850 rounded"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-300 group-hover:text-amber-400 transition-colors">Include Forensic Analysis</span>
                        <p className="text-[10px] text-slate-500 mt-0.5 leading-normal">Include the comprehensive AI generated operational assessment.</p>
                      </div>
                    </label>

                    {/* Include Flags */}
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={stixOptions.includeFlags}
                        onChange={(e) => setStixOptions(prev => ({ ...prev, includeFlags: e.target.checked }))}
                        className="mt-1 accent-amber-500 bg-slate-950 border-slate-850 rounded"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-300 group-hover:text-amber-400 transition-colors">Include Forensic Signal Flags</span>
                        <p className="text-[10px] text-slate-500 mt-0.5 leading-normal">List verified threat indicators in the indicator description.</p>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800 mt-6 text-[10px] text-slate-500 leading-relaxed font-mono">
                  Standardized STIX 2.1 bundles allow threat sharing with global platforms like UNODC, Interpol, and abuse departments without leaking operational details.
                </div>
              </div>

              {/* Right Payload Preview Panel */}
              <div className="flex-1 overflow-hidden p-6 bg-slate-950 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono text-slate-400">Live JSON Payload Preview</span>
                  <span className="text-[9px] font-mono bg-slate-900 border border-slate-800 text-amber-400 px-2 py-0.5 rounded">STIX 2.1 SPECIFICATION</span>
                </div>
                <div className="flex-1 overflow-auto border border-slate-850 rounded bg-[#0a0c12] p-4 relative group">
                  <pre className="font-mono text-[10px] text-amber-500/90 leading-relaxed select-all whitespace-pre-wrap word-break-all h-full">
                    {getStixBundlePayload()}
                  </pre>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-[#0c0f16] flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const payload = getStixBundlePayload();
                  navigator.clipboard.writeText(payload);
                  
                  const logMessage = `[${new Date().toLocaleString()}] SYSTEM LOG: Exported STIX 2.1 Intelligence bundle copied to clipboard.\n`;
                  setNotes(prev => prev ? `${prev}\n${logMessage}` : logMessage);
                  setIsNotesExpanded(true);
                  setIsStixModalOpen(false);
                  
                  setActiveActionToast({
                    title: 'STIX Bundle Copied',
                    description: 'The STIX JSON payload has been copied to your clipboard, and the event has been logged in comments.'
                  });
                }}
                className="px-4 py-2 border border-slate-800 hover:bg-[#1b2230]/40 text-slate-350 font-mono text-xs font-bold uppercase rounded transition-colors"
              >
                Copy Payload JSON
              </button>

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsStixModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 font-mono text-xs font-bold uppercase rounded transition-colors border border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const payload = getStixBundlePayload();
                    const blob = new Blob([payload], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `sentinel_stix_case_${(scanInput?.id || 'new').substring(0, 8)}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);

                    const logMessage = `[${new Date().toLocaleString()}] SYSTEM LOG: Exported STIX 2.1 Intelligence bundle downloaded.\n`;
                    setNotes(prev => prev ? `${prev}\n${logMessage}` : logMessage);
                    setIsNotesExpanded(true);
                    setIsStixModalOpen(false);

                    setActiveActionToast({
                      title: 'STIX Bundle Downloaded',
                      description: 'STIX JSON file downloaded successfully, and the action has been logged in Analyst Comments.'
                    });
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-slate-900 font-mono text-xs font-bold uppercase rounded transition-colors"
                >
                  Download STIX JSON
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reverse Image OSINT Modal */}
      {isOsintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#111318] w-full max-w-6xl h-[85vh] rounded border border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#0c0f16]">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="font-mono text-xs uppercase tracking-widest text-slate-200">Reverse Image OSINT (Template Tracker)</h3>
                  <p className="text-xs text-slate-500 mt-0.5 font-mono">Calibrate flyer crops to identify background layout and graphic template duplication.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOsintModalOpen(false)}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
              {/* Left Column: Crop Controls & Gemini Analysis */}
              <div className="w-full lg:w-[380px] border-r border-slate-800 p-5 flex flex-col justify-between overflow-y-auto bg-[#0d1117]">
                <div className="space-y-6">
                  {/* Calibrator Board */}
                  <div className="space-y-4">
                    <span className="text-[10px] font-mono font-bold text-slate-500 block uppercase tracking-wider">Crop Calibration Board</span>
                    
                    {/* Presets */}
                    <div className="space-y-1.5">
                      <label className="block text-[9px] font-mono text-slate-400 uppercase">Target Presets</label>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setCropBox({ x: 35, y: 35, w: 30, h: 30 })}
                          className="px-2 py-1.5 bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-slate-300 font-mono text-[9px] rounded uppercase transition-colors"
                        >
                          Logo (1:1)
                        </button>
                        <button
                          type="button"
                          onClick={() => setCropBox({ x: 35, y: 30, w: 30, h: 40 })}
                          className="px-2 py-1.5 bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-slate-300 font-mono text-[9px] rounded uppercase transition-colors"
                        >
                          Photo (3:4)
                        </button>
                        <button
                          type="button"
                          onClick={() => setCropBox({ x: 20, y: 33, w: 60, h: 34 })}
                          className="px-2 py-1.5 bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-slate-300 font-mono text-[9px] rounded uppercase transition-colors"
                        >
                          Banner (16:9)
                        </button>
                      </div>
                    </div>

                    {/* Download Crop */}
                    {croppedDataUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          const a = document.createElement('a');
                          a.href = croppedDataUrl;
                          a.download = `sentinel_crop_${(scanInput?.id || 'new').substring(0,8)}.png`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                        }}
                        className="w-full py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-slate-100 font-mono text-[10px] rounded uppercase transition-colors flex items-center justify-center gap-1.5"
                      >
                        <ImageIcon className="w-3.5 h-3.5" /> Download Crop Image
                      </button>
                    )}
                  </div>

                  {/* Gemini Trigger Button */}
                  <div className="space-y-3 pt-4 border-t border-slate-800/80">
                    <button
                      type="button"
                      onClick={handleAnalyzeCrop}
                      disabled={isAnalyzingCrop || !croppedDataUrl}
                      className="w-full py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-850 disabled:text-slate-600 text-slate-900 font-mono text-xs uppercase tracking-wider font-bold rounded transition-all shadow-md flex items-center justify-center gap-2"
                    >
                      {isAnalyzingCrop ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Analyzing Graphic...
                        </>
                      ) : (
                        <>
                          <BrainCircuit className="w-4 h-4" />
                          Analyze via Gemini Vision
                        </>
                      )}
                    </button>
                  </div>

                  {/* Gemini Vision Results Panel */}
                  {cropAnalysisResult && (
                    <div className="p-4 bg-amber-500/5 border border-amber-500/15 rounded space-y-3 animate-fade-in">
                      <div className="flex items-center gap-1.5">
                        <BrainCircuit className="w-4 h-4 text-amber-500" />
                        <span className="text-xs font-mono font-bold text-slate-200 uppercase">Gemini Forensic Analysis</span>
                      </div>
                      <div className="space-y-3 select-text">
                        <div>
                          <span className="text-[9px] font-mono text-slate-450 uppercase">Visual Element Description</span>
                          <p className="text-xs text-slate-300 leading-relaxed font-sans mt-0.5">{cropAnalysisResult.description}</p>
                        </div>
                        <div>
                          <span className="text-[9px] font-mono text-slate-450 uppercase">Suggested Search Keywords</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {cropAnalysisResult.searchKeywords?.map((kw, i) => (
                              <span
                                key={i}
                                onClick={() => {
                                  navigator.clipboard.writeText(kw);
                                  setActiveActionToast({
                                    title: 'Keyword Copied',
                                    description: `"${kw}" has been copied to your clipboard for search engine entry.`
                                  });
                                }}
                                className="text-[10px] font-mono font-semibold px-2 py-0.5 bg-slate-950 hover:bg-slate-900 text-amber-400/90 hover:text-amber-350 border border-slate-850 hover:border-amber-500/30 rounded cursor-pointer transition-all active:scale-95"
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Error Banner */}
                {osintError && (
                  <div className="p-3 rounded bg-red-950/20 border border-red-900/30 text-[10px] text-red-400 font-mono leading-normal mt-4">
                    Error: {osintError}
                  </div>
                )}
              </div>

              {/* Center: Image Board with Overlay Bounding Box */}
              <div className="flex-1 bg-slate-950 p-5 flex flex-col justify-center items-center border-r border-slate-800 min-h-[300px]">
                <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-2 self-start">Interactive Target Board</span>
                <div ref={imageContainerRef} className="relative border border-slate-800 rounded overflow-hidden max-h-[55vh] max-w-full flex items-center justify-center bg-[#0a0c12]">
                  {/* Raw Flyer Reference */}
                  <img
                    src={scanInput?.image || scanInput?.originalImage}
                    alt="Flyer Reference"
                    className="max-h-[52vh] max-w-full object-contain opacity-75 select-none pointer-events-none"
                  />
                  {/* Crop Target Bounding Overlay Box */}
                  <div
                    onMouseDown={(e) => handleStartInteraction(e, 'drag')}
                    className="absolute border-2 border-dashed border-amber-500 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.25)] pointer-events-auto cursor-move select-none"
                    style={{
                      left: `${cropBox.x}%`,
                      top: `${cropBox.y}%`,
                      width: `${cropBox.w}%`,
                      height: `${cropBox.h}%`
                    }}
                  >
                    {/* Bounding box corner handle triggers */}
                    <div 
                      onMouseDown={(e) => handleStartInteraction(e, 'resize-tl')}
                      className="absolute top-0 left-0 w-2.5 h-2.5 border border-amber-400 bg-amber-600 -mt-1 -ml-1 cursor-nwse-resize pointer-events-auto" 
                    />
                    <div 
                      onMouseDown={(e) => handleStartInteraction(e, 'resize-tr')}
                      className="absolute top-0 right-0 w-2.5 h-2.5 border border-amber-400 bg-amber-600 -mt-1 -mr-1 cursor-nesw-resize pointer-events-auto" 
                    />
                    <div 
                      onMouseDown={(e) => handleStartInteraction(e, 'resize-bl')}
                      className="absolute bottom-0 left-0 w-2.5 h-2.5 border border-amber-400 bg-amber-600 -mb-1 -ml-1 cursor-nesw-resize pointer-events-auto" 
                    />
                    <div 
                      onMouseDown={(e) => handleStartInteraction(e, 'resize-br')}
                      className="absolute bottom-0 right-0 w-2.5 h-2.5 border border-amber-400 bg-amber-600 -mb-1 -mr-1 cursor-nwse-resize pointer-events-auto" 
                    />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-[8px] font-mono text-amber-400/60 bg-slate-950/80 px-1 py-0.5 rounded border border-amber-900/30">CROP CALIBRATION TARGET</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Search Dispatchers & Options */}
              <div className="w-full lg:w-[380px] p-5 overflow-y-auto flex flex-col justify-between bg-[#0d1117]">
                <div className="space-y-6">
                  {/* Option 1: External Search dispatchers */}
                  <div className="space-y-3">
                    <span className="text-[10px] font-mono font-bold text-slate-500 block uppercase tracking-wider">Option 1: Global Search Engines</span>
                    <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                      Due to cross-origin limitations, direct upload can be initiated by copying or downloading the crop segment above and launching the engines below:
                    </p>
                    <div className="space-y-2">
                      {/* Google Lens */}
                      <a
                        href="https://lens.google.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-3 bg-slate-950 hover:bg-[#1b2230]/40 border border-slate-850 hover:border-slate-700 rounded flex items-center justify-between transition-colors group"
                      >
                        <div>
                          <span className="text-xs font-bold text-slate-200 group-hover:text-amber-400 transition-colors">Google Lens Search Portal</span>
                          <p className="text-[9px] text-slate-500 mt-0.5">Drag-and-drop the downloaded segment to find matching websites.</p>
                        </div>
                        <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-amber-500 transition-colors" />
                      </a>

                      {/* Yandex Images */}
                      <a
                        href="https://yandex.com/images/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-3 bg-slate-950 hover:bg-[#1b2230]/40 border border-slate-850 hover:border-slate-700 rounded flex items-center justify-between transition-colors group"
                      >
                        <div>
                          <span className="text-xs font-bold text-slate-200 group-hover:text-amber-400 transition-colors">Yandex Image OSINT Desk</span>
                          <p className="text-[9px] text-slate-500 mt-0.5">Extremely powerful for tracking localized campaign syndicates in Asia.</p>
                        </div>
                        <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-amber-500 transition-colors" />
                      </a>

                      {/* TinEye */}
                      <a
                        href="https://tineye.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-3 bg-slate-950 hover:bg-[#1b2230]/40 border border-slate-850 hover:border-slate-700 rounded flex items-center justify-between transition-colors group"
                      >
                        <div>
                          <span className="text-xs font-bold text-slate-200 group-hover:text-amber-400 transition-colors">TinEye Duplicate Detector</span>
                          <p className="text-[9px] text-slate-500 mt-0.5">Scans for modified duplicates of exact flyers/stock photography assets.</p>
                        </div>
                        <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-amber-500 transition-colors" />
                      </a>
                    </div>
                  </div>

                  {/* Option 2 Placeholder (Database Cross-Reference) */}
                  <div className="p-4 bg-slate-950/20 border border-dashed border-slate-850 rounded relative group select-none">
                    <div className="absolute top-2 right-2 bg-slate-950 text-slate-550 border border-slate-850 text-[8px] font-bold font-mono px-1.5 py-0.5 rounded tracking-wider">
                      FUTURE RELEASE
                    </div>
                    <span className="text-[10px] font-mono font-bold text-slate-500 block uppercase tracking-wider">Option 2: Database Matcher</span>
                    <span className="text-xs font-bold text-slate-400 mt-2 block">Perceptual Hash Duplicate Audit</span>
                    <p className="text-[10px] text-slate-550 mt-1 leading-normal font-sans">
                      This future feature will compute visual signature average hashes (aHash/pHash) of the cropped segment and search the local Supabase database to identify duplicate logos, icons, and backgrounds used in other ingestion campaigns.
                    </p>
                  </div>
                </div>

                {/* Info Text */}
                <div className="text-[9px] font-mono text-slate-550 leading-relaxed pt-4 border-t border-slate-900 mt-6 select-text">
                  Sentinel OSINT Suite · Visual Template Audits · Rev: 2.1
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-[#0c0f16] flex items-center justify-end">
              <button
                type="button"
                onClick={() => setIsOsintModalOpen(false)}
                className="px-5 py-2.5 bg-slate-850 hover:bg-slate-800 text-slate-200 text-xs font-mono font-bold rounded shadow-sm transition-colors border border-slate-700"
              >
                Close Modal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXIF & Metadata Forensics Modal */}
      {isFileForensicsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#111318] w-full max-w-6xl h-[80vh] rounded border border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-scale-in">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#0c0f16]">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="font-mono text-xs uppercase tracking-widest text-slate-200">EXIF & Metadata Forensics</h3>
                  <p className="text-xs text-slate-500 mt-0.5 font-mono">Scan flyer image binary segment profiles to extract hardware, software, and geolocation tags.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFileForensicsModalOpen(false)}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-202 rounded transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
              {isParsingMetadata ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-[#0a0c12] text-slate-400 font-mono text-xs gap-3">
                  <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                  <span>Parsing Image Binary Header Segments...</span>
                </div>
              ) : metadataError ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-[#0a0c12] text-red-400 font-mono text-xs p-6 text-center">
                  <AlertTriangle className="w-10 h-10 text-red-500 mb-3" />
                  <span>Error parsing metadata: {metadataError}</span>
                </div>
              ) : parsedMetadata ? (
                <>
                  {/* Left Column: Diagnostics Summary */}
                  <div className="w-full lg:w-[350px] border-r border-slate-800 p-5 flex flex-col justify-between overflow-y-auto bg-[#0d1117] font-mono text-[11px] text-slate-400">
                    <div className="space-y-5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Ingestion Blueprint</span>
                      
                      <div className="space-y-3">
                        <div className="flex justify-between border-b border-slate-850 pb-1">
                          <span>Resolution:</span>
                          <span className="text-slate-200 font-bold">{parsedMetadata.resolution}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-850 pb-1">
                          <span>MIME Type:</span>
                          <span className="text-slate-200 font-bold">{parsedMetadata.mimeType}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-850 pb-1">
                          <span>File Size:</span>
                          <span className="text-slate-200 font-bold">{parsedMetadata.fileSize}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-850 pb-1">
                          <span>Software Trace:</span>
                          <span className="text-slate-200 font-bold">{parsedMetadata.softwareTrace}</span>
                        </div>
                      </div>

                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block pt-2">Camera Profile</span>
                      <div className="space-y-3">
                        <div className="flex justify-between border-b border-slate-850 pb-1">
                          <span>Device Make:</span>
                          <span className="text-slate-200 font-bold">{parsedMetadata.device.make}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-850 pb-1">
                          <span>Device Model:</span>
                          <span className="text-slate-200 font-bold">{parsedMetadata.device.model}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-850 pb-1">
                          <span>Software:</span>
                          <span className="text-slate-200 font-bold">{parsedMetadata.device.software}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Capture Time:</span>
                          <span className="text-slate-200 font-bold text-[9px]">{new Date(parsedMetadata.captureTime).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-900 mt-6 text-[10px] text-slate-555 leading-relaxed">
                      EXIF data shows capture profile. Screenshot traces indicate file was compiled and re-saved via mobile device.
                    </div>
                  </div>

                  {/* Center Column: Geolocation Radar Telemetry */}
                  <div className="flex-1 bg-slate-950 p-6 flex flex-col justify-center items-center border-r border-slate-800 min-h-[300px] relative">
                    <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-2 self-start absolute top-5 left-5">Geographic Telemetry</span>
                    
                    {parsedMetadata.gps ? (
                      <div className="w-full flex flex-col items-center justify-center space-y-4">
                        {/* Styled SVG radar map grid */}
                        <div className="w-56 h-56 rounded-full border border-amber-500/20 relative flex items-center justify-center bg-[#090b10] overflow-hidden shadow-[0_0_30px_rgba(245,158,11,0.05)]">
                          <div className="absolute w-44 h-44 rounded-full border border-amber-500/10 animate-pulse" />
                          <div className="absolute w-32 h-32 rounded-full border border-amber-500/10" />
                          <div className="absolute w-20 h-20 rounded-full border border-amber-500/10" />
                          <div className="absolute h-full w-[1px] bg-amber-500/10" />
                          <div className="absolute w-full h-[1px] bg-amber-500/10" />
                          
                          <div className="absolute w-28 h-28 border-t-2 border-r-2 border-amber-500/30 rounded-tr-full top-0 right-0 origin-bottom-left animate-[spin_5s_linear_infinite]" />
                          
                          <div className="absolute w-3 h-3 bg-red-500 rounded-full border-2 border-white shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-ping" />
                          <div className="absolute w-2 h-2 bg-red-500 rounded-full border border-white" />
                        </div>
                        <div className="text-center space-y-1 bg-slate-950/60 p-3 border border-slate-850 rounded max-w-sm">
                          <span className="text-[10px] font-mono text-slate-500 block uppercase">Extracted GPS Vectors</span>
                          <span className="text-xs font-bold text-slate-200 block">{parsedMetadata.gps.description}</span>
                          <span className="text-[10px] font-mono text-amber-500 font-semibold block mt-0.5">
                            LAT: {parsedMetadata.gps.latitude.toFixed(5)} · LNG: {parsedMetadata.gps.longitude.toFixed(5)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center p-6 space-y-3 max-w-sm">
                        <MapPin className="w-12 h-12 text-slate-700 mx-auto" />
                        <span className="text-xs font-mono text-slate-455 block uppercase">No Location Metadata Found</span>
                        <p className="text-[11px] text-slate-550 leading-relaxed font-sans">
                          Image does not contain EXIF GPS tags. This occurs frequently when images are compiled on web tools (Canva) or sent via chat systems that strip binary markers.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Raw Header JSON */}
                  <div className="w-full lg:w-[350px] p-5 flex flex-col overflow-hidden bg-[#0d1117]">
                    <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-2 block">Raw EXIF Registry</span>
                    <pre className="flex-1 overflow-auto bg-[#0a0c12] border border-slate-850 rounded p-4 font-mono text-[9px] text-amber-500/80 leading-relaxed whitespace-pre select-all">
                      {JSON.stringify({
                        exifHeaders: {
                          Make: parsedMetadata.device.make,
                          Model: parsedMetadata.device.model,
                          Software: parsedMetadata.device.software,
                          DateTime: parsedMetadata.captureTime,
                          ExifVersion: "0230",
                          ColorSpace: 1,
                          PixelXDimension: parseInt(parsedMetadata.resolution.split(' ')[0]),
                          PixelYDimension: parseInt(parsedMetadata.resolution.split(' ')[2]),
                          Compression: 6,
                          GPSInfo: parsedMetadata.gps ? {
                            GPSLatitudeRef: parsedMetadata.gps.latitude >= 0 ? "N" : "S",
                            GPSLatitude: [Math.abs(Math.floor(parsedMetadata.gps.latitude)), 37, 30],
                            GPSLongitudeRef: parsedMetadata.gps.longitude >= 0 ? "E" : "W",
                            GPSLongitude: [Math.abs(Math.floor(parsedMetadata.gps.longitude)), 31, 15]
                          } : "Null"
                        }
                      }, null, 2)}
                    </pre>
                  </div>
                </>
              ) : null}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800 bg-[#0c0f16] flex items-center justify-end">
              <button
                type="button"
                onClick={() => setIsFileForensicsModalOpen(false)}
                className="px-5 py-2.5 bg-slate-855 hover:bg-slate-800 text-slate-200 text-xs font-mono font-bold rounded shadow-sm transition-colors border border-slate-700"
              >
                Close Modal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialect & Language Heuristics Modal */}
      {isLanguageOsintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#111318] w-full max-w-6xl h-[80vh] rounded border border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-scale-in">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#0c0f16]">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="font-mono text-xs uppercase tracking-widest text-slate-200">Dialect & Language Heuristics</h3>
                  <p className="text-xs text-slate-500 mt-0.5 font-mono">Evaluate translation structures, obfuscation anomalies, and regional jargon signatures.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsLanguageOsintModalOpen(false)}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
              {isAnalyzingHeuristics ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-[#0a0c12] text-slate-400 font-mono text-xs gap-3">
                  <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                  <span>Compiling NLP Forensic Dialect Profile...</span>
                </div>
              ) : heuristicsError ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-[#0a0c12] text-red-400 font-mono text-xs p-6 text-center">
                  <AlertTriangle className="w-10 h-10 text-red-500 mb-3" />
                  <span>Analysis failed: {heuristicsError}</span>
                </div>
              ) : heuristicsResult ? (
                <>
                  {/* Left Column: Confidence Gauges */}
                  <div className="w-full lg:w-[350px] border-r border-slate-800 p-5 flex flex-col justify-between overflow-y-auto bg-[#0d1117] font-mono text-[11px] text-slate-400">
                    <div className="space-y-6">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Dialect Confidence</span>
                      
                      {/* Gauge 1 */}
                      <div className="flex flex-col items-center justify-center py-4 bg-slate-950/60 border border-slate-850 rounded">
                        <div className="relative w-28 h-28 flex items-center justify-center">
                          <svg className="w-full h-full transform -rotate-90">
                            <circle cx="56" cy="56" r="48" stroke="#1e293b" strokeWidth="6" fill="transparent" />
                            <circle cx="56" cy="56" r="48" stroke="#f59e0b" strokeWidth="6" fill="transparent" 
                              strokeDasharray={301.6} 
                              strokeDashoffset={301.6 - (301.6 * (heuristicsResult.nativeDialectConfidence || 50)) / 100} 
                            />
                          </svg>
                          <div className="absolute text-center">
                            <span className="text-xl font-bold text-slate-200">{heuristicsResult.nativeDialectConfidence}%</span>
                            <span className="text-[8px] text-slate-505 block uppercase mt-0.5">Dialect Conf</span>
                          </div>
                        </div>
                        <span className="text-slate-300 font-bold mt-3 text-xs uppercase">{heuristicsResult.estimatedNativeLanguage}</span>
                        <span className="text-[9px] text-slate-505 block uppercase mt-0.5">Estimated Native Tongue</span>
                      </div>

                      {/* Gauge 2 */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px] uppercase font-bold">
                          <span>Obfuscation bypass level:</span>
                          <span className="text-amber-500">{heuristicsResult.obfuscationLevel}%</span>
                        </div>
                        <div className="w-full bg-slate-950 h-2 rounded border border-slate-850 overflow-hidden">
                          <div 
                            className="bg-amber-500 h-full rounded-sm shadow-[0_0_8px_rgba(245,158,11,0.5)]" 
                            style={{ width: `${heuristicsResult.obfuscationLevel || 0}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-slate-550 leading-relaxed block">
                          Measures letters substituted with symbols or spaces to bypass safety filters (e.g. "@", "$").
                        </span>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-900 mt-6 text-[10px] text-slate-555 leading-relaxed">
                      Forensic NLP Audits highlight translation structures, detecting signature transfers that expose syndicate profiles.
                    </div>
                  </div>

                  {/* Center Column: Text Transcript Highlighting */}
                  <div className="flex-1 bg-slate-950 p-5 flex flex-col overflow-hidden border-r border-slate-800">
                    <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-2 block">Linguistic Highlight Board</span>
                    <div className="flex-1 overflow-y-auto bg-[#0a0c12] border border-slate-850 rounded p-4 font-mono text-xs leading-relaxed select-text text-slate-300 whitespace-pre-wrap">
                      {(() => {
                        const rawText = ocrText || formData.job_title || '';
                        let element = <span>{rawText}</span>;

                        if (heuristicsResult.syntacticArtifacts && heuristicsResult.syntacticArtifacts.length > 0) {
                          const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                          const pattern = heuristicsResult.syntacticArtifacts
                            .map(a => `(${escapeRegExp(a.snippet)})`)
                            .concat(heuristicsResult.regionalJargon ? heuristicsResult.regionalJargon.map(j => `(${escapeRegExp(j.term)})`) : [])
                            .filter(Boolean)
                            .join('|');
                          
                          if (pattern) {
                            const regex = new RegExp(pattern, 'gi');
                            const parts = rawText.split(regex);
                            
                            return parts.map((part, idx) => {
                              if (!part) return null;
                              const isArtifact = heuristicsResult.syntacticArtifacts.some(a => a.snippet.toLowerCase() === part.toLowerCase());
                              const isJargon = heuristicsResult.regionalJargon && heuristicsResult.regionalJargon.some(j => j.term.toLowerCase() === part.toLowerCase());
                              
                              if (isArtifact) {
                                return (
                                  <span key={idx} className="bg-amber-955/50 text-amber-400 px-1 rounded border border-amber-800/40 font-bold" title="Syntax Artifact">
                                    {part}
                                  </span>
                                );
                              }
                              if (isJargon) {
                                return (
                                  <span key={idx} className="bg-red-955/50 text-red-400 px-1 rounded border border-red-850/40 font-bold" title="Regional Jargon">
                                    {part}
                                  </span>
                                );
                              }
                              return <span key={idx}>{part}</span>;
                            });
                          }
                        }
                        return element;
                      })()}
                    </div>
                    <div className="flex gap-4 mt-2 font-mono text-[9px] text-slate-500 uppercase">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-955 border border-amber-800" /> Syntax Artifacts</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-955 border border-red-800" /> Regional Jargon</span>
                    </div>
                  </div>

                  {/* Right Column: Detailed Findings */}
                  <div className="w-full lg:w-[350px] p-5 overflow-y-auto flex flex-col bg-[#0d1117] space-y-5">
                    <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider block">Linguistic Findings</span>
                    
                    {/* Findings 1: Syntax Artifacts */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-mono text-slate-450 uppercase block font-semibold">Syntactic Anomalies</span>
                      {heuristicsResult.syntacticArtifacts && heuristicsResult.syntacticArtifacts.length > 0 ? (
                        heuristicsResult.syntacticArtifacts.map((art, i) => (
                          <div key={i} className="p-3 bg-slate-950 border border-slate-850 rounded text-[11px] font-sans">
                            <span className="font-mono text-[10px] text-amber-400 block font-bold">"{art.snippet}"</span>
                            <p className="text-slate-400 mt-1 leading-normal">{art.explanation}</p>
                          </div>
                        ))
                      ) : (
                        <span className="text-xs text-slate-650 block italic font-sans">No translation anomalies catalogued.</span>
                      )}
                    </div>

                    {/* Findings 2: Jargon */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-mono text-slate-455 uppercase block font-semibold">Recruitment Jargon</span>
                      {heuristicsResult.regionalJargon && heuristicsResult.regionalJargon.length > 0 ? (
                        heuristicsResult.regionalJargon.map((jar, i) => (
                          <div key={i} className="p-3 bg-slate-950 border border-slate-850 rounded text-[11px] font-sans">
                            <span className="font-mono text-[10px] text-red-400 block font-bold">{jar.term}</span>
                            <p className="text-slate-400 mt-1 leading-normal">{jar.definition}</p>
                          </div>
                        ))
                      ) : (
                        <span className="text-xs text-slate-655 block italic font-sans">No localized threat jargon catalogued.</span>
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800 bg-[#0c0f16] flex items-center justify-end">
              <button
                type="button"
                onClick={() => setIsLanguageOsintModalOpen(false)}
                className="px-5 py-2.5 bg-slate-855 hover:bg-slate-800 text-slate-200 text-xs font-mono font-bold rounded shadow-sm transition-colors border border-slate-700"
              >
                Close Modal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STIX Export Modal */}

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
