import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase, mapRecordToDb, uploadBase64Image } from '../utils/supabaseClient';
import { calculateRiskScore, getRiskLevel, RISK_FLAGS } from '../utils/scoring';
import { ShieldAlert, CheckCircle, AlertTriangle, Save, ArrowLeft, Loader2, MapPin, TrendingUp, BrainCircuit } from 'lucide-react';
import { analyzeJobPosting } from '../services/geminiService';
import { getMedianSalary } from '../utils/countryMedians';
import { useAuth } from '../context/AuthContext';

export default function ReviewScan() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  
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
  
  // Extract inputs from navigation state (image or text)
  const scanInput = location.state;

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
      setLoading(false);
    } else {
      // New scan - call Gemini API
      performScan();
    }
  }, [scanInput, navigate]);

  const performScan = async () => {
    try {
      setLoading(true);
      const apiKey = localStorage.getItem('gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY;
      const modelName = localStorage.getItem('gemini_model');
      
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
            const existingScan = mapDbToRecord(dupData[0]);
            if (window.confirm(`This job description has already been analyzed. Would you like to view the existing analysis instead of running a new scan?`)) {
              navigate('/review', { 
                state: { 
                  ...existingScan,
                  isExistingScan: true
                },
                replace: true
              });
              return;
            }
          }
        } catch (dupErr) {
          console.error("Duplicate search failed:", dupErr);
        }
      }

      const result = await analyzeJobPosting(apiKey, modelName, {
        text: scanInput.text,
        imageBase64: scanInput.image
      });

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
    } catch (err) {
      setError(err.message);
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
      const score = calculateRiskScore(activeFlags);
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
        extractedData: formData,
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
        userId: user?.id || null
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

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mb-4" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Analyzing Posting...</h2>
        <p className="text-slate-500 mt-2">Checking for exploitative patterns</p>
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

  const score = calculateRiskScore(activeFlags);
  const riskInfo = getRiskLevel(score);

  return (
    <div className="flex flex-col flex-1 max-w-lg w-full mx-auto my-4 gap-4 pb-20">
      
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Review Analysis</h1>
      </div>

      {/* Raw Input Display */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
           <h3 className="font-bold text-slate-800 dark:text-slate-200">Raw Input</h3>
           <p className="text-xs text-slate-500 mt-1">The original text or image used for analysis.</p>
        </div>

        {isTranslated && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800/30 p-3 px-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-400">
              <BrainCircuit className="w-4 h-4 text-blue-500" />
              <span>Translated from {detectedLanguage} to English by AI</span>
            </div>
            
            {/* Input Switch Tabs */}
            <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs mt-1 self-start">
              <button
                type="button"
                onClick={() => setActiveTabInput('original')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${activeTabInput === 'original' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
              >
                Original Text ({detectedLanguage})
              </button>
              <button
                type="button"
                onClick={() => setActiveTabInput('translation')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${activeTabInput === 'translation' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
              >
                English Translation
              </button>
            </div>
          </div>
        )}

        <div className="p-4 flex flex-col gap-4">
          {scanInput?.image || scanInput?.originalImage ? (
            <div className="flex flex-col gap-4">
              <img src={scanInput.image || scanInput.originalImage} alt="Raw Input" className="w-full max-w-sm mx-auto rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 object-contain max-h-64" />
              
              {/* If we have OCR text, we can show it here based on translation active tab */}
              {ocrText && (!isTranslated || activeTabInput === 'original') && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    Extracted Text ({detectedLanguage})
                  </div>
                  <div className="p-3 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {ocrText}
                  </div>
                </div>
              )}

              {isTranslated && activeTabInput === 'translation' && translatedText && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    English Translation
                  </div>
                  <div className="p-3 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {translatedText}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              {(!isTranslated || activeTabInput === 'original') ? (
                <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-lg border border-slate-200 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                  {scanInput?.text || scanInput?.originalText || 'No input text provided.'}
                </div>
              ) : (
                <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-lg border border-slate-200 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                  {translatedText || 'No translation available.'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Risk Score Widget */}
      <div className={`rounded-2xl shadow-sm border overflow-hidden ${
        score >= 60 ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30' : 
        score >= 30 ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30' : 
        'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/30'
      } transition-colors`}>
        <div className="p-6 flex items-center justify-between">
          <div>
             <p className={`text-sm font-bold uppercase tracking-wider mb-1 ${
               score >= 60 ? 'text-red-600 dark:text-red-400' :
               score >= 30 ? 'text-amber-600 dark:text-amber-400' :
               'text-emerald-600 dark:text-emerald-400'
             }`}>{riskInfo.label}</p>
             <h2 className="text-4xl font-black text-slate-900 dark:text-white">{score}<span className="text-xl text-slate-500 font-medium">/100</span></h2>
          </div>
          <div>
             {score >= 60 ? <ShieldAlert className="w-16 h-16 text-red-500/80" /> :
              score >= 30 ? <AlertTriangle className="w-16 h-16 text-amber-500/80" /> :
              <CheckCircle className="w-16 h-16 text-emerald-500/80" />}
          </div>
        </div>
        
        {/* Breakdown */}
        {activeFlags.length > 0 ? (
          <div className={`p-4 border-t text-sm ${
               score >= 60 ? 'border-red-200 dark:border-red-800/30 bg-red-100/50 dark:bg-red-900/10' :
               score >= 30 ? 'border-amber-200 dark:border-amber-800/30 bg-amber-100/50 dark:bg-amber-900/10' :
               'border-emerald-200 dark:border-emerald-800/30 bg-emerald-100/50 dark:bg-emerald-900/10'
             }`}>
             <h4 className="font-semibold mb-3 text-slate-800 dark:text-slate-200">Score Breakdown</h4>
             <ul className="space-y-2">
               {activeFlags.map(flag => (
                 <li key={flag} className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                   <span>{flag}</span>
                   <span className="font-medium font-mono">+{RISK_FLAGS[flag]?.weight || 0}</span>
                 </li>
               ))}
               <li className={`flex justify-between font-bold pt-2 mt-2 border-t ${
                 score >= 60 ? 'border-red-200 dark:border-red-800/30' :
                 score >= 30 ? 'border-amber-200 dark:border-amber-800/30' :
                 'border-emerald-200 dark:border-emerald-800/30'
               } text-slate-900 dark:text-white`}>
                 <span>Total (Capped at 100)</span>
                 <span className="font-mono">{score}</span>
               </li>
             </ul>
          </div>
        ) : (
          <div className={`p-4 border-t text-sm ${
            score >= 60 ? 'border-red-200 dark:border-red-800/30 bg-red-100/50 dark:bg-red-900/10' :
            score >= 30 ? 'border-amber-200 dark:border-amber-800/30 bg-amber-100/50 dark:bg-amber-900/10' :
            'border-emerald-200 dark:border-emerald-800/30 bg-emerald-100/50 dark:bg-emerald-900/10'
          } text-slate-600 dark:text-slate-400 text-center`}>
            No risk triggers detected.
          </div>
        )}
      </div>

      {/* AI Review Widget */}
      {aiReview && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-indigo-50/50 dark:bg-indigo-900/10 flex items-center gap-2">
             <BrainCircuit className="w-5 h-5 text-indigo-500" />
             <h3 className="font-bold text-slate-800 dark:text-slate-200">AI Scam Analysis</h3>
          </div>
          <div className="p-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
             {aiReview}
          </div>
        </div>
      )}

      {/* Extracted Data Form */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
           <h3 className="font-bold text-slate-800 dark:text-slate-200">Extracted Details</h3>
           <p className="text-xs text-slate-500 mt-1">Tap fields to correct any inaccuracies.</p>
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
                     if (!deepLink) return null;
                     return (
                       <a 
                         href={deepLink.url}
                         className={`text-xs flex items-center gap-1 font-semibold px-2 py-0.5 rounded transition-colors ${
                           deepLink.platform === 'Telegram' 
                             ? 'bg-sky-50 text-sky-600 hover:bg-sky-100 dark:bg-sky-950/30 dark:text-sky-400 dark:hover:bg-sky-900/40' 
                             : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-900/40'
                         }`}
                       >
                         {deepLink.platform === 'Telegram' ? '✈️' : '💬'} Open {deepLink.platform} ({deepLink.label})
                       </a>
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
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden mb-6">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
           <h3 className="font-bold text-slate-800 dark:text-slate-200">Risk Indicators</h3>
           <p className="text-xs text-slate-500 mt-1">Check triggers you've discovered to recalculate the score.</p>
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
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden mb-6">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
             <h3 className="font-bold text-slate-800 dark:text-slate-200">Image OCR Output</h3>
             <p className="text-xs text-slate-500 mt-1">Full text extracted from the image by the AI.</p>
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
