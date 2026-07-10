import React, { useState, useEffect } from 'react';
import { supabase, mapDbToRecord } from '../utils/supabaseClient';
import { BarChart3, AlertTriangle, ShieldAlert, CheckCircle2, TrendingUp, Users, MapPin, PhoneCall, Loader2, Award, ChevronUp, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getCleanContactValue } from '../utils/caseHelpers';

export default function DashboardView() {
  const navigate = useNavigate();
  const [scans, setScans] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showBriefing, setShowBriefing] = useState(() => {
    const saved = localStorage.getItem('sentinel_show_dashboard_briefing');
    return saved === 'true';
  });

  useEffect(() => {
    const fetchScans = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('scans')
          .select('id, timestamp, job_title, employer, risk_score, risk_level, location_country, extracted_data, active_flags');
        if (error) throw error;
        setScans((data || []).map(mapDbToRecord));
      } catch (err) {
        console.error("Dashboard data load failed:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchScans();
  }, []);

  if (loading || !scans) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 bg-[#0d1117] text-slate-300">
        <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-3" />
        <p className="text-slate-500 text-sm font-mono">Loading dashboard analytics...</p>
      </div>
    );
  }

  const totalScans = scans.length;

  if (totalScans === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 my-10 max-w-md mx-auto bg-[#111318] border border-slate-800 rounded">
        <div className="p-4 bg-slate-950 border border-slate-800 text-amber-500 rounded mb-4">
          <BarChart3 className="w-10 h-10" />
        </div>
        <h2 className="text-lg font-mono uppercase tracking-wider text-slate-200 mb-2">No Data Available</h2>
        <p className="text-slate-500 text-xs mb-6">Scan some job descriptions or upload a batch CSV to see security stats and recruiter network graphs.</p>
        <button
          onClick={() => navigate('/')}
          className="bg-amber-600 hover:bg-amber-700 text-slate-900 font-mono text-xs uppercase tracking-wider font-bold py-2.5 px-6 rounded transition-all"
        >
          Go to Scanner
        </button>
      </div>
    );
  }

  // Calculate metrics
  const avgRisk = Math.round(scans.reduce((sum, s) => sum + s.riskScore, 0) / totalScans);
  const highRiskCount = scans.filter(s => s.riskScore >= 60).length;
  const highRiskPercent = Math.round((highRiskCount / totalScans) * 100);

  // Red Flags distribution
  const flagCounts = {};
  scans.forEach(scan => {
    (scan.activeFlags || []).forEach(flag => {
      flagCounts[flag] = (flagCounts[flag] || 0) + 1;
    });
  });

  const sortedFlags = Object.entries(flagCounts)
    .map(([flag, count]) => ({ flag, count, percent: Math.round((count / totalScans) * 100) }))
    .sort((a, b) => b.count - a.count);

  // Recruiter Network Hubs (Shared contacts)
  const contactMap = {};

  scans.forEach(scan => {
    const contactMethod = scan.extractedData?.contact_method;
    const cleanContact = getCleanContactValue(contactMethod);
    if (cleanContact) {
      if (!contactMap[cleanContact]) {
        contactMap[cleanContact] = [];
      }
      contactMap[cleanContact].push(scan);
    }
  });

  const networkHubs = Object.entries(contactMap)
    .map(([contact, list]) => ({
      contact,
      count: list.length,
      avgRisk: Math.round(list.reduce((sum, s) => sum + s.riskScore, 0) / list.length)
    }))
    .filter(hub => hub.count > 1)
    .sort((a, b) => b.count - a.count);

  // Country breakdown
  const countryData = {};
  scans.forEach(scan => {
    const country = scan.locationCountry || 'Unknown / Remote';
    if (!countryData[country]) {
      countryData[country] = { count: 0, totalRisk: 0 };
    }
    countryData[country].count += 1;
    countryData[country].totalRisk += scan.riskScore;
  });

  const sortedCountries = Object.entries(countryData)
    .map(([name, data]) => ({
      name,
      count: data.count,
      avgRisk: Math.round(data.totalRisk / data.count)
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="flex flex-col flex-1 h-full mt-4 max-w-screen-md w-full mx-auto space-y-6 pb-20 select-none">
      
      <div>
        <h1 className="font-mono text-sm uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
          <span className="text-amber-500 font-bold">▸</span> Analytics Dashboard
        </h1>
        <p className="text-slate-500 text-xs mt-0.5">Aggregate risk metrics and scam patterns detected in historical listings.</p>
      </div>

      {/* System Briefing / Onboarding Panel */}
      <div className="bg-[#111318] border border-slate-800 rounded transition-all duration-300">
        <button
          type="button"
          onClick={() => {
            const nextState = !showBriefing;
            setShowBriefing(nextState);
            localStorage.setItem('sentinel_show_dashboard_briefing', String(nextState));
          }}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[#1b2230]/30 transition-colors rounded-t"
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
              System Briefing: Intelligence Dashboard & Network Analysis
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
          <div className="p-4 border-t border-slate-800/60 bg-[#0a0c12]/40 text-xs font-mono space-y-4 grid grid-cols-1 md:grid-cols-2 gap-4 md:space-y-0">
            <div className="space-y-2">
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                Console Overview
              </div>
              <p className="text-slate-400 leading-relaxed">
                This dashboard aggregates risk intelligence gathered from historical scans to track exploitation metrics, isolate syndicated recruiters, and map syndicate hubs globally.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1.5">
                <div className="border border-slate-800 bg-[#111318]/50 p-2 rounded">
                  <div className="text-slate-500 font-bold text-[9px] uppercase">Syndicate Hubs</div>
                  <div className="text-purple-400 font-bold text-[10px] mt-0.5">{networkHubs.length} Shared Contacts</div>
                </div>
                <div className="border border-slate-800 bg-[#111318]/50 p-2 rounded">
                  <div className="text-slate-500 font-bold text-[9px] uppercase">Danger Threshold</div>
                  <div className="text-red-400 font-bold text-[10px] mt-0.5">&gt;= 60 Severe Risk</div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                Risk Metrics Explanation
              </div>
              <ul className="space-y-1.5 text-slate-400">
                <li className="flex items-start gap-2">
                  <span className="text-amber-500/80">•</span>
                  <span><strong>Key Indicators:</strong> Most frequent red-flags found in active exploitative posts.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-500/80">•</span>
                  <span><strong>Recruiter Hubs:</strong> Identified contact methods connecting multiple scam postings. Click any hub to view the recruiter's network.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-500/80">•</span>
                  <span><strong>Geographic Distribution:</strong> Average risk levels grouped by country or operating jurisdiction.</span>
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        {/* KPI 1 */}
        <div className="bg-[#111318] p-4 rounded border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-550">
            <span className="text-[10px] font-bold font-mono uppercase tracking-wider">Total Scans</span>
            <Award className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black font-mono text-slate-200">{totalScans}</div>
            <p className="text-[10px] text-slate-500 mt-0.5 font-mono">Listings analyzed</p>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-[#111318] p-4 rounded border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-555">
            <span className="text-[10px] font-bold font-mono uppercase tracking-wider">Avg Risk Index</span>
            <AlertTriangle className={`w-4 h-4 ${avgRisk >= 60 ? 'text-red-500' : avgRisk >= 30 ? 'text-amber-500' : 'text-[#3fb950]'}`} />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black font-mono text-slate-200">{avgRisk}%</div>
            <p className={`text-[10px] font-mono uppercase font-bold mt-0.5 ${
              avgRisk >= 60 ? 'text-red-400' : avgRisk >= 30 ? 'text-amber-400' : 'text-[#3fb950]'
            }`}>
              {avgRisk >= 60 ? 'High Danger' : avgRisk >= 30 ? 'Moderate Risk' : 'Highly Secure'}
            </p>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-[#111318] p-4 rounded border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-555">
            <span className="text-[10px] font-bold font-mono uppercase tracking-wider">High Risk Rate</span>
            <ShieldAlert className="w-4 h-4 text-red-500" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black font-mono text-slate-200">{highRiskPercent}%</div>
            <p className="text-[10px] text-slate-550 mt-0.5 font-mono">{highRiskCount} listings &gt;= 60</p>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-[#111318] p-4 rounded border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-555">
            <span className="text-[10px] font-bold font-mono uppercase tracking-wider">Recruiter Hubs</span>
            <Users className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black font-mono text-slate-200">{networkHubs.length}</div>
            <p className="text-[10px] text-slate-550 mt-0.5 font-mono">Shared contact methods</p>
          </div>
        </div>

      </div>

      {/* Grid for Red Flags and Recruiter Hubs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Left: Top Red Flags */}
        <div className="bg-[#111318] p-4 border border-slate-800 rounded shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-2">
            <h3 className="font-bold text-slate-200 text-sm flex items-center gap-1.5 font-mono uppercase tracking-wider">
              <TrendingUp className="w-4 h-4 text-amber-500" /> Key Indicators
            </h3>
            <span className="text-[10px] text-slate-500 font-mono font-medium">Frequency</span>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto max-h-64 pr-1">
            {sortedFlags.length > 0 ? (
              sortedFlags.map(({ flag, count, percent }) => (
                <div key={flag} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-semibold text-slate-300">{flag}</span>
                    <span className="font-bold text-slate-500">{count} scan{count !== 1 ? 's' : ''} ({percent}%)</span>
                  </div>
                  <div className="w-full bg-slate-950 border border-slate-850 h-2 rounded-sm overflow-hidden">
                    <div 
                      className="bg-red-500 h-full rounded-sm" 
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500 text-center py-6 font-mono">No flags triggered yet.</p>
            )}
          </div>
        </div>

        {/* Right: Recruiter Hubs */}
        <div className="bg-[#111318] p-4 border border-slate-800 rounded shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-2">
            <h3 className="font-bold text-slate-200 text-sm flex items-center gap-1.5 font-mono uppercase tracking-wider">
              <Users className="w-4 h-4 text-purple-400" /> Recruiter Hubs
            </h3>
            <span className="text-[10px] text-slate-500 font-mono font-medium">Shared count</span>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto max-h-64 pr-1">
            {networkHubs.length > 0 ? (
              networkHubs.map(hub => (
                <div 
                  key={hub.contact} 
                  onClick={() => navigate(`/poster/${encodeURIComponent(hub.contact)}`)}
                  className="p-2.5 rounded border border-purple-900/20 bg-[#0a0c12] flex items-center justify-between hover:border-purple-550/30 cursor-pointer transition-colors group"
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-xs font-bold text-slate-200 truncate flex items-center gap-1 group-hover:text-purple-400 transition-colors">
                      <PhoneCall className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" /> {hub.contact}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 font-mono">Avg Connected Risk: <span className="font-bold text-red-500">{hub.avgRisk}%</span></div>
                  </div>
                  <span className="text-[9px] font-bold font-mono bg-purple-950 border border-purple-900/60 text-purple-450 px-2 py-0.5 rounded flex-shrink-0 transition-colors">
                    {hub.count} Jobs
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-550">
                <CheckCircle2 className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                <p className="text-xs font-mono">No shared contact method hubs detected.</p>
                <p className="text-[10px] text-slate-600 mt-0.5 font-mono">Posters are currently isolated.</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Country/Geographic breakdown */}
      <div className="bg-[#111318] p-4 border border-slate-800 rounded shadow-sm">
        <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-2">
          <h3 className="font-bold text-slate-200 text-sm flex items-center gap-1.5 font-mono uppercase tracking-wider">
            <MapPin className="w-4 h-4 text-blue-400" /> Geographic Risk Distribution
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-400">
            <thead className="text-[10px] uppercase font-bold text-slate-555 tracking-wider font-mono">
              <tr>
                <th className="py-2">Country / Jurisdiction</th>
                <th className="py-2 text-center">Postings</th>
                <th className="py-2 text-center">Avg Risk Score</th>
                <th className="py-2 text-right">Prevalence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {sortedCountries.map(country => (
                <tr key={country.name} className="hover:bg-slate-850/20">
                  <td className="py-3 font-semibold text-slate-200">{country.name}</td>
                  <td className="py-3 text-center font-bold text-slate-400 font-mono">{country.count}</td>
                  <td className="py-3 text-center font-mono">
                    <span className={`px-2 py-0.5 rounded-sm border font-bold text-[10px] ${
                      country.avgRisk >= 60 ? 'bg-red-950/30 text-red-400 border-red-900/30' :
                      country.avgRisk >= 30 ? 'bg-amber-950/30 text-amber-400 border-amber-900/30' :
                      'bg-slate-900 text-slate-450 border border-slate-800'
                    }`}>
                      {country.avgRisk}%
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-[10px] text-slate-500 font-bold font-mono">{Math.round((country.count / totalScans) * 100)}%</span>
                      <div className="w-16 bg-slate-950 border border-slate-850 h-2 rounded-sm overflow-hidden">
                        <div 
                          className="bg-blue-500 h-full rounded-sm"
                          style={{ width: `${(country.count / totalScans) * 100}%` }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
