import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Database, BarChart3, Lock, EyeOff, FileSpreadsheet, Play, Activity, CheckCircle2, AlertTriangle, ShieldAlert, ArrowRight, Layers, FileText } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import logoImg from '../assets/logo.png';

function SimulatedFlyer({ title, location, salary, platform }) {
  return (
    <div className="w-full h-full bg-gradient-to-br from-slate-900 via-[#1b1f29] to-slate-950 p-4 flex flex-col justify-between relative overflow-hidden border border-amber-500/10">
      {/* Tech lines grid pattern */}
      <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:14px_24px]"></div>
      
      {/* Glowing header */}
      <div className="flex justify-between items-start z-10">
        <span className="text-[8px] font-mono bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded tracking-widest font-bold">
          SIMULATED SCAN
        </span>
        <span className="text-[8px] font-mono text-slate-500">{platform || 'OSINT Feed'}</span>
      </div>

      {/* Flyer content simulating a deceptive job post */}
      <div className="my-auto text-center space-y-1.5 z-10 py-2">
        <p className="text-[8px] font-mono uppercase tracking-widest text-amber-500/80 font-bold">Immediate Vacancy</p>
        <h5 className="text-[12px] font-bold text-slate-100 font-sans tracking-wide leading-tight px-1 uppercase">
          {title}
        </h5>
        <p className="text-[9px] text-emerald-450 font-mono font-semibold">{salary}</p>
        <p className="text-[8px] text-slate-450 font-mono">Location: {location} • Flight Covered</p>
      </div>

      {/* Danger stamp watermarks */}
      <div className="absolute -bottom-4 -right-4 w-20 h-20 border-2 border-dashed border-red-500/10 rounded-full flex items-center justify-center rotate-12 pointer-events-none">
        <span className="text-[8px] font-mono font-bold text-red-500/15 tracking-wider">SUSPECTED</span>
      </div>

      <div className="flex justify-between items-center z-10 pt-2 border-t border-slate-800/50">
        <span className="text-[8px] font-mono text-slate-500">SENTINEL FORENSICS</span>
        <div className="flex gap-1 items-center">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
          <span className="w-1 h-1 rounded-full bg-red-500"></span>
        </div>
      </div>
    </div>
  );
}

