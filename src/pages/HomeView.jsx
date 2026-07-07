import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Shield, ShieldAlert, Lock, EyeOff, CheckCircle2, AlertTriangle,
  ArrowRight, Layers, FileText, ScanSearch, Database, Activity,
  Upload, Cpu, ClipboardCheck, BookOpen, HardDrive, Cloud
} from 'lucide-react';
import { supabase, isSupabaseConfigured, mapDbToRecord } from '../utils/supabaseClient';
import { useAuth } from '../context/AuthContext';
import logoImg from '../assets/logo.png';

const HIGH_RISK_THRESHOLD = 60;

function StatCard({ label, value, loading, icon: Icon, iconClass, valueClass, to }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to)}
      className="p-5 bg-[#111318] border border-slate-800 rounded-xl flex items-center justify-between shadow-sm hover:border-slate-700 transition-colors text-left cursor-pointer group"
    >
      <div className="space-y-1">
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{label}</span>
        <h2 className={`text-2xl font-bold font-mono ${valueClass}`}>
          {loading ? <span className="text-slate-600">—</span> : value}
        </h2>
      </div>
      <Icon className={`w-8 h-8 ${iconClass} group-hover:scale-110 transition-transform`} />
    </button>
  );
}

function ChecklistStep({ done, title, description, actionLabel, to, stepNumber }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-4 p-4 rounded-xl border transition-colors group ${
        done
          ? 'border-emerald-500/20 bg-emerald-500/5'
          : 'border-slate-800 bg-[#111318] hover:border-amber-500/30 hover:bg-[#141720]'
      }`}
    >
      <div className="flex-shrink-0">
        {done ? (
          <CheckCircle2 className="w-6 h-6 text-emerald-400" />
        ) : (
          <span className="w-6 h-6 rounded-full border border-slate-700 flex items-center justify-center text-xs font-mono font-bold text-slate-400">
            {stepNumber}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${done ? 'text-emerald-300' : 'text-slate-200'}`}>{title}</p>
        <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{description}</p>
      </div>
      {!done && (
        <span className="flex-shrink-0 flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-wider text-amber-400 group-hover:text-amber-300">
          {actionLabel} <ArrowRight className="w-3.5 h-3.5" />
        </span>
      )}
    </Link>
  );
}

function HowItWorksStep({ icon: Icon, step, title, description }) {
  return (
    <div className="p-4 bg-[#111318] border border-slate-800 rounded-xl space-y-2">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-amber-500" />
        </div>
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Step {step}</span>
      </div>
      <p className="text-sm font-semibold text-slate-200">{title}</p>
      <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
    </div>
  );
}

