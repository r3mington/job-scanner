import React, { useState, useEffect } from 'react';
import { supabase, mapDbToRecord } from '../utils/supabaseClient';
import { Search, ChevronRight, ChevronDown, ChevronUp, AlertTriangle, Briefcase, MapPin, Folder, Trash2, Globe, DollarSign, Languages, FileText, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { getCleanContactValue } from './DashboardView';
import NetworkGraphView from '../components/NetworkGraphView';
import { calculateSimilarity } from '../utils/similarity';

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
  const s = score || 0;
  if (s >= 60) {
    return {
      border: 'border-red-500/20',
      hoverBorder: 'hover:border-red-500/40',
      text: 'text-red-400',
      bg: 'bg-red-950/20',
      glow: 'hover:shadow-[0_0_15px_-3px_rgba(239,68,68,0.12)]',
      pill: 'bg-red-500/10 border border-red-500/25 text-red-400'
    };
  }
  if (s >= 30) {
    return {
      border: 'border-amber-500/20',
      hoverBorder: 'hover:border-amber-500/40',
      text: 'text-amber-455',
      bg: 'bg-amber-950/20',
      glow: 'hover:shadow-[0_0_15px_-3px_rgba(245,158,11,0.10)]',
      pill: 'bg-amber-500/10 border border-amber-500/25 text-amber-400'
    };
  }
  return {
    border: 'border-[#3fb950]/20',
    hoverBorder: 'hover:border-[#3fb950]/40',
    text: 'text-[#3fb950]',
    bg: 'bg-[#3fb950]/5',
    glow: 'hover:shadow-[0_0_15px_-3px_rgba(63,185,80,0.10)]',
    pill: 'bg-[#3fb950]/10 border border-[#3fb950]/25 text-[#3fb950]'
  };
};

export default function HistoryView() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedBatches, setExpandedBatches] = useState([]);
  const [viewType, setViewType] = useState('list'); // 'list', 'graph'
  const [scans, setScans] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showBriefing, setShowBriefing] = useState(() => {
    const saved = localStorage.getItem('sentinel_show_history_briefing');
    return saved !== 'false';
  });

  const fetchScans = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('scans')
        .select('*')
        .order('timestamp', { ascending: false });

      if (error) throw error;
      setScans((data || []).map(mapDbToRecord));
    } catch (err) {
      console.error("Error fetching scans:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
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

  const getSimilarCount = (targetScan) => {
    if (!scans || !targetScan.normalizedText) return 0;
    return scans.filter(s => s.id !== targetScan.id && s.normalizedText && calculateSimilarity(targetScan.normalizedText, s.normalizedText) > 0.40).length;
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
  const getGroupedScans = () => {
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

    return groups.sort((a, b) => b.timestamp - a.timestamp);
  };

  const groupedScans = getGroupedScans();

  return (
    <div className={`flex flex-col flex-1 h-full mt-4 w-full mx-auto transition-all ${viewType === 'list' ? 'max-w-lg' : 'max-w-screen-md'}`}>
      
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
                This console acts as a secure, local repository of your scanned jobs and ingested batches. Review historical risk trends, investigate threat dossiers, and track syndicates.
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
            className="w-full pl-10 pr-4 py-2.5 bg-[#0a0c12] border border-slate-800 rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 transition-shadow text-slate-200"
          />
        </div>

        {/* View Toggle */}
        <div className="flex bg-[#0a0c12] border border-slate-800 p-0.5 rounded text-[10px] font-mono uppercase tracking-wider mt-3">
          <button
            onClick={() => setViewType('list')}
            className={`flex-1 py-1.5 rounded transition-all duration-200 ${viewType === 'list' ? 'bg-[#1b2230] text-amber-500 font-bold border border-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-300 font-medium'}`}
          >
            [ List View ]
          </button>
          <button
            onClick={() => setViewType('graph')}
            className={`flex-1 py-1.5 rounded transition-all duration-200 ${viewType === 'graph' ? 'bg-[#1b2230] text-amber-500 font-bold border border-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-300 font-medium'}`}
          >
            [ Connections Graph ]
          </button>
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
                        <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded">
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
                              {batchItems.length} scans • Avg Risk: <span className={avgScore >= 60 ? 'text-red-500 font-bold' : avgScore >= 30 ? 'text-amber-500 font-bold' : 'text-[#3fb950] font-bold'}>{avgScore}%</span>
                            </p>
                            <button
                              onClick={(e) => handleDeleteBatch(e, group.batchId, group.batchName)}
                              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-0.5 px-2 py-0.5 rounded border border-red-500/25 bg-red-500/10 transition-colors mr-2 font-mono"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete
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
                                    <h4 className="font-bold text-slate-350 truncate text-sm group-hover:text-amber-400 transition-colors">
                                      {scan.jobTitle || 'Unknown Position'}
                                    </h4>
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
                                        <span className="text-[8px] text-[#3fb950] font-bold px-0.5 border border-[#3fb950]/20 rounded bg-[#3fb950]/5">
                                          TRANS
                                        </span>
                                      )}
                                    </span>
                                  )}
                                  {scan.notes && (
                                    <span className="flex items-center gap-0.5 text-amber-500/80" title="Has investigation notes">
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
                                        className="p-1 hover:bg-slate-800 text-amber-500 rounded transition-colors flex items-center gap-0.5 text-[9px] font-mono font-black bg-amber-500/10"
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
                                    <Trash2 className="w-3 h-3" />
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
                        <h3 className="font-bold text-slate-200 truncate text-base group-hover:text-amber-400 transition-colors">
                          {scan.jobTitle || 'Unknown Position'}
                        </h3>
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
                            <span className="text-[9px] text-[#3fb950] font-bold px-1 border border-[#3fb950]/20 rounded bg-[#3fb950]/5">
                              TRANS
                            </span>
                          )}
                        </span>
                      )}
                      {scan.notes && (
                        <span className="flex items-center gap-1 text-amber-500/80" title="Has investigation notes">
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
                            className="p-1.5 hover:bg-slate-800 text-amber-500 rounded transition-colors flex items-center gap-1 text-[10px] font-mono font-black bg-amber-500/10"
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
