import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase, mapDbToRecord } from '../utils/supabaseClient';
import { getCleanContactValue } from './DashboardView';
import { generateTraffickerSummary } from '../services/geminiService';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Loader2, PhoneCall, AlertTriangle, ShieldAlert, Award, FileText, Globe, ExternalLink, RefreshCw, Save } from 'lucide-react';

export default function TraffickerProfileView() {
  const { contactId } = useParams();
  const navigate = useNavigate();
  const { profile: authProfile } = useAuth();
  
  const [scans, setScans] = useState([]);
  const [traffickerProfile, setTraffickerProfile] = useState({ id: contactId, notes: '', ai_summary: '' });
  const [loading, setLoading] = useState(true);
  const [savingNotes, setSavingNotes] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [notesText, setNotesText] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // 1. Fetch all scans
        const { data: scansData, error: scansErr } = await supabase.from('scans').select('*');
        if (scansErr) throw scansErr;
        
        const mappedScans = (scansData || []).map(mapDbToRecord);
        
        // Filter scans matching this trafficker ID
        const matched = mappedScans.filter(scan => {
          const contactMethod = scan.extractedData?.contact_method;
          const clean = getCleanContactValue(contactMethod);
          return clean === contactId;
        });
        
        // Sort chronologically (newest first)
        matched.sort((a, b) => b.timestamp - a.timestamp);
        setScans(matched);

        // 2. Fetch or initialize trafficker profile notes & summaries
        const { data: profData, error: profErr } = await supabase
          .from('trafficker_profiles')
          .select('*')
          .eq('id', contactId)
          .maybeSingle();
          
        if (profErr && profErr.code !== 'PGRST116') {
          console.error("Error fetching profile details:", profErr);
        }

        if (profData) {
          setTraffickerProfile(profData);
          setNotesText(profData.notes || '');
        } else {
          setTraffickerProfile({ id: contactId, notes: '', ai_summary: '' });
          setNotesText('');
        }
      } catch (err) {
        console.error("Failed to hydrate trafficker dossier:", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [contactId]);

  const handleSaveNotes = async () => {
    try {
      setSavingNotes(true);
      const { error } = await supabase
        .from('trafficker_profiles')
        .upsert({
          id: contactId,
          notes: notesText,
          updated_at: new Date().toISOString()
        });
      if (error) throw error;
      
      setTraffickerProfile(prev => ({ ...prev, notes: notesText }));
    } catch (err) {
      console.error("Failed to save investigator notes:", err);
      alert("Failed to save notes: " + (err.message || err.toString()));
    } finally {
      setSavingNotes(false);
    }
  };

  const handleGenerateSummary = async () => {
    const apiKey = authProfile?.gemini_api_key || localStorage.getItem('gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY;
    const modelName = authProfile?.gemini_model || localStorage.getItem('gemini_model');
    
    if (!apiKey) {
      alert("Please configure your Gemini API Key in Settings to generate an intelligence report.");
      return;
    }

    try {
      setGeneratingSummary(true);
      const summary = await generateTraffickerSummary(apiKey, modelName, {
        contactMethod: contactId,
        scansData: scans
      });

      // Update database profile
      const { error } = await supabase
        .from('trafficker_profiles')
        .upsert({
          id: contactId,
          ai_summary: summary,
          updated_at: new Date().toISOString()
        });
      if (error) throw error;

      setTraffickerProfile(prev => ({ ...prev, ai_summary: summary }));
    } catch (err) {
      console.error("Failed to generate AI intelligence profile:", err);
      alert("Error generating summary: " + (err.message || err.toString()));
    } finally {
      setGeneratingSummary(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-3" />
        <p className="text-slate-400 text-sm font-mono">Loading recruiter threat dossier...</p>
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

  // Risk Classification
  const threatClass = avgRisk >= 80 
    ? { label: 'CRITICAL RISK / HIGH DANGER', color: 'text-red-500 bg-red-500/10 border-red-500/30' }
    : avgRisk >= 50
    ? { label: 'MODERATE TO HIGH RISK', color: 'text-amber-500 bg-amber-500/10 border-amber-500/30' }
    : { label: 'SUSPECTED / LOW RISK', color: 'text-[#3fb950] bg-[#3fb950]/10 border-[#3fb950]/30' };

  // Heat map for locations
  const countryMap = {};
  scans.forEach(s => {
    const c = s.locationCountry || 'Unknown / Remote';
    countryMap[c] = (countryMap[c] || 0) + 1;
  });
  const locationsSorted = Object.entries(countryMap)
    .map(([name, count]) => ({ name, count, percent: Math.round((count / totalAds) * 100) }))
    .sort((a, b) => b.count - a.count);

  // OSINT links helper
  const cleanHandle = contactId.replace('Telegram: @', '').replace('WhatsApp: ', '').replace('Email: ', '');
  const osintGoogle = `https://www.google.com/search?q=%22${encodeURIComponent(cleanHandle)}%22`;
  const osintTelegram = contactId.includes('Telegram') ? `https://telegram.dog/${cleanHandle}` : null;

  return (
    <div className="flex flex-col flex-1 h-full mt-4 max-w-screen-md w-full mx-auto space-y-6 pb-20">
      
      {/* Header and Back navigation */}
      <div className="flex items-center gap-3">
        <button 
          onClick={() => navigate('/dashboard')}
          className="p-2 border border-slate-800 hover:bg-[#1b2230]/40 rounded transition-all"
        >
          <ArrowLeft className="w-4 h-4 text-slate-400" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-100 truncate max-w-[400px] font-mono">
            Recruiter Dossier
          </h1>
          <p className="text-slate-500 text-xs font-mono truncate">{contactId}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left Side: Stats and OSINT Search */}
        <div className="md:col-span-1 space-y-6">
          
          {/* Risk Card */}
          <div className="bg-[#111318] border border-slate-800 rounded p-4 space-y-4">
            <div className={`p-2.5 rounded border text-center font-mono text-[10px] font-bold uppercase tracking-wider ${threatClass.color}`}>
              {threatClass.label}
            </div>
            
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-800 font-mono">
              <div className="text-center">
                <span className="text-[10px] text-slate-500 block">Avg Risk</span>
                <span className="text-xl font-bold text-slate-100">{avgRisk}%</span>
              </div>
              <div className="text-center">
                <span className="text-[10px] text-slate-500 block">Linked Ads</span>
                <span className="text-xl font-bold text-slate-100">{totalAds}</span>
              </div>
            </div>

            <div className="space-y-1.5 pt-3 border-t border-slate-800 font-mono text-[10px] text-slate-450">
              <div className="flex justify-between">
                <span>First Spotted:</span>
                <span className="font-semibold text-slate-300">{firstSpotted}</span>
              </div>
              <div className="flex justify-between">
                <span>Last Activity:</span>
                <span className="font-semibold text-slate-300">{lastSpotted}</span>
              </div>
            </div>
          </div>

          {/* OSINT Quick Links */}
          <div className="bg-[#111318] border border-slate-800 rounded p-4 space-y-3">
            <h3 className="font-mono text-xs font-bold text-slate-500 uppercase tracking-wide">
              OSINT Integrations
            </h3>
            <div className="flex flex-col gap-2">
              <a 
                href={osintGoogle} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center justify-between p-2.5 border border-slate-800 hover:bg-[#1b2230]/40 text-xs font-mono font-bold rounded text-slate-300"
              >
                <span>Google Search Handle</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              </a>
              {osintTelegram && (
                <a 
                  href={osintTelegram} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-2.5 border border-slate-800 hover:bg-[#1b2230]/40 text-xs font-mono font-bold rounded text-slate-300"
                >
                  <span>Open Telegram Chat</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                </a>
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
                <div key={loc.name} className="space-y-1 font-mono text-[10px]">
                  <div className="flex justify-between">
                    <span className="font-bold text-slate-400">{loc.name}</span>
                    <span className="text-slate-500">{loc.count} ({loc.percent}%)</span>
                  </div>
                  <div className="w-full bg-[#0a0c12] border border-slate-800 h-2 rounded overflow-hidden">
                    <div 
                      className="bg-amber-500 h-full rounded-sm"
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
                <Globe className="w-4 h-4 text-amber-500 animate-pulse" /> AI Threat Intelligence Profile
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
            
            {traffickerProfile.ai_summary ? (
              <div className="p-3.5 bg-[#0a0c12] border border-slate-800 rounded font-mono text-[11.5px] leading-relaxed text-slate-300">
                {traffickerProfile.ai_summary}
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
                disabled={savingNotes || notesText === traffickerProfile.notes}
                className="px-2.5 py-1.5 bg-[#1b2230] border border-slate-850 hover:bg-[#1b2230]/80 disabled:opacity-50 text-slate-300 font-mono text-[10px] font-bold uppercase tracking-wider rounded transition-all flex items-center gap-1"
              >
                <Save className="w-3 h-3" /> {savingNotes ? 'Saving...' : 'Save Notes'}
              </button>
            </div>
            
            <textarea 
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              placeholder="Record cross-referenced identities, physical compounds, syndicate flags, phone logs, or any other threat information..."
              rows={4}
              className="w-full p-3.5 bg-[#0a0c12] border border-slate-800 rounded text-xs text-slate-200 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none transition-all placeholder:italic font-mono"
            />
          </div>

          {/* Evidence Lock (Scans History) */}
          <div className="bg-[#111318] border border-slate-800 rounded p-5 space-y-3">
            <h3 className="font-mono text-xs font-bold text-slate-500 uppercase tracking-wider">
              Ingested Evidence Log
            </h3>
            
            <div className="divide-y divide-slate-800 max-h-96 overflow-y-auto pr-1">
              {scans.map(scan => (
                <div key={scan.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-200 truncate font-mono">
                      {scan.jobTitle}
                    </p>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                      {new Date(scan.timestamp).toLocaleDateString()} • {scan.employer} • {scan.locationCountry || 'Remote'}
                    </p>
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
              ))}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
