import React from 'react';
import { Activity, X } from 'lucide-react';
import { dayKeyOf } from '../utils/caseHelpers';

const MAX_DOTS = 8;

const tierBg = (score) =>
  score >= 60 ? 'bg-red-500' : score >= 30 ? 'bg-amber-500' : 'bg-[#3fb950]';

export default function PosterActivityTimeline({ scans, selectedDay, onSelectDay }) {
  if (scans.length === 0) return null;

  const timestamps = scans.map(s => s.timestamp);
  const first = new Date(Math.min(...timestamps));
  const last = new Date(Math.max(...timestamps));
  const start = new Date(first.getFullYear(), first.getMonth(), first.getDate());
  const end = new Date(last.getFullYear(), last.getMonth(), last.getDate());
  const dayCount = Math.round((end - start) / 86400000) + 1;

  const days = [];
  const byKey = {};
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const day = {
      key: dayKeyOf(d.getTime()),
      label: d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
      scans: []
    };
    days.push(day);
    byKey[day.key] = day;
  }
  scans.forEach(s => byKey[dayKeyOf(s.timestamp)]?.scans.push(s));

  const peakDay = days.reduce((max, d) => (d.scans.length > max.scans.length ? d : max), days[0]);
  const labelEvery = Math.max(1, Math.ceil(days.length / 14));

  return (
    <div className="bg-[#111318] border border-slate-800 rounded p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-mono text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-amber-500" /> Posting Activity Timeline
        </h3>
        <div className="flex items-center gap-3 font-mono text-[9px] text-slate-500">
          <span className="hidden sm:inline">
            Peak: {peakDay.scans.length} ad{peakDay.scans.length !== 1 ? 's' : ''} on {peakDay.label}
          </span>
          {selectedDay && (
            <button
              onClick={() => onSelectDay(null)}
              className="flex items-center gap-1 px-2 py-1 border border-amber-500/40 bg-amber-500/10 text-amber-400 rounded font-bold uppercase hover:bg-amber-500/20 transition-colors"
            >
              <X className="w-3 h-3" /> Clear Filter
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex items-end gap-0.5 min-w-full w-max">
          {days.map((day, idx) => {
            const isSelected = selectedDay === day.key;
            const hasScans = day.scans.length > 0;
            const shown = day.scans.slice(0, MAX_DOTS);
            const overflow = day.scans.length - shown.length;

            return (
              <button
                key={day.key}
                onClick={() => hasScans && onSelectDay(isSelected ? null : day.key)}
                disabled={!hasScans}
                title={`${day.label}: ${day.scans.length} ad${day.scans.length !== 1 ? 's' : ''}`}
                className={`flex flex-col items-center gap-1 px-1 pt-1.5 pb-1 rounded border min-w-[26px] transition-colors ${
                  isSelected
                    ? 'border-amber-500/50 bg-amber-500/10'
                    : hasScans
                    ? 'border-transparent hover:bg-[#1b2230]/50 cursor-pointer'
                    : 'border-transparent'
                }`}
              >
                <div className="flex flex-col-reverse items-center justify-start gap-[3px] h-24">
                  {hasScans ? (
                    <>
                      {shown.map(scan => (
                        <span
                          key={scan.id}
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${tierBg(scan.riskScore)}`}
                        />
                      ))}
                      {overflow > 0 && (
                        <span className="text-[8px] font-mono text-slate-400 leading-none">
                          +{overflow}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="w-2 h-[2px] bg-slate-800 rounded-full" />
                  )}
                </div>
                <span
                  className={`font-mono text-[8px] leading-none ${
                    isSelected ? 'text-amber-400 font-bold' : 'text-slate-500'
                  } ${idx % labelEvery === 0 || isSelected ? '' : 'invisible'}`}
                >
                  {day.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[9px] text-slate-500 pt-1 border-t border-slate-800">
        <span>1 dot = 1 linked ad • click a day to filter the evidence log</span>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> Risk &gt;= 60%</div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> 30–59%</div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#3fb950]" /> &lt; 30%</div>
      </div>
    </div>
  );
}
