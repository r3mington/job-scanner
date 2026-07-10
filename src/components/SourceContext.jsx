import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Globe } from 'lucide-react';

export default function SourceContext({
  sourcePlatform,
  setSourcePlatform,
  ingestionMethod,
  setIngestionMethod,
  sourceUrl,
  setSourceUrl,
  postDate,
  setPostDate,
  ocrText,
  isSourceExpanded,
  setIsSourceExpanded
}) {
  const [isOcrExpanded, setIsOcrExpanded] = useState(false);

  return (
    <div id="section-source" data-nav-section className="scroll-mt-32 rounded overflow-hidden border border-slate-800/80" style={{ background: '#111318' }}>
      <button
        type="button"
        onClick={() => setIsSourceExpanded(prev => !prev)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <div>
            <h3 className="font-bold text-slate-200 text-sm">Source & Ingestion Context</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Review platform, URL, ingestion method, post date, and raw OCR text
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

          {/* Raw OCR Text */}
          {ocrText && (
            <div className="border border-slate-800 rounded-sm overflow-hidden">
              <button
                type="button"
                onClick={() => setIsOcrExpanded(prev => !prev)}
                className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-slate-850/20 transition-colors"
              >
                <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                  Raw Image OCR Output
                </span>
                {isOcrExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
              </button>
              {isOcrExpanded && (
                <div className="p-3 bg-[#0a0c12] border-t border-slate-900 text-xs font-mono text-slate-400 whitespace-pre-wrap select-text max-h-60 overflow-y-auto">
                  {ocrText}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
