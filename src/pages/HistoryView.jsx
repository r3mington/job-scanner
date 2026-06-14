import React, { useState, useEffect } from 'react';
import { supabase, mapDbToRecord } from '../utils/supabaseClient';
import { Search, ChevronRight, ChevronDown, AlertTriangle, Briefcase, MapPin, Folder, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import NetworkGraphView from '../components/NetworkGraphView';
import { calculateSimilarity } from '../utils/similarity';

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
      
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 mb-4 sticky top-16 z-10">
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search scans by job or employer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-shadow text-slate-900 dark:text-slate-100"
          />
        </div>

        {/* View Toggle */}
        <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs mt-3">
          <button
            onClick={() => setViewType('list')}
            className={`flex-1 py-1.5 rounded-md font-bold transition-all ${viewType === 'list' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            List View
          </button>
          <button
            onClick={() => setViewType('graph')}
            className={`flex-1 py-1.5 rounded-md font-bold transition-all ${viewType === 'graph' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            Connections Graph
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
                            <span className="text-xs text-slate-500 whitespace-nowrap pt-1">
                              {format(new Date(group.timestamp), 'MMM d, yyyy')}
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
                    </div>

                    {isExpanded && (
                      <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 divide-y divide-slate-100 dark:divide-slate-800/50 px-4">
                        {batchItems.map(scan => (
                          <div 
                            key={scan.id}
                            onClick={() => handleScanClick(scan)}
                            className="py-3.5 flex items-center gap-3 cursor-pointer hover:bg-slate-100/30 dark:hover:bg-slate-800/30 transition-colors"
                          >
                            <div className={`w-2 h-10 rounded-full flex-shrink-0 ${scan.riskScore >= 60 ? 'bg-red-500' : scan.riskScore >= 30 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                            
                            <div className="flex-1 min-w-0">
                              <h4 className="font-bold text-slate-800 dark:text-slate-200 truncate text-sm">
                                {scan.jobTitle || 'Unknown Position'}
                              </h4>
                              <p className="text-xs text-slate-500 truncate flex items-center gap-1.5 mt-0.5">
                                <Briefcase className="w-3.5 h-3.5" /> {scan.employer || 'Unknown Employer'}
                              </p>
                            </div>
                            
                            {scan.activeFlags?.length > 0 && (
                              <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded-md flex-shrink-0 mr-1">
                                {scan.activeFlags.length} Flag{scan.activeFlags.length !== 1 ? 's' : ''}
                              </span>
                            )}
                            
                            <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                              {(() => {
                                const simCount = getSimilarCount(scan);
                                return simCount > 0 ? (
                                  <button
                                    onClick={() => handleScanClick(scan)}
                                    title={`Find Similar Ads (${simCount} found)`}
                                    className="p-1.5 hover:bg-slate-200/50 dark:hover:bg-slate-800 text-amber-600 dark:text-amber-400 rounded-lg transition-colors flex items-center gap-1 text-[10px] font-black bg-amber-50 dark:bg-amber-950/30"
                                  >
                                    <Search className="w-3.5 h-3.5" />
                                    <span>{simCount}</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleScanClick(scan)}
                                    title="Check Similar Ads"
                                    className="p-1.5 hover:bg-slate-200/50 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg transition-colors"
                                  >
                                    <Search className="w-3.5 h-3.5" />
                                  </button>
                                );
                              })()}
                              
                              <button
                                onClick={(e) => handleDeleteScan(e, scan.id, scan.jobTitle)}
                                title="Delete Scan"
                                className="p-1.5 hover:bg-slate-200/50 dark:hover:bg-slate-800 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            
                            <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0 cursor-pointer" onClick={() => handleScanClick(scan)} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              const { scan } = group;
              return (
                <div 
                  key={group.id} 
                  onClick={() => handleScanClick(scan)}
                  className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-4 active:scale-[0.98] transition-transform cursor-pointer hover:border-slate-300 dark:hover:border-slate-700"
                >
                  <div className={`w-3 h-16 rounded-full flex-shrink-0 ${scan.riskScore >= 60 ? 'bg-red-500' : scan.riskScore >= 30 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-bold text-slate-900 dark:text-slate-100 truncate text-base">
                        {scan.jobTitle || 'Unknown Position'}
                      </h3>
                      <span className="text-xs text-slate-500 whitespace-nowrap pt-1">
                        {format(new Date(scan.timestamp), 'MMM d, yyyy')}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                      <span className="truncate flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5" />
                        {scan.employer || 'Unknown Employer'}
                      </span>
                    </div>
                    
                    {scan.activeFlags?.length > 0 && (
                      <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 w-fit px-2 py-1 rounded-md">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {scan.activeFlags.length} Risk Flag{scan.activeFlags.length !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    {(() => {
                      const simCount = getSimilarCount(scan);
                      return simCount > 0 ? (
                        <button
                          onClick={() => handleScanClick(scan)}
                          title={`Find Similar Ads (${simCount} found)`}
                          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-amber-600 dark:text-amber-400 rounded-lg transition-colors flex items-center gap-1 text-[10px] font-black bg-amber-50 dark:bg-amber-950/30"
                        >
                          <Search className="w-4 h-4" />
                          <span>{simCount}</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleScanClick(scan)}
                          title="Check Similar Ads"
                          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg transition-colors"
                        >
                          <Search className="w-4 h-4" />
                        </button>
                      );
                    })()}
                    
                    <button
                      onClick={(e) => handleDeleteScan(e, scan.id, scan.jobTitle)}
                      title="Delete Scan"
                      className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <ChevronRight className="w-5 h-5 text-slate-400 cursor-pointer" onClick={() => handleScanClick(scan)} />
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
