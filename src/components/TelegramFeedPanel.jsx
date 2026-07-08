import React, { useState, useEffect, useRef } from 'react';
import { Radio, Play, Pause, Plus, X, Loader2, CheckCircle2, AlertTriangle, RotateCcw, Send, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import useTelegramFeed from '../hooks/useTelegramFeed';

function relTime(ts) {
  if (!ts) return '—';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)}m ago`;
}

export default function TelegramFeedPanel() {
  const { user, profile } = useAuth();
  const feed = useTelegramFeed({ user, profile });
  const {
    channels, running, logs, stats, lastPollAt, usingSnapshot, latestPost,
    start, stop, addChannel, toggleChannel, removeChannel, resetCursors,
  } = feed;

  const [newChannel, setNewChannel] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [, forceTick] = useState(0);
  const logRef = useRef(null);

  // Keep the "last poll" clock ticking and autoscroll the console.
  useEffect(() => {
    const t = setInterval(() => forceTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setAddError('');
    setAdding(true);
    try {
      await addChannel(newChannel);
      setNewChannel('');
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const flagRate = stats.screened ? Math.round((stats.flagged / stats.screened) * 100) : 0;

  return (
    <div className="w-full max-w-md flex flex-col gap-4">
      <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
        <Radio className="w-3.5 h-3.5 text-cyan-400" />
        <span>Live Ingestion: Public Telegram Channel Monitor</span>
      </div>

      {/* Provenance / ethics banner */}
      <div className="p-3 bg-cyan-950/15 border border-cyan-500/25 rounded text-[11px] text-cyan-300/90 font-mono leading-relaxed">
        Reads the <span className="font-bold">public web preview</span> of Telegram channels
        (t.me/s/…) — no login, no bot, read-only. Flagged posts flow into the Audit Registry
        tagged <span className="font-bold">Live Feed</span>.
      </div>

      {/* Live counters */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Screened', value: stats.screened, cls: 'text-slate-200' },
          { label: 'Flagged', value: stats.flagged, cls: 'text-red-400' },
          { label: 'Flag Rate', value: `${flagRate}%`, cls: 'text-amber-400' },
        ].map(k => (
          <div key={k.label} className="bg-[#111318] border border-slate-800 rounded p-2.5 text-center">
            <div className={`text-xl font-black font-mono ${k.cls}`}>{k.value}</div>
            <div className="text-[8px] font-mono uppercase tracking-wider text-slate-500 mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Run controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={running ? stop : start}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded font-mono text-xs font-bold uppercase tracking-wider transition-all ${
            running
              ? 'bg-red-950/30 text-red-400 border border-red-500/30 hover:bg-red-950/50'
              : 'bg-cyan-500 text-[#04121a] hover:bg-cyan-400'
          }`}
        >
          {running ? <><Pause className="w-4 h-4" /> Pause Monitor</> : <><Play className="w-4 h-4" /> Start Monitor</>}
        </button>
        <button
          type="button"
          onClick={resetCursors}
          title="Rewind cursors and re-screen from the top"
          className="p-2.5 rounded border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-all"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-wider text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-cyan-400 animate-pulse' : 'bg-slate-600'}`} />
          {running ? 'Monitoring' : 'Idle'}
        </span>
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Last poll {relTime(lastPollAt)}</span>
      </div>

      {usingSnapshot && (
        <div className="text-[10px] font-mono text-amber-400/80 bg-amber-950/15 border border-amber-500/20 rounded p-2">
          Live fetch unavailable — replaying bundled channel snapshot.
        </div>
      )}

      {/* Channel manager */}
      <div className="bg-[#111318] border border-slate-800 rounded p-3 space-y-2.5 font-mono text-xs">
        <div className="border-b border-slate-800 pb-2 flex items-center justify-between">
          <h4 className="font-bold text-slate-300 uppercase text-[11px]">Watched Channels</h4>
          <span className="text-[9px] text-slate-500">{channels.filter(c => c.active).length}/{channels.length} active</span>
        </div>

        {channels.map(ch => (
          <div key={ch.username} className="flex items-center justify-between p-2 bg-[#0a0c12] border border-slate-800 rounded">
            <div className="min-w-0">
              <div className="font-bold text-slate-300 truncate">@{ch.username}</div>
              <div className="text-[9px] text-slate-500 truncate">{ch.title}</div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => toggleChannel(ch.username)}
                className={`px-2 py-0.5 rounded text-[9px] font-bold border ${
                  ch.active
                    ? 'bg-cyan-950/30 text-cyan-400 border-cyan-500/30'
                    : 'bg-slate-900 text-slate-500 border-slate-700'
                }`}
              >
                {ch.active ? 'ACTIVE' : 'PAUSED'}
              </button>
              <button
                type="button"
                onClick={() => removeChannel(ch.username)}
                className="p-1 text-slate-600 hover:text-red-400 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}

        <form onSubmit={handleAdd} className="flex items-center gap-1.5 pt-1">
          <div className="flex items-center flex-1 bg-[#0a0c12] border border-slate-800 rounded px-2">
            <span className="text-slate-600">@</span>
            <input
              value={newChannel}
              onChange={(e) => setNewChannel(e.target.value)}
              placeholder="public_channel_username"
              className="flex-1 bg-transparent py-1.5 px-1 text-slate-200 text-xs outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={adding || !newChannel.trim()}
            className="p-2 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition-all"
          >
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          </button>
        </form>
        {addError && <div className="text-[10px] text-red-400">{addError}</div>}

        {/* Honest roadmap — other sources not yet built */}
        <div className="pt-1 space-y-1 opacity-50">
          {['Instagram hashtag ingestion', 'TikTok Business Graph webhook'].map(s => (
            <div key={s} className="flex items-center justify-between text-[9px] text-slate-500">
              <span>{s}</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">PLANNED</span>
            </div>
          ))}
        </div>
      </div>

      {/* Streaming console */}
      <div className="bg-[#0a0c12] border border-slate-800 rounded overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-800 flex items-center gap-2">
          <Send className="w-3 h-3 text-cyan-400" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">Ingestion Stream</span>
        </div>
        <div ref={logRef} className="h-48 overflow-y-auto p-2.5 font-mono text-[10px] space-y-1">
          {logs.length === 0 ? (
            <div className="text-slate-600 text-center py-8">Press Start Monitor to begin screening the public feed.</div>
          ) : logs.map((l, i) => {
            const color = l.type === 'flag' ? 'text-red-400'
              : l.type === 'success' ? 'text-slate-500'
              : l.type === 'error' ? 'text-amber-400'
              : 'text-cyan-400/80';
            const Icon = l.type === 'flag' ? AlertTriangle : l.type === 'success' ? CheckCircle2 : null;
            return (
              <div key={i} className={`flex items-start gap-1.5 ${color}`}>
                <span className="text-slate-700 flex-shrink-0">{l.time}</span>
                {Icon && <Icon className="w-3 h-3 flex-shrink-0 mt-0.5" />}
                <span className="break-words">{l.message}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Latest Ingested Post */}
      {latestPost && (
        <div className="bg-[#111318] border border-slate-800 rounded p-3.5 space-y-2 font-sans transition-all duration-300">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-450 font-bold">Latest Ingested Post</span>
            </div>
            <span className={`text-[10px] font-mono font-black px-2 py-0.5 rounded border ${
              latestPost.score >= 60 
                ? 'bg-red-500/15 border-red-500/25 text-red-400' 
                : latestPost.score >= 30 
                  ? 'bg-amber-500/15 border-amber-500/25 text-amber-400' 
                  : 'bg-emerald-500/15 border-emerald-500/25 text-emerald-405'
            }`}>
              {latestPost.score}% RISK
            </span>
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
            <span>📡 @{latestPost.channel}</span>
            <span>{new Date(latestPost.timestamp).toLocaleTimeString()}</span>
          </div>

          <div className="bg-[#0a0c12]/40 border border-slate-900 rounded p-2.5 max-h-32 overflow-y-auto text-xs font-mono text-slate-350 whitespace-pre-wrap leading-relaxed select-text">
            {latestPost.text}
          </div>
        </div>
      )}
    </div>
  );
}
