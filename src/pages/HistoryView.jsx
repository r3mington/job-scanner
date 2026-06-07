import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../utils/database';
import { Search, ChevronRight, AlertTriangle, Briefcase, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

export default function HistoryView() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  
  const scans = useLiveQuery(
    () => db.scans.orderBy('timestamp').reverse().toArray()
  );

  const filteredScans = scans?.filter(scan => 
    (scan.jobTitle?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (scan.employer?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  const handleScanClick = (scan) => {
    navigate('/review', { 
      state: { 
        ...scan,
        isExistingScan: true
      } 
    });
  };

  return (
    <div className="flex flex-col flex-1 h-full mt-4 max-w-lg w-full mx-auto">
      
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
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pb-4">
        {!filteredScans ? (
          <div className="text-center py-10 text-slate-500">Loading history...</div>
        ) : filteredScans.length === 0 ? (
          <div className="text-center py-10 text-slate-500 flex flex-col items-center">
             <Briefcase className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-3" />
             <p>No saved scans found.</p>
          </div>
        ) : (
          filteredScans.map(scan => (
            <div 
              key={scan.id} 
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
              
              <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0" />
            </div>
          ))
        )}
      </div>

    </div>
  );
}
