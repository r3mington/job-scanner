import React from 'react';
import { ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react';
import { RISK_FLAGS } from '../utils/scoring';

export default function IndicatorChecklist({
  activeFlags = [],
  handleFlagToggle,
  isIndicatorsExpanded,
  setIsIndicatorsExpanded
}) {

  return (
    <div id="section-indicators" data-nav-section className="scroll-mt-32 rounded overflow-hidden border border-slate-800/80 mb-6" style={{ background: '#111318' }}>
      <button
        type="button"
        onClick={() => setIsIndicatorsExpanded(prev => !prev)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-500" />
          <div>
            <h3 className="font-bold text-slate-200 text-sm">Risk Indicators</h3>
            <p className="text-xs text-slate-500 mt-0.5">Check triggers you've discovered to recalculate the score.</p>
          </div>
        </div>
        {isIndicatorsExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>
      {isIndicatorsExpanded && (
        <div className="p-2 border-t border-slate-800 divide-y divide-slate-850/30">
          {Object.keys(RISK_FLAGS).map(flag => (
            <label key={flag} className="flex items-center justify-between p-2.5 cursor-pointer hover:bg-slate-900/50 rounded-none transition-colors border-b border-slate-850/30 last:border-0">
              <span className="text-sm font-medium text-slate-300">{flag}</span>
              <input
                type="checkbox"
                checked={activeFlags.includes(flag)}
                onChange={() => handleFlagToggle(flag)}
                className="w-4 h-4 rounded-sm border-slate-800 text-amber-600 focus:ring-amber-500/40 bg-slate-950 cursor-pointer"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
