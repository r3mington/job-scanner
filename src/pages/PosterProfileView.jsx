import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase, mapDbToRecord } from '../utils/supabaseClient';
import { getCleanContactValue, dayKeyOf } from '../utils/caseHelpers';
import { generatePosterSummary } from '../services/geminiService';
import { useAuth } from '../context/AuthContext';
import { getActiveApiKey } from '../utils/apiKey';
import PosterActivityTimeline from '../components/PosterActivityTimeline';
import { ArrowLeft, Loader2, ShieldAlert, FileText, Globe, ExternalLink, RefreshCw, Save, MapPin, ChevronUp, ChevronDown } from 'lucide-react';

const COUNTRY_COORDINATES = {
  'Thailand': { x: 74, y: 55 },
  'Cambodia': { x: 76, y: 57 },
  'Myanmar': { x: 71, y: 52 },
  'Laos': { x: 74, y: 51 },
  'Vietnam': { x: 77, y: 53 },
  'Philippines': { x: 82, y: 53 },
  'Malaysia': { x: 73, y: 62 },
  'Indonesia': { x: 77, y: 68 },
  'Dubai': { x: 58, y: 43 },
  'UAE': { x: 58, y: 43 },
  'Mexico': { x: 22, y: 45 },
  'Brazil': { x: 34, y: 68 },
  'Pakistan': { x: 65, y: 42 },
  'India': { x: 67, y: 47 },
  'China': { x: 74, y: 38 },
  'Ukraine': { x: 55, y: 28 },
  'Taiwan': { x: 80, y: 44 },
  'Unknown / Remote': { x: 50, y: 50 }
};

