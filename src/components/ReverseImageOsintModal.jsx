import React, { useState, useEffect, useRef } from 'react';
import { X, Image as ImageIcon, ExternalLink, BrainCircuit, Loader2, Copy, UploadCloud, Fingerprint, Search } from 'lucide-react';
import { supabase, isSupabaseConfigured, uploadBase64Image } from '../utils/supabaseClient';
import { analyzeCrop } from '../services/geminiService';
import { getActiveApiKey } from '../utils/apiKey';
import { useAuth } from '../context/AuthContext';
import {
  computeImageHashes,
  hashImageUrl,
  hashSimilarity,
  loadHashCache,
  saveHashCache
} from '../utils/imageHash';

// External engines. `home` is the fallback landing page (manual paste/drop);
// `byUrl` deep-links straight into a reverse search when we have a public URL.
const SEARCH_ENGINES = [
  {
    name: 'Google Lens Search Portal',
    home: 'https://lens.google.com',
    byUrl: (u) => `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(u)}`,
    description: 'Finds matching websites and visually similar graphics.'
  },
  {
    name: 'Yandex Image OSINT Desk',
    home: 'https://yandex.com/images/',
    byUrl: (u) => `https://yandex.com/images/search?rpt=imageview&url=${encodeURIComponent(u)}`,
    description: 'Extremely powerful for tracking localized campaign syndicates in Asia.'
  },
  {
    name: 'TinEye Duplicate Detector',
    home: 'https://tineye.com',
    byUrl: (u) => `https://tineye.com/search?url=${encodeURIComponent(u)}`,
    description: 'Scans for modified duplicates of exact flyers/stock photography assets.'
  }
];

// Bit-agreement thresholds for the perceptual hash audit
const SIMILARITY_DUPLICATE = 0.85;
const SIMILARITY_RELATED = 0.72;

const MIN_BOX_PCT = 5;

const isHttpUrl = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);

