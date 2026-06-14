import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Image as ImageIcon, FileText, Upload, X, FileSpreadsheet, Play, CheckCircle2, AlertCircle, Loader2, Download, Copy, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase, mapRecordToDb } from '../utils/supabaseClient';
import { analyzeJobPosting } from '../services/geminiService';
import { calculateRiskScore, getRiskLevel } from '../utils/scoring';
import { useAuth } from '../context/AuthContext';
import { normalizeText } from '../utils/normalization';

export default function ScannerView() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState('camera'); // 'camera', 'upload', 'text', 'batch'
  const [capturedImage, setCapturedImage] = useState(null);
  const [pastedText, setPastedText] = useState('');
  
  // Batch processing state
  const [batchFile, setBatchFile] = useState(null);
  const [batchRows, setBatchRows] = useState([]);
  const [batchName, setBatchName] = useState('');
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [currentProcessingName, setCurrentProcessingName] = useState('');
  const [batchSuccessCount, setBatchSuccessCount] = useState(0);
  const [batchErrorCount, setBatchErrorCount] = useState(0);
  const [shouldAbortBatch, setShouldAbortBatch] = useState(false);
  const [batchLogs, setBatchLogs] = useState([]);
  const [isBatchDone, setIsBatchDone] = useState(false);
  
  const abortRef = useRef(false);
  const logsContainerRef = useRef(null);

  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [batchLogs]);

  const addLog = (type, message) => {
    const time = new Date().toLocaleTimeString();
    setBatchLogs(prev => [...prev, { time, type, message }]);
  };
  
  // Camera specific
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      // Fallback to upload if camera fails
      setActiveTab('upload');
    }
  };

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }, [stream]);

  // Clean up camera on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // Handle tab change
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'camera' && !capturedImage) {
      startCamera();
    } else {
      stopCamera();
    }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg');
      setCapturedImage(dataUrl);
      stopCamera();
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCapturedImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCSVUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setBatchFile(file);
      const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      setBatchName(fileNameWithoutExt || `Imported Batch ${new Date().toLocaleDateString()}`);
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        const rows = parseCSV(text);
        setBatchRows(rows);
      };
      reader.readAsText(file);
    }
  };

  const resetCapture = () => {
    setCapturedImage(null);
    setPastedText('');
    setBatchFile(null);
    setBatchRows([]);
    setBatchName('');
    if (activeTab === 'camera') {
      startCamera();
    }
  };

  const handleCancelBatch = () => {
    abortRef.current = true;
    setShouldAbortBatch(true);
  };

  const startBatchProcess = async () => {
    if (batchRows.length === 0) return;
    
    const apiKey = profile?.gemini_api_key || localStorage.getItem('gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY;
    const modelName = profile?.gemini_model || localStorage.getItem('gemini_model');
    if (!apiKey) {
      alert('Please configure your Gemini API Key in Settings first.');
      return;
    }

    setIsProcessingBatch(true);
    setIsBatchDone(false);
    setBatchProgress(0);
    setBatchSuccessCount(0);
    setBatchErrorCount(0);
    setBatchLogs([]);
    const batchId = `batch_${Date.now()}`;
    let successCount = 0;
    let errorCount = 0;
    abortRef.current = false;
    setShouldAbortBatch(false);

    addLog('info', `Starting batch scan for ${batchRows.length} items using ${modelName || 'gemini-2.5-flash'}...`);

    for (let i = 0; i < batchRows.length; i++) {
      if (abortRef.current) {
        addLog('error', `Batch processing aborted by user.`);
        break;
      }

      const row = batchRows[i];
      const jobTitle = row.job_title || `Job Posting #${i + 1}`;
      const displayTitle = jobTitle.length > 60 ? jobTitle.substring(0, 60) + '...' : jobTitle;
      setCurrentProcessingName(displayTitle);
      
      // Check for duplicate in database to avoid wasting API calls
      let isDuplicate = false;
      try {
        const { data: dupData } = await supabase
          .from('scans')
          .select('id')
          .eq('original_text', row.text)
          .eq('user_id', user.id)
          .limit(1);
        if (dupData && dupData.length > 0) {
          isDuplicate = true;
        }
      } catch (dupErr) {
        console.error("Duplicate check error:", dupErr);
      }

      if (isDuplicate) {
        addLog('success', `➜ "${displayTitle}" skipped (already analyzed in history).`);
        successCount++;
        setBatchSuccessCount(successCount);
        setBatchProgress(Math.round(((i + 1) / batchRows.length) * 100));
        continue;
      }

      addLog('info', `[${i + 1}/${batchRows.length}] Requesting Gemini analysis for: "${displayTitle}"`);

      try {
        const result = await analyzeJobPosting(apiKey, modelName, {
          text: row.text
        });

        const activeFlags = result.detected_red_flags || [];
        const score = calculateRiskScore(activeFlags);
        const level = getRiskLevel(score);

        const textToNormalize = result.translated_text || row.text || '';
        const record = {
          timestamp: Date.now(),
          jobTitle: result.job_title || row.job_title || 'Unknown Title',
          employer: result.employer_identity || row.employer_identity || 'Unknown Employer',
          riskScore: score,
          riskLevel: level.label,
          extractedData: {
            job_title: result.job_title || row.job_title || '',
            employer_identity: result.employer_identity || row.employer_identity || '',
            salary_range: result.salary_range || row.salary_range || '',
            location: result.location || row.location || '',
            industry: result.industry || row.industry || '',
            contact_method: result.contact_method || row.contact_method || ''
          },
          activeFlags: activeFlags,
          originalImage: null,
          originalText: row.text,
          ocrText: result.raw_ocr_text || null,
          aiReview: result.ai_review || '',
          parsedSalaryUsd: result.parsed_salary_usd || null,
          locationCountry: result.location_country || null,
          detectedLanguage: result.detected_language || 'English',
          isTranslated: result.is_translated || false,
          translatedText: result.translated_text || null,
          batchId: batchId,
          batchName: batchName,
          userId: user?.id || null,
          normalizedText: normalizeText(textToNormalize)
        };

        const { error: dbErr } = await supabase.from('scans').insert(mapRecordToDb(record));
        if (dbErr) throw dbErr;
        successCount++;
        setBatchSuccessCount(successCount);
        addLog('success', `✔ "${displayTitle}" processed. Score: ${score} (${level.label}). Flags: ${activeFlags.length > 0 ? activeFlags.join(', ') : 'None'}`);
      } catch (err) {
        console.error(`Error processing batch row ${i}:`, err);
        errorCount++;
        setBatchErrorCount(errorCount);
        addLog('error', `✘ Error processing "${displayTitle}": ${err.message || err.toString()}`);
      }

      setBatchProgress(Math.round(((i + 1) / batchRows.length) * 100));

      if (i < batchRows.length - 1 && !abortRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    addLog('info', `Batch execution ended. Final Stats -> Success: ${successCount}, Errors: ${errorCount}`);
    setIsBatchDone(true);
  };

  const handleScan = () => {
     navigate('/review', { 
       state: { 
         image: capturedImage, 
         text: pastedText,
         isExistingScan: false
       } 
     });
  };

  return (
    <div className="flex flex-col flex-1 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden my-4">
      
      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        <button 
          onClick={() => handleTabChange('camera')}
          className={`flex-1 py-3 px-2 text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'camera' ? 'text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
        >
          <Camera className="w-4 h-4 flex-shrink-0" /> Camera
        </button>
        <button 
          onClick={() => handleTabChange('upload')}
          className={`flex-1 py-3 px-2 text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'upload' ? 'text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
        >
          <ImageIcon className="w-4 h-4 flex-shrink-0" /> Upload
        </button>
        <button 
          onClick={() => handleTabChange('text')}
          className={`flex-1 py-3 px-2 text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'text' ? 'text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
        >
          <FileText className="w-4 h-4 flex-shrink-0" /> Text
        </button>
        <button 
          onClick={() => handleTabChange('batch')}
          className={`flex-1 py-3 px-2 text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'batch' ? 'text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
        >
          <FileSpreadsheet className="w-4 h-4 flex-shrink-0" /> Batch
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 p-4 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950/50 min-h-[400px]">
        
        {capturedImage ? (
          <div className="relative w-full max-w-md">
            <img src={capturedImage} alt="Captured" className="w-full rounded-lg shadow-md border border-slate-200 dark:border-slate-700" />
            <button 
              onClick={resetCapture}
              className="absolute top-3 right-3 p-2 bg-slate-900/70 text-white rounded-full hover:bg-slate-900/90 backdrop-blur-sm transition-colors shadow-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : activeTab === 'camera' ? (
          <div className="w-full max-w-md aspect-[3/4] bg-slate-900 rounded-lg overflow-hidden relative shadow-inner flex items-center justify-center">
             {stream ? (
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
             ) : (
                <div className="text-slate-400 text-sm">Requesting camera access...</div>
             )}
             
             {stream && (
               <div className="absolute bottom-8 left-0 right-0 flex justify-center">
                 <button 
                   onClick={capturePhoto}
                   className="w-16 h-16 bg-white rounded-full border-4 border-slate-300 shadow-xl active:scale-95 transition-transform"
                   aria-label="Take photo"
                 />
               </div>
             )}
          </div>
        ) : activeTab === 'upload' ? (
          <div className="w-full max-w-md h-64 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl flex flex-col items-center justify-center bg-white dark:bg-slate-900 shadow-sm transition-colors hover:border-emerald-400 dark:hover:border-emerald-500">
             <Upload className="w-10 h-10 text-slate-400 mb-3" />
             <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">Select an image of the job flyer</p>
             <label className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg font-medium cursor-pointer transition-colors shadow-sm">
               Choose File
               <input type="file" accept="image/png, image/jpeg, image/webp" className="hidden" onChange={handleFileUpload} />
             </label>
          </div>
        ) : activeTab === 'text' ? (
          <div className="w-full max-w-md flex flex-col h-full min-h-[300px]">
            <textarea 
              className="w-full flex-1 p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white resize-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none shadow-sm text-sm"
              placeholder="Paste the job description text here..."
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
            />
          </div>
        ) : (
          <div className="w-full max-w-md flex flex-col gap-4">
            {!batchFile ? (
              <div className="h-64 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl flex flex-col items-center justify-center bg-white dark:bg-slate-900 shadow-sm transition-colors hover:border-emerald-400 dark:hover:border-emerald-500 p-6">
                <FileSpreadsheet className="w-10 h-10 text-slate-400 mb-3" />
                <p className="text-slate-600 dark:text-slate-400 text-sm mb-1 text-center font-medium">Upload a CSV file containing job listings</p>
                <p className="text-slate-400 text-xs mb-4 text-center">It will scan each row sequentially</p>
                <label className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg font-medium cursor-pointer transition-colors shadow-sm">
                  Choose CSV File
                  <input type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
                </label>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 rounded-lg">
                      <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm truncate max-w-[200px]">{batchFile.name}</h4>
                      <p className="text-xs text-slate-400">{batchRows.length} rows detected</p>
                    </div>
                  </div>
                  <button 
                    onClick={resetCapture}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">
                    Batch Name
                  </label>
                  <input
                    type="text"
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value)}
                    placeholder="E.g., Jobs from LinkedIn"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Button */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        {activeTab === 'batch' ? (
          <button 
            onClick={startBatchProcess}
            disabled={batchRows.length === 0 || isProcessingBatch}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 text-white font-bold py-3.5 rounded-xl shadow-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4 fill-current animate-pulse" /> Start Batch Scan ({batchRows.length} Items)
          </button>
        ) : (
          <button 
            onClick={handleScan}
            disabled={!capturedImage && !pastedText.trim()}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 text-white font-bold py-3.5 rounded-xl shadow-sm transition-all active:scale-[0.98]"
          >
            Scan for Risks
          </button>
        )}
      </div>

      {/* Batch Processing Overlay */}
      {isProcessingBatch && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-xl shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {isBatchDone ? 'Batch Processing Complete' : 'Processing Batch'}
              </h3>
              <p className="text-sm text-slate-500">
                {isBatchDone ? 'Scan process has completed' : 'Respecting API rate limits (2s delay per item)'}
              </p>
            </div>

            <div className="space-y-4">
              {/* Progress stats */}
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
                <span>Success: <span className="text-emerald-600">{batchSuccessCount}</span></span>
                <span>Errors: <span className="text-red-500">{batchErrorCount}</span></span>
                <span>{batchProgress}%</span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div 
                  className="bg-emerald-600 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${batchProgress}%` }}
                />
              </div>

              {/* Current processing row / Status Indicator */}
              {!isBatchDone && (
                <div className="bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 p-3.5 rounded-xl flex items-center gap-3">
                  <Loader2 className="w-5 h-5 text-emerald-600 animate-spin flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-400 font-medium">Currently Analyzing:</p>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300 truncate">{currentProcessingName}</p>
                  </div>
                </div>
              )}

              {/* Logs / Console output */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Console Dump / Error Log</span>
                  {batchLogs.length > 0 && (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          const logText = batchLogs.map(log => `[${log.time}] [${log.type.toUpperCase()}] ${log.message}`).join('\n');
                          navigator.clipboard.writeText(logText);
                          alert('Logs copied to clipboard!');
                        }}
                        className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
                      >
                        <Copy className="w-3.5 h-3.5" /> Copy Dump
                      </button>
                      <button 
                        onClick={() => {
                          const logText = batchLogs.map(log => `[${log.time}] [${log.type.toUpperCase()}] ${log.message}`).join('\n');
                          const blob = new Blob([logText], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `batch_scan_log_${Date.now()}.txt`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        }}
                        className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
                      >
                        <Download className="w-3.5 h-3.5" /> Download
                      </button>
                    </div>
                  )}
                </div>
                <div 
                  ref={logsContainerRef}
                  className="w-full h-48 bg-slate-900 dark:bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs overflow-y-auto space-y-1 shadow-inner text-slate-300"
                >
                  {batchLogs.length === 0 ? (
                    <div className="text-slate-500 italic">No logs yet. Initializing...</div>
                  ) : (
                    batchLogs.map((log, index) => {
                      let colorClass = 'text-sky-400';
                      if (log.type === 'success') colorClass = 'text-emerald-400';
                      if (log.type === 'error') colorClass = 'text-rose-400';
                      return (
                        <div key={index} className="leading-relaxed whitespace-pre-wrap">
                          <span className="text-slate-500">[{log.time}]</span>{' '}
                          <span className={colorClass}>[{log.type.toUpperCase()}]</span>{' '}
                          <span>{log.message}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              {!isBatchDone ? (
                <button
                  onClick={handleCancelBatch}
                  disabled={shouldAbortBatch}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl text-sm transition-colors active:scale-[0.98]"
                >
                  {shouldAbortBatch ? 'Aborting...' : 'Cancel Batch'}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setIsProcessingBatch(false);
                      setIsBatchDone(false);
                    }}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl text-sm transition-colors active:scale-[0.98]"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      setIsProcessingBatch(false);
                      setIsBatchDone(false);
                      navigate('/history');
                    }}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm transition-colors active:scale-[0.98] flex items-center justify-center gap-1.5"
                  >
                    Go to History <ArrowRight className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// Simple, self-contained CSV Parser
function parseCSV(text) {
  const lines = [];
  let row = [""];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === ',' || char === ';') && !inQuotes) { // support comma and semicolon
      row.push('');
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      lines.push(row);
      row = [''];
    } else {
      row[row.length - 1] += char;
    }
  }
  if (row.length > 1 || row[0] !== '') {
    lines.push(row);
  }
  
  if (lines.length < 2) return [];

  // Parse headers
  const headers = lines[0].map(h => h.trim().toLowerCase());
  
  // Find column indexes
  const titleIdx = headers.findIndex(h => (h.includes('title') || h.includes('role') || h === 'job') && !h.includes('desc') && !h.includes('text') && !h.includes('body') && !h.includes('post'));
  const descIdx = headers.findIndex(h => h.includes('desc') || h.includes('text') || h.includes('body') || h.includes('post'));
  const locIdx = headers.findIndex(h => h.includes('loc') || h.includes('city') || h.includes('country') || h.includes('addr'));
  const empIdx = headers.findIndex(h => h.includes('employer') || h.includes('company') || h.includes('org') || h.includes('firm'));
  const salIdx = headers.findIndex(h => h.includes('sal') || h.includes('wage') || h.includes('pay') || h.includes('rate'));
  const indIdx = headers.findIndex(h => h.includes('ind') || h.includes('sector'));
  const conIdx = headers.findIndex(h => h.includes('con') || h.includes('email') || h.includes('phone') || h.includes('link') || h.includes('method'));

  const parsedRows = [];
  for (let j = 1; j < lines.length; j++) {
    const values = lines[j];
    if (values.length === 0 || (values.length === 1 && values[0] === '')) continue;
    
    const textContent = descIdx !== -1 ? (values[descIdx] || '') : (values[0] || '');
    const jobTitle = titleIdx !== -1 ? (values[titleIdx] || '') : '';
    const locationVal = locIdx !== -1 ? (values[locIdx] || '') : '';
    const employer = empIdx !== -1 ? (values[empIdx] || '') : '';
    const salary = salIdx !== -1 ? (values[salIdx] || '') : '';
    const industry = indIdx !== -1 ? (values[indIdx] || '') : '';
    const contact = conIdx !== -1 ? (values[conIdx] || '') : '';

    let fullTextToScan = textContent;
    if (descIdx === -1 && jobTitle) {
      fullTextToScan = `Job Title: ${jobTitle}\n\n${textContent}`;
    }

    parsedRows.push({
      text: fullTextToScan,
      job_title: jobTitle,
      location: locationVal,
      employer_identity: employer,
      salary_range: salary,
      industry: industry,
      contact_method: contact
    });
  }

  return parsedRows;
}
