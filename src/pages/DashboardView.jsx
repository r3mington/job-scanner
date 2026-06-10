import React, { useState, useEffect } from 'react';
import { supabase, mapDbToRecord } from '../utils/supabaseClient';
import { BarChart3, AlertTriangle, ShieldAlert, CheckCircle2, TrendingUp, Users, MapPin, PhoneCall, Loader2, Award } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function DashboardView() {
  const navigate = useNavigate();
  const [scans, setScans] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchScans = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase.from('scans').select('*');
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
      <div className="flex-1 flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mb-3" />
        <p className="text-slate-500 text-sm">Loading dashboard analytics...</p>
      </div>
    );
  }

  const totalScans = scans.length;

  if (totalScans === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 my-10 max-w-md mx-auto">
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 rounded-full mb-4">
          <BarChart3 className="w-10 h-10" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">No Data Available</h2>
        <p className="text-slate-500 text-sm mb-6">Scan some job descriptions or upload a batch CSV to see security stats and recruiter network graphs.</p>
        <button
          onClick={() => navigate('/')}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-6 rounded-xl transition-all text-sm"
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
  
  const medRiskCount = scans.filter(s => s.riskScore >= 30 && s.riskScore < 60).length;
  const lowRiskCount = scans.filter(s => s.riskScore < 30).length;

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
  
  const getCleanContactValue = (val) => {
    if (!val) return null;
    const str = val.trim();
    
    // Telegram usernames
    const tgUserMatch = str.match(/(?:t\.me\/|tg:\/\/resolve\?domain=)([a-zA-Z0-9_]{5,32})/i);
    const tgRawUser = str.match(/@([a-zA-Z0-9_]{5,32})/);
    if (tgUserMatch) return `Telegram: @${tgUserMatch[1]}`;
    if (tgRawUser) return `Telegram: @${tgRawUser[1]}`;
    
    // WhatsApp numbers
    const waMatch = str.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)([0-9]+)/i);
    if (waMatch) return `WhatsApp: +${waMatch[1]}`;
    
    // Emails
    const emailMatch = str.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
    if (emailMatch) return `Email: ${emailMatch[1]}`;

    if (str.length > 0) return str;
    return null;
  };

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
    .filter(hub => hub.count > 1) // Only show hubs shared by at least 2 listings
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
    <div className="flex flex-col flex-1 h-full mt-4 max-w-screen-md w-full mx-auto space-y-6 pb-20">
      
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">Analytics Dashboard</h1>
        <p className="text-slate-500 text-xs mt-0.5">Aggregate risk metrics and scam patterns detected in historical listings.</p>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        {/* KPI 1 */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Total Scans</span>
            <Award className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-800 dark:text-white">{totalScans}</div>
            <p className="text-[10px] text-slate-400 mt-0.5">Listings analyzed</p>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Avg Risk Index</span>
            <AlertTriangle className={`w-4 h-4 ${avgRisk >= 60 ? 'text-red-500' : avgRisk >= 30 ? 'text-amber-500' : 'text-emerald-500'}`} />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-800 dark:text-white">{avgRisk}%</div>
            <p className={`text-[10px] font-semibold mt-0.5 ${
              avgRisk >= 60 ? 'text-red-500' : avgRisk >= 30 ? 'text-amber-500' : 'text-emerald-500'
            }`}>
              {avgRisk >= 60 ? 'High Danger' : avgRisk >= 30 ? 'Moderate Risk' : 'Highly Secure'}
            </p>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">High Risk Rate</span>
            <ShieldAlert className="w-4 h-4 text-red-500" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-800 dark:text-white">{highRiskPercent}%</div>
            <p className="text-[10px] text-slate-400 mt-0.5">{highRiskCount} listings $\ge 60$</p>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Scammer Hubs</span>
            <Users className="w-4 h-4 text-purple-500" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-800 dark:text-white">{networkHubs.length}</div>
            <p className="text-[10px] text-slate-400 mt-0.5">Shared contact methods</p>
          </div>
        </div>

      </div>

      {/* Grid for Red Flags and Recruiter Hubs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Left: Top Red Flags */}
        <div className="bg-white dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-600" /> Key Risk Indicators
            </h3>
            <span className="text-[10px] text-slate-400 font-medium">Frequency</span>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto max-h-64 pr-1">
            {sortedFlags.length > 0 ? (
              sortedFlags.map(({ flag, count, percent }) => (
                <div key={flag} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{flag}</span>
                    <span className="font-bold text-slate-500">{count} scan{count !== 1 ? 's' : ''} ({percent}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-red-500 h-full rounded-full" 
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 text-center py-6">No flags triggered yet.</p>
            )}
          </div>
        </div>

        {/* Right: Recruiter Hubs */}
        <div className="bg-white dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-1.5">
              <Users className="w-4 h-4 text-purple-600" /> Active Scammer Hubs
            </h3>
            <span className="text-[10px] text-slate-400 font-medium">Shared count</span>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto max-h-64 pr-1">
            {networkHubs.length > 0 ? (
              networkHubs.map(hub => (
                <div key={hub.contact} className="p-2.5 rounded-lg border border-purple-100/40 dark:border-purple-900/10 bg-purple-50/20 dark:bg-purple-950/5 flex items-center justify-between">
                  <div className="min-w-0 pr-2">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate flex items-center gap-1">
                      <PhoneCall className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" /> {hub.contact}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Avg Connected Risk: <span className="font-bold text-red-500">{hub.avgRisk}%</span></div>
                  </div>
                  <span className="text-[10px] font-extrabold bg-purple-600 text-white px-2 py-0.5 rounded-full flex-shrink-0">
                    {hub.count} Jobs
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-400">
                <CheckCircle2 className="w-8 h-8 text-emerald-500/80 mx-auto mb-2" />
                <p className="text-xs font-medium">No shared contact method hubs detected.</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Posters are currently isolated.</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Country/Geographic breakdown */}
      <div className="bg-white dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">
          <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-blue-600" /> Geographic Risk Distribution
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-350">
            <thead className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              <tr>
                <th className="py-2">Country / Jurisdiction</th>
                <th className="py-2 text-center">Postings</th>
                <th className="py-2 text-center">Avg Risk Score</th>
                <th className="py-2 text-right">Prevalence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sortedCountries.map(country => (
                <tr key={country.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/20">
                  <td className="py-3 font-semibold text-slate-800 dark:text-slate-200">{country.name}</td>
                  <td className="py-3 text-center font-bold text-slate-600 dark:text-slate-450">{country.count}</td>
                  <td className="py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full font-bold font-mono text-[10px] ${
                      country.avgRisk >= 60 ? 'bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400' :
                      country.avgRisk >= 30 ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400' :
                      'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400'
                    }`}>
                      {country.avgRisk}%
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-[10px] text-slate-400 font-bold">{Math.round((country.count / totalScans) * 100)}%</span>
                      <div className="w-16 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-blue-500 h-full rounded-full"
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