export default function HomeView() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalScans: 0, highRiskScans: 0, totalHubs: 0 });
  const [recentScans, setRecentScans] = useState([]);

  useEffect(() => {
    async function loadStats() {
      try {
        const { data, error } = await supabase
          .from('scans')
          .select('id, timestamp, job_title, employer, risk_score, risk_level, location_country, source_platform, extracted_data, original_image_url');

        if (error) throw error;

        if (data) {
          const mapped = data.map(mapDbToRecord);
          const contactSet = new Set();
          mapped.forEach(s => {
            let ext = s.extractedData;
            if (typeof ext === 'string') {
              try { ext = JSON.parse(ext); } catch { ext = null; }
            }
            const method = ext?.contact_method || ext?.contactMethod;
            if (method && typeof method === 'string' && method.trim()) {
              contactSet.add(method.trim().toLowerCase());
            }
          });

          setStats({
            totalScans: mapped.length,
            highRiskScans: mapped.filter(s => (s.riskScore || 0) >= HIGH_RISK_THRESHOLD).length,
            totalHubs: contactSet.size
          });

          const sorted = [...mapped].sort(
            (a, b) => (new Date(b.timestamp).getTime() || 0) - (new Date(a.timestamp).getTime() || 0)
          );
          setRecentScans(sorted.slice(0, 3));
        }
      } catch (err) {
        console.warn('Could not fetch scan stats:', err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  const hasScans = stats.totalScans > 0;
  const displayName = user?.email ? user.email.split('@')[0] : 'Analyst';
  const setupComplete = hasScans;

  return (
    <div className="space-y-8 select-text pb-10">

      {/* Hero */}
      <div className="relative rounded-2xl border border-slate-800 bg-gradient-to-br from-[#111318] via-[#0d1117] to-[#111318] p-8 overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full filter blur-3xl pointer-events-none" />
        <img
          src={logoImg}
          alt=""
          className="absolute top-1/2 -translate-y-1/2 -right-10 w-72 opacity-[0.05] pointer-events-none select-none hidden lg:block"
        />
        <div className="relative z-10 max-w-2xl space-y-4">
          <p className="text-xs font-mono uppercase tracking-widest text-amber-500/80">
            Welcome, {displayName}
          </p>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white leading-tight tracking-tight">
            Spot fraudulent job postings <br />
            <span className="bg-gradient-to-r from-amber-400 via-orange-500 to-amber-500 bg-clip-text text-transparent">
              before they reach victims
            </span>
          </h1>
          <p className="text-sm md:text-base text-slate-400 leading-relaxed max-w-lg">
            Sentinel AI helps you analyze suspicious recruitment ads, score their risk signals,
            and build an auditable registry — all under UN Do No Harm guidelines.
          </p>
          <div className="pt-3 flex flex-wrap gap-4">
            <button
              onClick={() => navigate('/scanner')}
              className="bg-amber-500 hover:bg-amber-600 text-[#0d1117] font-bold py-2.5 px-5 rounded-lg text-xs transition-all active:scale-[0.97] shadow-lg shadow-amber-500/10 flex items-center gap-1.5 font-mono uppercase tracking-wider cursor-pointer"
            >
              {hasScans ? 'Scan a Posting' : 'Scan Your First Posting'} <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('/learn')}
              className="bg-[#171a21] hover:bg-[#202530] text-slate-300 border border-slate-800 font-bold py-2.5 px-5 rounded-lg text-xs transition-all active:scale-[0.97] flex items-center gap-1.5 font-mono uppercase tracking-wider cursor-pointer"
            >
              <BookOpen className="w-4 h-4" /> How It Works
            </button>
          </div>
        </div>
      </div>

      {/* Getting Started checklist — hidden once setup is complete */}
      {!loading && !setupComplete && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ScanSearch className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider font-mono">Getting Started</h3>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <ChecklistStep
              stepNumber="1"
              done={hasScans}
              title="Run your first scan"
              description="Upload a screenshot, paste the text of a job ad, or import a CSV batch. Sentinel extracts the details and scores the risk."
              actionLabel="Open Scanner"
              to="/scanner"
            />
            <ChecklistStep
              stepNumber="2"
              done={hasScans}
              title="Review your findings"
              description="Every scan lands in the Audit Registry, where you can inspect risk flags, compare postings, and export reports."
              actionLabel="Open Registry"
              to="/history"
            />
          </div>
        </div>
      )}

      {/* Workspace stats — real numbers only */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider font-mono">Your Workspace</h3>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#111318] border border-slate-800 text-[10px] font-mono text-slate-500 uppercase tracking-wider">
            {isSupabaseConfigured ? (
              <><Cloud className="w-3 h-3 text-sky-400" /> Cloud database</>
            ) : (
              <><HardDrive className="w-3 h-3 text-emerald-400" /> Local sandbox — data stays in this browser</>
            )}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Scans Audited"
            value={stats.totalScans}
            loading={loading}
            icon={Shield}
            iconClass="text-amber-500/35"
            valueClass="text-white"
            to="/history"
          />
          <StatCard
            label="High Risk Signals"
            value={stats.highRiskScans}
            loading={loading}
            icon={AlertTriangle}
            iconClass="text-red-500/30"
            valueClass={stats.highRiskScans > 0 ? 'text-red-500' : 'text-white'}
            to="/history"
          />
          <StatCard
            label="Recruiting Hubs Mapped"
            value={stats.totalHubs}
            loading={loading}
            icon={Layers}
            iconClass="text-purple-500/30"
            valueClass={stats.totalHubs > 0 ? 'text-purple-400' : 'text-white'}
            to="/dashboard"
          />
        </div>
      </div>

      {/* Recent scans — real data, honest empty state */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-amber-500" />
          <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider font-mono">Recent Scans</h3>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="rounded-xl border border-slate-800 bg-[#111318] h-48 animate-pulse" />
            ))}
          </div>
        ) : recentScans.length === 0 ? (
          <div className="p-10 border border-dashed border-slate-800 bg-[#111318]/50 rounded-xl text-center space-y-3">
            <Shield className="w-10 h-10 text-slate-700 mx-auto" />
            <p className="text-sm text-slate-400 font-semibold">Your registry is empty — and that's a fresh start.</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              Scan your first suspicious job posting and it will appear here with its risk score and extracted details.
            </p>
            <button
              onClick={() => navigate('/scanner')}
              className="mt-1 inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-[#0d1117] font-bold py-2 px-4 rounded-lg text-xs font-mono uppercase tracking-wider transition-all active:scale-[0.97] cursor-pointer"
            >
              Launch Scanner <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {recentScans.map(scan => {
              const isHigh = scan.riskScore >= HIGH_RISK_THRESHOLD;
              const isMed = scan.riskScore >= 30;
              const badgeColor = isHigh
                ? 'text-red-500 bg-red-500/10 border-red-500/20'
                : isMed
                  ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                  : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';

              return (
                <div
                  key={scan.id}
                  onClick={() => navigate('/review', { state: { ...scan, isExistingScan: true } })}
                  className="group rounded-xl border border-slate-800 bg-[#111318] overflow-hidden hover:border-slate-700 transition-all duration-300 cursor-pointer shadow-sm flex flex-col hover:shadow-lg hover:shadow-slate-950/50"
                >
                  <div className="relative aspect-video w-full bg-slate-950 overflow-hidden border-b border-slate-800">
                    {scan.originalImageUrl ? (
                      <img
                        src={scan.originalImageUrl}
                        alt={scan.jobTitle}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-slate-900 to-[#111318] flex flex-col items-center justify-center p-4">
                        <FileText className="w-8 h-8 text-slate-500 mb-2" />
                        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Text-Only Ingestion</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="px-3 py-1.5 rounded-lg bg-[#0d1117]/95 border border-slate-800 text-[10px] font-mono font-bold text-amber-500 uppercase tracking-wider shadow-md">
                        Review Intel File
                      </span>
                    </div>
                  </div>
                  <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border ${badgeColor}`}>
                          RISK {scan.riskScore}%
                        </span>
                        <span className="text-[9px] font-mono text-slate-500 truncate max-w-[120px]">
                          {scan.locationCountry || 'Global'}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-200 group-hover:text-amber-400 transition-colors line-clamp-1 mt-1">
                        {scan.jobTitle || 'Unknown Title'}
                      </h4>
                    </div>
                    <p className="text-[10px] text-slate-500 truncate">
                      {scan.employer && scan.employer !== 'Unknown Employer' ? scan.employer : 'Unattributed recruiter'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* How it works — static explainer, no fake data */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-amber-500" />
          <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider font-mono">How Sentinel AI Works</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <HowItWorksStep
            icon={Upload}
            step="1"
            title="Ingest a posting"
            description="Snap a photo, upload a screenshot, paste raw text, or import a CSV batch of recruitment ads from any platform."
          />
          <HowItWorksStep
            icon={Cpu}
            step="2"
            title="AI risk analysis"
            description="Gemini extracts the employer, salary, location, and contact channels, then scores the ad against known trafficking-lure patterns."
          />
          <HowItWorksStep
            icon={ClipboardCheck}
            step="3"
            title="Review and act"
            description="You validate every finding in the Audit Registry — compare postings, map recruiter networks, and export evidence reports."
          />
        </div>
      </div>

      {/* Safety commitments — compact */}
      <div className="rounded-xl border border-slate-800 bg-[#111318] p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <ShieldAlert className="w-5 h-5 text-amber-500" />
          <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider font-mono">Person-Centered Safety</h3>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Sentinel AI operates under strict <strong className="text-slate-200">UN Do No Harm principles</strong> to
          protect people in situations of vulnerability — and the investigators who help them.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              icon: Lock,
              title: 'Consent-first local storage',
              text: 'Phone number caches, checklist logs, and analyst files stay in your browser to prevent data exposure.'
            },
            {
              icon: EyeOff,
              title: 'Automatic metadata stripping',
              text: 'EXIF tags, GPS coordinates, and device fingerprints are removed from every file before download.'
            },
            {
              icon: CheckCircle2,
              title: '100% synthetic decoy data',
              text: 'Generated CVs use random regional names and stories — never real survivor identities.'
            },
            {
              icon: Activity,
              title: 'Human-in-the-loop, always',
              text: 'Warning posters, complaints, and decoy checks all require explicit analyst review and approval.'
            }
          ].map(item => (
            <div key={item.title} className="p-4 bg-[#0a0c12] border border-slate-800/80 rounded-lg flex items-start gap-3">
              <item.icon className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <strong className="text-slate-200 text-xs block">{item.title}</strong>
                <p className="text-xs text-slate-500 leading-relaxed">{item.text}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="pt-1">
          <Link to="/faq" className="text-[11px] font-mono uppercase tracking-wider text-amber-500 hover:text-amber-400 inline-flex items-center gap-1.5">
            Read the full safety framework <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

    </div>
  );
}
