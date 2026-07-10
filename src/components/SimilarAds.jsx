import React from 'react';
import { Columns, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getMatchReasons } from '../utils/similarity';
import { getCleanContactValue } from '../utils/caseHelpers';

export default function SimilarAds({
  similarScans = [],
  formData = {},
  originalText = '',
  ocrText = '',
  setComparisonTarget
}) {
  const navigate = useNavigate();

  if (similarScans.length === 0) return null;

  return (
    <div id="similar-postings-section" data-nav-section className="scroll-mt-32 rounded overflow-hidden border border-slate-800/80" style={{ background: '#111318' }}>
      <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-200">Similar Job Ads Detected</h3>
          <p className="text-xs text-slate-500 mt-1">Found potential matches or template re-use in your history.</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="bg-amber-950 text-amber-400 text-[10px] font-mono px-2 py-0.5 rounded border border-amber-800/60 font-bold">
            {similarScans.length} similar ad{similarScans.length > 1 ? 's' : ''}
          </span>
          <button
            type="button"
            onClick={() => {
              const cleanContact = getCleanContactValue ? getCleanContactValue(formData.contact_method) : null;
              navigate('/history', { state: { viewType: 'graph', focusContact: cleanContact || null } });
            }}
            title="Open these ads as a recruiter cluster in the connections graph"
            className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 text-[10px] font-mono font-bold rounded transition-colors"
          >
            <Users className="w-3.5 h-3.5" />
            View Cluster
          </button>
        </div>
      </div>
      <div className="divide-y divide-slate-800 max-h-80 overflow-y-auto">
        {similarScans.map((scan) => {
          const pct = Math.round(scan.similarity * 100);
          const reasons = getMatchReasons(originalText || ocrText || '', scan.originalText || scan.ocrText || '');
          const hasStrongLink = reasons.some(r => r.kind === 'critical');
          const strengthColor = hasStrongLink || pct >= 80
            ? 'bg-red-950/40 text-red-400 border-red-900/40'
            : pct >= 60
              ? 'bg-amber-950/40 text-amber-400 border-amber-900/40'
              : 'bg-slate-900 text-slate-400 border-slate-800';
          const barColor = hasStrongLink || pct >= 80 ? '#ef4444' : pct >= 60 ? '#f59e0b' : '#64748b';
          return (
            <div key={scan.id} className="p-4 flex items-start justify-between gap-4 hover:bg-slate-850/20 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-200 truncate">
                    {scan.jobTitle || 'Unknown Job'}
                  </span>
                  <span className="text-xs text-slate-450 truncate">
                    ({scan.employer || 'Unknown Employer'})
                  </span>
                </div>
                {/* Match-reason chips — WHY these ads are linked */}
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {reasons.map((reason, i) => {
                    const chipClass =
                      reason.kind === 'critical'
                        ? 'bg-red-950/40 text-red-300 border-red-900/50'
                        : reason.kind === 'template'
                          ? 'bg-amber-950/30 text-amber-300 border-amber-900/40'
                          : 'bg-slate-900 text-slate-450 border-slate-800';
                    return (
                      <span
                        key={i}
                        className={`inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border ${chipClass}`}
                      >
                        {reason.kind === 'critical' && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />}
                        {reason.label}
                      </span>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-550 mt-1.5">
                  Scanned on {new Date(scan.timestamp).toLocaleDateString()}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-sm border ${strengthColor}`}>
                  {pct}% Match
                </span>
                <div className="w-24 h-1 rounded-full bg-slate-900 border border-slate-850 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor }} />
                </div>
                <button
                  type="button"
                  onClick={() => setComparisonTarget(scan)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold font-mono rounded transition-colors flex items-center gap-1"
                >
                  <Columns className="w-3.5 h-3.5" />
                  Compare Diff
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
