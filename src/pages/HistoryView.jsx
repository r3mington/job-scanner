import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase, mapDbToRecord } from '../utils/supabaseClient';
import { Search, ChevronRight, ChevronDown, ChevronUp, Briefcase, MapPin, Folder, Trash2, Globe, DollarSign, FileText, List, Network, X, Send, Phone, Mail } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate, useLocation } from 'react-router-dom';
import { getCleanContactValue } from '../utils/caseHelpers';
import NetworkGraphView from '../components/NetworkGraphView';
import { prepareSimilarity, similarityFromPrepared } from '../utils/similarity';

const getStatusSortValue = (status) => {
  const s = status || 'pending';
  if (s === 'waiting_action') return 3;
  if (s === 'pending') return 2;
  if (s === 'reviewed') return 1;
  return 0;
};

const getGroupStatusVal = (group) => {
  if (group.isBatch) {
    const vals = group.items.map(item => getStatusSortValue(item.extractedData?.audit_status));
    return Math.max(...vals, 0);
  }
  return getStatusSortValue(group.scan.extractedData?.audit_status);
};

// Session cache: registry paints instantly on revisit, then refreshes in the
// background. Module-scoped so it survives route changes but not reloads.
let scansCache = null;

const formatSalary = (val) => {
  if (!val) return null;
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return val;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(num);
};

const getSeverityColors = () => {
  return {
    border: 'border-slate-800/80',
    hoverBorder: 'hover:border-amber-500/30 hover:bg-[#141822]',
    bg: 'bg-[#111318]',
    glow: '',
    text: 'text-slate-400',
    pill: 'bg-slate-900/40 border border-slate-800/80 text-slate-300'
  };
};

// Risk (content severity) — chip + bar colors keyed to the same thresholds as
// the review page, so the two surfaces read the same.
const riskChipClasses = (score) =>
  score >= 60 ? 'text-red-400 bg-red-500/10 border-red-500/30'
    : score >= 30 ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
      : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';

const riskBarColor = (score) =>
  score >= 60 ? 'bg-red-500' : score >= 30 ? 'bg-amber-500' : 'bg-[#3fb950]';

const getRiskBand = (score) =>
  score >= 60 ? { key: 'high', label: 'High risk' }
    : score >= 30 ? { key: 'medium', label: 'Medium risk' }
      : { key: 'low', label: 'Low risk' };

// Status (review workflow) — distinct color channel from risk.
const getStatusMeta = (status) => {
  const s = status || 'pending';
  if (s === 'waiting_action') return { key: 'waiting_action', label: 'Action Req', badge: 'text-red-400 bg-red-500/10 border-red-500/30', bar: 'bg-red-500' };
  if (s === 'reviewed') return { key: 'reviewed', label: 'Reviewed', badge: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', bar: 'bg-emerald-500' };
  return { key: 'pending', label: 'Pending', badge: 'text-amber-400 bg-amber-500/10 border-amber-500/30', bar: 'bg-amber-500' };
};

const renderStatusBadge = (status) => {
  const m = getStatusMeta(status);
  return (
    <span className="flex-shrink-0 px-1.5 py-0.5 border border-slate-800/80 bg-slate-900/40 text-slate-400 font-mono font-semibold rounded text-[8px] uppercase tracking-wider">
      {m.label}
    </span>
  );
};

const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };

const getTimeBucket = (ts) => {
  const diffDays = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / 86400000);
  if (diffDays <= 0) return { key: 'today', label: 'Today' };
  if (diffDays === 1) return { key: 'yesterday', label: 'Yesterday' };
  if (diffDays < 7) return { key: 'week', label: 'Earlier this week' };
  if (diffDays < 30) return { key: 'month', label: 'Earlier this month' };
  return { key: 'older', label: 'Older' };
};

const relTime = (ts) => {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); return `${d}d ago`;
};

// Row timestamps: relative while recent (how analysts think), absolute date
// once it stops being "recent". Full datetime lives in the title tooltip.
const listTime = (ts) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return format(new Date(ts), 'MMM d');
};

// Feed batch names arrive with a leading 📡 emoji baked in at ingestion time;
// strip it at render so the icon tile carries the meaning instead.
const stripLeadEmoji = (s) => (s || '').replace(/^[\p{Extended_Pictographic}️‍]+\s*/u, '');

const contactIconFor = (clean) => {
  const lc = (clean || '').toLowerCase();
  if (lc.startsWith('whatsapp')) return Phone;
  if (lc.startsWith('email')) return Mail;
  return Send;
};

function Stat({ label, value, accent, active, onClick, title, small }) {
  const accentText = accent === 'red' ? 'text-red-400' : accent === 'amber' ? 'text-amber-400' : accent === 'purple' ? 'text-purple-300' : 'text-slate-200';
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`text-left px-3 py-2 rounded border transition-colors ${onClick ? 'cursor-pointer' : 'cursor-default'} ${active ? 'border-amber-500/50 bg-amber-500/[0.07]' : 'border-transparent bg-slate-900/40 hover:bg-slate-900/70'}`}
    >
      <div className={`font-mono font-black ${small ? 'text-sm' : 'text-lg'} ${accentText}`}>{value}</div>
      <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500 mt-0.5 truncate">{label}</div>
    </button>
  );
}

