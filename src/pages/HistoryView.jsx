import React, { useState, useEffect } from 'react';
import { supabase, mapDbToRecord } from '../utils/supabaseClient';
import { Search, ChevronRight, ChevronDown, AlertTriangle, Briefcase, MapPin, Folder, Trash2, Globe, DollarSign, Languages, FileText, ShieldAlert } from 'lucide-react';
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
      border: 'border-red-500/20 dark:border-red-500/20',
      hoverBorder: 'hover:border-red-500/40 dark:hover:border-red-500/30',
      text: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-55/50 dark:bg-red-950/20',
      glow: 'glow-red hover:shadow-[0_0_15px_-3px_rgba(239,68,68,0.12)]',
      pill: 'bg-red-500/10 border border-red-500/25 text-red-500 dark:text-red-400'
    };
  }
  if (s >= 30) {
    return {
      border: 'border-amber-500/20 dark:border-amber-500/20',
      hoverBorder: 'hover:border-amber-500/40 dark:hover:border-amber-500/30',
      text: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-55/50 dark:bg-amber-950/20',
      glow: 'glow-amber hover:shadow-[0_0_15px_-3px_rgba(245,158,11,0.10)]',
      pill: 'bg-amber-500/10 border border-amber-500/25 text-amber-500 dark:text-amber-400'
    };
  }
  return {
    border: 'border-emerald-500/20 dark:border-emerald-500/20',
    hoverBorder: 'hover:border-emerald-500/40 dark:hover:border-emerald-500/30',
    text: 'text-emerald-600 dark:text-emerald-450',
    bg: 'bg-emerald-55/50 dark:bg-emerald-950/20',
    glow: 'glow-emerald hover:shadow-[0_0_15px_-3px_rgba(16,185,129,0.10)]',
    pill: 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 dark:text-emerald-400'
  };
};

