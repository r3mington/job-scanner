import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react';
import { makeTentative, sanitizeTraumaLanguage } from '../utils/caseHelpers';

export default function EscalationStages({
  playbookData = [],
  isPlaybookExpanded,
  setIsPlaybookExpanded
}) {
  const [expandedPlaybookRows, setExpandedPlaybookRows] = useState(new Set());

  if (playbookData.length === 0) return null;

  return (
    <div id="section-playbook" data-nav-section className="scroll-mt-32 rounded overflow-hidden border border-slate-800/80" style={{ background: '#111318' }}>
      {/* Collapsed summary bar — always visible */}
      <button
        type="button"
        onClick={() => setIsPlaybookExpanded(p => !p)}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-red-950/10 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <ShieldAlert className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-sm text-slate-300 font-medium">
            <span className="font-bold text-red-500">{playbookData.length} potential risk escalation stages</span>
            <span className="text-slate-400 font-normal"> detected based on current indicators</span>
          </span>
        </div>
        <span className="flex items-center gap-1 text-xs text-red-400 font-semibold flex-shrink-0 font-mono">
          {isPlaybookExpanded ? 'Hide' : 'View Playbook'}
          {isPlaybookExpanded
            ? <ChevronUp className="w-3.5 h-3.5" />
            : <ChevronDown className="w-3.5 h-3.5" />}
        </span>
      </button>

      {/* Slide-down panel */}
      {isPlaybookExpanded && (
        <div className="border-t border-slate-800 divide-y divide-slate-800/80">
          {playbookData.map((step, idx) => {
            const isRowOpen = expandedPlaybookRows.has(idx);
            const stageLabel = step.phase?.replace(/^Stage \d+:\s*/i, '') || step.phase;
            const isHighSeverity = idx < 2;
            return (
              <div key={idx} className="select-text">
                {/* Compact row */}
                <div className="flex items-start gap-3 px-4 py-3">
                  {/* Severity bar */}
                  <div className={`w-[3px] self-stretch rounded-full flex-shrink-0 mt-0.5 ${
                    isHighSeverity ? 'bg-red-500' : 'bg-amber-500'
                  }`} />

                  {/* Step number */}
                  <span className={`text-[10px] font-bold font-mono flex-shrink-0 mt-0.5 ${
                    isHighSeverity ? 'text-red-400' : 'text-amber-400'
                  }`}>
                    {String(idx + 1).padStart(2, '0')}
                  </span>

                  {/* Stage label + tactic summary */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[9px] font-bold uppercase tracking-widest font-mono ${
                        isHighSeverity ? 'text-red-400' : 'text-amber-400'
                      }`}>{stageLabel}</span>
                      <span className={`text-[8px] font-bold uppercase tracking-wider font-mono px-1 py-px rounded-sm border ${
                        isHighSeverity
                          ? 'text-red-300 border-red-500/40 bg-red-500/10'
                          : 'text-amber-300 border-amber-500/40 bg-amber-500/10'
                      }`}>{isHighSeverity ? 'High' : 'Elevated'}</span>
                    </div>
                    <p className="text-[13px] text-slate-300 mt-1 leading-relaxed">{makeTentative(step.tactic)}</p>
                  </div>

                  {/* Per-row details toggle */}
                  <button
                    type="button"
                    onClick={() => setExpandedPlaybookRows(prev => {
                      const next = new Set(prev);
                      next.has(idx) ? next.delete(idx) : next.add(idx);
                      return next;
                    })}
                    className="flex-shrink-0 text-[10px] font-mono font-semibold text-slate-400 hover:text-amber-400 transition-colors mt-0.5 whitespace-nowrap"
                  >
                    {isRowOpen ? '− hide' : '+ watch for'}
                  </button>
                </div>

                {/* Inline indicator detail */}
                {isRowOpen && (
                  <div className="px-4 pb-3 ml-[calc(3px+12px+20px+12px)]">
                    <p className="text-xs text-amber-200/90 leading-relaxed bg-amber-500/5 border border-amber-500/15 rounded px-3 py-2">
                      <span className="font-semibold uppercase tracking-wide text-amber-400/80 text-[10px] mr-1.5">Watch for:</span>
                      {sanitizeTraumaLanguage(step.red_flag_indicator)}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
