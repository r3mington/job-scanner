import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient';
import { calculateRiskScore } from '../utils/scoring';
import { jsPDF } from 'jspdf';
import { 
  ShieldAlert, 
  AlertTriangle, 
  ArrowLeft, 
  Copy, 
  Check, 
  RotateCcw, 
  FileText, 
  Lock, 
  Globe, 
  MapPin, 
  TrendingUp, 
  UserCheck, 
  MessageSquare,
  ChevronRight,
  ClipboardList
} from 'lucide-react';

const PERSONA_NAMES = ["Somyot", "Apinya", "Minh", "Ravi", "Sokha", "Myo Aung", "Kanya", "Aris", "Chinh", "Tewary"];
const PERSONA_AGES = [21, 23, 24, 25, 27, 29, 31];
const PERSONA_HOMETOWNS = ["Chiang Mai, Thailand", "Phnom Penh, Cambodia", "Hanoi, Vietnam", "Yangon, Myanmar", "Korat, Thailand", "Siem Reap, Cambodia", "Mandalay, Myanmar"];
const PERSONA_BACKSTORIES = [
  "Former hotel clerk. Lost job due to compound closures. Has credit card debt of $1,500. Willing to work long shifts for high wage.",
  "High school graduate. Basic computer knowledge, no technical skills. Needs visa sponsorship. Seeking remote support roles.",
  "Call center employee. Experience in customer handling, speaks basic English and Thai. Seeking entry-level desk jobs.",
  "Agricultural worker seeking relocation. Willing to perform any online administrative task, desperate for cash to pay loan sharks.",
  "Freelance driver. Experienced in logistics, wants to move to office work. Eager for fast visa processing."
];
const PERSONA_HANDLES = ["@somyot_c9", "@apinya_travels", "@minh_support", "@ravi_desk", "@sokha_agent", "@myo_aung_tech", "@kanya_work", "@aris_support"];

