import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase, mapDbToRecord, mapRecordToDb, uploadBase64Image, SCAN_DETAIL_COLUMNS } from '../utils/supabaseClient';
import { calculateRiskScore, getRiskLevel } from '../utils/scoring';
import { ShieldAlert, AlertTriangle, Save, ArrowLeft, Loader2, MapPin, Columns, X, ChevronDown, ChevronUp, Image as ImageIcon, ExternalLink, TrendingUp, HelpCircle, BrainCircuit, MessageSquare, Send, Phone, Mail, Users, UserX } from 'lucide-react';
import { analyzeJobPosting } from '../services/geminiService';
import { getTakedownDetails, buildCaseSummary, getCleanContactValue } from '../utils/caseHelpers';
import { useAuth } from '../context/AuthContext';
import { getActiveApiKey } from '../utils/apiKey';
import { computeWordDiff, computeKeywordMatches, prepareSimilarity, similarityFromPrepared, STOP_WORDS, GENERIC_JOB_WORDS } from '../utils/similarity';
import { generateStixBundle } from '../utils/stixExporter';
import { getMedianSalary } from '../utils/countryMedians';

// Extracted sub-components
import ScoreBreakdown from '../components/ScoreBreakdown';
import ThreatAnalysis from '../components/ThreatAnalysis';
import EscalationStages from '../components/EscalationStages';
import ActionGrid from '../components/ActionGrid';
import SourceContext from '../components/SourceContext';
import SimilarAds from '../components/SimilarAds';
import IndicatorChecklist from '../components/IndicatorChecklist';
import WarningPosterModal from '../components/WarningPosterModal';
import STIXExportModal from '../components/STIXExportModal';
import ReverseImageOsintModal from '../components/ReverseImageOsintModal';
import ExifForensicsModal from '../components/ExifForensicsModal';

const LOADING_STEPS = [
  "Acquiring and registering flyer media...",
  "Parsing text segments via OCR engine...",
  "Translating linguistic structures...",
  "Calculating comparative wage anomalies...",
  "Auditing high-risk location parameters...",
  "Compiling parsed intelligence..."
];

