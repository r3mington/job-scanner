import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase, mapDbToRecord } from '../utils/supabaseClient';
import { Search, ChevronRight, ChevronDown, ChevronUp, AlertTriangle, Briefcase, MapPin, Folder, Trash2, Globe, DollarSign, Languages, FileText, ShieldAlert, List, Network } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { getCleanContactValue } from './DashboardView';
import NetworkGraphView from '../components/NetworkGraphView';
import { prepareSimilarity, similarityFromPrepared } from '../utils/similarity';

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

const getSeverityColors = (score) => {
  return {
    border: 'border-slate-800/80',
    hoverBorder: 'hover:border-slate-700/80',
    bg: 'bg-[#111318]',
    glow: '',
    text: 'text-slate-400',
    pill: 'bg-slate-900/40 border border-slate-800/80 text-slate-300'
  };
};

const renderStatusBadge = (status) => {
  const s = status || 'pending';
  let text = 'Pending';
  if (s === 'reviewed') text = 'Reviewed';
  if (s === 'waiting_action') text = 'Action Req';

  return (
    <span className="flex-shrink-0 px-1.5 py-0.5 bg-slate-900/40 border border-slate-800/80 text-slate-400 font-mono font-semibold rounded text-[8px] uppercase tracking-wider">
      {text}
    </span>
  );
};

