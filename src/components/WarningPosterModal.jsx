import React, { useState } from 'react';
import { FileText, X, ShieldAlert, BrainCircuit, Loader2 } from 'lucide-react';
import { getActiveApiKey } from '../utils/apiKey';
import { generatePosterContent } from '../services/geminiService';
import { buildPosterPrintHtml } from '../utils/posterGenerator';
import { calculateRiskScore } from '../utils/scoring';

export default function WarningPosterModal({
  isOpen,
  onClose,
  formData,
  activeFlags,
  parsedSalaryUsd,
  locationCountry,
  detectedLanguage,
  suspiciousSpans,
  predictedPlaybook,
  sourcePlatform,
  ingestionMethod,
  ocrText,
  translatedText,
  scanInput
}) {
  const [posterMode, setPosterMode] = useState('community');
  const [posterLanguage, setPosterLanguage] = useState('English');
  const [customLanguage, setCustomLanguage] = useState('');
  const [generatedPosterData, setGeneratedPosterData] = useState(null);
  const [isGeneratingPoster, setIsGeneratingPoster] = useState(false);
  const [posterError, setPosterError] = useState('');

  if (!isOpen) return null;

  const handleGeneratePoster = async () => {
    try {
      setIsGeneratingPoster(true);
      setPosterError('');
      setGeneratedPosterData(null);
      
      // Client key optional — generatePosterContent routes through the
      // gemini-proxy edge function (server-held GEMINI_API_KEY) when absent.
      const apiKey = getActiveApiKey();
      const modelName = localStorage.getItem('gemini_model'); // fallback handled in geminiService

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
      sourcePlatform,
      ingestionMethod,
      scanInput
    });

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleClose = () => {
    onClose();
    setGeneratedPosterData(null);
    setPosterError('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-[#111318] w-full max-w-5xl h-[85vh] rounded border border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-scale-in">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#0c0f16]">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-550" />
            <div>
              <h3 className="font-mono text-xs uppercase tracking-widest text-slate-200">Generate Investigation Poster</h3>
              <p className="text-xs text-slate-500 mt-0.5 font-mono">Translate and format warning bulletins or intel reports for distribution.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
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
                          <span className={`w-1.5 h-1.5 rounded-sm ${posterMode === 'community' ? 'bg-red-555' : 'bg-slate-450'}`}></span>
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
                    <p className="text-xs leading-relaxed text-slate-455 font-sans">{generatedPosterData.playbookWarning}</p>
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
            onClick={handleClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 font-mono text-xs font-bold uppercase rounded transition-colors border border-slate-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