// Recency label for the sticky-bar recruiter strip
function formatLastActive(ts) {
  if (!ts) return null;
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days <= 0) return { label: 'active today', live: true };
  if (days === 1) return { label: 'active yesterday', live: false };
  if (days < 30) return { label: `last seen ${days}d ago`, live: false };
  return {
    label: `last seen ${new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`,
    live: false
  };
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
  const [originalText, setOriginalText] = useState(scanInput?.text || scanInput?.originalText || '');
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
  const [isNotesExpanded, setIsNotesExpanded] = useState(false);
  const [isSourceExpanded, setIsSourceExpanded] = useState(false);
  const [isIndicatorsExpanded, setIsIndicatorsExpanded] = useState(false);
  const [isPlaybookExpanded, setIsPlaybookExpanded] = useState(false);
  const [suspiciousSpans, setSuspiciousSpans] = useState([]);
  const [showHighlights, setShowHighlights] = useState(true);
  const [isImageExpanded, setIsImageExpanded] = useState(false);
  // Flyer reference image. New scans get it from nav state; registry-opened
  // scans load it lazily (separately from the detail fetch) so a multi-MB
  // base64 blob never blocks first paint.
  const [flyerImageUrl, setFlyerImageUrl] = useState(scanInput?.image || scanInput?.originalImage || null);
  const [hoveredKey, setHoveredKey] = useState(null);
  const [loadingStepIdx, setLoadingStepIdx] = useState(0);
  const [apiTelemetryLogs, setApiTelemetryLogs] = useState([]);
  const consoleContainerRef = useRef(null);
  const [predictedPlaybook, setPredictedPlaybook] = useState([]);
  const [scoreBarsVisible, setScoreBarsVisible] = useState(false);
  const [activeActionToast, setActiveActionToast] = useState(null);
  const [showBriefing, setShowBriefing] = useState(() => {
    const saved = localStorage.getItem('sentinel_show_review_briefing');
    return saved === 'true';
  });

  // Localized Poster Generator States
  const [isPosterModalOpen, setIsPosterModalOpen] = useState(false);

  // Takedown Dispatcher States
  const [isTakedownModalOpen, setIsTakedownModalOpen] = useState(false);
  const [takedownDetails, setTakedownDetails] = useState({
    platform: 'Web Host',
    target: '',
    webLink: null,
    subject: '',
    body: ''
  });

  // Image OSINT States (crop/analysis state lives inside ReverseImageOsintModal)
  const [isOsintModalOpen, setIsOsintModalOpen] = useState(false);

  // File Forensics States (parsing state lives inside ExifForensicsModal)
  const [isFileForensicsModalOpen, setIsFileForensicsModalOpen] = useState(false);

  // STIX Export States
  const [isStixModalOpen, setIsStixModalOpen] = useState(false);
  const [stixOptions, setStixOptions] = useState({
    redactInvestigator: true,
    redactText: false,
    includeGemini: true,
    includeFlags: true,
  });

  // Anchor nav scroll-spy + score-bar evidence jump
  const [activeNavSection, setActiveNavSection] = useState('section-score');
  const evidencePulseTimer = useRef(null);

  // Live score-delta feedback on indicator toggle
  const [scoreDelta, setScoreDelta] = useState(null); // { value, id }
  const scoreDeltaTimer = useRef(null);

  // Recruiter identity strip intel — { linkedCount, lastActive }. Loaded
  // after paint; the handle itself renders instantly from formData.
  const [actorIntel, setActorIntel] = useState(null);

  useEffect(() => {
    if (loading || !user) return;
    const cc = getCleanContactValue(formData.contact_method);
    if (!cc) { setActorIntel(null); return; }

    // Distinctive token to match against stored contact strings: the handle
    // for Telegram, digits for WhatsApp, the address for email.
    const raw = cc.includes(':') ? cc.split(':').slice(1).join(':').trim() : cc;
    const token = raw.startsWith('+') ? raw.slice(1) : raw;
    if (!token || token.length < 4) { setActorIntel(null); return; }

    let cancelled = false;
    (async () => {
      try {
        const pattern = '%' + token.replace(/[\\%_]/g, '\\$&') + '%';
        const { data, error } = await supabase
          .from('scans')
          .select('id, timestamp')
          .eq('user_id', user.id)
          .ilike('extracted_data->>contact_method', pattern);
        if (error) throw error;
        if (cancelled || !data) return;

        const linkedCount = data.filter(d => d.id !== scanInput?.id).length;
        const lastActive = data.reduce((max, d) => {
          const t = typeof d.timestamp === 'number' ? d.timestamp : (Number(d.timestamp) || Date.parse(d.timestamp) || 0);
          return Math.max(max, t);
        }, 0);
        setActorIntel({ linkedCount, lastActive: lastActive || null });
      } catch (err) {
        console.warn('Recruiter intel lookup failed:', err?.message || err);
      }
    })();
    return () => { cancelled = true; };
  }, [loading, user, formData.contact_method, scanInput?.id]);

  useEffect(() => {
    let rafId = null;
    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const sections = document.querySelectorAll('[data-nav-section]');
        let current = null;
        sections.forEach(el => {
          if (el.getBoundingClientRect().top <= 130) current = el.id;
        });
        if (current) setActiveNavSection(current);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [loading, error]);

  useEffect(() => () => {
    if (evidencePulseTimer.current) clearTimeout(evidencePulseTimer.current);
    if (scoreDeltaTimer.current) clearTimeout(scoreDeltaTimer.current);
  }, []);

  const handleNavJump = (id) => {
    if (id === 'section-notes') setIsNotesExpanded(true);
    if (id === 'section-source') setIsSourceExpanded(true);
    if (id === 'section-indicators') setIsIndicatorsExpanded(true);
    if (id === 'section-playbook') setIsPlaybookExpanded(true);
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  // Scroll to the flagged phrase in the ad text and pulse it via the hover-emphasis mechanic
  const jumpToEvidence = (flagName) => {
    setShowHighlights(true);
    if (activeTabInput === 'normalized') setActiveTabInput('original');
    setTimeout(() => {
      const el = document.querySelector(`[data-threat-key="${CSS.escape(flagName)}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHoveredKey(flagName);
      if (evidencePulseTimer.current) clearTimeout(evidencePulseTimer.current);
      evidencePulseTimer.current = setTimeout(() => {
        setHoveredKey(k => (k === flagName ? null : k));
      }, 2200);
    }, 80);
  };

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
      sourcePlatform,
      sourceUrl,
      ocrText,
      translatedText,
      aiReview
    });
  };

  const handleTakeAction = (actionId) => {
    if (actionId === 'poster') {
      setIsPosterModalOpen(true);
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
    } else if (actionId === 'takedown') {
      const details = getTakedownDetails(formData.contact_method, formData.source_url);
      setTakedownDetails(details);
      setIsTakedownModalOpen(true);
    } else if (actionId === 'stix') {
      setIsStixModalOpen(true);
    } else if (actionId === 'image_osint') {
      if (flyerImageUrl) {
        setIsOsintModalOpen(true);
      } else {
        setActiveActionToast({
          title: 'Reverse Image OSINT',
          description: 'No physical flyer reference image associated with this scan to perform OSINT analysis.'
        });
      }
    } else if (actionId === 'file_forensics') {
      if (flyerImageUrl) {
        setIsFileForensicsModalOpen(true);
      } else {
        setActiveActionToast({
          title: 'EXIF & Metadata Forensics',
          description: 'No physical flyer reference image associated with this scan to perform file analysis.'
        });
      }
    }
  };

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


  useEffect(() => {
    if (loading || !user || !normalizedTextVal) return;

    const TOP_MATCHES = 12;

    const fetchSimilarScans = async () => {
      try {
        // Rank on normalized_text only — the big original_text/ocr_text columns
        // are fetched afterwards for just the handful of surviving matches.
        const { data, error } = await supabase
          .from('scans')
          .select('id, timestamp, job_title, employer, normalized_text')
          .eq('user_id', user.id);

        if (error) throw error;
        if (!data) return;

        // Prepare the current ad once instead of re-tokenizing it per row.
        const preparedCurrent = prepareSimilarity(normalizedTextVal);

        const ranked = data
          .map(scan => {
            const record = mapDbToRecord(scan);
            const similarity = similarityFromPrepared(preparedCurrent, prepareSimilarity(record.normalizedText || ''));
            return { ...record, similarity };
          })
          .filter(item => item.id !== scanInput?.id && item.similarity > 0.40)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, TOP_MATCHES);

        if (ranked.length === 0) {
          setSimilarScans([]);
          return;
        }

        // Hydrate only the top matches with the full text needed to explain the
        // match (shared handle / template overlap) in the UI.
        const { data: textData, error: textErr } = await supabase
          .from('scans')
          .select('id, original_text, ocr_text')
          .in('id', ranked.map(r => r.id));

        if (!textErr && textData) {
          const textById = new Map(textData.map(t => [t.id, t]));
          ranked.forEach(r => {
            const t = textById.get(r.id);
            if (t) {
              r.originalText = t.original_text;
              r.ocrText = t.ocr_text;
            }
          });
        }

        setSimilarScans(ranked);
      } catch (err) {
        console.error('Failed to fetch similar scans:', err?.message || err);
      }
    };

    // Defer off the first-paint frame so ranking/hydration never competes with
    // rendering the case the analyst actually opened.
    const schedule = window.requestIdleCallback || ((cb) => setTimeout(cb, 200));
    const handle = schedule(fetchSimilarScans);
    return () => {
      if (window.cancelIdleCallback && typeof handle === 'number') window.cancelIdleCallback(handle);
    };
  }, [loading, user, normalizedTextVal, scanInput?.id]);

  useEffect(() => {
    if (!scanInput) {
      navigate('/');
      return;
    }

    if (scanInput.isExistingScan) {
      if (scanInput.ocrText === undefined && scanInput.id) {
        setLoading(true);
        // Critical path: fetch every detail column EXCEPT the image blob so the
        // page paints without waiting on a potentially multi-MB base64 field.
        supabase.from('scans').select(SCAN_DETAIL_COLUMNS).eq('id', scanInput.id).single()
          .then(({ data, error }) => {
            if (error) {
              setError("Failed to fetch full scan details: " + error.message);
              setLoading(false);
            } else if (data) {
               const fullScan = mapDbToRecord(data);
               setFormData(fullScan.extractedData);
               setActiveFlags(fullScan.activeFlags || []);
               setOcrText(fullScan.ocrText || null);
               setOriginalText(fullScan.originalText || '');
               setAiReview(fullScan.aiReview || '');
              setParsedSalaryUsd(fullScan.parsedSalaryUsd || null);
              setLocationCountry(fullScan.locationCountry || null);
              setDetectedLanguage(fullScan.detectedLanguage || 'English');
              setIsTranslated(fullScan.isTranslated || false);
              setTranslatedText(fullScan.translatedText || null);
              setNormalizedText(fullScan.normalizedText || '');
              setNotes(fullScan.notes || '');
              setSourcePlatform(fullScan.sourcePlatform || 'unspecified');
              setSourceUrl(fullScan.sourceUrl || 'unspecified');
              setIngestionMethod(fullScan.ingestionMethod || 'Analyst Upload');
              setPostDate(fullScan.postDate || 'unspecified');
              setSuspiciousSpans(fullScan.extractedData?.suspicious_spans || []);
              setPredictedPlaybook(fullScan.extractedData?.predicted_playbook || []);
              setAuditStatus(fullScan.extractedData?.audit_status || 'pending');
              setLoading(false);

              // Lazily pull the flyer image reference after paint — off the
              // critical path since it can be a large base64 data-URI.
              if (!flyerImageUrl) {
                supabase.from('scans').select('original_image_url').eq('id', scanInput.id).single()
                  .then(({ data: imgData, error: imgErr }) => {
                    if (!imgErr && imgData?.original_image_url) {
                      setFlyerImageUrl(imgData.original_image_url);
                    }
                  });
              }
            }
          });
      } else {
        // Viewing/Editing an existing history record
      setFormData(scanInput.extractedData || {
        job_title: '', employer_identity: '', salary_range: '',
        location: '', industry: '', contact_method: ''
      });
      setActiveFlags(scanInput.activeFlags || []);
      setOriginalText(scanInput.originalText || null);
      setOcrText(scanInput.ocrText || null);
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
      }
    } else {
      // New scan - call Gemini API
      setSourcePlatform(scanInput.sourcePlatform || 'unspecified');
      setSourceUrl(scanInput.sourceUrl || 'unspecified');
      setIngestionMethod(scanInput.ingestionMethod || 'Analyst Upload');
      setPostDate(scanInput.postDate || 'unspecified');
      performScan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const apiKey = getActiveApiKey();
      const modelName = profile?.gemini_model || localStorage.getItem('gemini_model');

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

            // A re-import can carry a flyer image the stored duplicate lacks
            // (e.g. the record was first ingested text-only from the live
            // feed). Backfill it so the image isn't silently dropped and the
            // image-based tools (OSINT, forensics) work on this case.
            if (scanInput.image && !dupScan.original_image_url) {
              try {
                const backfilledUrl = scanInput.image.startsWith('data:image/')
                  ? await uploadBase64Image(scanInput.image)
                  : scanInput.image;
                const { error: backfillErr } = await supabase
                  .from('scans')
                  .update({ original_image_url: backfilledUrl })
                  .eq('id', dupScan.id);
                if (backfillErr) throw backfillErr;
                dupScan.original_image_url = backfilledUrl;
              } catch (imgErr) {
                console.warn('Failed to backfill flyer image onto duplicate record:', imgErr?.message || imgErr);
              }
            }
            if (dupScan.original_image_url) setFlyerImageUrl(dupScan.original_image_url);

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
            // Drop the image rather than writing a multi-MB base64 blob to the DB.
            console.warn('Image upload failed during auto-save; saving without it:', uploadErr?.message || uploadErr);
            imageUrl = null;
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
    const nextFlags = activeFlags.includes(flag)
      ? activeFlags.filter(f => f !== flag)
      : [...activeFlags, flag];

    // Compute the true score delta (includes combo multipliers + contextual
    // scaling/capping), not just the raw flag weight, so the feedback matches
    // the recalculated Total Risk Index.
    const scoringContext = {
      parsedSalaryUsd,
      locationCountry,
      detectedLanguage,
      contactMethod: formData.contact_method,
      suspiciousSpans,
      predictedPlaybook,
      sourcePlatform,
      employer: formData.employer_identity
    };
    const before = calculateRiskScore(activeFlags, scoringContext).score;
    const after = calculateRiskScore(nextFlags, scoringContext).score;

    setActiveFlags(nextFlags);

    const diff = after - before;
    if (diff !== 0) {
      const id = Date.now();
      setScoreDelta({ value: diff, id });
      if (scoreDeltaTimer.current) clearTimeout(scoreDeltaTimer.current);
      scoreDeltaTimer.current = setTimeout(() => {
        setScoreDelta(cur => (cur && cur.id === id ? null : cur));
      }, 1800);
    }
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
          sourcePlatform,
        employer: formData.employer_identity
      });
      const score = scoreResult.score;
      const level = getRiskLevel(score);

      // Handle uploading image if raw Base64. flyerImageUrl preserves the
      // reference for registry-opened scans (whose nav state has no image).
      let imageUrl = scanInput.image || scanInput.originalImage || flyerImageUrl || null;
      if (imageUrl && imageUrl.startsWith('data:image/')) {
        try {
          imageUrl = await uploadBase64Image(imageUrl);
        } catch (uploadErr) {
          // Never persist a multi-MB base64 data-URI into the DB column — it
          // would bloat the table and slow every future load. Drop it instead.
          console.warn('Image upload failed; saving without the flyer image:', uploadErr?.message || uploadErr);
          imageUrl = null;
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
    if (scanInput?.isExistingScan || isExistingScan) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center py-20 bg-[#0d1117] text-slate-300">
          <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-3" />
          <p className="text-slate-500 text-sm font-mono uppercase tracking-wider">Retrieving case files...</p>
        </div>
      );
    }

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
              {flyerImageUrl ? (
                <img
                  src={flyerImageUrl}
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
    sourcePlatform,
    employer: formData.employer_identity
  });
  const score = scoreResult.score;
  const scoreDetails = scoreResult.details;
  const riskInfo = getRiskLevel(score);

  // Score reconciliation: History/Dashboard show the score stored at save time.
  // ReviewScan always recomputes live, so an existing scan saved under older
  // scoring logic can display a different number here. Surface the drift instead
  // of silently contradicting the registry.
  const storedScore = (scanInput?.isExistingScan || isExistingScan) && typeof scanInput?.riskScore === 'number'
    ? scanInput.riskScore
    : null;
  const scoreDrifted = storedScore !== null && storedScore !== score;

  // Sticky intel bar derived values
  const stickyScoreColor = score >= 60 ? 'text-red-400 bg-red-500/10 border-red-500/30' : score >= 30 ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' : 'text-amber-400 bg-amber-500/10 border-amber-500/30';

  // Recruiter identity strip derivations
  const cleanContact = getCleanContactValue(formData.contact_method);
  const contactDisplay = cleanContact
    ? (cleanContact.includes(':') ? cleanContact.split(':').slice(1).join(':').trim() : cleanContact)
    : null;
  const contactKindLc = (cleanContact || '').toLowerCase();
  const ContactIcon = contactKindLc.startsWith('telegram') ? Send
    : contactKindLc.startsWith('whatsapp') ? Phone
    : contactKindLc.startsWith('email') ? Mail
    : Users;
  const isActorHub = (actorIntel?.linkedCount ?? 0) >= 1;
  const actorRecency = formatLastActive(actorIntel?.lastActive);
  const openDossier = () => cleanContact && navigate(`/poster/${encodeURIComponent(cleanContact)}`);

  // One-shot text digest of the case for pasting into reports / secure channels.
  const handleCopySummary = async () => {
    const text = buildCaseSummary({
      caseId: (scanInput?.isExistingScan && scanInput?.id) ? scanInput.id.substring(0, 8).toUpperCase() : 'NEW',
      jobTitle: formData.job_title,
      score,
      riskLabel: riskInfo.label,
      auditStatus,
      location: formData.location,
      contactMethod: formData.contact_method,
      sourcePlatform,
      salaryRange: formData.salary_range,
      employer: formData.employer_identity,
      scoreDetails,
      playbookData: getPlaybookData(),
      notes
    });
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setActiveActionToast({
        title: 'Case Summary Copied',
        description: 'Plain-text digest copied to clipboard — ready to paste into a report or secure channel.'
      });
    } catch {
      setActiveActionToast({
        title: 'Copy Failed',
        description: 'Clipboard access was blocked by the browser. Try again or copy manually.'
      });
    }
  };

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
      <div className="sticky top-0 z-40 -mx-4 backdrop-blur-md border-b" style={{ background: 'rgba(10,12,18,0.92)', borderColor: 'rgba(255,255,255,0.06)' }}>
      <div className="px-4 py-2 flex items-center justify-between gap-3">
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
          <span className="relative flex items-center gap-1.5">
            <span key={score} className={`score-chip-bump text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${stickyScoreColor}`}>
              RISK {score}
            </span>
            {scoreDelta && (
              <span
                key={scoreDelta.id}
                className={`score-delta-pop pointer-events-none text-[10px] font-mono font-black px-1.5 py-0.5 rounded ${
                  scoreDelta.value > 0
                    ? 'text-red-300 bg-red-500/15 border border-red-500/25'
                    : 'text-emerald-300 bg-emerald-500/15 border border-emerald-500/25'
                }`}
              >
                {scoreDelta.value > 0 ? `+${scoreDelta.value}` : scoreDelta.value}
              </span>
            )}
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

      {/* Recruiter identity strip — always visible; empty state when no contact */}
      <div className={`px-4 py-1.5 flex items-center gap-2.5 flex-wrap border-t ${
        !contactDisplay ? 'border-slate-800/60 bg-slate-900/20'
          : isActorHub ? 'border-purple-500/20 bg-purple-950/20' : 'border-slate-800/60 bg-slate-900/30'
      }`}>
        {contactDisplay ? (
          <>
            <button
              type="button"
              onClick={openDossier}
              title="Open recruiter dossier"
              className={`flex items-center gap-1.5 text-[11px] font-mono font-bold transition-colors ${
                isActorHub ? 'text-purple-200 hover:text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              <ContactIcon className="w-3 h-3" />
              {contactDisplay}
            </button>
            {isActorHub && (
              <button
                type="button"
                onClick={() => navigate('/history', { state: { viewType: 'graph', focusContact: cleanContact } })}
                title="View this recruiter's cluster in the connections graph"
                className="text-[9px] font-mono font-bold uppercase tracking-wider text-purple-300 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/40 rounded-full px-2 py-0.5 transition-colors"
              >
                Hub · {actorIntel.linkedCount} linked ad{actorIntel.linkedCount > 1 ? 's' : ''}
              </button>
            )}
            {actorRecency && (
              <span className={`flex items-center gap-1 text-[10px] font-mono ${
                actorRecency.live ? 'text-emerald-400' : 'text-slate-500'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${actorRecency.live ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
                {actorRecency.label}
              </span>
            )}
            <span className="flex-1" />
            <button
              type="button"
              onClick={openDossier}
              className={`text-[10px] font-mono font-bold uppercase tracking-wider transition-colors ${
                isActorHub ? 'text-purple-300 hover:text-purple-100' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Dossier →
            </button>
          </>
        ) : (
          <span className="flex items-center gap-1.5 text-[11px] font-mono font-medium text-slate-500">
            <UserX className="w-3 h-3" />
            No recruiter contact identified
            <span className="text-slate-600 font-normal">· anonymous posting</span>
          </span>
        )}
      </div>

      {/* Anchor nav — section jump links */}
      <nav className="px-4 pb-1.5 pt-1.5 flex items-center gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-850 scrollbar-track-transparent border-t border-slate-800/60" aria-label="Page sections">
        {[
          { id: 'section-score', label: 'Score' },
          { id: 'section-threat', label: 'Analysis' },
          ...(getPlaybookData().length > 0 ? [{ id: 'section-playbook', label: 'Escalation' }] : []),
          { id: 'section-actions', label: 'Actions' },
          ...(similarScans.length > 0 ? [{ id: 'similar-postings-section', label: 'Similar Ads' }] : []),
          ...(aiReview ? [{ id: 'section-ai-review', label: 'AI Review' }] : []),
          { id: 'section-notes', label: 'Notes' },
          { id: 'section-source', label: 'Source' },
          { id: 'section-details', label: 'Details' },
          { id: 'section-indicators', label: 'Indicators' },
        ].map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleNavJump(item.id)}
            className={`flex-shrink-0 px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider transition-colors ${
              activeNavSection === item.id
                ? 'text-amber-400 bg-amber-500/10 border border-amber-500/30'
                : 'text-slate-500 hover:text-slate-300 border border-transparent'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
      </div>

      <ScoreBreakdown
        score={score}
        scoreBorder={score >= 60 ? 'border-red-800/40' : 'border-amber-800/40'}
        scoreDetails={scoreDetails}
        suspiciousSpans={suspiciousSpans}
        scoreBarsVisible={scoreBarsVisible}
        setScoreBarsVisible={setScoreBarsVisible}
        jumpToEvidence={jumpToEvidence}
        scoreColor={score >= 60 ? '#e5534b' : score >= 30 ? '#f0b429' : '#3fb950'}
        scoreDrifted={scoreDrifted}
        storedScore={storedScore}
        handleSave={handleSave}
        saving={saving}
      />


      <ThreatAnalysis
        originalText={originalText}
        ocrText={ocrText}
        translatedText={translatedText}
        normalizedTextVal={normalizedTextVal}
        suspiciousSpans={suspiciousSpans}
        detectedLanguage={detectedLanguage}
        isTranslated={isTranslated}
        showHighlights={showHighlights}
        setShowHighlights={setShowHighlights}
        activeTabInput={activeTabInput}
        setActiveTabInput={setActiveTabInput}
        hoveredKey={hoveredKey}
        setHoveredKey={setHoveredKey}
      />



      <EscalationStages
        playbookData={getPlaybookData()}
        isPlaybookExpanded={isPlaybookExpanded}
        setIsPlaybookExpanded={setIsPlaybookExpanded}
      />

      <ActionGrid
        handleCopySummary={handleCopySummary}
        handleTakeAction={handleTakeAction}
      />

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
      {flyerImageUrl && (
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
                src={flyerImageUrl}
                alt="Raw Flyer"
                loading="lazy"
                className="w-full max-w-sm mx-auto rounded border border-slate-800 object-contain max-h-96"
              />
            </div>
          )}
        </div>
      )}



      <SimilarAds
        similarScans={similarScans}
        formData={formData}
        originalText={originalText}
        ocrText={ocrText}
        setComparisonTarget={setComparisonTarget}
      />


      {/* AI Review Widget */}
      {aiReview && (
        <div id="section-ai-review" data-nav-section className="scroll-mt-32 rounded overflow-hidden border border-indigo-900/40" style={{background:'#111318'}}>
          <div className="p-4 border-b border-indigo-900/30 bg-indigo-500/5 flex items-center gap-2">
             <BrainCircuit className="w-4 h-4 text-indigo-400" />
             <h3 className="font-bold text-slate-200 text-sm">AI Scam Analysis</h3>
          </div>
          <div className="p-4 text-[15px] text-slate-200 leading-relaxed border-l-2 border-indigo-500/30 ml-4 mr-4 mt-0 pl-3">
             {aiReview}
          </div>
        </div>
      )}

      {/* Analyst Comments & Notes Widget */}
      <div id="section-notes" data-nav-section className="scroll-mt-32 rounded overflow-hidden border border-slate-800/80" style={{background:'#111318'}}>
        <button
          type="button"
          onClick={() => setIsNotesExpanded(prev => !prev)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-amber-500" />
            <div>
              <h3 className="font-bold text-slate-200 text-sm">Analyst Notes & Case Comments</h3>
              <p className="text-xs text-slate-500 mt-0.5">
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

      <SourceContext
        sourcePlatform={sourcePlatform}
        setSourcePlatform={setSourcePlatform}
        ingestionMethod={ingestionMethod}
        setIngestionMethod={setIngestionMethod}
        sourceUrl={sourceUrl}
        setSourceUrl={setSourceUrl}
        postDate={postDate}
        setPostDate={setPostDate}
        ocrText={ocrText}
        isSourceExpanded={isSourceExpanded}
        setIsSourceExpanded={setIsSourceExpanded}
      />


      {/* Extracted Data Form */}
      <div id="section-details" data-nav-section className="scroll-mt-32 rounded overflow-hidden border border-slate-800/80" style={{background:'#111318'}}>
        <div className="p-4 border-b border-slate-800">
           <h3 className="font-bold text-slate-200 text-sm">Extracted Details</h3>
           <p className="text-xs text-slate-500 mt-1">Tap fields to correct any inaccuracies.</p>
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

      <IndicatorChecklist
        activeFlags={activeFlags}
        handleFlagToggle={handleFlagToggle}
        isIndicatorsExpanded={isIndicatorsExpanded}
        setIsIndicatorsExpanded={setIsIndicatorsExpanded}
      />


      {/* Save action completed via sticky header console */}

      {/* Side-by-Side Diff Modal */}
      {comparisonTarget && (() => {
        const oldText = comparisonTarget.normalizedText || '';
        const newText = normalizedTextVal;
        
         const extractHandles = (s) => new Set((s.match(/@[\w]{3,}/g) || []).map(m => m.toLowerCase()));
         const sharedHandles = Array.from(extractHandles(comparisonTarget.originalText || '')).filter(h => extractHandles(originalText || ocrText || '').has(h));
 
         const extractPhones = (s) => new Set(s.match(/\b\d{7,}\b/g) || []);
         const sharedPhones = Array.from(extractPhones(comparisonTarget.originalText || '')).filter(p => extractPhones(originalText || ocrText || '').has(p));
 
         const extractNumbers = (s) => new Set(s.match(/\b\d{4}\b/g) || []);
         const sharedNumbers = Array.from(extractNumbers(comparisonTarget.originalText || '')).filter(n => extractNumbers(originalText || ocrText || '').has(n));

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
                        : (originalText || ocrText || '');
                      
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
                        : (originalText || ocrText || '');

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
          <WarningPosterModal
            isOpen={isPosterModalOpen}
            onClose={() => setIsPosterModalOpen(false)}
            formData={formData}
            activeFlags={activeFlags}
            parsedSalaryUsd={parsedSalaryUsd}
            locationCountry={locationCountry}
            detectedLanguage={detectedLanguage}
            suspiciousSpans={suspiciousSpans}
            predictedPlaybook={predictedPlaybook}
            sourcePlatform={sourcePlatform}
            ingestionMethod={ingestionMethod}
            ocrText={ocrText}
            translatedText={translatedText}
            scanInput={scanInput}
          />

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
      <STIXExportModal
        isOpen={isStixModalOpen}
        onClose={() => setIsStixModalOpen(false)}
        stixOptions={stixOptions}
        setStixOptions={setStixOptions}
        getStixBundlePayload={getStixBundlePayload}
        caseId={scanInput?.id || 'new'}
        onLogAction={(logText, toastTitle, toastDesc) => {
          const fullMessage = `[${new Date().toLocaleString()}] SYSTEM LOG: ${logText}\n`;
          setNotes(prev => prev ? `${prev}\n${fullMessage}` : fullMessage);
          setIsNotesExpanded(true);
          setActiveActionToast({
            title: toastTitle,
            description: toastDesc
          });
        }}
      />

      {/* Reverse Image OSINT Modal */}
      <ReverseImageOsintModal
        isOpen={isOsintModalOpen}
        onClose={() => setIsOsintModalOpen(false)}
        flyerImageUrl={flyerImageUrl}
        scanId={scanInput?.id}
        onLog={(message) => {
          setNotes(prev => prev ? `${prev}\n${message}` : message);
          setIsNotesExpanded(true);
        }}
        onToast={setActiveActionToast}
      />

      {/* EXIF & Metadata Forensics Modal */}
      <ExifForensicsModal
        isOpen={isFileForensicsModalOpen}
        onClose={() => setIsFileForensicsModalOpen(false)}
        flyerImageUrl={flyerImageUrl}
        onLog={(message) => {
          setNotes(prev => prev ? `${prev}\n${message}` : message);
          setIsNotesExpanded(true);
        }}
      />


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