export default function HistoryView() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedBatches, setExpandedBatches] = useState([]);
  const [viewType, setViewType] = useState('list'); // 'list', 'graph'
  const [sortBy, setSortBy] = useState('date'); // 'date', 'status', 'risk'
  const [scans, setScans] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showBriefing, setShowBriefing] = useState(() => {
    const saved = localStorage.getItem('sentinel_show_history_briefing');
    return saved === 'true';
  });

  const fetchScans = async () => {
    try {
      if (!scansCache) setLoading(true);
      // Select only list-level fields. extracted_data is a multi-KB JSONB blob
      // per row; the list only needs two of its subfields, so pull just those.
      const { data, error } = await supabase
        .from('scans')
        .select('id, timestamp, job_title, employer, risk_score, risk_level, location_country, parsed_salary_usd, detected_language, is_translated, source_platform, notes, batch_id, batch_name, user_id, audit_status:extracted_data->>audit_status, contact_method:extracted_data->>contact_method')
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
      console.error("Error fetching scans:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (scansCache) {
      setScans(scansCache);
      setLoading(false);
    }
    fetchScans();
  }, []);

  const filteredScans = scans?.filter(scan => 
    (scan.jobTitle?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (scan.employer?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (scan.batchName?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

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

      <div className="bg-[#111318] p-4 rounded border border-slate-800 mb-4 sticky top-16 z-10">
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search scans by job or employer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-[#0a0c12] border border-slate-800 rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-slate-700 transition-shadow text-slate-200"
          />
        </div>

        {/* View Toggle & Sort Options */}
        <div className="flex items-center justify-between mt-3 text-[10px] font-mono uppercase tracking-wider gap-3">
          <div className="flex bg-[#0a0c12] border border-slate-800 p-0.5 rounded flex-1">
            <button
              onClick={() => setViewType('list')}
              className={`flex items-center justify-center gap-1.5 flex-1 py-1.5 rounded transition-all duration-200 ${viewType === 'list' ? 'bg-slate-800 text-amber-500 font-bold border border-slate-700 shadow-md' : 'text-slate-400 hover:text-white font-medium'}`}
            >
              <List className="w-3.5 h-3.5" />
              <span>List View</span>
            </button>
            <button
              onClick={() => setViewType('graph')}
              className={`flex items-center justify-center gap-1.5 flex-1 py-1.5 rounded transition-all duration-200 ${viewType === 'graph' ? 'bg-slate-800 text-amber-500 font-bold border border-slate-700 shadow-md' : 'text-slate-400 hover:text-white font-medium'}`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>Connections Graph</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 bg-[#0a0c12] border border-slate-800 rounded px-2.5 py-1">
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
            groupedScans.map(group => {
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
                        <div className="p-2.5 bg-slate-800/40 text-slate-400 rounded">
                          <Folder className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <h3 className="font-bold text-slate-200 truncate text-base">
                              {group.batchName}
                            </h3>
                            <span className="text-xs text-slate-500 font-mono whitespace-nowrap pt-1">
                              {format(new Date(group.timestamp), 'yyyy-MM-dd HH:mm')}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-slate-400 font-medium font-mono">
                              {batchItems.length} scans • Avg Risk: <span className="text-slate-300 font-bold">{avgScore}%</span>
                            </p>
                            <button
                              onClick={(e) => handleDeleteBatch(e, group.batchId, group.batchName)}
                              title="Delete Batch"
                              className="p-1.5 hover:bg-red-500/10 text-slate-500 hover:text-red-400 rounded transition-colors mr-2"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-slate-500 flex-shrink-0" />
                      )}
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
                              <div className={`absolute -left-[22px] top-1/2 -translate-y-1/2 w-2 h-2 rounded border border-[#111318] ${scan.riskScore >= 60 ? 'bg-red-500' : scan.riskScore >= 30 ? 'bg-amber-500' : 'bg-[#3fb950]'}`} />
                              
                              {/* Left severity indicator and score pill */}
                              <div className="flex flex-col items-center justify-center flex-shrink-0 select-none">
                                <div className={`w-10 h-10 rounded flex flex-col items-center justify-center ${subSev.pill} font-mono font-black text-xs`}>
                                  <span>{scan.riskScore || 0}%</span>
                                </div>
                                <div className={`w-0.5 h-6 mt-1.5 rounded-full ${scan.riskScore >= 60 ? 'bg-red-500' : scan.riskScore >= 30 ? 'bg-amber-500' : 'bg-[#3fb950]'}`} />
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

                                {/* Recruiter Contact Handle */}
                                {scan.extractedData?.contact_method && (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    <span className="text-[8px] font-mono font-bold tracking-wider px-1.5 py-0.5 rounded border border-slate-800 text-slate-400 bg-slate-900/50 uppercase">
                                      CONTACT: {getCleanContactValue(scan.extractedData.contact_method) || scan.extractedData.contact_method}
                                    </span>
                                  </div>
                                )}
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
                  {/* Left severity indicator and score pill */}
                  <div className="flex flex-col items-center justify-center flex-shrink-0 select-none">
                    <div className={`w-12 h-12 rounded flex flex-col items-center justify-center ${sev.pill} font-mono font-black text-sm`}>
                      <span>{scan.riskScore || 0}%</span>
                      <span className="text-[8px] uppercase tracking-wider font-bold">Risk</span>
                    </div>
                    <div className={`w-1 h-8 mt-2 rounded-full ${scan.riskScore >= 60 ? 'bg-red-500' : scan.riskScore >= 30 ? 'bg-amber-500' : 'bg-[#3fb950]'}`} />
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
                        <span className="text-xs text-slate-500 font-mono whitespace-nowrap pt-0.5">
                          {format(new Date(scan.timestamp), 'yyyy-MM-dd HH:mm')}
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

                    {/* Recruiter Contact Handle */}
                    {scan.extractedData?.contact_method && (
                      <div className="mt-2.5 flex flex-wrap gap-1">
                        <span className="text-[9px] font-mono font-bold tracking-wider px-1.5 py-0.5 rounded border border-slate-800 text-slate-400 bg-slate-900/50 uppercase">
                          CONTACT: {getCleanContactValue(scan.extractedData.contact_method) || scan.extractedData.contact_method}
                        </span>
                      </div>
                    )}
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
            })
          )}
        </div>
      ) : (
        <NetworkGraphView scans={filteredScans || []} />
      )}
    </div>
  );
}