export default function HistoryView() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedBatches, setExpandedBatches] = useState([]);
  const [viewType, setViewType] = useState('list'); // 'list', 'graph'
  const [scans, setScans] = useState(null);
  const [loading, setLoading] = useState(true);

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
      
      <div className="bg-white dark:bg-[#111318] p-4 rounded-lg border border-slate-200 dark:border-slate-800 mb-4 sticky top-16 z-10">
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search scans by job or employer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950/45 border border-slate-200 dark:border-slate-800 rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-shadow text-slate-900 dark:text-slate-100"
          />
        </div>

        {/* View Toggle */}
        <div className="flex bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-0.5 rounded-md text-[10px] font-mono uppercase tracking-wider mt-3">
          <button
            onClick={() => setViewType('list')}
            className={`flex-1 py-1.5 rounded transition-all duration-200 ${viewType === 'list' ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-bold border border-slate-200 dark:border-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350 font-medium'}`}
          >
            [ List View ]
          </button>
          <button
            onClick={() => setViewType('graph')}
            className={`flex-1 py-1.5 rounded transition-all duration-200 ${viewType === 'graph' ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-bold border border-slate-200 dark:border-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350 font-medium'}`}
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
               <Briefcase className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-3" />
               <p>No saved scans found.</p>
            </div>
          ) : (
            groupedScans.map(group => {
              if (group.isBatch) {
                const batchItems = group.items;
                const isExpanded = expandedBatches.includes(group.batchId);
                const avgScore = Math.round(batchItems.reduce((acc, item) => acc + item.riskScore, 0) / batchItems.length);
                
                return (
                  <div key={group.id} className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden transition-all">
                    <div 
                      onClick={() => toggleBatchExpand(group.batchId)}
                      className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 rounded-lg">
                          <Folder className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <h3 className="font-bold text-slate-900 dark:text-slate-100 truncate text-base">
                              {group.batchName}
                            </h3>
                            <span className="text-xs text-slate-400 dark:text-slate-500 font-mono whitespace-nowrap pt-1">
                              {format(new Date(group.timestamp), 'yyyy-MM-dd HH:mm')}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-slate-400 font-medium">
                              {batchItems.length} scans • Avg Risk: <span className={avgScore >= 60 ? 'text-red-500 font-bold' : avgScore >= 30 ? 'text-amber-500 font-bold' : 'text-emerald-500 font-bold'}>{avgScore}%</span>
                            </p>
                            <button
                              onClick={(e) => handleDeleteBatch(e, group.batchId, group.batchName)}
                              className="text-xs text-red-500 hover:text-red-600 flex items-center gap-0.5 px-2 py-0.5 rounded hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors mr-2"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                          </div>
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-slate-450 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0" />
                      )}
                    </div>                    {isExpanded && (
                      <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-55/30 dark:bg-slate-950/40 pl-8 pr-4 py-4 relative flex flex-col gap-3">
                        {/* Vertical timeline dashed thread */}
                        <div className="absolute left-[20px] top-0 bottom-0 border-l border-dashed border-slate-300 dark:border-slate-800 pointer-events-none" />
                        
                        {batchItems.map(scan => {
                          const subSev = getSeverityColors(scan.riskScore);
                          return (
                            <div 
                              key={scan.id}
                              onClick={() => handleScanClick(scan)}
                              className={`group relative bg-white dark:bg-[#111318] border ${subSev.border} ${subSev.hoverBorder} ${subSev.glow} rounded-lg p-3.5 transition-all duration-300 active:scale-[0.99] cursor-pointer flex gap-4 ml-2`}
                            >
                              {/* Connector dot */}
                              <div className={`absolute -left-[22px] top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-white dark:border-[#111318] ${scan.riskScore >= 60 ? 'bg-red-500' : scan.riskScore >= 30 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                              
                              {/* Left severity indicator and score pill */}
                              <div className="flex flex-col items-center justify-center flex-shrink-0 select-none">
                                <div className={`w-10 h-10 rounded-md flex flex-col items-center justify-center ${subSev.pill} font-mono font-black text-xs`}>
                                  <span>{scan.riskScore || 0}%</span>
                                </div>
                                <div className={`w-0.5 h-6 mt-1.5 rounded-full ${scan.riskScore >= 60 ? 'bg-red-500' : scan.riskScore >= 30 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                              </div>
                              
                              {/* Center details */}
                              <div className="flex-1 min-w-0 flex flex-col justify-between">
                                <div>
                                  <div className="flex items-start justify-between gap-2 mb-1">
                                    <h4 className="font-bold text-slate-800 dark:text-slate-205 truncate text-sm group-hover:text-emerald-550 dark:group-hover:text-emerald-400 transition-colors">
                                      {scan.jobTitle || 'Unknown Position'}
                                    </h4>
                                  </div>
                                  
                                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                    <Briefcase className="w-3 h-3 flex-shrink-0 text-slate-400" />
                                    <span className="truncate">{scan.employer || 'Unknown Employer'}</span>
                                  </div>
                                </div>
                                
                                {/* Metadata Row */}
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 text-[10px] font-mono text-slate-500 dark:text-slate-450 border-t border-slate-100 dark:border-slate-800/45 pt-2">
                                  {scan.locationCountry && (
                                    <span className="flex items-center gap-0.5">
                                      <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                      <span>{scan.locationCountry}</span>
                                    </span>
                                  )}
                                  {scan.parsedSalaryUsd && (
                                    <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                                      <DollarSign className="w-3 h-3 flex-shrink-0" />
                                      <span>{formatSalary(scan.parsedSalaryUsd)}/mo</span>
                                    </span>
                                  )}
                                  {scan.sourcePlatform && scan.sourcePlatform !== 'unspecified' && (
                                    <span className="flex items-center gap-0.5">
                                      <span className="px-1.5 py-0.5 border border-slate-200 dark:border-slate-805 text-[8px] font-mono font-bold text-slate-400 dark:text-slate-500 rounded uppercase bg-slate-50 dark:bg-slate-900/40">
                                        {scan.sourcePlatform}
                                      </span>
                                    </span>
                                  )}
                                  {scan.detectedLanguage && (
                                    <span className="flex items-center gap-0.5">
                                      <Globe className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                      <span>{scan.detectedLanguage.toUpperCase()}</span>
                                      {scan.isTranslated && (
                                        <span className="text-[8px] text-emerald-600 dark:text-emerald-400 font-bold px-0.5 border border-emerald-500/20 rounded bg-emerald-500/5">
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
                                    <span className="text-[8px] font-mono font-bold tracking-wider px-1.5 py-0.5 rounded border border-purple-500/20 text-purple-650 dark:text-purple-400 dark:border-purple-500/15 bg-purple-500/5 uppercase">
                                      CONTACT: {getCleanContactValue(scan.extractedData.contact_method) || scan.extractedData.contact_method}
                                    </span>
                                  </div>
                                )}
                              </div>
                              
                              {/* Right side actions */}
                              <div className="flex flex-col justify-between items-end flex-shrink-0 opacity-45 group-hover:opacity-100 transition-opacity duration-200" onClick={e => e.stopPropagation()}>
                                <div onClick={() => handleScanClick(scan)} className="cursor-pointer p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-650 transition-colors">
                                  <ChevronRight className="w-4 h-4" />
                                </div>

                                <div className="flex items-center gap-1">
                                  {(() => {
                                    const simCount = getSimilarCount(scan);
                                    return simCount > 0 ? (
                                      <button
                                        onClick={() => handleScanClick(scan)}
                                        title={`Find Similar Ads (${simCount} found)`}
                                        className="p-1 hover:bg-slate-200/50 dark:hover:bg-slate-850 text-amber-600 dark:text-amber-400 rounded transition-colors flex items-center gap-0.5 text-[9px] font-mono font-black bg-amber-50 dark:bg-amber-950/30"
                                      >
                                        <Search className="w-3 h-3" />
                                        <span>{simCount}</span>
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handleScanClick(scan)}
                                        title="Check Similar Ads"
                                        className="p-1 hover:bg-slate-150 dark:hover:bg-slate-850 text-slate-400 hover:text-slate-650 rounded transition-colors"
                                      >
                                        <Search className="w-3 h-3" />
                                      </button>
                                    );
                                  })()}
                                  
                                  <button
                                    onClick={(e) => handleDeleteScan(e, scan.id, scan.jobTitle)}
                                    title="Delete Scan"
                                    className="p-1 hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-450 hover:text-red-500 rounded transition-colors"
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
                  className={`group relative bg-white dark:bg-[#111318] border ${sev.border} ${sev.hoverBorder} ${sev.glow} rounded-lg p-4 transition-all duration-300 active:scale-[0.99] cursor-pointer flex gap-4`}
                >
                  {/* Left severity indicator and score pill */}
                  <div className="flex flex-col items-center justify-center flex-shrink-0 select-none">
                    <div className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center ${sev.pill} font-mono font-black text-sm`}>
                      <span>{scan.riskScore || 0}%</span>
                      <span className="text-[8px] uppercase tracking-wider font-bold">Risk</span>
                    </div>
                    <div className={`w-1 h-8 mt-2 rounded-full ${scan.riskScore >= 60 ? 'bg-red-500' : scan.riskScore >= 30 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  </div>
                  
                  {/* Center details */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-bold text-slate-900 dark:text-slate-100 truncate text-base group-hover:text-emerald-550 dark:group-hover:text-emerald-400 transition-colors">
                          {scan.jobTitle || 'Unknown Position'}
                        </h3>
                        <span className="text-xs text-slate-400 dark:text-slate-500 font-mono whitespace-nowrap pt-0.5">
                          {format(new Date(scan.timestamp), 'yyyy-MM-dd HH:mm')}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                        <Briefcase className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
                        <span className="truncate">{scan.employer || 'Unknown Employer'}</span>
                      </div>
                    </div>
                    
                    {/* Metadata Row */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs font-mono text-slate-500 dark:text-slate-450 border-t border-slate-100 dark:border-slate-800/60 pt-2.5">
                      {scan.locationCountry && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <span>{scan.locationCountry}</span>
                        </span>
                      )}
                      {scan.parsedSalaryUsd && (
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <DollarSign className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{formatSalary(scan.parsedSalaryUsd)}/mo</span>
                        </span>
                      )}
                      {scan.sourcePlatform && scan.sourcePlatform !== 'unspecified' && (
                        <span className="flex items-center gap-1">
                          <span className="px-1.5 py-0.5 border border-slate-200 dark:border-slate-805 text-[9px] font-mono font-bold text-slate-400 dark:text-slate-500 rounded uppercase bg-slate-50 dark:bg-slate-900/40">
                            {scan.sourcePlatform}
                          </span>
                        </span>
                      )}
                      {scan.detectedLanguage && (
                        <span className="flex items-center gap-1">
                          <Globe className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <span>{scan.detectedLanguage.toUpperCase()}</span>
                          {scan.isTranslated && (
                            <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold px-1 border border-emerald-500/20 rounded bg-emerald-500/5">
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
                        <span className="text-[9px] font-mono font-bold tracking-wider px-1.5 py-0.5 rounded border border-purple-500/20 text-purple-650 dark:text-purple-400 dark:border-purple-500/15 bg-purple-500/5 uppercase">
                          CONTACT: {getCleanContactValue(scan.extractedData.contact_method) || scan.extractedData.contact_method}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* Right side actions */}
                  <div className="flex flex-col justify-between items-end flex-shrink-0 opacity-45 group-hover:opacity-100 transition-opacity duration-200" onClick={e => e.stopPropagation()}>
                    <div onClick={() => handleScanClick(scan)} className="cursor-pointer p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-350 transition-colors">
                      <ChevronRight className="w-5 h-5" />
                    </div>

                    <div className="flex items-center gap-1">
                      {(() => {
                        const simCount = getSimilarCount(scan);
                        return simCount > 0 ? (
                          <button
                            onClick={() => handleScanClick(scan)}
                            title={`Find Similar Ads (${simCount} found)`}
                            className="p-1.5 hover:bg-slate-200/50 dark:hover:bg-slate-850 text-amber-600 dark:text-amber-400 rounded-md transition-colors flex items-center gap-1 text-[10px] font-mono font-black bg-amber-50 dark:bg-amber-950/30"
                          >
                            <Search className="w-3.5 h-3.5" />
                            <span>{simCount}</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleScanClick(scan)}
                            title="Check Similar Ads"
                            className="p-1.5 hover:bg-slate-150 dark:hover:bg-slate-850 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-md transition-colors"
                          >
                            <Search className="w-3.5 h-3.5" />
                          </button>
                        );
                      })()}
                      
                      <button
                        onClick={(e) => handleDeleteScan(e, scan.id, scan.jobTitle)}
                        title="Delete Scan"
                        className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-450 hover:text-red-500 rounded-md transition-colors"
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
