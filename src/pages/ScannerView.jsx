import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Image as ImageIcon, FileText, Upload, X, FileSpreadsheet, Play, CheckCircle2, AlertCircle, Loader2, Download, Copy, ArrowRight, ChevronDown, ChevronUp, Globe, Link, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase, mapRecordToDb } from '../utils/supabaseClient';
import { analyzeJobPosting } from '../services/geminiService';
import { calculateRiskScore, getRiskLevel } from '../utils/scoring';
import { useAuth } from '../context/AuthContext';

export default function ScannerView() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState('camera'); // 'camera', 'upload', 'text', 'batch'
  const [capturedImage, setCapturedImage] = useState(null);
  const [pastedText, setPastedText] = useState('');
  
  // Drag & drop state
  const [isDragging, setIsDragging] = useState(false);
  const [imageMeta, setImageMeta] = useState(null);
  const [csvMapping, setCsvMapping] = useState(null);
  
  // Metadata state
  const [sourcePlatform, setSourcePlatform] = useState('unspecified');
  const [sourceUrl, setSourceUrl] = useState('');
  const [ingestionMethod, setIngestionMethod] = useState('Analyst Upload');
  const [postDate, setPostDate] = useState('');
  const [isMetadataExpanded, setIsMetadataExpanded] = useState(false);
  
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

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeTab === 'upload' || activeTab === 'batch') {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (activeTab === 'upload') {
        if (file.type.startsWith('image/')) {
          handleFileUpload(file);
        } else {
          alert('Please drop an image file (PNG, JPG, WEBP).');
        }
      } else if (activeTab === 'batch') {
        if (file.name.endsWith('.csv') || file.type === 'text/csv') {
          handleCSVUpload(file);
        } else {
          alert('Please drop a CSV file.');
        }
      }
    }
  };

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
    const file = e.target && e.target.files ? e.target.files[0] : e;
    if (file) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      setImageMeta({
        name: file.name,
        size: `${sizeMb} MB`,
        type: file.type || 'image/jpeg'
      });
      const reader = new FileReader();
      reader.onloadend = () => {
        setCapturedImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCSVUpload = (e) => {
    const file = e.target && e.target.files ? e.target.files[0] : e;
    if (file) {
      setBatchFile(file);
      const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      setBatchName(fileNameWithoutExt || `Imported Batch ${new Date().toLocaleDateString()}`);
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        const result = parseCSV(text);
        setBatchRows(result.rows);
        setCsvMapping(result.mapping);
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
    setImageMeta(null);
    setCsvMapping(null);
    setSourcePlatform('unspecified');
    setSourceUrl('');
    setIngestionMethod('Analyst Upload');
    setPostDate('');
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
          normalizedText: result.normalized_text || '',
          sourcePlatform: sourcePlatform || 'unspecified',
          sourceUrl: row.source_url || 'unspecified',
          ingestionMethod: ingestionMethod || 'Analyst Upload',
          postDate: row.post_date || 'unspecified'
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
         isExistingScan: false,
         sourcePlatform: sourcePlatform || 'unspecified',
         sourceUrl: sourceUrl || 'unspecified',
         ingestionMethod: ingestionMethod || 'Analyst Upload',
         postDate: postDate || 'unspecified'
       } 
     });
  };

  return (
    <div className="flex flex-col flex-1 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden my-4">
      
      {/* Tabs - Pill style container */}
      <div className="p-1.5 bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex gap-1.5 overflow-x-auto">
        <button 
          onClick={() => handleTabChange('camera')}
          className={`flex-1 py-2 px-3 text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-2 rounded-lg transition-all whitespace-nowrap ${activeTab === 'camera' ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-500 shadow-sm border border-slate-200/60 dark:border-slate-850' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350'}`}
        >
          <Camera className="w-3.5 h-3.5 flex-shrink-0" /> Camera
        </button>
        <button 
          onClick={() => handleTabChange('upload')}
          className={`flex-1 py-2 px-3 text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-2 rounded-lg transition-all whitespace-nowrap ${activeTab === 'upload' ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-500 shadow-sm border border-slate-200/60 dark:border-slate-850' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350'}`}
        >
          <ImageIcon className="w-3.5 h-3.5 flex-shrink-0" /> Upload Image
        </button>
        <button 
          onClick={() => handleTabChange('text')}
          className={`flex-1 py-2 px-3 text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-2 rounded-lg transition-all whitespace-nowrap ${activeTab === 'text' ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-500 shadow-sm border border-slate-200/60 dark:border-slate-850' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350'}`}
        >
          <FileText className="w-3.5 h-3.5 flex-shrink-0" /> Paste Text
        </button>
        <button 
          onClick={() => handleTabChange('batch')}
          className={`flex-1 py-2 px-3 text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-2 rounded-lg transition-all whitespace-nowrap ${activeTab === 'batch' ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-500 shadow-sm border border-slate-200/60 dark:border-slate-850' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350'}`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5 flex-shrink-0" /> Batch CSV
        </button>
      </div>

      {/* Content Area with Drag & Drop Listener */}
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex-1 p-4 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950/30 min-h-[400px] transition-all relative ${isDragging ? 'bg-emerald-50/20 dark:bg-emerald-950/10' : ''}`}
      >
        
        {/* Drag & Drop Overlay */}
        {isDragging && (
          <div className="absolute inset-4 border-2 border-dashed border-emerald-500 dark:border-emerald-400 bg-white/95 dark:bg-slate-950/95 rounded-xl flex flex-col items-center justify-center z-15 animate-fade-in shadow-[0_0_15px_rgba(16,185,129,0.15)]">
            <Upload className="w-12 h-12 text-emerald-500 animate-bounce mb-3" />
            <p className="text-emerald-600 dark:text-emerald-400 font-mono text-sm font-bold uppercase tracking-wider">Drop File to Ingest</p>
            <p className="text-slate-400 text-xs mt-1">Accepts {activeTab === 'upload' ? 'Images (PNG, JPG, WEBP)' : 'CSV Spreadsheet'}</p>
          </div>
        )}

        {capturedImage ? (
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-md space-y-4">
            <div className="relative aspect-video w-full rounded-lg overflow-hidden border border-slate-100 dark:border-slate-800/80">
              <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
            </div>
            
            <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800/60 pt-3">
              <div className="min-w-0 flex-1 pr-4">
                <p className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 truncate">
                  {imageMeta?.name || 'Captured_Scan_Frame.jpg'}
                </p>
                <p className="text-[10px] text-slate-400 font-mono">
                  {imageMeta?.size || 'Direct capture'} • {imageMeta?.type || 'image/jpeg'}
                </p>
              </div>
              <button 
                onClick={resetCapture}
                className="px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg transition-colors border border-rose-200 dark:border-rose-900/40"
              >
                Clear
              </button>
            </div>
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
          <div className="w-full max-w-md h-64 border-2 border-dashed border-slate-350 dark:border-slate-750 rounded-xl flex flex-col items-center justify-center bg-white dark:bg-slate-900 shadow-sm transition-colors hover:border-emerald-400 dark:hover:border-emerald-500">
             <Upload className="w-10 h-10 text-slate-400 mb-3" />
             <p className="text-slate-600 dark:text-slate-400 text-sm mb-1 font-medium">Upload or Drop Flyer Image</p>
             <p className="text-slate-400 text-[10px] font-mono mb-4">PNG, JPG, or WEBP formats</p>
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
              <div className="h-64 border-2 border-dashed border-slate-350 dark:border-slate-750 rounded-xl flex flex-col items-center justify-center bg-white dark:bg-slate-900 shadow-sm transition-colors hover:border-emerald-400 dark:hover:border-emerald-500 p-6">
                <FileSpreadsheet className="w-10 h-10 text-slate-400 mb-3" />
                <p className="text-slate-600 dark:text-slate-400 text-sm mb-1 text-center font-medium">Upload or Drop CSV File</p>
                <p className="text-slate-400 text-[10px] font-mono mb-4 text-center">Contains row-by-row job listings to analyze</p>
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

                {/* CSV Header Mapping Console */}
                {csvMapping && (
                  <div className="border border-slate-200 dark:border-slate-850 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-950 p-3 font-mono text-[10px]">
                    <div className="text-[10px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider mb-2 pb-1.5 border-b border-slate-200 dark:border-slate-800">
                      Terminal Column Mapping Console
                    </div>
                    <div className="grid grid-cols-2 gap-y-1.5 text-slate-700 dark:text-slate-350">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 animate-pulse"></span>
                        <span className="font-bold text-slate-400 dark:text-slate-500">DESC/TEXT:</span>
                      </div>
                      <div className="text-emerald-600 dark:text-emerald-400 truncate">➔ '{csvMapping.text}'</div>

                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${csvMapping.jobTitle ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                        <span className="font-bold text-slate-400 dark:text-slate-500">JOB_TITLE:</span>
                      </div>
                      <div className="truncate text-slate-600 dark:text-slate-450">
                        {csvMapping.jobTitle ? `➔ '${csvMapping.jobTitle}'` : '✕ [Auto-detected by AI]'}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${csvMapping.sourceUrl ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                        <span className="font-bold text-slate-400 dark:text-slate-500">SOURCE_URL:</span>
                      </div>
                      <div className="truncate text-slate-600 dark:text-slate-450 font-semibold">
                        {csvMapping.sourceUrl ? `➔ '${csvMapping.sourceUrl}'` : '✕ [Row Default: Unspecified]'}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${csvMapping.postDate ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                        <span className="font-bold text-slate-400 dark:text-slate-500">POST_DATE:</span>
                      </div>
                      <div className="truncate text-slate-600 dark:text-slate-450 font-semibold">
                        {csvMapping.postDate ? `➔ '${csvMapping.postDate}'` : '✕ [Row Default: Unspecified]'}
                      </div>
                    </div>
                  </div>
                )}

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

      {/* Source & Ingestion Metadata Accordion with Summary Badges */}
      <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/10 w-full">
        <button
          type="button"
          onClick={() => setIsMetadataExpanded(prev => !prev)}
          className="w-full px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between text-left hover:bg-slate-100 dark:hover:bg-slate-800/40 transition-colors border-b border-slate-150 dark:border-slate-800/60 gap-2"
        >
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-350">
            <Globe className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <span className="text-xs font-mono font-bold uppercase tracking-wider">Source & Ingestion Details</span>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wide border ${
              sourcePlatform !== 'unspecified' 
                ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40'
                : 'bg-slate-100 dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500'
            }`}>
              Platform: {sourcePlatform}
            </span>

            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wide bg-slate-100 dark:bg-slate-900 text-slate-550 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
              Method: {ingestionMethod}
            </span>

            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wide border ${
              activeTab === 'batch'
                ? 'bg-sky-50 dark:bg-sky-950/20 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-900/40'
                : sourceUrl.trim()
                ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40'
                : 'bg-slate-100 dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-800 text-slate-450 dark:text-slate-500'
            }`}>
              URL: {activeTab === 'batch' ? 'PARSED' : sourceUrl.trim() ? 'SPECIFIED' : 'UNSPECIFIED'}
            </span>

            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wide border ${
              activeTab === 'batch'
                ? 'bg-sky-50 dark:bg-sky-950/20 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-900/40'
                : postDate.trim()
                ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40'
                : 'bg-slate-100 dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-800 text-slate-450 dark:text-slate-500'
            }`}>
              Date: {activeTab === 'batch' ? 'PARSED' : postDate.trim() ? 'SPECIFIED' : 'UNSPECIFIED'}
            </span>

            {isMetadataExpanded ? (
              <ChevronUp className="w-4 h-4 text-slate-400 ml-1" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400 ml-1" />
            )}
          </div>
        </button>

        {isMetadataExpanded && (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 border-b border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-950/20">
            {/* Source Platform Dropdown */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-mono font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Source Platform
              </label>
              <select
                value={sourcePlatform}
                onChange={(e) => setSourcePlatform(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md text-xs text-slate-800 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
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

            {/* Ingestion Method Dropdown */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-mono font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Ingestion Method
              </label>
              <select
                value={ingestionMethod}
                onChange={(e) => setIngestionMethod(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md text-xs text-slate-800 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
              >
                <option value="Analyst Upload">Analyst Upload</option>
                <option value="Web Scraper">Web Scraper</option>
                <option value="API Feed">API Feed</option>
                <option value="Community Tip Line">Community Tip Line</option>
              </select>
            </div>

            {/* Source URL & Post Date Inputs */}
            {activeTab === 'batch' ? (
              <div className="sm:col-span-2 bg-blue-50/30 dark:bg-blue-950/10 border border-blue-200/50 dark:border-blue-900/30 p-3 rounded-lg flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-sky-500 flex-shrink-0 mt-0.5 animate-pulse" />
                <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  <span className="font-bold text-sky-600 dark:text-sky-450 uppercase">Batch CSV Auto-Ingest:</span> Source URL and Original Post Date are parsed dynamically from each listing's corresponding CSV columns (if matching column names are found). Global options are disabled.
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-mono font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Link className="w-3 h-3 text-slate-400 flex-shrink-0" /> Source URL Link
                  </label>
                  <input
                    type="text"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder="e.g. t.me/... or facebook.com/groups/..."
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md text-xs text-slate-800 dark:text-slate-350 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-mono font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400 flex-shrink-0" /> Post Date
                  </label>
                  <input
                    type="text"
                    value={postDate}
                    onChange={(e) => setPostDate(e.target.value)}
                    placeholder="e.g. YYYY-MM-DD or Unspecified"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md text-xs text-slate-800 dark:text-slate-350 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
         {/* Action Button */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col items-center gap-2">
        {activeTab === 'batch' ? (
          <>
            <button 
              onClick={startBatchProcess}
              disabled={batchRows.length === 0 || isProcessingBatch}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 text-white font-bold py-3.5 rounded-xl shadow-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4 fill-current animate-pulse" /> Start Batch Scan ({batchRows.length} Items)
            </button>
            {batchRows.length === 0 && (
              <p className="text-[10px] font-mono text-slate-400 text-center uppercase tracking-wider">
                Please upload or drop a CSV file to initialize batch scan
              </p>
            )}
          </>
        ) : (
          <>
            <button 
              onClick={handleScan}
              disabled={!capturedImage && !pastedText.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 text-white font-bold py-3.5 rounded-xl shadow-sm transition-all active:scale-[0.98]"
            >
              Scan for Risks
            </button>
            {!capturedImage && !pastedText.trim() && (
              <p className="text-[10px] font-mono text-slate-400 text-center uppercase tracking-wider">
                Please {activeTab === 'camera' ? 'capture a photo' : activeTab === 'upload' ? 'upload / drop a flyer image' : 'paste description text'} to enable scanning
              </p>
            )}
          </>
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
  
  if (lines.length < 2) return { rows: [], mapping: null };

  // Parse headers
  const headers = lines[0].map(h => h.trim().toLowerCase());
  const originalHeaders = lines[0].map(h => h.trim());
  
  // Find column indexes
  const titleIdx = headers.findIndex(h => (h.includes('title') || h.includes('role') || h === 'job') && !h.includes('desc') && !h.includes('text') && !h.includes('body') && !h.includes('post'));
  const descIdx = headers.findIndex(h => h.includes('desc') || h.includes('text') || h.includes('body') || h.includes('post'));
  const locIdx = headers.findIndex(h => h.includes('loc') || h.includes('city') || h.includes('country') || h.includes('addr'));
  const empIdx = headers.findIndex(h => h.includes('employer') || h.includes('company') || h.includes('org') || h.includes('firm'));
  const salIdx = headers.findIndex(h => h.includes('sal') || h.includes('wage') || h.includes('pay') || h.includes('rate'));
  const indIdx = headers.findIndex(h => h.includes('ind') || h.includes('sector'));
  const conIdx = headers.findIndex(h => h.includes('con') || h.includes('email') || h.includes('phone') || h.includes('link') || h.includes('method'));
  const urlIdx = headers.findIndex(h => h === 'url' || h.includes('source_url') || h.includes('link'));
  const dateIdx = headers.findIndex(h => h.includes('date') || h.includes('time') || h === 'post_date');

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
    const sourceUrlVal = urlIdx !== -1 ? (values[urlIdx] || '') : '';
    const postDateVal = dateIdx !== -1 ? (values[dateIdx] || '') : '';

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
      contact_method: contact,
      source_url: sourceUrlVal,
      post_date: postDateVal
    });
  }

  return {
    rows: parsedRows,
    mapping: {
      text: descIdx !== -1 ? originalHeaders[descIdx] : (originalHeaders[0] || 'Column 1 (Fallback)'),
      jobTitle: titleIdx !== -1 ? originalHeaders[titleIdx] : null,
      location: locIdx !== -1 ? originalHeaders[locIdx] : null,
      employer: empIdx !== -1 ? originalHeaders[empIdx] : null,
      salary: salIdx !== -1 ? originalHeaders[salIdx] : null,
      industry: indIdx !== -1 ? originalHeaders[indIdx] : null,
      contact: conIdx !== -1 ? originalHeaders[conIdx] : null,
      sourceUrl: urlIdx !== -1 ? originalHeaders[urlIdx] : null,
      postDate: dateIdx !== -1 ? originalHeaders[dateIdx] : null,
    }
  };
}
