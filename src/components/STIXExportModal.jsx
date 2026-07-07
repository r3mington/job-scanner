import React from 'react';
import { Globe, X } from 'lucide-react';

export default function STIXExportModal({
  isOpen,
  onClose,
  stixOptions,
  setStixOptions,
  getStixBundlePayload,
  onLogAction,
  caseId = 'new'
}) {
  if (!isOpen) return null;

  const handleCopy = () => {
    const payload = getStixBundlePayload();
    navigator.clipboard.writeText(payload);
    onLogAction(
      `Exported STIX 2.1 Intelligence bundle copied to clipboard.`,
      'STIX Bundle Copied',
      'The STIX JSON payload has been copied to your clipboard, and the event has been logged in comments.'
    );
    onClose();
  };

  const handleDownload = () => {
    const payload = getStixBundlePayload();
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `sentinel_stix_case_${caseId.substring(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    onLogAction(
      `Exported STIX 2.1 Intelligence bundle downloaded.`,
      'STIX Bundle Downloaded',
      'STIX JSON file downloaded successfully, and the action has been logged in Analyst Comments.'
    );
    onClose();
  };

  return (
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
            onClick={onClose}
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
            onClick={handleCopy}
            className="px-4 py-2 border border-slate-800 hover:bg-[#1b2230]/40 text-slate-350 font-mono text-xs font-bold uppercase rounded transition-colors"
          >
            Copy Payload JSON
          </button>

          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 font-mono text-xs font-bold uppercase rounded transition-colors border border-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-slate-900 font-mono text-xs font-bold uppercase rounded transition-colors"
            >
              Download STIX JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
