import React from 'react';
import { Eye, TrendingUp } from 'lucide-react';
import RiskGauge from './RiskGauge';

const DEFAULT_CRITICAL_FLAGS = new Set([
  'Passport/ID Control',
  'Upfront Fees',
  'Immediate Travel Pressure',
  'Housing Compound Isolation',
  'Suspect Location Hub'
]);

export default function ScoreBreakdown({
  score,
  scoreBorder,
  scoreDetails = [],
  criticalFlags = DEFAULT_CRITICAL_FLAGS,
  suspiciousSpans = [],
  scoreBarsVisible,
  setScoreBarsVisible,
  jumpToEvidence,
  scoreColor,
  scoreDrifted,
  storedScore,
  handleSave,
  saving
}) {
  return (
    <div id="section-score" data-nav-section className={`scroll-mt-32 rounded overflow-hidden border ${scoreBorder}`} style={{ background: '#111318' }}>
      {/* Gauge hero */}
      <div className="px-5 pt-5 pb-3 flex items-center gap-6">
        {/* SVG Radial Arc */}
        <RiskGauge score={score} size={120} strokeWidth={10} />
        {!scoreBarsVisible && (
          <span className="sr-only" ref={el => { if (el) requestAnimationFrame(() => setScoreBarsVisible(true)); }} />
        )}

        {/* Breakdown bars */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest mb-3">Risk Breakdown</p>
          {scoreDetails && scoreDetails.length > 0 ? (
            <div className="space-y-3.5">
              {[...scoreDetails].sort((a, b) => b.weight - a.weight).map((detail, idx) => {
                const maxWeight = Math.max(...scoreDetails.map(d => d.weight));
                const pct = Math.round((detail.weight / maxWeight) * 100);
                const isCritical = criticalFlags.has(detail.name);
                const barColor = detail.isSalaryAnomaly || detail.isCrossBorderMismatch
                  ? '#f59e0b' : isCritical ? '#ef4444' : '#f87171';
                const hasEvidence = suspiciousSpans.some(s => s.red_flag === detail.name && (s.original_snippet || s.translated_snippet));
                
                const row = (
                  <>
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="text-slate-300 font-medium truncate pr-2 flex items-center gap-1.5">
                        {detail.name}
                        {hasEvidence && (
                          <Eye className="w-3 h-3 text-slate-600 group-hover/bar:text-amber-400 transition-colors flex-shrink-0" />
                        )}
                      </span>
                      <span className="text-slate-450 font-bold flex-shrink-0">+{detail.weight} pts</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-900 border border-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all ease-out"
                        style={{
                          width: scoreBarsVisible ? `${pct}%` : '0%',
                          background: barColor,
                          transitionDuration: '600ms',
                          transitionDelay: `${150 + idx * 60}ms`,
                        }}
                      />
                    </div>
                  </>
                );

                if (hasEvidence) {
                  return (
                    <button
                      key={detail.name}
                      type="button"
                      onClick={() => jumpToEvidence(detail.name)}
                      title="Jump to the flagged phrase in the ad text"
                      className="group/bar w-full text-left space-y-1 rounded -mx-1.5 px-1.5 py-1 -my-1 hover:bg-slate-800/40 transition-colors cursor-pointer"
                    >
                      {row}
                    </button>
                  );
                }
                return (
                  <div key={detail.name} className="space-y-1">
                    {row}
                  </div>
                );
              })}
              <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold">Total Risk Index (capped)</span>
                <span className="text-sm font-black font-mono" style={{ color: scoreColor }}>{score} / 100</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 font-mono">No risk triggers detected.</p>
          )}
        </div>
      </div>

      {/* Score drift reconciliation notice */}
      {scoreDrifted && (
        <div className="mx-5 mb-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md border border-amber-500/25 bg-amber-500/[0.06] px-3.5 py-2.5">
          <TrendingUp className="h-4 w-4 flex-shrink-0 text-amber-400" />
          <p className="flex-1 text-[13px] leading-snug text-slate-300">
            Score recalculated under current scoring rules: registry shows{' '}
            <span className="font-semibold text-slate-200">{storedScore}</span>, now{' '}
            <span className="font-semibold text-amber-300">{score}</span>.
          </p>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-shrink-0 rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Update registry'}
          </button>
        </div>
      )}
    </div>
  );
}