export default function HistoryView() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedBatches, setExpandedBatches] = useState([]);
  // Open directly into the graph when navigated in to inspect a recruiter cluster.
  const [viewType, setViewType] = useState(location.state?.viewType === 'graph' ? 'graph' : 'list'); // 'list', 'graph'
  const [focusContact, setFocusContact] = useState(location.state?.focusContact || null);
  const [sortBy, setSortBy] = useState('date'); // 'date', 'status', 'risk'
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all', 'manual', 'feed'
  const [quickFilter, setQuickFilter] = useState('all'); // 'all', 'high', 'pending'
  const [scans, setScans] = useState(null);
  const [showLegend, setShowLegend] = useState(() => localStorage.getItem('sentinel_hide_history_legend') !== 'true');
  const [showBriefing, setShowBriefing] = useState(() => {
    const saved = localStorage.getItem('sentinel_show_history_briefing');
    return saved === 'true';
  });

  // Consume the one-shot navigation state so a refresh or back-nav doesn't
  // re-trigger the graph focus.
  useEffect(() => {
    if (location.state?.viewType || location.state?.focusContact) {
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchScans = async () => {
    try {
      // Select only list-level fields. extracted_data is a multi-KB JSONB blob
      // per row; the list only needs two of its subfields, so pull just those.
      const { data, error } = await supabase
        .from('scans')
        .select('id, timestamp, job_title, employer, risk_score, risk_level, location_country, parsed_salary_usd, detected_language, is_translated, source_platform, notes, batch_id, batch_name, user_id, ingestion_method, audit_status:extracted_data->>audit_status, contact_method:extracted_data->>contact_method')
        .order('timestamp', { ascending: false });

      if (error) throw error;
      const mapped = (data || []).map(d => {
        const rec = mapDbToRecord(d);
        // Real client returns the two aliased subfields; the mock client
        // ignores the select string and returns full rows with extracted_data.
        rec.extractedData = d.extracted_data || {
          audit_status: d.audit_status,
          contact_method: d.contact_method
        };
        return rec;
      });
      scansCache = mapped;
      setScans(mapped);
    } catch (err) {
      console.error("Error fetching scans:", err?.message || err);
    }
  };

  useEffect(() => {
    if (scansCache) {
      setScans(scansCache);
    }
    fetchScans();
  }, []);

  const isLiveFeed = (scan) => scan.ingestionMethod === 'Telegram Live Feed';
  const isUnreviewed = (scan) => {
    const st = scan.extractedData?.audit_status || 'pending';
    return st === 'pending' || st === 'waiting_action';
  };

  // Orientation stats over the whole registry (unfiltered) — the numbers teach
  // the mental model and double as one-click filters.
  const stats = useMemo(() => {
    const list = scans || [];
    const handleCounts = new Map();
    let lastIngest = 0;
    list.forEach(s => {
      const c = getCleanContactValue(s.extractedData?.contact_method);
      if (c) handleCounts.set(c, (handleCounts.get(c) || 0) + 1);
      if (s.timestamp > lastIngest) lastIngest = s.timestamp;
    });
    return {
      total: list.length,
      high: list.filter(s => s.riskScore >= 60).length,
      pending: list.filter(isUnreviewed).length,
      hubs: [...handleCounts.values()].filter(n => n >= 2).length,
      lastIngest
    };
  }, [scans]);

  const sourceCounts = useMemo(() => {
    const list = scans || [];
    const feed = list.filter(isLiveFeed).length;
    return { all: list.length, feed, manual: list.length - feed };
  }, [scans]);

  const filteredScans = scans?.filter(scan => {
    if (sourceFilter === 'feed' && !isLiveFeed(scan)) return false;
    if (sourceFilter === 'manual' && isLiveFeed(scan)) return false;
    if (quickFilter === 'high' && scan.riskScore < 60) return false;
    if (quickFilter === 'pending' && !isUnreviewed(scan)) return false;
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    const handle = (getCleanContactValue(scan.extractedData?.contact_method) || scan.extractedData?.contact_method || '').toLowerCase();
    return (
      (scan.jobTitle?.toLowerCase() || '').includes(q) ||
      (scan.employer?.toLowerCase() || '').includes(q) ||
      (scan.batchName?.toLowerCase() || '').includes(q) ||
      handle.includes(q)
    );
  });

  const toggleBatchExpand = (batchId) => {
    setExpandedBatches(prev => 
      prev.includes(batchId) ? prev.filter(id => id !== batchId) : [...prev, batchId]
    );
  };

  const handleDeleteBatch = async (e, batchId, batchName) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete the entire batch "${batchName}" and all of its associated scans?`)) {
      try {
        const { error } = await supabase
          .from('scans')
          .delete()
          .eq('batch_id', batchId);
          
        if (error) throw error;
        fetchScans();
      } catch (err) {
        console.error("Failed to delete batch:", err);
        alert("Failed to delete batch: " + (err.message || err.toString()));
      }
    }
  };

  const handleDeleteScan = async (e, scanId, jobTitle) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete the scan for "${jobTitle || 'this job'}"?`)) {
      try {
        const { error } = await supabase
          .from('scans')
          .delete()
          .eq('id', scanId);
          
        if (error) throw error;
        fetchScans();
      } catch (err) {
        console.error("Failed to delete scan:", err);
        alert("Failed to delete scan: " + (err.message || err.toString()));
      }
    }
  };

  // Similar-ads counts run off the critical path: the heavy normalized_text
  // column is fetched in a second query after the list has painted, each text
  // is prepared once, and the O(n²) pair loop yields to the event loop between
  // chunks so it never blocks interaction.
  const [similarityCounts, setSimilarityCounts] = useState({});
  const simSignatureRef = useRef('');

  useEffect(() => {
    if (!scans || scans.length < 2) return;
    // Skip recompute when the id set is unchanged (e.g. cache-then-refetch on mount)
    const signature = scans.map(s => s.id).join(',');
    if (signature === simSignatureRef.current) return;
    simSignatureRef.current = signature;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('scans')
        .select('id, normalized_text');
      if (error || !data || cancelled) return;

      const prepared = data
        .filter(r => r.normalized_text)
        .map(r => ({ id: r.id, prep: prepareSimilarity(r.normalized_text) }));

      const counts = {};
      const n = prepared.length;
      const PAIRS_PER_CHUNK = 2500;
      let i = 0;
      let j = 1;

      const step = () => {
        if (cancelled) return;
        let done = 0;
        while (i < n - 1 && done < PAIRS_PER_CHUNK) {
          const a = prepared[i];
          for (; j < n && done < PAIRS_PER_CHUNK; j++, done++) {
            if (similarityFromPrepared(a.prep, prepared[j].prep) > 0.40) {
              counts[a.id] = (counts[a.id] || 0) + 1;
              counts[prepared[j].id] = (counts[prepared[j].id] || 0) + 1;
            }
          }
          if (j >= n) {
            i++;
            j = i + 1;
          }
        }
        if (i < n - 1) {
          setTimeout(step, 0);
        } else {
          setSimilarityCounts(counts);
        }
      };
      step();
    })();

    return () => { cancelled = true; };
  }, [scans]);

  const getSimilarCount = (targetScan) => {
    return similarityCounts[targetScan.id] || 0;
  };

  const handleScanClick = (scan) => {
    navigate('/review', { 
      state: { 
        ...scan,
        isExistingScan: true
      } 
    });
  };



  // Group scans by batchId
  const groupedScans = useMemo(() => {
    if (!filteredScans) return [];

    const groups = [];
    const batchMap = new Map();

    filteredScans.forEach(scan => {
      if (scan.batchId) {
        if (batchMap.has(scan.batchId)) {
          const idx = batchMap.get(scan.batchId);
          groups[idx].items.push(scan);
          if (scan.timestamp > groups[idx].timestamp) {
            groups[idx].timestamp = scan.timestamp;
          }
        } else {
          const newGroup = {
            id: scan.batchId,
            isBatch: true,
            isLiveFeed: isLiveFeed(scan) || scan.batchId?.startsWith('tgfeed_'),
            batchId: scan.batchId,
            batchName: scan.batchName || 'Imported Batch',
            timestamp: scan.timestamp,
            items: [scan]
          };
          groups.push(newGroup);
          batchMap.set(scan.batchId, groups.length - 1);
        }
      } else {
        groups.push({
          id: `single_${scan.id}`,
          isBatch: false,
          timestamp: scan.timestamp,
          scan: scan
        });
      }
    });

    // Sort items inside batches first
    groups.forEach(g => {
      if (g.isBatch) {
        g.items.sort((a, b) => {
          if (sortBy === 'status') {
            const valA = getStatusSortValue(a.extractedData?.audit_status);
            const valB = getStatusSortValue(b.extractedData?.audit_status);
            if (valB !== valA) return valB - valA;
          } else if (sortBy === 'risk') {
            if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
          }
          return b.timestamp - a.timestamp;
        });
      }
    });

    // Sort the groups
    return groups.sort((a, b) => {
      if (sortBy === 'status') {
        const valA = getGroupStatusVal(a);
        const valB = getGroupStatusVal(b);
        if (valB !== valA) return valB - valA;
      } else if (sortBy === 'risk') {
        const scoreA = a.isBatch ? Math.round(a.items.reduce((acc, item) => acc + item.riskScore, 0) / a.items.length) : a.scan.riskScore;
        const scoreB = b.isBatch ? Math.round(b.items.reduce((acc, item) => acc + item.riskScore, 0) / b.items.length) : b.scan.riskScore;
        if (scoreB !== scoreA) return scoreB - scoreA;
      }
      return b.timestamp - a.timestamp;
    });
  }, [filteredScans, sortBy]);

  // Split the sorted groups into labelled sections. The active sort dimension
  // decides the section headers, so "sort" doubles as "group by".
  const sections = useMemo(() => {
    const scanCountOf = (g) => (g.isBatch ? g.items.length : 1);
    const metaFor = (g) => {
      if (sortBy === 'status') {
        const status = ({ 3: 'waiting_action', 2: 'pending', 1: 'reviewed', 0: 'pending' })[getGroupStatusVal(g)] || 'pending';
        const m = getStatusMeta(status);
        const label = m.key === 'waiting_action' ? 'Action required' : m.key === 'reviewed' ? 'Reviewed' : 'Pending review';
        return { key: 'st_' + m.key, label };
      }
      if (sortBy === 'risk') {
        const score = g.isBatch ? Math.round(g.items.reduce((a, i) => a + i.riskScore, 0) / g.items.length) : g.scan.riskScore;
        const b = getRiskBand(score);
        return { key: 'rk_' + b.key, label: b.label };
      }
      const b = getTimeBucket(g.timestamp);
      return { key: 'dt_' + b.key, label: b.label };
    };

    const map = new Map();
    const order = [];
    groupedScans.forEach(g => {
      const { key, label } = metaFor(g);
      if (!map.has(key)) { map.set(key, { key, label, groups: [], scanCount: 0 }); order.push(key); }
      const sec = map.get(key);
      sec.groups.push(g);
      sec.scanCount += scanCountOf(g);
    });
    return order.map(k => map.get(k));
  }, [groupedScans, sortBy]);

  const dismissLegend = () => {
    setShowLegend(false);
    localStorage.setItem('sentinel_hide_history_legend', 'true');
  };

  return (
    <div className="flex flex-col flex-1 h-full mt-4 w-full mx-auto transition-all max-w-screen-md">
      
      {/* System Briefing / Onboarding Panel */}
      <div className="bg-[#0a0c12] border border-slate-800 rounded mb-4 overflow-hidden transition-all duration-300">
        <button
          type="button"
          onClick={() => {
            const nextState = !showBriefing;
            setShowBriefing(nextState);
            localStorage.setItem('sentinel_show_history_briefing', String(nextState));
          }}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[#1b2230]/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
              System Briefing: History Console & Audit Log
            </h2>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-500 uppercase">
            <span>{showBriefing ? 'Hide Briefing' : 'Show Briefing'}</span>
            {showBriefing ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </div>
        </button>

        {showBriefing && (
          <div className="p-4 border-t border-slate-800 bg-[#0a0c12]/40 text-xs font-mono space-y-4 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:space-y-0">
            <div className="space-y-2">
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                Audit Trail Overview
              </div>
              <p className="text-slate-400 leading-relaxed">
                This console acts as a secure, local repository of your scanned jobs and ingested batches. Review historical risk trends, investigate risk profiles, and track syndicates.
              </p>
            </div>
            
            <div className="space-y-2">
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                Interface Operations
              </div>
              <ul className="space-y-1 text-slate-400">
                <li className="flex items-start gap-2">
                  <span className="text-amber-500/80">•</span>
                  <span><strong>List View:</strong> Displays nested batch structures and chronological timelines.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-500/80">•</span>
                  <span><strong>Connections Graph:</strong> Maps shared burner handles to visually isolate syndicate networks.</span>
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Orientation stats — what this page is, at a glance. Each is a filter. */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
        <Stat
          label="Cases"
          value={stats.total}
          active={quickFilter === 'all' && sourceFilter === 'all'}
          onClick={() => { setQuickFilter('all'); setSourceFilter('all'); }}
          title="Show all cases"
        />
        <Stat
          label="High risk"
          value={stats.high}
          accent="red"
          active={quickFilter === 'high'}
          onClick={() => setQuickFilter(quickFilter === 'high' ? 'all' : 'high')}
          title="Filter to risk 60+"
        />
        <Stat
          label="Pending review"
          value={stats.pending}
          accent="amber"
          active={quickFilter === 'pending'}
          onClick={() => setQuickFilter(quickFilter === 'pending' ? 'all' : 'pending')}
          title="Filter to unreviewed cases"
        />
        <Stat
          label="Recruiter hubs"
          value={stats.hubs}
          accent="purple"
          onClick={() => setViewType('graph')}
          title="Open the connections graph"
        />
        <Stat
          label="Last ingest"
          value={relTime(stats.lastIngest)}
          small
          title={stats.lastIngest ? new Date(stats.lastIngest).toLocaleString() : 'No scans yet'}
        />
      </div>

      {/* First-visit legend — plain row, part of the flat chrome zone */}
      {showLegend && (
        <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 mb-4 px-1 text-[10px] font-mono text-slate-500">
          <span className="text-slate-400 font-bold uppercase tracking-wider">Legend</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> risk 60+ high</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> 30–59 medium</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#3fb950]" /> under 30 low</span>
          <button onClick={dismissLegend} title="Dismiss" className="ml-auto p-0.5 hover:text-slate-300 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search + controls — flat chrome, no card wrapper: bordered cards below
          are reserved for cases so "card = case" reads instantly. */}
      <div className="mb-5">
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search title, employer, or @handle…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-[#0a0c12] border border-slate-800 rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-slate-700 transition-shadow text-slate-200"
          />
        </div>

        {/* View Toggle & Sort Options */}
        <div className="flex flex-wrap items-center mt-3 text-[10px] font-mono uppercase tracking-wider gap-3">
          <div className="inline-flex bg-[#0a0c12] border border-slate-800 p-0.5 rounded">
            <button
              onClick={() => { setViewType('list'); setFocusContact(null); }}
              className={`flex items-center justify-center gap-1.5 px-4 py-1.5 rounded whitespace-nowrap transition-all duration-200 ${viewType === 'list' ? 'bg-slate-800 text-amber-500 font-bold border border-slate-700 shadow-md' : 'text-slate-400 hover:text-white font-medium border border-transparent'}`}
            >
              <List className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
            <button
              onClick={() => setViewType('graph')}
              className={`flex items-center justify-center gap-1.5 px-4 py-1.5 rounded whitespace-nowrap transition-all duration-200 ${viewType === 'graph' ? 'bg-slate-800 text-amber-500 font-bold border border-slate-700 shadow-md' : 'text-slate-400 hover:text-white font-medium border border-transparent'}`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>Graph</span>
            </button>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-1.5 bg-[#0a0c12] border border-slate-800 rounded px-2.5 py-2">
            <span className="text-slate-500 font-bold">SOURCE:</span>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="bg-transparent border-0 rounded p-0 text-[10px] font-mono font-bold text-slate-300 focus:outline-none cursor-pointer outline-none"
            >
              <option value="all" className="text-slate-300 bg-[#0d1117]">ALL SOURCES ({sourceCounts.all})</option>
              <option value="manual" className="text-slate-300 bg-[#0d1117]">MANUAL SCANS ({sourceCounts.manual})</option>
              <option value="feed" className="text-slate-300 bg-[#0d1117]">LIVE FEED ({sourceCounts.feed})</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-[#0a0c12] border border-slate-800 rounded px-2.5 py-2">
            <span className="text-slate-500 font-bold">SORT:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent border-0 rounded p-0 text-[10px] font-mono font-bold text-slate-300 focus:outline-none cursor-pointer outline-none"
            >
              <option value="date" className="text-slate-300 bg-[#0d1117]">DATE (NEWEST)</option>
              <option value="status" className="text-slate-300 bg-[#0d1117]">STATUS (ACTION REQ)</option>
              <option value="risk" className="text-slate-300 bg-[#0d1117]">RISK (HIGHEST)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Hinge line — labels where chrome ends and the case list begins */}
      {viewType === 'list' && filteredScans && filteredScans.length > 0 && (
        <div className="flex items-center gap-2 mb-3 px-1 text-[10px] font-mono uppercase tracking-wider text-slate-500">
          <span>Showing {filteredScans.length} case{filteredScans.length !== 1 ? 's' : ''}</span>
          <span className="text-slate-600">· sorted by {sortBy}</span>
          {(quickFilter !== 'all' || sourceFilter !== 'all' || searchQuery) && (
            <span className="text-amber-500/80">· filtered</span>
          )}
          <div className="flex-1 h-px bg-slate-800/70" />
        </div>
      )}

      {viewType === 'list' ? (
        <div className="flex-1 overflow-y-auto space-y-3 pb-4">
          {!filteredScans ? (
            <div className="text-center py-10 text-slate-500">Loading history...</div>
          ) : filteredScans.length === 0 ? (
            <div className="text-center py-10 text-slate-500 flex flex-col items-center">
               <Briefcase className="w-12 h-12 text-slate-700 mb-3" />
               <p>No saved scans found.</p>
            </div>
          ) : (
            sections.map(section => (
              <div key={section.key} className="space-y-3">
                <div className="sticky top-16 md:top-0 z-[5] flex items-center gap-2 px-1 py-1.5 bg-[#0d1117]/95 backdrop-blur-sm">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">{section.label}</span>
                  <span className="text-[10px] font-mono text-slate-600">· {section.scanCount} case{section.scanCount !== 1 ? 's' : ''}</span>
                  <div className="flex-1 h-px bg-slate-800/60" />
                </div>
                {section.groups.map(group => {
              if (group.isBatch) {
                const batchItems = group.items;
                const isExpanded = expandedBatches.includes(group.batchId);
                const avgScore = Math.round(batchItems.reduce((acc, item) => acc + item.riskScore, 0) / batchItems.length);
                
                return (
                  <div key={group.id} className="bg-[#111318] rounded border border-slate-800 overflow-hidden transition-all">
                    <div 
                      onClick={() => toggleBatchExpand(group.batchId)}
                      className="p-4 flex items-center justify-between cursor-pointer hover:bg-[#1b2230]/40 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`p-2.5 rounded ${group.isLiveFeed ? 'bg-sky-500/10 text-sky-400' : 'bg-slate-800/40 text-slate-400'}`}>
                          {group.isLiveFeed ? <Send className="w-5 h-5" /> : <Folder className="w-5 h-5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <h3 className="font-bold text-slate-200 truncate text-base flex items-center gap-2">
                              {stripLeadEmoji(group.batchName)}
                              <span className={`flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider ${group.isLiveFeed ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30' : 'bg-slate-800/60 text-slate-400 border border-slate-700/60'}`}>
                                {group.isLiveFeed ? <Send className="w-2.5 h-2.5" /> : <Folder className="w-2.5 h-2.5" />}
                                {group.isLiveFeed ? 'Feed Batch' : 'Batch'}
                              </span>
                            </h3>
                            <span className="text-xs text-slate-500 font-mono whitespace-nowrap pt-1" title={format(new Date(group.timestamp), 'yyyy-MM-dd HH:mm')}>
                              {listTime(group.timestamp)}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-medium font-mono">
                            <span>{batchItems.length} scans</span>
                            <span className={`text-[10px] font-mono font-black px-1.5 py-0.5 rounded border ${riskChipClasses(avgScore)}`}>
                              AVG {avgScore}
                            </span>
                            {/* Per-scan risk distribution — an average hides outliers */}
                            <span className="flex items-end gap-[2px]" title="Per-scan risk distribution">
                              {batchItems.slice(0, 20).map(item => (
                                <span key={item.id} className={`w-[3px] h-2.5 rounded-sm ${riskBarColor(item.riskScore)}`} />
                              ))}
                              {batchItems.length > 20 && (
                                <span className="text-[9px] text-slate-600 ml-0.5">+{batchItems.length - 20}</span>
                              )}
                            </span>
                            <span className="text-slate-600">· {isExpanded ? 'tap to collapse' : `tap to expand ${batchItems.length}`}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={(e) => handleDeleteBatch(e, group.batchId, group.batchName)}
                          title="Delete Batch"
                          className="p-1.5 hover:bg-red-500/10 text-slate-600 hover:text-red-400 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => toggleBatchExpand(group.batchId)}
                          className="p-1 rounded"
                          title={isExpanded ? 'Collapse batch' : 'Expand batch'}
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-slate-400" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-slate-500" />
                          )}
                        </button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-slate-800 bg-[#0a0c12] pl-8 pr-4 py-4 relative flex flex-col gap-3">
                        {/* Vertical timeline dashed thread */}
                        <div className="absolute left-[20px] top-0 bottom-0 border-l border-dashed border-slate-800 pointer-events-none" />
                        
                        {batchItems.map(scan => {
                          const subSev = getSeverityColors(scan.riskScore);
                          return (
                            <div 
                              key={scan.id}
                              onClick={() => handleScanClick(scan)}
                              className={`group relative bg-[#111318] border ${subSev.border} ${subSev.hoverBorder} ${subSev.glow} rounded p-3.5 transition-all duration-300 active:scale-[0.99] cursor-pointer flex gap-4 ml-2`}
                            >
                              {/* Connector dot */}
                              <div className={`absolute -left-[22px] top-1/2 -translate-y-1/2 w-2 h-2 rounded border border-[#111318] ${riskBarColor(scan.riskScore)}`} />

                              {/* Left: risk chip */}
                              <div className="flex flex-col items-center flex-shrink-0 select-none pt-0.5">
                                <span className={`text-[11px] font-mono font-black px-1.5 py-0.5 rounded border ${riskChipClasses(scan.riskScore)}`}>
                                  {scan.riskScore || 0}
                                </span>
                              </div>
                              
                              {/* Center details */}
                              <div className="flex-1 min-w-0 flex flex-col justify-between">
                                <div>
                                  <div className="flex items-start justify-between gap-2 mb-1">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <h4 className="font-bold text-slate-350 truncate text-sm group-hover:text-slate-100 transition-colors">
                                        {scan.jobTitle || 'Unknown Position'}
                                      </h4>
                                      {renderStatusBadge(scan.extractedData?.audit_status)}
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                    <Briefcase className="w-3 h-3 flex-shrink-0 text-slate-500" />
                                    <span className="truncate">{scan.employer || 'Unknown Employer'}</span>
                                  </div>
                                </div>
                                
                                {/* Metadata Row */}
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 text-[10px] font-mono text-slate-500 border-t border-slate-800 pt-2">
                                  {scan.locationCountry && (
                                    <span className="flex items-center gap-0.5">
                                      <MapPin className="w-3 h-3 text-slate-500 flex-shrink-0" />
                                      <span>{scan.locationCountry}</span>
                                    </span>
                                  )}
                                  {scan.parsedSalaryUsd && (
                                    <span className="flex items-center gap-0.5 text-slate-400">
                                      <DollarSign className="w-3 h-3 flex-shrink-0" />
                                      <span>{formatSalary(scan.parsedSalaryUsd)}/mo</span>
                                    </span>
                                  )}
                                  {scan.sourcePlatform && scan.sourcePlatform !== 'unspecified' && (
                                    <span className="flex items-center gap-0.5">
                                      <span className="px-1.5 py-0.5 border border-slate-800 text-[8px] font-mono font-bold text-slate-500 rounded uppercase bg-[#0a0c12]">
                                        {scan.sourcePlatform}
                                      </span>
                                    </span>
                                  )}
                                  {scan.detectedLanguage && (
                                    <span className="flex items-center gap-0.5">
                                      <Globe className="w-3 h-3 text-slate-500 flex-shrink-0" />
                                      <span>{scan.detectedLanguage.toUpperCase()}</span>
                                      {scan.isTranslated && (
                                        <span className="text-[8px] text-slate-450 font-bold px-0.5 border border-slate-800 rounded bg-[#0a0c12]">
                                          TRANS
                                        </span>
                                      )}
                                    </span>
                                  )}
                                  {scan.notes && (
                                    <span className="flex items-center gap-0.5 text-slate-400" title="Has investigation notes">
                                      <FileText className="w-3 h-3 flex-shrink-0" />
                                      <span>NOTES</span>
                                    </span>
                                  )}
                                </div>

                                {/* Recruiter contact — click through to the dossier */}
                                {scan.extractedData?.contact_method && (() => {
                                  const clean = getCleanContactValue(scan.extractedData.contact_method) || scan.extractedData.contact_method;
                                  const display = clean.includes(':') ? clean.split(':').slice(1).join(':').trim() : clean;
                                  const CIcon = contactIconFor(clean);
                                  return (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); navigate(`/poster/${encodeURIComponent(clean)}`); }}
                                        title="Open recruiter dossier"
                                        className="flex items-center gap-1 text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded border border-slate-800 text-slate-400 bg-slate-900/50 hover:text-sky-300 hover:border-sky-500/40 transition-colors"
                                      >
                                        <CIcon className="w-2.5 h-2.5" />
                                        {display}
                                      </button>
                                    </div>
                                  );
                                })()}
                              </div>
                              
                              {/* Right side actions */}
                              <div className="flex flex-col justify-between items-end flex-shrink-0 opacity-45 group-hover:opacity-100 transition-opacity duration-200" onClick={e => e.stopPropagation()}>
                                <div onClick={() => handleScanClick(scan)} className="cursor-pointer p-1 rounded hover:bg-[#1b2230] text-slate-500 hover:text-slate-350 transition-colors">
                                  <ChevronRight className="w-4 h-4" />
                                </div>

                                <div className="flex items-center gap-1">
                                  {(() => {
                                    const simCount = getSimilarCount(scan);
                                    return simCount > 0 ? (
                                      <button
                                        onClick={() => handleScanClick(scan)}
                                        title={`Find Similar Ads (${simCount} found)`}
                                        className="p-1 hover:bg-slate-800 text-slate-300 rounded transition-colors flex items-center gap-0.5 text-[9px] font-mono font-black bg-slate-800/40"
                                      >
                                        <Search className="w-3 h-3" />
                                        <span>{simCount}</span>
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handleScanClick(scan)}
                                        title="Check Similar Ads"
                                        className="p-1 hover:bg-slate-800 text-slate-550 hover:text-slate-350 rounded transition-colors"
                                      >
                                        <Search className="w-3 h-3" />
                                      </button>
                                    );
                                  })()}
                                  
                                  <button
                                    onClick={(e) => handleDeleteScan(e, scan.id, scan.jobTitle)}
                                    title="Delete Scan"
                                    className="p-1 hover:bg-red-500/10 text-slate-500 hover:text-red-400 rounded transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }
              const { scan } = group;
              const sev = getSeverityColors(scan.riskScore);
              return (
                <div 
                  key={group.id} 
                  onClick={() => handleScanClick(scan)}
                  className={`group relative bg-[#111318] border ${sev.border} ${sev.hoverBorder} ${sev.glow} rounded p-4 transition-all duration-300 active:scale-[0.99] cursor-pointer flex gap-4`}
                >
                  {/* Left: risk chip (content severity) */}
                  <div className="flex flex-col items-center gap-1 flex-shrink-0 select-none pt-0.5">
                    <span className={`text-sm font-mono font-black px-2 py-1 rounded border ${riskChipClasses(scan.riskScore)}`}>
                      {scan.riskScore || 0}
                    </span>
                    <span className="text-[7px] font-mono uppercase tracking-widest text-slate-600 font-bold">Risk</span>
                  </div>
                  
                  {/* Center details */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <h3 className="font-bold text-slate-200 truncate text-base group-hover:text-slate-100 transition-colors">
                            {scan.jobTitle || 'Unknown Position'}
                          </h3>
                          {renderStatusBadge(scan.extractedData?.audit_status)}
                        </div>
                        <span className="text-xs text-slate-500 font-mono whitespace-nowrap pt-0.5" title={format(new Date(scan.timestamp), 'yyyy-MM-dd HH:mm')}>
                          {listTime(scan.timestamp)}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1.5 text-sm text-slate-500">
                        <Briefcase className="w-3.5 h-3.5 flex-shrink-0 text-slate-500" />
                        <span className="truncate">{scan.employer || 'Unknown Employer'}</span>
                      </div>
                    </div>
                    
                    {/* Metadata Row */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs font-mono text-slate-500 border-t border-slate-800 pt-2.5">
                      {scan.locationCountry && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                          <span>{scan.locationCountry}</span>
                        </span>
                      )}
                      {scan.parsedSalaryUsd && (
                        <span className="flex items-center gap-1 text-slate-400">
                          <DollarSign className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{formatSalary(scan.parsedSalaryUsd)}/mo</span>
                        </span>
                      )}
                      {scan.sourcePlatform && scan.sourcePlatform !== 'unspecified' && (
                        <span className="flex items-center gap-1">
                          <span className="px-1.5 py-0.5 border border-slate-800 text-[9px] font-mono font-bold text-slate-500 rounded uppercase bg-[#0a0c12]">
                            {scan.sourcePlatform}
                          </span>
                        </span>
                      )}
                      {scan.detectedLanguage && (
                        <span className="flex items-center gap-1">
                          <Globe className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                          <span>{scan.detectedLanguage.toUpperCase()}</span>
                          {scan.isTranslated && (
                            <span className="text-[9px] text-slate-450 font-bold px-1 border border-slate-800 rounded bg-[#0a0c12]">
                               TRANS
                             </span>
                           )}
                         </span>
                       )}
                       {scan.notes && (
                         <span className="flex items-center gap-1 text-slate-400" title="Has investigation notes">
                           <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                           <span>NOTES</span>
                         </span>
                      )}
                    </div>

                    {/* Recruiter contact — click through to the dossier */}
                    {scan.extractedData?.contact_method && (() => {
                      const clean = getCleanContactValue(scan.extractedData.contact_method) || scan.extractedData.contact_method;
                      const display = clean.includes(':') ? clean.split(':').slice(1).join(':').trim() : clean;
                      const CIcon = contactIconFor(clean);
                      return (
                        <div className="mt-2.5 flex flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); navigate(`/poster/${encodeURIComponent(clean)}`); }}
                            title="Open recruiter dossier"
                            className="flex items-center gap-1 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border border-slate-800 text-slate-400 bg-slate-900/50 hover:text-sky-300 hover:border-sky-500/40 transition-colors"
                          >
                            <CIcon className="w-2.5 h-2.5" />
                            {display}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                  
                  {/* Right side actions */}
                  <div className="flex flex-col justify-between items-end flex-shrink-0 opacity-45 group-hover:opacity-100 transition-opacity duration-200" onClick={e => e.stopPropagation()}>
                    <div onClick={() => handleScanClick(scan)} className="cursor-pointer p-1 rounded hover:bg-[#1b2230] text-slate-500 hover:text-slate-350 transition-colors">
                      <ChevronRight className="w-5 h-5" />
                    </div>

                    <div className="flex items-center gap-1">
                      {(() => {
                        const simCount = getSimilarCount(scan);
                        return simCount > 0 ? (
                          <button
                            onClick={() => handleScanClick(scan)}
                            title={`Find Similar Ads (${simCount} found)`}
                            className="p-1.5 hover:bg-slate-800 text-slate-300 rounded transition-colors flex items-center gap-1 text-[10px] font-mono font-black bg-slate-800/40"
                          >
                            <Search className="w-3.5 h-3.5" />
                            <span>{simCount}</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleScanClick(scan)}
                            title="Check Similar Ads"
                            className="p-1.5 hover:bg-slate-800 text-slate-500 hover:text-slate-350 rounded transition-colors"
                          >
                            <Search className="w-3.5 h-3.5" />
                          </button>
                        );
                      })()}
                      
                      <button
                        onClick={(e) => handleDeleteScan(e, scan.id, scan.jobTitle)}
                        title="Delete Scan"
                        className="p-1.5 hover:bg-red-500/10 text-slate-500 hover:text-red-400 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
                })}
              </div>
            ))
          )}
        </div>
      ) : (
        <NetworkGraphView scans={filteredScans || []} focusContact={focusContact} />
      )}
    </div>
  );
}