export default function DecoyContactView() {
  const location = useLocation();
  const navigate = useNavigate();
  
  const scanData = location.state;
  const scanId = scanData?.scanId;
  const isExisting = scanId && scanId !== 'NEW';
  
  // Safe redirection fallback if accessed directly without router state
  useEffect(() => {
    if (!scanData) {
      navigate('/history');
    }
  }, [scanData, navigate]);

  if (!scanData) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0a0f18] text-slate-400 font-mono text-sm">
        No scan parameters provided. Redirecting...
      </div>
    );
  }

  // --- Checkpoints State ---
  const [checkpoints, setCheckpoints] = useState({
    handleLogged: false,
    walletLogged: false,
    routeLogged: false,
    passportPolicyConfirmed: false,
    coordinatesExtracted: false
  });

  // Hydrate checkpoints
  useEffect(() => {
    // 1. Try to read from passed state
    const originalCheckpoints = scanData?.extractedData?.decoy_checkpoints || scanData?.extractedData?.decoyCheckpoints;
    if (originalCheckpoints) {
      setCheckpoints(originalCheckpoints);
    }
    
    // 2. Fetch from Supabase if existing record
    if (isExisting) {
      const fetchScanCheckpoints = async () => {
        try {
          const { data, error } = await supabase
            .from('scans')
            .select('extracted_data')
            .eq('id', scanId)
            .single();
          if (data && data.extracted_data && data.extracted_data.decoy_checkpoints) {
            setCheckpoints(data.extracted_data.decoy_checkpoints);
          }
        } catch (err) {
          console.warn("Could not retrieve latest checkpoint logs:", err);
        }
      };
      fetchScanCheckpoints();
    }
  }, [scanId, isExisting, scanData]);

  // Toggle checklist checkboxes and save to Supabase
  const handleToggleCheckpoint = async (key) => {
    const updated = { ...checkpoints, [key]: !checkpoints[key] };
    setCheckpoints(updated);
    
    if (isExisting) {
      try {
        const { data: original } = await supabase
          .from('scans')
          .select('extracted_data')
          .eq('id', scanId)
          .single();
          
        const mergedExtracted = {
          ...(original?.extracted_data || {}),
          decoy_checkpoints: updated
        };
        
        await supabase
          .from('scans')
          .update({ extracted_data: mergedExtracted })
          .eq('id', scanId);
      } catch (err) {
        console.error("Failed to update checkpoints:", err);
      }
    }
  };

  // --- Burner Persona State ---
  const [persona, setPersona] = useState({
    name: "Somyot",
    age: 24,
    hometown: "Chiang Mai, Thailand",
    backstory: "Former hotel clerk. Lost job due to compound closures. Has credit card debt of $1,500. Willing to work long shifts for high wage.",
    handle: "@somyot_c9"
  });

  const rollPersona = () => {
    const name = PERSONA_NAMES[Math.floor(Math.random() * PERSONA_NAMES.length)];
    const age = PERSONA_AGES[Math.floor(Math.random() * PERSONA_AGES.length)];
    const hometown = PERSONA_HOMETOWNS[Math.floor(Math.random() * PERSONA_HOMETOWNS.length)];
    const backstory = PERSONA_BACKSTORIES[Math.floor(Math.random() * PERSONA_BACKSTORIES.length)];
    const handle = PERSONA_HANDLES[Math.floor(Math.random() * PERSONA_HANDLES.length)];
    setPersona({ name, age, hometown, backstory, handle });
  };

  // --- Canned Templates Navigation ---
  const [activeTab, setActiveTab] = useState('outreach');
  const [copiedId, setCopiedId] = useState(null);

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const outreachTemplates = [
    {
      id: 'outreach_casual',
      label: 'Casual Inquiry (Urgent)',
      text: `Hi, I saw your job post about the high-paying customer service role. Is it still open? I am looking to start immediately, I need a job soon to support my family. Let me know what details you need.`
    },
    {
      id: 'outreach_relocator',
      label: 'Relocation Inquiry',
      text: `Hello. I am interested in the customer support position. I am willing to relocate immediately. Can you tell me if flight tickets and accommodation are sponsor by company? Thank you.`
    }
  ];

  const visaTemplates = [
    {
      id: 'visa_documentation',
      label: 'Documentation & Passport Audit',
      text: `I'm ready to apply. Can I apply for the visa myself at the local embassy here? Or do I need to send you my passport book image? I want to make sure the travel visa is legal.`
    },
    {
      id: 'visa_withholding',
      label: 'Withholding Policy Check',
      text: `My friend told me some overseas companies keep the passport for safety. Will I be able to keep my passport with me in my room, or does the HR department hold it for visa renewal?`
    }
  ];

  const locationTemplates = [
    {
      id: 'loc_address',
      label: 'Lodging & Office Address Check',
      text: `Before I buy my flight, my family is asking for the company address so they know where I am staying. Can you give me the building name and street address of the office?`
    },
    {
      id: 'loc_transit',
      label: 'Transit Pickup Routine',
      text: `Will someone from company pick me up at the main airport terminal, or do I take a bus? Which airport should I fly to? Yangon, Bangkok, or Phnom Penh?`
    }
  ];

  const getActiveTemplates = () => {
    if (activeTab === 'outreach') return outreachTemplates;
    if (activeTab === 'visa') return visaTemplates;
    return locationTemplates;
  };

  // --- jsPDF Resume Downloader ---
  const handleDownloadResume = () => {
    const doc = new jsPDF();
    
    // Title Section
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(22);
    doc.text(persona.name.toUpperCase(), 20, 20);
    
    // Contact details line
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Age: ${persona.age}  |  Location: ${persona.hometown}  |  Contact: ${persona.handle}`, 20, 28);
    
    // Border line
    doc.setLineWidth(0.5);
    doc.line(20, 32, 190, 32);
    
    // Career Objective
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.text("OBJECTIVE", 20, 42);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Motivated and hard-working individual from ${persona.hometown} seeking an overseas entry-level customer service or administrative assistant role to support business operations. Available for immediate relocation.`, 20, 48, { maxWidth: 170 });
    
    // Work History
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.text("WORK HISTORY", 20, 68);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Assistant General Helper (2022 - Present)", 20, 74);
    doc.text("• Handled general inquiries, inventory records, and office data entry tasks.", 25, 80);
    doc.text("• Managed phone calls and chat interactions with local clients.", 25, 86);
    
    doc.text("Store Helper / Cashier (2020 - 2022)", 20, 96);
    doc.text("• Processed transactional payments, reconciled logs, and managed cash registers.", 25, 102);
    doc.text("• Assisted customers with location navigation and delivery updates.", 25, 108);
    
    // Education
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.text("EDUCATION & SKILLS", 20, 122);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.text("• High School Graduate / General Education", 20, 128);
    doc.text("• Basic Computer Literacy (MS Office, Google Sheets, messaging apps)", 20, 134);
    doc.text("• Typing speed: 40 WPM", 20, 140);
    doc.text("• Languages: Native regional language, basic conversational English", 20, 146);
    
    // Bottom separator
    doc.setLineWidth(0.2);
    doc.line(20, 156, 190, 156);
    
    // OpSec note
    doc.setFont("Helvetica", "italic");
    doc.setFontSize(8);
    doc.text("Note: This document contains no tracking metadata or EXIF logs to verify authenticity.", 20, 162);
    
    doc.save(`${persona.name.toLowerCase()}_cv.pdf`);
  };

  const calculatedScore = calculateRiskScore(scanData.activeFlags || [], {
    parsedSalaryUsd: scanData.parsedSalaryUsd,
    locationCountry: scanData.locationCountry,
    detectedLanguage: scanData.detectedLanguage,
    contactMethod: scanData.contactMethod
  }).score;

  return (
    <div className="flex flex-col flex-1 p-4 max-w-4xl w-full mx-auto space-y-6 select-text text-slate-355 bg-[#0d1117] min-h-screen">
      
      {/* Header Panel */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 hover:text-slate-200 transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2 font-mono">
            <Lock className="w-6 h-6 text-amber-500" />
            Decoy Engagement Control
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-mono">Operational chat prompts and metadata sanitization console.</p>
        </div>
      </div>

      {/* Target Recruiter Box */}
      <div className="rounded border border-slate-800 p-4 bg-[#111318] flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">Active Recruiter Target</div>
          <h2 className="text-sm font-bold text-slate-200 font-mono">{scanData.contactMethod || 'N/A'}</h2>
          <p className="text-xs text-slate-400 font-mono">
            {scanData.jobTitle ? `${scanData.jobTitle}` : 'Unnamed job offer'} 
            {scanData.locationCountry ? ` · ${scanData.locationCountry}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded bg-[#0a0c12] border border-slate-800 text-slate-400">
            CASE: SENTINEL-{(scanId || 'NEW').substring(0,8).toUpperCase()}
          </span>
          <span className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded border ${
            calculatedScore >= 60 ? 'text-red-400 bg-red-500/10 border-red-500/30' :
            calculatedScore >= 30 ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' :
            'text-[#3fb950] bg-[#3fb950]/10 border-[#3fb950]/30'
          }`}>
            RISK INDEX {calculatedScore}%
          </span>
        </div>
      </div>

      {/* STRICT OPSEC WARNING CONTAINER */}
      <div className="rounded border-l-[4px] border-red-500 border-t border-b border-r border-slate-800 bg-red-950/20 p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-red-400 uppercase tracking-wide font-mono">Mandatory Operational Security (OpSec) Safeguards</h3>
            <p className="text-xs text-slate-450 leading-relaxed font-mono">
              Engaging directly with trafficking syndicates poses active physical and digital retaliation risks. Before sending any message, you must certify compliance with the following security standards:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-3 rounded bg-[#0a0c12] border border-slate-800 flex items-start gap-2.5">
                <Lock className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-205">Device Confinement</strong>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-normal">Use burner devices or sandbox virtual machines. Never chat on personal hardware.</p>
                </div>
              </div>
              <div className="p-3 rounded bg-[#0a0c12] border border-slate-800 flex items-start gap-2.5">
                <Globe className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-205">Network Shielding</strong>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-normal">Always run connections through Tor or multi-hop VPNs. Never expose your true IP.</p>
                </div>
              </div>
              <div className="p-3 rounded bg-[#0a0c12] border border-slate-800 flex items-start gap-2.5">
                <UserCheck className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-205">Burner Profiles</strong>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-normal">Deploy generic, aged handles with consistent backstories. Never use personal profiles.</p>
                </div>
              </div>
              <div className="p-3 rounded bg-[#0a0c12] border border-slate-800 flex items-start gap-2.5">
                <FileText className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-205">EXIF Sanitization</strong>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-normal">Strip camera details, time stamps, and GPS coordinates from resumes or screenshots before sending.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Column Settings, Right Column Templates */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left Column (Persona & Checklist) */}
        <div className="md:col-span-1 space-y-6">
          
          {/* Burner Persona Generator */}
          <div className="rounded border border-slate-800 p-5 bg-[#111318]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-sm text-slate-250 flex items-center gap-1.5 font-mono">
                <UserCheck className="w-4 h-4 text-amber-500" />
                Burner Candidate Profile
              </h3>
              <button 
                type="button" 
                onClick={rollPersona}
                className="p-1.5 rounded border border-slate-800 bg-[#0a0c12] hover:bg-[#1b2230] text-slate-400 hover:text-slate-200 transition-colors"
                title="Roll New Persona"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
            
            <div className="space-y-3 text-xs font-mono">
              <div className="p-2 rounded bg-[#0a0c12] border border-slate-800">
                <span className="text-[9px] text-slate-550 uppercase block mb-0.5">Assigned Name</span>
                <span className="text-slate-300 font-bold">{persona.name} (Age: {persona.age})</span>
              </div>
              <div className="p-2 rounded bg-[#0a0c12] border border-slate-800">
                <span className="text-[9px] text-slate-550 uppercase block mb-0.5">Origin Location</span>
                <span className="text-slate-300 font-bold">{persona.hometown}</span>
              </div>
              <div className="p-2 rounded bg-[#0a0c12] border border-slate-800">
                <span className="text-[9px] text-slate-550 uppercase block mb-0.5">Contact Method</span>
                <span className="text-slate-300 font-bold">{persona.handle}</span>
              </div>
              <div className="p-2.5 rounded bg-[#0a0c12] border border-slate-800">
                <span className="text-[9px] text-slate-550 uppercase block mb-0.5">Backstory Profile</span>
                <span className="text-slate-400 font-sans leading-normal block mt-1">{persona.backstory}</span>
              </div>
            </div>

            {/* Sanitized PDF Resume Downloader */}
            <button
              type="button"
              onClick={handleDownloadResume}
              className="w-full mt-4 py-2.5 bg-[#0a0c12] hover:bg-[#1b2230] border border-slate-800 text-slate-300 hover:text-white text-xs font-mono font-bold rounded transition-all flex items-center justify-center gap-1.5 active:scale-95 shadow-sm"
            >
              <FileText className="w-4 h-4 text-amber-500" />
              Download Sanitized CV (PDF)
            </button>
          </div>

          {/* Evidence Checkpoint Checklist */}
          <div className="rounded border border-slate-800 p-5 bg-[#111318]">
            <h3 className="font-bold text-sm text-slate-250 flex items-center gap-1.5 mb-2 font-mono">
              <ClipboardList className="w-4 h-4 text-amber-500" />
              Intel Checkpoint Log
            </h3>
            <p className="text-[11px] text-slate-500 leading-normal mb-4 font-mono">Check parameters as you extract them to auto-sync evidence history.</p>

            <div className="space-y-3">
              {[
                { key: 'handleLogged', label: 'Alternative Recruiter Handle logged' },
                { key: 'walletLogged', label: 'Wallet Address / Payment details' },
                { key: 'routeLogged', label: 'Border transit hubs confirmed' },
                { key: 'passportPolicyConfirmed', label: 'Passport withholding policy verified' },
                { key: 'coordinatesExtracted', label: 'Lodging / Compound coordinates' }
              ].map(item => (
                <label 
                  key={item.key} 
                  className="flex items-start gap-2.5 p-2 rounded border border-slate-800 bg-[#0a0c12]/40 hover:bg-[#1b2230]/40 cursor-pointer select-none transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={checkpoints[item.key]}
                    onChange={() => handleToggleCheckpoint(item.key)}
                    className="w-4 h-4 mt-0.5 rounded border-slate-800 text-amber-500 focus:ring-amber-500 bg-[#0a0c12]"
                  />
                  <span className="text-[10px] font-mono leading-snug text-slate-400">{item.label}</span>
                </label>
              ))}
            </div>

            {!isExisting && (
              <div className="mt-4 p-2 rounded bg-amber-500/5 border border-amber-500/10 text-[10px] text-amber-500 font-mono leading-normal">
                ⚠️ Case is not saved yet. Save scan to history first to permanently sync checkpoint checks.
              </div>
            )}
          </div>

        </div>

        {/* Right Column (Canned Chat Templates) */}
        <div className="md:col-span-2 space-y-6">
          <div className="rounded border border-slate-800 overflow-hidden bg-[#111318]">
            {/* Tab Bar */}
            <div className="border-b border-slate-800 p-2 flex bg-[#0a0c12]/50 justify-between items-center">
              <div className="flex bg-[#0a0c12] border border-slate-800 p-0.5 rounded text-xs">
                {[
                  { id: 'outreach', label: '1. Hook / Outreach' },
                  { id: 'visa', label: '2. Visa & Passport Audit' },
                  { id: 'location', label: '3. Location Discovery' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-1.5 rounded font-bold font-mono transition-all ${
                      activeTab === tab.id
                        ? 'bg-[#1b2230] text-amber-500 border border-slate-800 shadow-sm'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Templates Content */}
            <div className="p-5 space-y-5">
              <div className="p-3 rounded bg-[#0a0c12] border border-[#0a0c12] text-xs text-slate-500 leading-normal flex items-start gap-2 font-mono">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <span>
                  {activeTab === 'outreach' && "OBJECTIVE: Establish initial rapport. Act matching your Burner backstory. Gauge candidate requirements (low barriers to entry)."}
                  {activeTab === 'visa' && "OBJECTIVE: Audit documentation workflow. Verify if the recruiter demands high-res passport pages, visa deposits, or passport controls."}
                  {activeTab === 'location' && "OBJECTIVE: Extract compound coordinates or land travel checkpoints. Do not agree to cross borders illegally."}
                </span>
              </div>

              <div className="space-y-4">
                {getActiveTemplates().map(template => (
                  <div key={template.id} className="p-4 rounded border border-slate-800 bg-[#0a0c12]/30 flex flex-col justify-between gap-3 relative group">
                    <div className="flex justify-between items-start gap-3">
                      <div className="space-y-1">
                        <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">{template.label}</span>
                        <p className="text-xs font-mono text-slate-300 leading-relaxed pr-6 select-all whitespace-pre-wrap">{template.text}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(template.id, template.text)}
                        className="p-2 rounded border border-slate-800 bg-[#0a0c12] hover:bg-[#1b2230] text-slate-400 hover:text-white transition-all flex-shrink-0 relative active:scale-95"
                        title="Copy Template"
                      >
                        {copiedId === template.id ? (
                          <Check className="w-4 h-4 text-[#3fb950]" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