export default function PosterProfileView() {
  const { contactId } = useParams();
  const navigate = useNavigate();
  const { user, profile: authProfile } = useAuth();
  
  const [scans, setScans] = useState([]);
  const [posterProfile, setPosterProfile] = useState({ id: contactId, notes: '', ai_summary: '' });
  const [loading, setLoading] = useState(true);
  const [savingNotes, setSavingNotes] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [notesText, setNotesText] = useState('');
  const [showBriefing, setShowBriefing] = useState(() => {
    const saved = localStorage.getItem('sentinel_show_dossier_briefing');
    return saved === 'true';
  });
  const [pendingLink, setPendingLink] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [summaryTime, setSummaryTime] = useState(null);

  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      try {
        setLoading(true);
        
        // 1. Fetch only current user's scans with limited columns
        const { data: scansData, error: scansErr } = await supabase
          .from('scans')
          .select('id, timestamp, job_title, employer, extracted_data, location_country, risk_score, active_flags, normalized_text')
          .eq('user_id', user.id);
        if (scansErr) throw scansErr;
        
        const mappedScans = (scansData || []).map(mapDbToRecord);
        
        // Filter scans matching this poster contact
        const matched = mappedScans.filter(scan => {
          const contactMethod = scan.extractedData?.contact_method;
          const clean = getCleanContactValue(contactMethod);
          return clean === contactId;
        });
        
        // Sort chronologically (newest first)
        matched.sort((a, b) => b.timestamp - a.timestamp);
        setScans(matched);
 
        // Load local backups first
        const localNotes = localStorage.getItem(`sentinel_poster_notes_${contactId}`) || '';
        const localSummary = localStorage.getItem(`sentinel_poster_summary_${contactId}`) || '';
        const localSummaryTime = localStorage.getItem(`sentinel_poster_summary_time_${contactId}`);
        setSummaryTime(localSummaryTime ? Number(localSummaryTime) : null);

        // 2. Fetch or initialize poster profile notes & summaries from database
        let profData = null;
        try {
          const { data, error: profErr } = await supabase
            .from('trafficker_profiles')
            .select('*')
            .eq('id', contactId)
            .maybeSingle();
            
          if (profErr && profErr.code !== 'PGRST116') {
            console.warn("Supabase trafficker_profiles table query failed, utilizing localStorage fallback:", profErr);
          } else {
            profData = data;
          }
        } catch (dbErr) {
          console.warn("Exception querying Supabase trafficker_profiles, utilizing localStorage fallback:", dbErr);
        }
 
        if (profData) {
          setPosterProfile(profData);
          setNotesText(profData.notes || localNotes || '');
        } else {
          setPosterProfile({ id: contactId, notes: localNotes, ai_summary: localSummary });
          setNotesText(localNotes);
        }
      } catch (err) {
        console.error("Failed to load poster profile:", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [contactId, user]);

  const handleSaveNotes = async () => {
    try {
      setSavingNotes(true);
      localStorage.setItem(`sentinel_poster_notes_${contactId}`, notesText);
      setPosterProfile(prev => ({ ...prev, notes: notesText }));
    } catch (err) {
      console.error("Failed to save investigator notes locally:", err);
    }

    try {
      const { error } = await supabase
        .from('trafficker_profiles')
        .upsert({
          id: contactId,
          notes: notesText,
          updated_at: new Date().toISOString()
        });
      if (error) {
        console.warn("Failed to sync notes to Supabase (saved locally instead):", error);
      }
    } catch (dbErr) {
      console.warn("Supabase write error during notes sync (saved locally instead):", dbErr);
    } finally {
      setSavingNotes(false);
    }
  };

  const handleGenerateSummary = async () => {
    // Client key optional — generatePosterSummary routes through the gemini-proxy
    // edge function (server-held GEMINI_API_KEY) when no client key is present.
    const apiKey = getActiveApiKey();
    const modelName = authProfile?.gemini_model || localStorage.getItem('gemini_model');

    let summary = '';
    try {
      setGeneratingSummary(true);
      summary = await generatePosterSummary(apiKey, modelName, {
        contactMethod: contactId,
        scansData: scans
      });

      localStorage.setItem(`sentinel_poster_summary_${contactId}`, summary);
      const generatedAt = Date.now();
      localStorage.setItem(`sentinel_poster_summary_time_${contactId}`, String(generatedAt));
      setSummaryTime(generatedAt);
      setPosterProfile(prev => ({ ...prev, ai_summary: summary }));
    } catch (err) {
      console.error("Failed to generate AI intelligence profile:", err);
      alert("Error generating summary: " + (err.message || err.toString()));
      setGeneratingSummary(false);
      return;
    }

    try {
      const { error } = await supabase
        .from('trafficker_profiles')
        .upsert({
          id: contactId,
          ai_summary: summary,
          updated_at: new Date().toISOString()
        });
      if (error) {
        console.warn("Failed to sync AI summary to Supabase (saved locally instead):", error);
      }
    } catch (dbErr) {
      console.warn("Supabase write error during summary sync (saved locally instead):", dbErr);
    } finally {
      setGeneratingSummary(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-3" />
        <p className="text-slate-400 text-sm font-mono">Loading poster profile...</p>
      </div>
    );
  }

  // Calculate metrics
  const totalAds = scans.length;
  const avgRisk = totalAds > 0 
    ? Math.round(scans.reduce((sum, s) => sum + s.riskScore, 0) / totalAds) 
    : 0;

  // Spotted Timelines
  const firstSpotted = totalAds > 0 ? new Date(scans[scans.length - 1].timestamp).toLocaleDateString() : 'N/A';
  const lastSpotted = totalAds > 0 ? new Date(scans[0].timestamp).toLocaleDateString() : 'N/A';
  const activeDays = totalAds > 0
    ? Math.round((scans[0].timestamp - scans[scans.length - 1].timestamp) / 86400000) + 1
    : 0;

  // Risk Classification
  const riskClass = avgRisk >= 80 
    ? { label: 'CRITICAL RISK / HIGH DANGER', color: 'text-red-500 bg-red-500/10 border-red-500/30' }
    : avgRisk >= 50
    ? { label: 'MODERATE TO HIGH RISK', color: 'text-amber-500 bg-amber-500/10 border-amber-500/30' }
    : { label: 'SUSPECTED / LOW RISK', color: 'text-[#3fb950] bg-[#3fb950]/10 border-[#3fb950]/30' };

  // Heat map for locations (count + per-jurisdiction average risk)
  const countryMap = {};
  scans.forEach(s => {
    const c = s.locationCountry || 'Unknown / Remote';
    if (!countryMap[c]) countryMap[c] = { count: 0, riskSum: 0 };
    countryMap[c].count += 1;
    countryMap[c].riskSum += s.riskScore;
  });
  const locationsSorted = Object.entries(countryMap)
    .map(([name, { count, riskSum }]) => ({
      name,
      count,
      percent: Math.round((count / totalAds) * 100),
      avgRisk: Math.round(riskSum / count)
    }))
    .sort((a, b) => b.count - a.count);
  const maxCountryCount = locationsSorted[0]?.count || 1;

  // Reused ad templates (identical normalized text posted multiple times)
  const templateCounts = {};
  scans.forEach(s => {
    const key = (s.normalizedText || '').trim().toLowerCase();
    if (key.length > 20) templateCounts[key] = (templateCounts[key] || 0) + 1;
  });
  const templateCountOf = (scan) => {
    const key = (scan.normalizedText || '').trim().toLowerCase();
    return key.length > 20 ? templateCounts[key] : 0;
  };

  // Evidence log filtered by the timeline day selection, grouped by day
  const filteredScans = selectedDay ? scans.filter(s => dayKeyOf(s.timestamp) === selectedDay) : scans;
  const groupedEvidence = [];
  filteredScans.forEach(scan => {
    const label = new Date(scan.timestamp).toLocaleDateString();
    const lastGroup = groupedEvidence[groupedEvidence.length - 1];
    if (lastGroup && lastGroup.label === label) lastGroup.scans.push(scan);
    else groupedEvidence.push({ label, scans: [scan] });
  });

  // AI summary freshness
  const summaryIsStale = Boolean(
    posterProfile.ai_summary && summaryTime && totalAds > 0 && scans[0].timestamp > summaryTime
  );

  // OSINT links helper
  const cleanHandle = contactId.replace('Telegram: @', '').replace('WhatsApp: ', '').replace('Email: ', '');
  const osintGoogle = `https://www.google.com/search?q=%22${encodeURIComponent(cleanHandle)}%22`;
  const osintTelegram = contactId.includes('Telegram') ? `https://telegram.dog/${cleanHandle}` : null;

  return (
    <div className="flex flex-col flex-1 h-full mt-4 max-w-screen-lg w-full mx-auto space-y-6 pb-20">
      
      {/* Header and Back navigation */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/dashboard')}
            className="p-2 border border-slate-800 hover:bg-[#1b2230]/40 rounded transition-all"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4 text-slate-400" />
          </button>
          
          {/* SVG Silhouette Recruiter Image */}
          <div className="relative">
            <svg viewBox="0 0 100 100" className="w-14 h-14 rounded border border-slate-800 bg-[#0a0c12] p-1 flex-shrink-0">
              {/* Silhouette head */}
              <circle cx="50" cy="38" r="16" fill="#1e293b" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="60 10" className="animate-pulse" />
              {/* Silhouette shoulders */}
              <path d="M22 82 C22 65 32 58 50 58 C68 58 78 65 78 82" fill="#1e293b" stroke="#f59e0b" strokeWidth="1.5" />
              {/* Corner crosshairs for scan/target aesthetic */}
              <path d="M8 20 L8 8 L20 8" stroke="#f59e0b" strokeWidth="1.5" fill="none" />
              <path d="M92 20 L92 8 L80 8" stroke="#f59e0b" strokeWidth="1.5" fill="none" />
              <path d="M8 80 L8 92 L20 92" stroke="#f59e0b" strokeWidth="1.5" fill="none" />
              <path d="M92 80 L92 92 L80 92" stroke="#f59e0b" strokeWidth="1.5" fill="none" />
              {/* Midpoint horizontal scanline indicator */}
              <line x1="12" y1="50" x2="88" y2="50" stroke="#f59e0b" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
            </svg>
            <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-red-500 border border-slate-900 animate-pulse" title="Profile under review" />
          </div>

          <div>
            <h1 className="text-xl font-bold text-slate-100 truncate max-w-[400px] font-mono tracking-wide uppercase">
              Poster Profile
            </h1>
            <p className="text-slate-500 text-xs font-mono mt-0.5 truncate">{contactId}</p>
          </div>
        </div>

        {/* Small operational indicator */}
        <div className="hidden sm:flex flex-col items-end font-mono text-[9px] text-slate-500">
          <div>STATUS: SCANNED PROFILE</div>
          <div className="text-red-400 font-bold">INTEL RECORD: ACTIVE</div>
        </div>
      </div>

      {/* System Briefing / Onboarding Panel */}
      <div className="bg-[#0a0c12] border border-slate-800 rounded overflow-hidden transition-all duration-300">
        <button
          type="button"
          onClick={() => {
            const nextState = !showBriefing;
            setShowBriefing(nextState);
            localStorage.setItem('sentinel_show_dossier_briefing', String(nextState));
          }}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[#1b2230]/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
              System Briefing: Poster Profile Console
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
          <div className="p-4 border-t border-slate-800 bg-[#0a0c12]/40 text-xs font-mono space-y-4 grid grid-cols-1 md:grid-cols-3 gap-4 md:space-y-0">
            <div className="space-y-1.5">
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                1. Risk Overview
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Review aggregated risk metrics, total linked postings, and first/last sighting dates for this contact handle.
              </p>
            </div>
            
            <div className="space-y-1.5">
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                2. AI Intelligence Profile
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Click `Generate Summary` to run a Gemini LLM analysis on all associated postings and identify deceptive recruitment patterns.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                3. Case Documentation
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Add custom investigator notes, link associated postings, and click `Save Notes` to store evidence permanently.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Dossier Masthead: risk classification + headline stats */}
      <div className="bg-[#111318] border border-slate-800 rounded p-4 flex flex-col lg:flex-row lg:items-stretch gap-4">
        <div className={`px-4 py-3 rounded border flex items-center justify-center text-center font-mono text-[10px] font-bold uppercase tracking-wider lg:w-52 flex-shrink-0 ${riskClass.color}`}>
          {riskClass.label}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1 font-mono">
          <div className="flex flex-col justify-center px-3 py-2 bg-[#0a0c12] border border-slate-800 rounded">
            <span className="text-[9px] text-slate-500 uppercase tracking-wider">Avg Risk</span>
            <span className={`text-xl font-bold ${avgRisk >= 60 ? 'text-red-400' : avgRisk >= 30 ? 'text-amber-400' : 'text-[#3fb950]'}`}>{avgRisk}%</span>
          </div>
          <div className="flex flex-col justify-center px-3 py-2 bg-[#0a0c12] border border-slate-800 rounded">
            <span className="text-[9px] text-slate-500 uppercase tracking-wider">Linked Ads</span>
            <span className="text-xl font-bold text-slate-100">{totalAds}</span>
          </div>
          <div className="flex flex-col justify-center px-3 py-2 bg-[#0a0c12] border border-slate-800 rounded">
            <span className="text-[9px] text-slate-500 uppercase tracking-wider">Active Window</span>
            <span className="text-xs font-bold text-slate-100 leading-tight">{firstSpotted} – {lastSpotted}</span>
            <span className="text-[9px] text-slate-500">{activeDays} day{activeDays !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex flex-col justify-center px-3 py-2 bg-[#0a0c12] border border-slate-800 rounded">
            <span className="text-[9px] text-slate-500 uppercase tracking-wider">Jurisdictions</span>
            <span className="text-xl font-bold text-slate-100">{locationsSorted.length}</span>
          </div>
        </div>
      </div>

      {/* Posting Activity Timeline */}
      <PosterActivityTimeline
        scans={scans}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Left Side: OSINT Search and Jurisdictions */}
        <div className="md:col-span-1 space-y-6">

          {/* OSINT Quick Links */}
          <div className="bg-[#111318] border border-slate-800 rounded p-4 space-y-3">
            <h3 className="font-mono text-xs font-bold text-slate-500 uppercase tracking-wide">
              OSINT Integrations
            </h3>
            <div className="flex flex-col gap-2">
              <button 
                onClick={() => setPendingLink(osintGoogle)}
                className="flex items-center justify-between p-2.5 border border-slate-800 hover:bg-[#1b2230]/40 text-xs font-mono font-bold rounded text-slate-300 text-left w-full cursor-pointer"
              >
                <span>Google Search Handle</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              </button>
              {osintTelegram && (
                <button 
                  onClick={() => setPendingLink(osintTelegram)}
                  className="flex items-center justify-between p-2.5 border border-slate-800 hover:bg-[#1b2230]/40 text-xs font-mono font-bold rounded text-slate-300 text-left w-full cursor-pointer"
                >
                  <span>Open Telegram Chat</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                </button>
              )}
            </div>
          </div>

          {/* Location Breakdown */}
          <div className="bg-[#111318] border border-slate-800 rounded p-4 space-y-3">
            <h3 className="font-mono text-xs font-bold text-slate-500 uppercase tracking-wide">
              Jurisdictions Matrix
            </h3>
            <div className="space-y-2.5">
              {locationsSorted.map(loc => (
                <div key={loc.name} className="space-y-1 font-mono text-[10px]" title={`Avg risk in ${loc.name}: ${loc.avgRisk}%`}>
                  <div className="flex justify-between">
                    <span className="font-bold text-slate-400">{loc.name}</span>
                    <span className="text-slate-500">{loc.count} ({loc.percent}%)</span>
                  </div>
                  <div className="w-full bg-[#0a0c12] border border-slate-800 h-2 rounded overflow-hidden">
                    <div
                      className={`h-full rounded-sm ${loc.avgRisk >= 60 ? 'bg-red-500' : loc.avgRisk >= 30 ? 'bg-amber-500' : 'bg-[#3fb950]'}`}
                      style={{ width: `${loc.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Side: Notes, Summary, Scans History */}
        <div className="md:col-span-2 space-y-6">
          

          
          {/* AI Intelligence Report */}
          <div className="bg-[#111318] border border-slate-800 rounded p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-amber-500 animate-pulse" /> AI Recruitment Pattern Analysis
              </h3>
              <button 
                onClick={handleGenerateSummary}
                disabled={generatingSummary || scans.length === 0}
                className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-800 disabled:text-slate-600 text-[#0d1117] font-mono text-[10px] font-bold uppercase tracking-wider rounded transition-colors flex items-center gap-1"
              >
                {generatingSummary ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" /> Generating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3 h-3" /> Generate Summary
                  </>
                )}
              </button>
            </div>
            
            {posterProfile.ai_summary ? (
              <div className="space-y-2">
                <div className="p-3.5 bg-[#0a0c12] border border-slate-800 rounded font-mono text-[11.5px] leading-relaxed text-slate-300">
                  {posterProfile.ai_summary}
                </div>
                <div className="flex items-center gap-2 font-mono text-[9px] text-slate-500">
                  {summaryTime && <span>Generated {new Date(summaryTime).toLocaleString()}</span>}
                  {summaryIsStale && (
                    <span className="px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-400 font-bold uppercase tracking-wider">
                      Stale — new evidence ingested since generation
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-6 border border-dashed border-slate-800 rounded text-center">
                <p className="text-xs text-slate-500 italic">No AI intelligence generated for this profile handle yet.</p>
                <p className="text-[10px] text-slate-500 mt-1">Click the button above to request a synthesis report from Gemini.</p>
              </div>
            )}
          </div>

          {/* Investigator Notes */}
          <div className="bg-[#111318] border border-slate-800 rounded p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-amber-500" /> Investigator Case Notes
              </h3>
              <button 
                onClick={handleSaveNotes}
                disabled={savingNotes || notesText === posterProfile.notes}
                className="px-2.5 py-1.5 bg-[#1b2230] border border-slate-850 hover:bg-[#1b2230]/80 disabled:opacity-50 text-slate-300 font-mono text-[10px] font-bold uppercase tracking-wider rounded transition-all flex items-center gap-1"
              >
                <Save className="w-3 h-3" /> {savingNotes ? 'Saving...' : 'Save Notes'}
              </button>
            </div>
            
            <textarea 
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              placeholder="Record cross-referenced identities, linked postings, contact logs, or other case-relevant information..."
              rows={4}
              className="w-full p-3.5 bg-[#0a0c12] border border-slate-800 rounded text-xs text-slate-200 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none transition-all placeholder:italic font-mono"
            />
          </div>

          {/* Evidence Lock (Scans History) */}
          <div className="bg-[#111318] border border-slate-800 rounded p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-mono text-xs font-bold text-slate-500 uppercase tracking-wider">
                Ingested Evidence Log
              </h3>
              <span className="font-mono text-[9px] text-slate-500">
                {selectedDay
                  ? `${filteredScans.length} of ${totalAds} ads (day filter active)`
                  : `${totalAds} ads`}
              </span>
            </div>

            <div className="max-h-96 overflow-y-auto pr-1">
              {groupedEvidence.map(group => (
                <div key={group.label}>
                  <div className="sticky top-0 bg-[#111318] pt-2 pb-1 flex items-center gap-2">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-500">
                      {group.label}
                    </span>
                    <span className="font-mono text-[9px] text-slate-600">
                      {group.scans.length} ad{group.scans.length !== 1 ? 's' : ''}
                    </span>
                    <div className="flex-1 border-t border-slate-800" />
                  </div>
                  <div className="divide-y divide-slate-800/60">
                    {group.scans.map(scan => {
                      const templateHits = templateCountOf(scan);
                      const flags = scan.activeFlags || [];
                      return (
                        <div key={scan.id} className="py-3 flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-200 truncate font-mono">
                              {scan.jobTitle}
                            </p>
                            <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                              {scan.employer} • {scan.locationCountry || 'Remote'}
                            </p>
                            {(flags.length > 0 || templateHits > 1) && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {templateHits > 1 && (
                                  <span className="px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-400 font-mono text-[9px] font-bold">
                                    Template ×{templateHits}
                                  </span>
                                )}
                                {flags.slice(0, 3).map(flag => (
                                  <span key={flag} className="px-1.5 py-0.5 rounded border border-slate-800 bg-[#1b2230] text-slate-400 font-mono text-[9px]">
                                    {flag}
                                  </span>
                                ))}
                                {flags.length > 3 && (
                                  <span className="px-1.5 py-0.5 rounded border border-slate-800 text-slate-500 font-mono text-[9px]" title={flags.slice(3).join(', ')}>
                                    +{flags.length - 3}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                              scan.riskScore >= 60
                                ? 'bg-red-500/10 text-red-400'
                                : scan.riskScore >= 30
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-[#3fb950]/10 text-[#3fb950]'
                            }`}>
                              {scan.riskScore}%
                            </span>
                            <button
                              onClick={() => navigate('/review', { state: { scanId: scan.id, isExistingScan: true } })}
                              className="px-2 py-1 border border-slate-800 hover:bg-[#1b2230]/40 text-slate-400 hover:text-slate-205 rounded text-[10px] font-mono font-bold uppercase transition-colors"
                            >
                              Review
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {filteredScans.length === 0 && (
                <p className="py-6 text-center text-xs text-slate-500 font-mono italic">
                  No ads match the selected day.
                </p>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Geographic Risk Map */}
      <div className="bg-[#111318] border border-slate-800 rounded p-5 space-y-4">
        <style>{`
          @keyframes radar-sweep {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
          .animate-radar-sweep {
            animation: radar-sweep 4s linear infinite;
          }
        `}</style>

        <h3 className="font-mono text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-amber-500" /> Geographic Activity Map
        </h3>
        
        <div className="relative w-full aspect-[2/1] bg-[#0a0c12] border border-slate-850 rounded overflow-hidden">
          {/* Radar Grid Lines */}
          <div className="absolute inset-0 opacity-[0.07] pointer-events-none">
            <div className="w-full h-full" style={{
              backgroundImage: 'radial-gradient(circle, #f59e0b 1px, transparent 1px), linear-gradient(to right, #f59e0b 1px, transparent 1px), linear-gradient(to bottom, #f59e0b 1px, transparent 1px)',
              backgroundSize: '8px 8px, 40px 40px, 40px 40px',
              backgroundPosition: 'center'
            }} />
          </div>
          
          {/* Radar Sweeper Animation Effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-500/10 to-transparent w-[200%] -translate-x-full animate-radar-sweep pointer-events-none" />

          {/* Simplified world map outline vectors for visual reference */}
          <svg viewBox="0 0 100 100" className="w-full h-full absolute inset-0 opacity-[0.15] pointer-events-none" preserveAspectRatio="none">
            {/* Simplified North America */}
            <path d="M 5,20 L 25,12 L 35,25 L 30,45 L 20,48 L 15,35 Z" fill="none" stroke="#64748b" strokeWidth="1.2" />
            {/* Simplified South America */}
            <path d="M 28,52 L 38,55 L 34,85 L 29,82 L 25,62 Z" fill="none" stroke="#64748b" strokeWidth="1.2" />
            {/* Simplified Africa */}
            <path d="M 45,45 L 58,42 L 62,55 L 55,75 L 48,72 L 42,55 Z" fill="none" stroke="#64748b" strokeWidth="1.2" />
            {/* Simplified Eurasia */}
            <path d="M 40,25 L 75,15 L 90,20 L 92,48 L 78,60 L 68,52 L 55,35 Z" fill="none" stroke="#64748b" strokeWidth="1.2" />
            {/* Simplified Australia */}
            <path d="M 80,68 L 88,68 L 90,78 L 80,82 Z" fill="none" stroke="#64748b" strokeWidth="1.2" />
          </svg>

          {/* Active targeting markers */}
          {locationsSorted.map(loc => {
            const coords = COUNTRY_COORDINATES[loc.name] || COUNTRY_COORDINATES['Unknown / Remote'];
            const isHighRisk = loc.avgRisk >= 60;
            const markerSize = 10 + (loc.count / maxCountryCount) * 8;

            return (
              <div
                key={loc.name}
                style={{ left: `${coords.x}%`, top: `${coords.y}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 group z-10"
              >
                {/* Concentric pulsing rings */}
                <span className={`absolute inline-flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-75 animate-ping duration-1500 ${isHighRisk ? 'bg-red-500/20' : 'bg-amber-500/20'}`} />

                {/* Center Core Dot — sized by scan count, colored by jurisdiction avg risk */}
                <div
                  style={{ width: `${markerSize}px`, height: `${markerSize}px` }}
                  className={`rounded-full border-2 border-[#0a0c12] shadow-md ${isHighRisk ? 'bg-red-500' : 'bg-amber-500'}`}
                />

                {/* Tooltip Label (hover only, to keep clustered regions readable) */}
                <div className="absolute left-5 top-1/2 -translate-y-1/2 bg-slate-950/95 border border-slate-800 px-2 py-1 rounded text-[9px] font-mono text-slate-200 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl z-20 pointer-events-none">
                  <span className="font-bold text-slate-100">{loc.name}</span>
                  <span className="text-[8px] text-slate-450 block mt-0.5">{loc.count} Active Scan{loc.count !== 1 ? 's' : ''} • Avg Risk {loc.avgRisk}%</span>
                </div>
              </div>
            );
          })}
        </div>
        
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[9px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> High-Danger Jurisdiction (Jurisdiction Avg Risk &gt;= 60%)
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Suspicious Jurisdiction (Jurisdiction Avg Risk &lt; 60%)
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full border border-slate-600" /> Marker size = scan volume
          </div>
        </div>
      </div>

      {/* Safety Warning Interstitial Modal */}
      {pendingLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#111318] border border-slate-800 rounded-xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-500">
              <ShieldAlert className="w-6 h-6 animate-pulse" />
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider">
                Do No Harm Safety Gate
              </h3>
            </div>
            
            <p className="text-xs text-slate-350 leading-relaxed font-mono">
              <strong>WARNING: DIRECT CONTACT RISK</strong>
              <br /><br />
              You are opening an external search or messaging channel referencing this contact handle.
              <br /><br />
              Under UN Do No Harm guidelines, analysts must:
              <br />
              • NEVER initiate direct contact without a supervised investigation protocol.
              <br />
              • NEVER alert the subject of ongoing OSINT monitoring.
              <br />
              • Utilize isolated VMs/VPNs and authorised cover profiles only.
            </p>

            <div className="pt-2 flex justify-end gap-3 font-mono text-xs">
              <button
                onClick={() => setPendingLink(null)}
                className="px-4 py-2 border border-slate-800 hover:bg-[#1b2230]/40 text-slate-400 rounded transition-colors cursor-pointer"
              >
                [ Cancel ]
              </button>
              <button
                onClick={() => {
                  window.open(pendingLink, '_blank', 'noopener,noreferrer');
                  setPendingLink(null);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded transition-colors cursor-pointer"
              >
                [ Confirm & Open ]
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