function dataUrlToBlob(dataUrl) {
  const [meta, rawBase64] = dataUrl.split(';base64,');
  const contentType = meta.split(':')[1];
  const binaryStr = atob(rawBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
}

export default function ReverseImageOsintModal({ isOpen, onClose, flyerImageUrl, scanId, onLog, onToast }) {
  const { user, profile } = useAuth();

  // Crop box in percentages of the displayed image (floats — rounding to
  // whole percents quantizes the box to ~12px jumps on a 1200px flyer)
  const [cropBox, setCropBox] = useState({ x: 25, y: 25, w: 50, h: 50 });
  const [croppedDataUrl, setCroppedDataUrl] = useState(null);
  const [cropError, setCropError] = useState('');

  // Gemini Vision analysis
  const [isAnalyzingCrop, setIsAnalyzingCrop] = useState(false);
  const [cropAnalysisResult, setCropAnalysisResult] = useState(null);
  const [osintError, setOsintError] = useState('');

  // URL staging for one-click engine dispatch
  const [stagedCropUrl, setStagedCropUrl] = useState(null);
  const [isStagingCrop, setIsStagingCrop] = useState(false);

  // Perceptual hash duplicate audit
  const [matcherStatus, setMatcherStatus] = useState('idle'); // idle | running | done | error
  const [matcherProgress, setMatcherProgress] = useState({ done: 0, total: 0 });
  const [matcherResults, setMatcherResults] = useState([]);
  const [matcherError, setMatcherError] = useState('');

  // The overlay percentages are measured against this wrapper, which
  // shrink-wraps the <img> exactly — so overlay position and extracted
  // pixels can't drift apart.
  const boardRef = useRef(null);
  // Decoded flyer, loaded once per URL; every crop slice draws from it
  // synchronously (no per-mousemove Image reloads, no stale-onload races).
  const [sourceImg, setSourceImg] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setCropAnalysisResult(null);
    setOsintError('');
    setStagedCropUrl(null);
    setMatcherStatus('idle');
    setMatcherResults([]);
    setMatcherError('');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !flyerImageUrl) return;
    let cancelled = false;
    setSourceImg(null);
    setCropError('');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { if (!cancelled) setSourceImg(img); };
    img.onerror = () => {
      if (!cancelled) setCropError('Reference image failed to load — crop extraction unavailable.');
    };
    img.src = flyerImageUrl;
    return () => { cancelled = true; };
  }, [isOpen, flyerImageUrl]);

  // Regenerate the crop slice synchronously from the decoded source image
  useEffect(() => {
    if (!sourceImg) { setCroppedDataUrl(null); return; }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const realX = (cropBox.x / 100) * sourceImg.width;
    const realY = (cropBox.y / 100) * sourceImg.height;
    const realW = Math.max(1, Math.round((cropBox.w / 100) * sourceImg.width));
    const realH = Math.max(1, Math.round((cropBox.h / 100) * sourceImg.height));
    canvas.width = realW;
    canvas.height = realH;
    ctx.drawImage(sourceImg, realX, realY, realW, realH, 0, 0, realW, realH);
    try {
      setCroppedDataUrl(canvas.toDataURL('image/png'));
      setCropError('');
    } catch {
      // Canvas tainted: the image host doesn't send CORS headers
      setCroppedDataUrl(null);
      setCropError('Crop extraction blocked: the image host does not allow cross-origin pixel access (CORS). Engine links below fall back to full-flyer URL search.');
    }
  }, [sourceImg, cropBox]);

  // A new crop invalidates anything staged from the previous one
  useEffect(() => {
    setStagedCropUrl(null);
  }, [croppedDataUrl]);

  // Presets are computed against the flyer's real pixel dimensions so the
  // advertised aspect ratio (1:1, 3:4, 16:9) holds in the extracted image
  const applyPreset = (ratio) => {
    if (!sourceImg) return;
    const iw = sourceImg.width;
    const ih = sourceImg.height;
    let w = 50;
    let h = (w * iw) / (ratio * ih);
    if (h > 85) {
      w *= 85 / h;
      h = 85;
    }
    setCropBox({ x: (100 - w) / 2, y: (100 - h) / 2, w, h });
  };

  const handleStartInteraction = (e, mode) => {
    e.preventDefault();
    e.stopPropagation();

    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();

    const startX = e.clientX;
    const startY = e.clientY;
    const startBox = { ...cropBox };

    const handleMove = (moveEvent) => {
      const deltaX = ((moveEvent.clientX - startX) / rect.width) * 100;
      const deltaY = ((moveEvent.clientY - startY) / rect.height) * 100;

      if (mode === 'drag') {
        const newX = Math.max(0, Math.min(100 - startBox.w, startBox.x + deltaX));
        const newY = Math.max(0, Math.min(100 - startBox.h, startBox.y + deltaY));
        setCropBox((prev) => ({ ...prev, x: newX, y: newY }));
      } else if (mode === 'resize-br') {
        const newW = Math.max(MIN_BOX_PCT, Math.min(100 - startBox.x, startBox.w + deltaX));
        const newH = Math.max(MIN_BOX_PCT, Math.min(100 - startBox.y, startBox.h + deltaY));
        setCropBox((prev) => ({ ...prev, w: newW, h: newH }));
      } else if (mode === 'resize-tl') {
        const newX = Math.max(0, Math.min(startBox.x + startBox.w - MIN_BOX_PCT, startBox.x + deltaX));
        const newY = Math.max(0, Math.min(startBox.y + startBox.h - MIN_BOX_PCT, startBox.y + deltaY));
        setCropBox({
          x: newX,
          y: newY,
          w: startBox.w - (newX - startBox.x),
          h: startBox.h - (newY - startBox.y)
        });
      } else if (mode === 'resize-tr') {
        const newW = Math.max(MIN_BOX_PCT, Math.min(100 - startBox.x, startBox.w + deltaX));
        const newY = Math.max(0, Math.min(startBox.y + startBox.h - MIN_BOX_PCT, startBox.y + deltaY));
        setCropBox({
          x: startBox.x,
          y: newY,
          w: newW,
          h: startBox.h - (newY - startBox.y)
        });
      } else if (mode === 'resize-bl') {
        const newX = Math.max(0, Math.min(startBox.x + startBox.w - MIN_BOX_PCT, startBox.x + deltaX));
        const newH = Math.max(MIN_BOX_PCT, Math.min(100 - startBox.y, startBox.h + deltaY));
        setCropBox({
          x: newX,
          y: startBox.y,
          w: startBox.w - (newX - startBox.x),
          h: newH
        });
      }
    };

    const handleEnd = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);
  };

  // Escape closes; arrow keys nudge the box (Shift for coarse steps)
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (!e.key.startsWith('Arrow')) return;
      e.preventDefault();
      const step = e.shiftKey ? 5 : 1;
      setCropBox((prev) => {
        const next = { ...prev };
        if (e.key === 'ArrowLeft') next.x = Math.max(0, prev.x - step);
        if (e.key === 'ArrowRight') next.x = Math.min(100 - prev.w, prev.x + step);
        if (e.key === 'ArrowUp') next.y = Math.max(0, prev.y - step);
        if (e.key === 'ArrowDown') next.y = Math.min(100 - prev.h, prev.y + step);
        return next;
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const handleAnalyzeCrop = async () => {
    if (!croppedDataUrl) return;
    try {
      setIsAnalyzingCrop(true);
      setOsintError('');
      setCropAnalysisResult(null);

      const apiKey = getActiveApiKey();
      const modelName = profile?.gemini_model || localStorage.getItem('gemini_model');

      const response = await analyzeCrop(apiKey, modelName, { imageBase64: croppedDataUrl });
      setCropAnalysisResult(response);

      const keywords = (response.searchKeywords || []).join('; ');
      onLog(
        `[${new Date().toLocaleString()}] SYSTEM LOG: Reverse Image OSINT — Gemini crop analysis.\n` +
        `Finding: ${response.description}\n` +
        (keywords ? `Search keywords: ${keywords}\n` : '')
      );
    } catch (err) {
      console.error(err);
      setOsintError(err.message || 'Failed to analyze cropped image.');
    } finally {
      setIsAnalyzingCrop(false);
    }
  };

  const canCopyImage = typeof window !== 'undefined' && !!window.ClipboardItem && !!navigator.clipboard?.write;

  const handleCopyCrop = async () => {
    if (!croppedDataUrl) return;
    try {
      const blob = dataUrlToBlob(croppedDataUrl);
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
      onToast({
        title: 'Crop Copied as Image',
        description: 'Paste it (Ctrl/Cmd+V) directly into Google Lens or Yandex — no download needed.'
      });
    } catch (err) {
      setOsintError(`Clipboard copy failed: ${err.message || 'unsupported browser'}. Use Download instead.`);
    }
  };

  const handleDownloadCrop = () => {
    if (!croppedDataUrl) return;
    const a = document.createElement('a');
    a.href = croppedDataUrl;
    a.download = `sentinel_crop_${(scanId || 'new').substring(0, 8)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Publish the crop segment to storage so engines can be deep-linked by URL
  const handleStageCrop = async () => {
    if (!croppedDataUrl) return;
    try {
      setIsStagingCrop(true);
      setOsintError('');
      const publicUrl = await uploadBase64Image(croppedDataUrl);
      setStagedCropUrl(publicUrl);
      onToast({
        title: 'Crop Staged for URL Search',
        description: 'Engine links below now open a reverse search of the crop segment directly.'
      });
    } catch (err) {
      console.error(err);
      setOsintError(`Failed to stage crop segment: ${err.message || 'storage upload error'}`);
    } finally {
      setIsStagingCrop(false);
    }
  };

  const runDuplicateAudit = async () => {
    if (!sourceImg) return;
    if (!isSupabaseConfigured) {
      setMatcherStatus('error');
      setMatcherError('Requires a configured Supabase backend — local sandbox mode has no real corpus to audit.');
      return;
    }
    setMatcherStatus('running');
    setMatcherResults([]);
    setMatcherError('');
    setMatcherProgress({ done: 0, total: 0 });

    try {
      const reference = computeImageHashes(sourceImg);

      let query = supabase
        .from('scans')
        .select('id, job_title, employer, timestamp, original_image_url')
        .order('timestamp', { ascending: false })
        .limit(80);
      if (user?.id) query = query.eq('user_id', user.id);
      const { data, error } = await query;
      if (error) throw error;

      const candidates = (data || []).filter((r) => r.original_image_url && r.id !== scanId);
      setMatcherProgress({ done: 0, total: candidates.length });

      const cache = loadHashCache();
      const results = [];
      let done = 0;

      // Small batches: enough parallelism to hide network latency without
      // decoding dozens of flyers at once
      for (let i = 0; i < candidates.length; i += 4) {
        const batch = candidates.slice(i, i + 4);
        await Promise.all(batch.map(async (row) => {
          try {
            let entry = cache[row.id];
            if (!entry || entry.url !== row.original_image_url) {
              const hashes = await hashImageUrl(row.original_image_url);
              entry = { url: row.original_image_url, ...hashes };
              cache[row.id] = entry;
            }
            results.push({ ...row, similarity: hashSimilarity(reference, entry) });
          } catch {
            // Image unreachable or CORS-blocked — skip this candidate
          }
          done += 1;
          setMatcherProgress({ done, total: candidates.length });
        }));
      }

      saveHashCache(cache);
      results.sort((a, b) => b.similarity - a.similarity);
      setMatcherResults(results.slice(0, 6));
      setMatcherStatus('done');

      const topDuplicate = results.find((r) => r.similarity >= SIMILARITY_DUPLICATE);
      if (topDuplicate) {
        onLog(
          `[${new Date().toLocaleString()}] SYSTEM LOG: Perceptual hash audit — flyer matches "${topDuplicate.job_title || 'Untitled scan'}" ` +
          `(${topDuplicate.employer || 'unknown employer'}) at ${Math.round(topDuplicate.similarity * 100)}% visual similarity. Likely template reuse.\n`
        );
      }
    } catch (err) {
      console.error(err);
      setMatcherStatus('error');
      setMatcherError(err.message || 'Duplicate audit failed.');
    }
  };

  if (!isOpen) return null;

  // Deep-link target: a staged crop wins; otherwise fall back to the hosted
  // full flyer; data-URI flyers have no public address, so engines open plain
  const dispatchUrl = stagedCropUrl || (isHttpUrl(flyerImageUrl) ? flyerImageUrl : null);
  const dispatchScope = stagedCropUrl ? 'CROP SEGMENT' : 'FULL FLYER';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
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
            onClick={onClose}
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
                      onClick={() => applyPreset(1)}
                      className="px-2 py-1.5 bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-slate-300 font-mono text-[9px] rounded uppercase transition-colors"
                    >
                      Logo (1:1)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset(3 / 4)}
                      className="px-2 py-1.5 bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-slate-300 font-mono text-[9px] rounded uppercase transition-colors"
                    >
                      Photo (3:4)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset(16 / 9)}
                      className="px-2 py-1.5 bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-slate-300 font-mono text-[9px] rounded uppercase transition-colors"
                    >
                      Banner (16:9)
                    </button>
                  </div>
                  <p className="text-[9px] font-mono text-slate-600 leading-relaxed">
                    Drag to reposition · corners to resize · arrow keys to nudge (Shift = ×5)
                  </p>
                </div>

                {/* Live Crop Preview */}
                {croppedDataUrl && (
                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-mono text-slate-400 uppercase">Live Segment Preview</label>
                    <div className="border border-slate-800 rounded bg-[#0a0c12] p-2 flex items-center justify-center">
                      <img
                        src={croppedDataUrl}
                        alt="Crop segment preview"
                        className="max-h-28 max-w-full object-contain rounded-sm"
                      />
                    </div>
                  </div>
                )}

                {/* Copy / Download / Stage */}
                {croppedDataUrl && (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-2 gap-1.5">
                      {canCopyImage && (
                        <button
                          type="button"
                          onClick={handleCopyCrop}
                          className="py-2 bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-slate-300 hover:text-slate-100 font-mono text-[10px] rounded uppercase transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Copy className="w-3.5 h-3.5" /> Copy Crop
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleDownloadCrop}
                        className={`py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-slate-100 font-mono text-[10px] rounded uppercase transition-colors flex items-center justify-center gap-1.5 ${canCopyImage ? '' : 'col-span-2'}`}
                      >
                        <ImageIcon className="w-3.5 h-3.5" /> Download
                      </button>
                    </div>
                    {isSupabaseConfigured && (
                      <button
                        type="button"
                        onClick={handleStageCrop}
                        disabled={isStagingCrop || !!stagedCropUrl}
                        className="w-full py-2 bg-slate-900 border border-slate-800 hover:border-amber-500/40 disabled:opacity-60 text-slate-300 hover:text-slate-100 font-mono text-[10px] rounded uppercase transition-colors flex items-center justify-center gap-1.5"
                      >
                        {isStagingCrop ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Staging Segment...</>
                        ) : stagedCropUrl ? (
                          <>Crop Staged — Engines Armed</>
                        ) : (
                          <><UploadCloud className="w-3.5 h-3.5" /> Stage Crop for URL Search</>
                        )}
                      </button>
                    )}
                  </div>
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
                            className="flex items-center text-[10px] font-mono font-semibold bg-slate-950 hover:bg-slate-900 text-amber-400/90 border border-slate-850 hover:border-amber-500/30 rounded transition-all"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(kw);
                                onToast({
                                  title: 'Keyword Copied',
                                  description: `"${kw}" has been copied to your clipboard for search engine entry.`
                                });
                              }}
                              className="px-2 py-0.5 hover:text-amber-350 active:scale-95"
                              title="Copy keyword"
                            >
                              {kw}
                            </button>
                            <a
                              href={`https://www.google.com/search?q=${encodeURIComponent(kw)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-1.5 py-1 border-l border-slate-850 text-slate-500 hover:text-amber-400 transition-colors"
                              title="Search on Google"
                            >
                              <Search className="w-3 h-3" />
                            </a>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Error Banner */}
            {(osintError || cropError) && (
              <div className="p-3 rounded bg-red-950/20 border border-red-900/30 text-[10px] text-red-400 font-mono leading-normal mt-4">
                Error: {osintError || cropError}
              </div>
            )}
          </div>

          {/* Center: Image Board with Overlay Bounding Box */}
          <div className="flex-1 bg-slate-950 p-5 flex flex-col justify-center items-center border-r border-slate-800 min-h-[300px]">
            <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-2 self-start">Interactive Target Board</span>
            <div className="border border-slate-800 rounded overflow-hidden max-h-[55vh] max-w-full flex items-center justify-center bg-[#0a0c12]">
              {/* Raw Flyer Reference. History records arrive without the
                  heavy image column; flyerImageUrl is hydrated lazily from
                  original_image_url, so it — not the scan record — is the
                  source of truth here (same as the crop-slice generator). */}
              {flyerImageUrl ? (
                <div ref={boardRef} className="relative inline-block">
                  <img
                    src={flyerImageUrl}
                    alt="Flyer Reference"
                    className="block max-h-[52vh] max-w-full object-contain opacity-75 select-none pointer-events-none"
                  />
                  {/* Crop Target Bounding Overlay Box */}
                  <div
                    onPointerDown={(e) => handleStartInteraction(e, 'drag')}
                    className="absolute border-2 border-dashed border-amber-500 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.25)] pointer-events-auto cursor-move select-none touch-none"
                    style={{
                      left: `${cropBox.x}%`,
                      top: `${cropBox.y}%`,
                      width: `${cropBox.w}%`,
                      height: `${cropBox.h}%`
                    }}
                  >
                    {/* Bounding box corner handle triggers */}
                    <div
                      onPointerDown={(e) => handleStartInteraction(e, 'resize-tl')}
                      className="absolute top-0 left-0 w-2.5 h-2.5 border border-amber-400 bg-amber-600 -mt-1 -ml-1 cursor-nwse-resize pointer-events-auto touch-none"
                    />
                    <div
                      onPointerDown={(e) => handleStartInteraction(e, 'resize-tr')}
                      className="absolute top-0 right-0 w-2.5 h-2.5 border border-amber-400 bg-amber-600 -mt-1 -mr-1 cursor-nesw-resize pointer-events-auto touch-none"
                    />
                    <div
                      onPointerDown={(e) => handleStartInteraction(e, 'resize-bl')}
                      className="absolute bottom-0 left-0 w-2.5 h-2.5 border border-amber-400 bg-amber-600 -mb-1 -ml-1 cursor-nesw-resize pointer-events-auto touch-none"
                    />
                    <div
                      onPointerDown={(e) => handleStartInteraction(e, 'resize-br')}
                      className="absolute bottom-0 right-0 w-2.5 h-2.5 border border-amber-400 bg-amber-600 -mb-1 -mr-1 cursor-nwse-resize pointer-events-auto touch-none"
                    />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-[8px] font-mono text-amber-400/60 bg-slate-950/80 px-1 py-0.5 rounded border border-amber-900/30">CROP CALIBRATION TARGET</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-72 max-w-full h-40 flex items-center justify-center text-center p-6">
                  <span className="text-[10px] font-mono text-slate-500 leading-relaxed">
                    Loading reference image… If this case was ingested without an image (e.g. text-only feed post), the crop board is unavailable.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Search Dispatchers & Options */}
          <div className="w-full lg:w-[380px] p-5 overflow-y-auto flex flex-col justify-between bg-[#0d1117]">
            <div className="space-y-6">
              {/* Option 1: External Search dispatchers */}
              <div className="space-y-3">
                <span className="text-[10px] font-mono font-bold text-slate-500 block uppercase tracking-wider">Option 1: Global Search Engines</span>
                {dispatchUrl ? (
                  <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                    Engines armed for direct URL search of the{' '}
                    <span className="text-amber-400/90 font-mono text-[9px]">{dispatchScope}</span>. Click to launch a pre-filled reverse search — no manual upload needed.
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                    This flyer has no public URL yet. Copy or download the crop segment above, then paste/drop it into the engines below:
                  </p>
                )}
                <div className="space-y-2">
                  {SEARCH_ENGINES.map((engine) => (
                    <a
                      key={engine.name}
                      href={dispatchUrl ? engine.byUrl(dispatchUrl) : engine.home}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 bg-slate-950 hover:bg-[#1b2230]/40 border border-slate-850 hover:border-slate-700 rounded flex items-center justify-between transition-colors group"
                    >
                      <div>
                        <span className="text-xs font-bold text-slate-200 group-hover:text-amber-400 transition-colors">{engine.name}</span>
                        <p className="text-[9px] text-slate-500 mt-0.5">{engine.description}</p>
                      </div>
                      <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-amber-500 transition-colors shrink-0 ml-3" />
                    </a>
                  ))}
                </div>
              </div>

              {/* Option 2: Perceptual Hash Duplicate Audit */}
              <div className="p-4 bg-slate-950/20 border border-slate-850 rounded space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">Option 2: Database Matcher</span>
                  <Fingerprint className="w-4 h-4 text-slate-600" />
                </div>
                <span className="text-xs font-bold text-slate-300 block">Perceptual Hash Duplicate Audit</span>
                <p className="text-[10px] text-slate-500 leading-normal font-sans">
                  Computes visual signatures (aHash/dHash) of this flyer and compares them against your ingested case corpus to surface recycled graphic templates. Larger corpora may take a moment on first run; signatures are cached.
                </p>
                <button
                  type="button"
                  onClick={runDuplicateAudit}
                  disabled={matcherStatus === 'running' || !sourceImg}
                  className="w-full py-2 bg-slate-900 border border-slate-800 hover:border-amber-500/40 disabled:opacity-60 text-slate-300 hover:text-slate-100 font-mono text-[10px] rounded uppercase transition-colors flex items-center justify-center gap-1.5"
                >
                  {matcherStatus === 'running' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Hashing Corpus... {matcherProgress.done}/{matcherProgress.total}
                    </>
                  ) : (
                    <>
                      <Fingerprint className="w-3.5 h-3.5" /> Run Duplicate Audit
                    </>
                  )}
                </button>

                {matcherStatus === 'error' && (
                  <div className="p-2.5 rounded bg-red-950/20 border border-red-900/30 text-[10px] text-red-400 font-mono leading-normal">
                    {matcherError}
                  </div>
                )}

                {matcherStatus === 'done' && matcherResults.length === 0 && (
                  <p className="text-[10px] font-mono text-slate-500">No comparable flyers found in the corpus.</p>
                )}

                {matcherStatus === 'done' && matcherResults.length > 0 && (
                  <div className="space-y-1.5">
                    {matcherResults.map((match) => {
                      const pct = Math.round(match.similarity * 100);
                      const isDuplicate = match.similarity >= SIMILARITY_DUPLICATE;
                      const isRelated = !isDuplicate && match.similarity >= SIMILARITY_RELATED;
                      return (
                        <div
                          key={match.id}
                          className={`p-2 rounded border flex items-center gap-2.5 ${
                            isDuplicate
                              ? 'bg-red-950/20 border-red-900/40'
                              : isRelated
                                ? 'bg-amber-500/5 border-amber-500/20'
                                : 'bg-slate-950 border-slate-850'
                          }`}
                        >
                          <img
                            src={match.original_image_url}
                            alt=""
                            className="w-9 h-9 object-cover rounded-sm border border-slate-800 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-bold text-slate-300 truncate">{match.job_title || 'Untitled scan'}</p>
                            <p className="text-[9px] text-slate-500 truncate">{match.employer || 'Unknown employer'}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className={`text-[10px] font-mono font-bold ${isDuplicate ? 'text-red-400' : isRelated ? 'text-amber-400' : 'text-slate-400'}`}>
                              {pct}%
                            </span>
                            {isDuplicate && <p className="text-[8px] font-mono text-red-500/80 uppercase">Likely duplicate</p>}
                            {isRelated && <p className="text-[8px] font-mono text-amber-500/80 uppercase">Related</p>}
                          </div>
                        </div>
                      );
                    })}
                    <p className="text-[9px] font-mono text-slate-600 leading-relaxed pt-0.5">
                      Locate matched cases in the History Registry for side-by-side review.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Info Text */}
            <div className="text-[9px] font-mono text-slate-550 leading-relaxed pt-4 border-t border-slate-900 mt-6 select-text">
              Sentinel OSINT Suite · Visual Template Audits · Rev: 2.2
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-[#0c0f16] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-850 hover:bg-slate-800 text-slate-200 text-xs font-mono font-bold rounded shadow-sm transition-colors border border-slate-700"
          >
            Close Modal
          </button>
        </div>
      </div>
    </div>
  );
}
