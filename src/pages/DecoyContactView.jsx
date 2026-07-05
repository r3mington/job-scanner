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
  ClipboardList,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

const PERSONA_AGES = [21, 23, 24, 25, 27, 29, 31];
const PERSONA_BACKSTORIES = [
  "Hotel industry background. Seeking a transition to office-based work. Has experience with customer service and basic administration.",
  "Recent secondary school graduate with foundational computer skills. Looking for an entry-level role with on-the-job training.",
  "Customer support experience in a call center. Conversational English and Thai. Open to entry-level desk or remote roles.",
  "Agricultural and logistics background. Interested in transitioning to administrative or data-entry work.",
  "Freelance transport and delivery background. Looking to move into a stable office-based position."
];

const PERSONAS_BY_COUNTRY = {
  Thailand: {
    names: ["Somyot", "Apinya", "Kanya", "Anong", "Chai"],
    hometowns: ["Chiang Mai, Thailand", "Korat, Thailand", "Bangkok, Thailand", "Phuket, Thailand"],
    handles: ["@somyot_c9", "@apinya_travels", "@kanya_work", "@chai_support", "@anong_cs"]
  },
  Cambodia: {
    names: ["Sokha", "Aris", "Chanthou", "Sophea", "Narin"],
    hometowns: ["Phnom Penh, Cambodia", "Siem Reap, Cambodia", "Battambang, Cambodia", "Sihanoukville, Cambodia"],
    handles: ["@sokha_agent", "@aris_support", "@chanthou_work", "@sophea_cs", "@narin_admin"]
  },
  Vietnam: {
    names: ["Minh", "Chinh", "Lan", "Nam", "Huong"],
    hometowns: ["Hanoi, Vietnam", "Ho Chi Minh City, Vietnam", "Da Nang, Vietnam", "Can Tho, Vietnam"],
    handles: ["@minh_support", "@chinh_admin", "@lan_support", "@nam_cs", "@huong_agent"]
  },
  Myanmar: {
    names: ["Myo Aung", "Tewary", "Thandar", "Kyaw", "Zin"],
    hometowns: ["Yangon, Myanmar", "Mandalay, Myanmar", "Naypyidaw, Myanmar", "Taunggyi, Myanmar"],
    handles: ["@myo_aung_tech", "@thandar_cs", "@kyaw_work", "@zin_support", "@tewary_admin"]
  },
  Malaysia: {
    names: ["Ravi", "Lim", "Ahmad", "Siti", "Mei"],
    hometowns: ["Kuala Lumpur, Malaysia", "Penang, Malaysia", "Johor Bahru, Malaysia", "Ipoh, Malaysia"],
    handles: ["@ravi_desk", "@lim_support", "@ahmad_cs", "@siti_agent", "@mei_admin"]
  },
  Indonesia: {
    names: ["Aris", "Budi", "Dewi", "Sari", "Agus"],
    hometowns: ["Jakarta, Indonesia", "Surabaya, Indonesia", "Bandung, Indonesia", "Medan, Indonesia"],
    handles: ["@aris_support", "@budi_cs", "@dewi_admin", "@sari_agent", "@agus_work"]
  },
  Philippines: {
    names: ["Maria", "Juan", "Santos", "Cruz", "Reyes"],
    hometowns: ["Manila, Philippines", "Cebu City, Philippines", "Davao City, Philippines", "Quezon City, Philippines"],
    handles: ["@maria_cs", "@juan_support", "@santos_work", "@cruz_admin", "@reyes_agent"]
  },
  Laos: {
    names: ["Seng", "Somphone", "Kham", "Keo", "Phon"],
    hometowns: ["Vientiane, Laos", "Luang Prabang, Laos", "Savannakhet, Laos", "Pakse, Laos"],
    handles: ["@seng_cs", "@somphone_support", "@kham_work", "@keo_admin", "@phon_agent"]
  }
};

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
  const [isOpSecExpanded, setIsOpSecExpanded] = useState(false);

  const [selectedCountry, setSelectedCountry] = useState(() => {
    // Try to guess country from scanData's locationCountry
    const matched = scanData?.locationCountry || '';
    if (PERSONAS_BY_COUNTRY[matched]) {
      return matched;
    }
    return 'Thailand';
  });

  const [persona, setPersona] = useState({
    name: "Somyot",
    age: 24,
    hometown: "Chiang Mai, Thailand",
    backstory: "Former hotel clerk. Lost job due to compound closures. Has credit card debt of $1,500. Willing to work long shifts for high wage.",
    handle: "@somyot_c9"
  });

  const rollPersona = (countryName = selectedCountry) => {
    const countryData = PERSONAS_BY_COUNTRY[countryName] || PERSONAS_BY_COUNTRY['Thailand'];
    const name = countryData.names[Math.floor(Math.random() * countryData.names.length)];
    const age = PERSONA_AGES[Math.floor(Math.random() * PERSONA_AGES.length)];
    const hometown = countryData.hometowns[Math.floor(Math.random() * countryData.hometowns.length)];
    const backstory = PERSONA_BACKSTORIES[Math.floor(Math.random() * PERSONA_BACKSTORIES.length)];
    const handle = countryData.handles[Math.floor(Math.random() * countryData.handles.length)];
    setPersona({ name, age, hometown, backstory, handle });
  };

  // Re-roll persona when selected country changes
  const handleCountryChange = (country) => {
    setSelectedCountry(country);
    rollPersona(country);
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
    },
    {
      id: 'outreach_salary_type',
      label: 'Compensation & Currency Inquiry',
      text: `Regarding the salary, is it paid in local currency or USD/USDT? I want to make sure I can send the money back home to my family easily. Do you help set up a bank account?`
    },
    {
      id: 'outreach_group',
      label: 'Group Referral Inquiry',
      text: `I have two friends who also lost their jobs. Do you have multiple spots open? We can travel together next week if you can sponsor all of us.`
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
    },
    {
      id: 'visa_costs',
      label: 'Travel Expense & Deposit Audit',
      text: `Are there any visa processing fees or travel deposits I need to pay upfront? If the company pays for the flight, is that deducted from my salary later?`
    },
    {
      id: 'visa_contract',
      label: 'Contract Exit Option Check',
      text: `What is the minimum contract period? If I find the job is not a good fit for me, can I resign and return home immediately, or is there a penalty fee I have to pay?`
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
    },
    {
      id: 'loc_mobility',
      label: 'Compound Mobility Check',
      text: `Is the office in a closed park or compound? Are employees free to leave the building and visit the local town during our days off, or is it a security compound?`
    },
    {
      id: 'loc_comms',
      label: 'Communications & Internet Access Check',
      text: `Will I have free internet access in my room to call my family? Are we allowed to keep our personal mobile phones with us during office working hours?`
    }
  ];

  const getActiveTemplates = () => {
    if (activeTab === 'outreach') return outreachTemplates;
    if (activeTab === 'visa') return visaTemplates;
    return locationTemplates;
  };

  // --- jsPDF Resume Downloader ---
  // --- jsPDF Resume Downloader ---
  const handleDownloadResume = () => {
    const doc = new jsPDF();
    
    // Set custom colors
    const primaryColor = [22, 101, 160]; // Deep Blue
    const darkGray = [55, 65, 81];
    
    // Header Name
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(persona.name.toUpperCase(), 20, 20);
    
    // Contact Info Grid
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(`Age: ${persona.age}  |  Location: ${persona.hometown}  |  Contact: ${persona.handle}`, 20, 27);
    
    // Decorative Section Divider Line
    doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setLineWidth(1);
    doc.line(20, 31, 190, 31);
    
    // 1. Professional Summary / Career Objective
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text("PROFESSIONAL SUMMARY", 20, 40);
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    const objectiveText = `Motivated and adaptable administrative professional from ${persona.hometown} with over 6 years of experience in data entry, client services, and logistics support. Demonstrates strong organizational skills, rapid document processing speed, and conversational language fluency. Seeking to leverage customer support and office management expertise in a challenging international environment. Available for immediate relocation.`;
    doc.text(objectiveText, 20, 45, { maxWidth: 170, align: "justify" });
    
    // Divider
    doc.setDrawColor(220, 224, 230);
    doc.setLineWidth(0.5);
    doc.line(20, 60, 190, 60);
    
    // 2. Professional Experience
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text("PROFESSIONAL EXPERIENCE", 20, 68);
    
    // Job 1
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(31, 41, 55);
    doc.text("Administrative Assistant & Data Coordinator", 20, 75);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text("South-East Logistics Ltd.  |  2022 - Present", 20, 80);
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text("• Handled incoming chat correspondence, client requests, and ticket queues under tight schedules.", 25, 86, { maxWidth: 165 });
    doc.text("• Managed daily operations for shipping logs and digital data entry with 99.8% precision rating.", 25, 91, { maxWidth: 165 });
    doc.text("• Maintained secure records databases and verified customs and routing documentation.", 25, 96, { maxWidth: 165 });
    
    // Job 2
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(31, 41, 55);
    doc.text("Customer Service & Front Office Representative", 20, 106);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text("Grand Horizon Hotel Group  |  2019 - 2022", 20, 111);
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text("• Managed guest communication channels, phone switchboards, and online chat assistance.", 25, 117, { maxWidth: 165 });
    doc.text("• Coordinated travel plans, shuttle transfers, and regional tour guides for foreign customers.", 25, 122, { maxWidth: 165 });
    doc.text("• Resolved customer disputes calmly and maintained billing registers accurately.", 25, 127, { maxWidth: 165 });
    
    // Job 3
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(31, 41, 55);
    doc.text("Retail Operations Clerk & Cashier", 20, 137);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text("City Center Express Mart  |  2017 - 2019", 20, 142);
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text("• Operated electronic cash register systems and balanced cash accounts daily.", 25, 148, { maxWidth: 165 });
    doc.text("• Conducted bi-weekly inventory tracking, cataloging, and vendor restocking protocols.", 25, 153, { maxWidth: 165 });
    
    // Divider
    doc.line(20, 161, 190, 161);
    
    // 3. Education & Credentials
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text("EDUCATION", 20, 169);
    
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(31, 41, 55);
    doc.text("Associate Degree in Business Administration", 20, 175);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text("Regional Vocational Institute  |  Graduated: 2017", 20, 180);
    
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(31, 41, 55);
    doc.text("High School Certificate", 20, 188);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text("District Academy  |  Graduated: 2015", 20, 193);
    
    // Divider
    doc.line(20, 200, 190, 200);
    
    // 4. Skills & Dialects
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text("TECHNICAL SKILLS & LANGUAGES", 20, 208);
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text("• Software: Microsoft Office Suite (Excel, Word), Google Workspace, Basic CRM platforms.", 20, 214);
    doc.text("• Communication: Live Chat Support, VoIP, Customer Ticket Handling, email management.", 20, 220);
    doc.text("• Key Metrics: Fast typing speed (55 WPM), document verification, scheduling.", 20, 226);
    doc.text("• Languages: Native regional language (fluent), Conversational English.", 20, 232);
    
    // Divider
    doc.line(20, 240, 190, 240);
    
    // 5. References
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text("REFERENCES", 20, 248);
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text("Available immediately upon request.", 20, 254);
    
    // OpSec note / Footer
    doc.setDrawColor(220, 38, 38);
    doc.setLineWidth(0.5);
    doc.line(20, 268, 190, 268);
    
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(220, 38, 38);
    doc.text("WARNING: SIMULATED DECOY PROFILE. RESEARCH AND TRAINING USE ONLY - NOT A REAL IDENTITY.", 20, 274);
    doc.setFont("Helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(156, 163, 175);
    doc.text("Sentinel AI Do No Harm Framework: EXIF metadata and tracking layers stripped.", 20, 280);
    
    doc.save(`${persona.name.toLowerCase()}_cv.pdf`);
  };

  const calculatedScore = calculateRiskScore(scanData.activeFlags || [], {
    parsedSalaryUsd: scanData.parsedSalaryUsd,
    locationCountry: scanData.locationCountry,
    detectedLanguage: scanData.detectedLanguage,
    contactMethod: scanData.contactMethod
  }).score;

  return (
    <div className="flex flex-col flex-1 p-4 max-w-screen-md w-full mx-auto space-y-6 select-text text-slate-355 bg-[#0d1117] min-h-screen">
      
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
      <div className="rounded border-l-[4px] border-red-500 border-t border-b border-r border-slate-800 bg-red-950/20 overflow-hidden">
        <button
          type="button"
          onClick={() => setIsOpSecExpanded(!isOpSecExpanded)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-red-950/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-red-500 flex-shrink-0" />
            <h3 className="text-sm font-bold text-red-400 uppercase tracking-wide font-mono">
              Mandatory Operational Security (OpSec) Safeguards
            </h3>
          </div>
          <div className="flex items-center gap-1 text-[10px] font-mono text-slate-500 uppercase">
            <span>{isOpSecExpanded ? 'Hide' : 'Show'}</span>
            {isOpSecExpanded ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </div>
        </button>

        {isOpSecExpanded && (
          <div className="px-5 pb-5 pt-1 border-t border-slate-800/40 space-y-3">
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
        )}
      </div>

      {/* Main Grid: Left Column Settings, Right Column Templates */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left Column (Persona & Checklist) */}
        <div className="md:col-span-1 space-y-6">
          
          {/* Burner Persona Generator */}
          <div className="rounded border border-slate-800 p-5 bg-[#111318] space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-sm text-slate-250 flex items-center gap-1.5 font-mono">
                <UserCheck className="w-4 h-4 text-amber-500" />
                Burner Candidate Profile
              </h3>
              <button 
                type="button" 
                onClick={() => rollPersona(selectedCountry)}
                className="p-1.5 rounded border border-slate-800 bg-[#0a0c12] hover:bg-[#1b2230] text-slate-400 hover:text-slate-200 transition-colors"
                title="Roll New Persona"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Country Selector Selector */}
            <div className="space-y-1.5 font-mono text-xs">
              <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                Select Resume Target Country
              </label>
              <select
                value={selectedCountry}
                onChange={(e) => handleCountryChange(e.target.value)}
                className="w-full px-3 py-2 bg-[#0a0c12] border border-slate-800 rounded text-xs text-slate-255 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all"
              >
                {Object.keys(PERSONAS_BY_COUNTRY).map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
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

            {/* Synthetic Candidate Disclaimer */}
            <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded font-mono text-[9px] text-amber-500/90 leading-relaxed">
              <div className="font-bold uppercase tracking-wider mb-1 flex items-center gap-1 text-amber-500">
                <ShieldAlert className="w-3.5 h-3.5" />
                Synthetic Candidate Profile
              </div>
              This profile and CV are generated with <strong>synthetic/fake data</strong>:
              <ul className="list-disc list-inside mt-1 space-y-0.5 pl-1">
                <li>Under no circumstances should live contact occur without active investigator oversight.</li>
                <li>Used strictly for defensive OSINT simulation and safety profile mitigation.</li>
              </ul>
            </div>

            {/* Sanitized PDF Resume Downloader */}
            <button
              type="button"
              onClick={handleDownloadResume}
              className="w-full py-2.5 bg-[#0a0c12] hover:bg-[#1b2230] border border-slate-800 text-slate-300 hover:text-white text-xs font-mono font-bold rounded transition-all flex items-center justify-center gap-1.5 active:scale-95 shadow-sm"
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
        <div className="md:col-span-2 space-y-4">
          <h3 className="font-bold text-sm text-slate-250 flex items-center gap-1.5 font-mono">
            <MessageSquare className="w-4 h-4 text-amber-500" />
            Decoy Engagement Templates
          </h3>
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
              <div className="p-3 rounded bg-amber-500/5 border border-amber-500/10 text-xs text-amber-500/90 leading-normal flex flex-col gap-1.5 font-mono">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <span>
                    {activeTab === 'outreach' && "OBJECTIVE: Establish initial rapport. Act matching your Burner backstory. Gauge candidate requirements (low barriers to entry)."}
                    {activeTab === 'visa' && "OBJECTIVE: Audit documentation workflow. Verify if the recruiter demands high-res passport pages, visa deposits, or passport controls."}
                    {activeTab === 'location' && "OBJECTIVE: Extract compound coordinates or land travel checkpoints. Do not agree to cross borders illegally."}
                  </span>
                </div>
                <div className="text-[10px] text-amber-500/80 pl-6 border-t border-amber-500/10 pt-1.5 mt-0.5 font-semibold uppercase tracking-wider">
                  ⚠️ Synthetic OSINT Sandbox — Human-In-The-Loop Oversight Mandatory
                </div>
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