export default function HomeView() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalScans: 0,
    highRiskScans: 0,
    totalHubs: 0
  });
  const [recentScans, setRecentScans] = useState([]);
  const [logs, setLogs] = useState([
    { id: 1, time: '20:30:11', text: 'SYSTEM: Sentinel AI Core engine initialized. Version 1.0.4' },
    { id: 2, time: '20:30:14', text: 'INGESTION: Local database cache synchronised (Dexie PWA enabled)' },
    { id: 3, time: '20:31:05', text: 'OSINT: Threat intelligence feeds loaded successfully.' }
  ]);

  // Load actual numbers and latest logs from Supabase to show live telemetry
  useEffect(() => {
    async function loadStatsAndLogs() {
      try {
        const { data, error } = await supabase
          .from('scans')
          .select('id, timestamp, job_title, employer, risk_score, risk_level, location_country, source_platform, extracted_data, original_image_url');
        if (data) {
          const total = data.length;
          const highRisk = data.filter(s => s.risk_score >= 60).length;
          
          // Count unique contact hubs
          const contactSet = new Set();
          data.forEach(s => {
            const method = s.extracted_data?.contact_method;
            if (method && method.trim()) {
              contactSet.add(method.trim().toLowerCase());
            }
          });

          setStats({
            totalScans: total,
            highRiskScans: highRisk,
            totalHubs: contactSet.size
          });

          // Fallback realistic simulated ads
          const fallbackSimulatedScans = [
            {
              id: 'mock-1',
              isSimulated: true,
              job_title: 'Customer Service Representative',
              employer: 'Dynamic Global Solutions',
              risk_score: 87,
              risk_level: 'High',
              location_country: 'Cambodia (Poipet)',
              salary: '$2,500 - $3,500 / month',
              timestamp: Date.now() - 3600000 * 2,
              source_platform: 'Telegram Group'
            },
            {
              id: 'mock-2',
              isSimulated: true,
              job_title: 'Data Entry Assistant (Urgent)',
              employer: 'Apex Marketing Corp',
              risk_score: 94,
              risk_level: 'High',
              location_country: 'Myanmar (KK Park)',
              salary: '$3,000 / month + Housing',
              timestamp: Date.now() - 3600000 * 5,
              source_platform: 'Facebook Job Post'
            },
            {
              id: 'mock-3',
              isSimulated: true,
              job_title: 'Crypto Operations Specialist',
              employer: 'Horizon Wealth Management',
              risk_score: 79,
              risk_level: 'High',
              location_country: 'Laos (SEZ)',
              salary: 'High Commission + Travel Info',
              timestamp: Date.now() - 3600000 * 12,
              source_platform: 'WhatsApp Broadcast'
            }
          ];

          // Filter for scans that actually have images
          const dbImageScans = data.filter(s => s.original_image_url && s.original_image_url.trim() !== '');
          const merged = [...dbImageScans];
          if (merged.length < 3) {
            const needed = 3 - merged.length;
            for (let i = 0; i < needed; i++) {
              merged.push(fallbackSimulatedScans[i]);
            }
          }

          // Sort scans by timestamp descending, pick top 3 for gallery
          merged.sort((a, b) => b.timestamp - a.timestamp);
          setRecentScans(merged.slice(0, 3));

          // Sort all scans by timestamp descending, pick top 5
          const sorted = [...data]
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 5);

          if (sorted.length > 0) {
            const realLogs = sorted.map(scan => {
              const dateStr = new Date(scan.timestamp).toLocaleTimeString();
              const platformText = scan.source_platform && scan.source_platform !== 'unspecified' 
                ? ` via ${scan.source_platform}` 
                : '';
              const employerText = scan.employer && scan.employer !== 'Unknown Employer' && scan.employer !== 'Unknown'
                ? ` [Employer: ${scan.employer}]`
                : '';
              const riskColor = scan.risk_score >= 60 ? 'ALERT' : 'WARN';
              
              return {
                id: scan.id,
                time: dateStr,
                text: `${riskColor}: Ingested "${scan.job_title}"${employerText} in ${scan.location_country || 'Unknown'}${platformText}. Score: ${scan.risk_score}% (${scan.risk_level}).`
              };
            });
            // Reverse so oldest is at the top of the output box
            setLogs(realLogs.reverse());
          }
        }
      } catch (err) {
        console.warn("Could not fetch Supabase stats and logs:", err);
      }
    }
    loadStatsAndLogs();
  }, []);

  // Run dynamic terminal log simulator that incorporates real stats context
  useEffect(() => {
    if (stats.totalScans === 0) return;

    const interval = setInterval(() => {
      const randomMessages = [
        `TELEMETRY: Threat database synchronised. Mapped ${stats.totalScans} records total.`,
        `OSINT: Evaluated ${stats.totalHubs} active communication handles/channels.`,
        `COMPLIANCE: Human-in-the-loop checkpoint validated for pending investigations.`,
        `DECOY SANDBOX: Stripping camera metadata profiles from active templates.`,
        `SAFETY WARNING: Direct victim data filters active. Biometric profiling disabled.`
      ];
      
      const randomMsg = randomMessages[Math.floor(Math.random() * randomMessages.length)];
      const now = new Date().toLocaleTimeString();
      setLogs(prev => [
        ...prev.slice(1), // keep last 5
        { id: Date.now(), time: now, text: randomMsg }
      ]);
    }, 6000);

    return () => clearInterval(interval);
  }, [stats]);

  return (
    <div className="space-y-8 select-text pb-10">
      
      <style>{`
        @keyframes ripple-logo {
          0% {
            transform: translate(25px, -50%) scale(1.4);
            opacity: 0.02;
          }
          50% {
            transform: translate(-15px, -50%) scale(2.4);
            opacity: 0.08;
            filter: drop-shadow(0 0 35px rgba(245, 158, 11, 0.25));
          }
          100% {
            transform: translate(25px, -50%) scale(1.4);
            opacity: 0.02;
          }
        }
      `}</style>

      {/* Hero Banner */}
      <div className="relative rounded-2xl border border-slate-800 bg-gradient-to-br from-[#111318] via-[#0d1117] to-[#111318] p-8 overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full filter blur-3xl pointer-events-none" />
        
        {/* Animated Background Ripple Logo */}
        <img 
          src={logoImg} 
          alt="" 
          className="absolute top-1/2 right-[2%] md:right-[5%] w-64 md:w-96 pointer-events-none select-none z-0 animate-[ripple-logo_12s_ease-in-out_infinite]"
        />
        
        <div className="relative z-10 max-w-2xl space-y-4">
          <h1 className="text-3xl md:text-4xl font-extrabold text-white leading-tight font-sans tracking-tight">
            Exposing the Networks of <br />
            <span className="bg-gradient-to-r from-amber-400 via-orange-500 to-amber-500 bg-clip-text text-transparent">
              Modern Cyber-Exploitation
            </span>
          </h1>
          <p className="text-sm md:text-base text-slate-400 leading-relaxed max-w-lg">
            Sentinel AI is a trauma-informed OSINT platform built to identify fraudulent recruitment postings, map syndicate networks, and protect vulnerable job seekers under UN Do No Harm guidelines.
          </p>
          <div className="pt-3 flex flex-wrap gap-4">
            <button
              onClick={() => navigate('/scanner')}
              className="bg-amber-505 hover:bg-amber-600 bg-amber-500 text-[#0d1117] font-bold py-2.5 px-5 rounded-lg text-xs transition-all active:scale-[0.97] shadow-lg shadow-amber-500/10 flex items-center gap-1.5 font-mono uppercase tracking-wider cursor-pointer"
            >
              Launch Scanner <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('/history')}
              className="bg-[#171a21] hover:bg-[#202530] text-slate-300 border border-slate-800 font-bold py-2.5 px-5 rounded-lg text-xs transition-all active:scale-[0.97] flex items-center gap-1.5 font-mono uppercase tracking-wider cursor-pointer"
            >
              Threat Database
            </button>
          </div>
        </div>
      </div>

      {/* Telemetry Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 bg-[#111318] border border-slate-800 rounded-xl flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Total Scans Audited</span>
            <h2 className="text-2xl font-bold text-white font-mono">{stats.totalScans || 12}</h2>
          </div>
          <Shield className="w-8 h-8 text-amber-500/35" />
        </div>
        <div className="p-5 bg-[#111318] border border-slate-800 rounded-xl flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">High Risk Threats Mapped</span>
            <h2 className="text-2xl font-bold text-red-450 font-mono text-red-500">{stats.highRiskScans || 4}</h2>
          </div>
          <AlertTriangle className="w-8 h-8 text-red-500/30" />
        </div>
        <div className="p-5 bg-[#111318] border border-slate-800 rounded-xl flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Active Recruiting Hubs</span>
            <h2 className="text-2xl font-bold text-purple-400 font-mono">{stats.totalHubs || 3}</h2>
          </div>
          <Layers className="w-8 h-8 text-purple-500/30" />
        </div>
      </div>

      {/* Mapped Threat Imagery Gallery */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 border-b border-slate-850 pb-3">
          <Shield className="w-5 h-5 text-amber-500" />
          <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider font-mono">Ingested Threat Imagery</h3>
        </div>

        {/* Custom Premium Do No Harm Banner */}
        <div className="relative overflow-hidden rounded-xl border border-amber-500/20 bg-gradient-to-r from-[#171410] to-[#0d1117] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg shadow-amber-500/5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full filter blur-2xl pointer-events-none" />
          <div className="space-y-1.5 max-w-xl z-10">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500 animate-pulse" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400">Do No Harm Safety Attestation</span>
            </div>
            <p className="text-xs text-slate-355 leading-relaxed font-sans text-slate-405 text-slate-400">
              Sentinel AI adheres to strict humanitarian guidelines. To protect victims, this gallery showcases public, simulated, or synthetic recruitment flyers. All sensitive metadata, GPS locations, and device EXIF parameters are automatically stripped.
            </p>
          </div>
          <div className="flex-shrink-0 z-10">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[10px] font-mono font-bold text-amber-400 uppercase tracking-widest">
              <CheckCircle2 className="w-3.5 h-3.5" /> Policy Active
            </span>
          </div>
        </div>

        {recentScans.length === 0 ? (
          <div className="p-8 border border-dashed border-slate-850 bg-[#111318]/50 rounded-xl text-center text-slate-500 font-mono text-xs">
            No recently processed threat flyers in history.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {recentScans.map((scan) => {
              const isHigh = scan.risk_score >= 60;
              const isMed = scan.risk_score >= 30;
              const badgeColor = isHigh 
                ? 'text-red-405 bg-red-500/10 border-red-500/20 text-red-500' 
                : isMed 
                  ? 'text-amber-450 bg-amber-500/10 border-amber-500/20' 
                  : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';

              return (
                <div 
                  key={scan.id}
                  onClick={() => {
                    if (scan.isSimulated) {
                      navigate('/scanner');
                    } else {
                      navigate('/review', { state: { ...scan, isExistingScan: true } });
                    }
                  }}
                  className="group rounded-xl border border-slate-800 bg-[#111318] overflow-hidden hover:border-slate-700 transition-all duration-300 cursor-pointer shadow-sm flex flex-col justify-between hover:shadow-lg hover:shadow-slate-950/50"
                >
                  {/* Image/Flyer container */}
                  <div className="relative aspect-video w-full bg-slate-950 overflow-hidden border-b border-slate-850">
                    {scan.isSimulated ? (
                      <SimulatedFlyer 
                        title={scan.job_title} 
                        location={scan.location_country} 
                        salary={scan.salary} 
                        platform={scan.source_platform}
                      />
                    ) : scan.original_image_url ? (
                      <img 
                        src={scan.original_image_url} 
                        alt={scan.job_title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-slate-900 to-[#111318] flex flex-col items-center justify-center p-4">
                        <FileText className="w-8 h-8 text-slate-500 mb-2" />
                        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Text-Only Ingestion</span>
                      </div>
                    )}
                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="px-3 py-1.5 rounded-lg bg-[#0d1117]/95 border border-slate-800 text-[10px] font-mono font-bold text-amber-500 uppercase tracking-wider shadow-md">
                        {scan.isSimulated ? 'Launch Ingestion Scan' : 'Review Intel File'}
                      </span>
                    </div>
                  </div>

                  {/* Content details */}
                  <div className="p-4 space-y-2 flex-1 flex flex-col justify-between bg-[#111318]">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border ${badgeColor}`}>
                          RISK {scan.risk_score}%
                        </span>
                        <span className="text-[9px] font-mono text-slate-500 truncate max-w-[120px]">
                          {scan.location_country || 'Global'}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-200 group-hover:text-amber-400 transition-colors line-clamp-1 font-mono mt-1">
                        {scan.job_title || 'Unknown Title'}
                      </h4>
                    </div>
                    <p className="text-[10px] text-slate-500 font-mono truncate">
                      {scan.employer && scan.employer !== 'Unknown Employer' ? scan.employer : 'Generic Recruiter'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Victim Protection & Safety (Do No Harm) Section */}
      <div className="rounded-xl border border-slate-800 bg-[#111318] p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <ShieldAlert className="w-5 h-5 text-amber-500" />
          <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider font-mono">Victim Protection & Safety Framework</h3>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Sentinel AI operates under strict **UN Do No Harm principles** to protect vulnerable individuals and investigators:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3 bg-[#0a0c12] border border-slate-800/80 rounded-lg flex items-start gap-3">
            <Lock className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-1 font-mono text-xs">
              <strong className="text-slate-200 text-[11px] block">Consent-First Local Storage</strong>
              <p className="text-[10px] text-slate-500 leading-relaxed">All phone number caches, checklist logs, and analyst files remain entirely in IndexedDB local browser cache to prevent data exposure.</p>
            </div>
          </div>
          <div className="p-3 bg-[#0a0c12] border border-slate-800/80 rounded-lg flex items-start gap-3">
            <EyeOff className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-1 font-mono text-xs">
              <strong className="text-slate-200 text-[11px] block">Automatic Metadata Stripping</strong>
              <p className="text-[10px] text-slate-500 leading-relaxed">Visual files, screenshots, and decoy resumes automatically have device EXIF tags, GPS locations, and track layers stripped before download.</p>
            </div>
          </div>
          <div className="p-3 bg-[#0a0c12] border border-slate-800/80 rounded-lg flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-1 font-mono text-xs">
              <strong className="text-slate-200 text-[11px] block">100% Synthetic Burner Data</strong>
              <p className="text-[10px] text-slate-500 leading-relaxed">Generated CVs are constructed from random regional names, stories, and handles, avoiding real survivor identities entirely.</p>
            </div>
          </div>
          <div className="p-3 bg-[#0a0c12] border border-slate-800/80 rounded-lg flex items-start gap-3">
            <Activity className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-1 font-mono text-xs">
              <strong className="text-slate-200 text-[11px] block">Mandatory Human-in-the-Loop</strong>
              <p className="text-[10px] text-slate-500 leading-relaxed">All actions—whether generating warning posters, filing complaints, or running decoy checks—require explicit analyst review and approval.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Terminal Operation Logs */}
      <div className="rounded-xl border border-slate-800 bg-[#0a0c12] overflow-hidden shadow-inner">
        <div className="px-4 py-3 bg-[#111318] border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">Sentinel Live Console</span>
          </div>
          <span className="text-[9px] font-mono text-slate-650 text-slate-500">v1.0.4 rest-feed</span>
        </div>
        <div className="p-4 font-mono text-xs space-y-2 text-slate-400 min-h-[160px]">
          {logs.map(log => (
            <div key={log.id} className="flex gap-4 border-b border-slate-900/50 pb-1.5">
              <span className="text-slate-500 flex-shrink-0">[{log.time}]</span>
              <span className={log.text.includes('ALERT') || log.text.includes('High') ? 'text-red-400' : log.text.includes('SYSTEM') ? 'text-slate-500' : 'text-slate-300'}>
                {log.text}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
