import React from 'react';
import {
  Copy, ChevronRight, ExternalLink,
  FileText, PhoneCall, Users, ShieldAlert, Globe, Image as ImageIcon
} from 'lucide-react';

const TAKE_ACTIONS = [
  {
    id: 'poster',
    title: 'Generate Investigation Poster (PDF)',
    description: 'Create a downloadable PDF poster summarizing the ad, risk score, and highlighted key threat indicators. Fully translated/localized.',
    icon: FileText,
    badge: 'PDF REPORT',
    ctaText: 'Generate Poster',
  },
  {
    id: 'contact',
    title: 'Initiate contact with poster',
    description: 'Access recommended next steps, supervised contact templates, and secure evidence gathering documentation guidelines.',
    icon: PhoneCall,
    badge: 'EVIDENCE',
    ctaText: 'Initiate Contact',
  },
  {
    id: 'dossier',
    title: 'Investigate Recruiter Profile',
    description: 'Access the threat dossier, geographical footprint, and intelligence summary for the recruiter account associated with this posting.',
    icon: Users,
    badge: 'RECRUITER INTEL',
    ctaText: 'View Dossier',
  },
  {
    id: 'takedown',
    title: 'Abuse & Takedown Dispatcher',
    description: 'Auto-detect target host/platform and generate pre-filled safety complaints with evidence citation templates for domain/account suspension.',
    icon: ShieldAlert,
    badge: 'TAKEDOWN COMMS',
    ctaText: 'Automate Takedown',
  },
  {
    id: 'stix',
    title: 'STIX Intelligence Export',
    description: 'Packages the scan metadata, text analysis, and risk logs into a standardized STIX 2.1 (Structured Threat Information Expression) JSON file or sanitized intelligence brief.',
    icon: Globe,
    badge: 'STIX FEED',
    ctaText: 'Share/Export',
  },
  {
    id: 'image_osint',
    title: 'Reverse Image OSINT',
    description: 'Extract cropped graphics, logos, or backgrounds from the physical flyer scan to track template reuse across syndicates.',
    icon: ImageIcon,
    badge: 'IMAGE OSINT',
    ctaText: 'Analyze Graphic',
  },
  {
    id: 'file_forensics',
    title: 'EXIF & Metadata Forensics',
    description: 'Scan image binary segments to extract camera profiles, creation timestamps, and GPS geolocation coordinates.',
    icon: FileText,
    badge: 'FILE FORENSICS',
    ctaText: 'Scan Metadata',
  }
];

const HERO_ACTION = TAKE_ACTIONS.find(a => a.id === 'poster');
const TOOL_ACTIONS = TAKE_ACTIONS.filter(a => a.id !== 'poster');

export default function ActionGrid({ handleCopySummary, handleTakeAction }) {
  return (
    <div id="section-actions" data-nav-section className="scroll-mt-32 rounded overflow-hidden border border-slate-800/80 p-5" style={{ background: '#111318' }}>
      <div className="border-b border-slate-800 pb-3 mb-5 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-200">Take Action</h3>
          <p className="text-xs text-slate-500 mt-1">Operational next steps and evidence-gathering tools for analysts.</p>
        </div>
        <button
          type="button"
          onClick={handleCopySummary}
          title="Copy a plain-text case digest to the clipboard"
          className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-mono font-bold rounded transition-colors"
        >
          <Copy className="w-3.5 h-3.5" />
          Copy Summary
        </button>
      </div>

      {/* Hero action — the primary recommended deliverable */}
      {HERO_ACTION && (() => {
        const Icon = HERO_ACTION.icon;
        return (
          <button
            type="button"
            onClick={() => handleTakeAction(HERO_ACTION.id)}
            className="group w-full text-left bg-gradient-to-br from-amber-500/12 to-transparent border border-amber-500/40 hover:border-amber-400/70 rounded-lg p-4 flex items-center gap-4 transition-all duration-200 mb-4 shadow-md"
          >
            <div className="p-3 bg-amber-500 text-slate-950 rounded-md flex-shrink-0 shadow">
              <Icon className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold font-mono tracking-widest bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded">
                  RECOMMENDED
                </span>
                <span className="text-[9px] font-bold font-mono tracking-widest text-amber-400/70">{HERO_ACTION.badge}</span>
              </div>
              <h4 className="text-sm font-extrabold text-slate-100 mt-1.5 leading-snug">{HERO_ACTION.title}</h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed pr-4">{HERO_ACTION.description}</p>
            </div>
            <span className="hidden sm:flex items-center gap-1.5 flex-shrink-0 bg-amber-500 group-hover:bg-amber-400 text-slate-950 text-xs font-mono font-black rounded-md px-4 py-2.5 tracking-wider transition-colors">
              {HERO_ACTION.ctaText}
              <ExternalLink className="w-3.5 h-3.5" />
            </span>
          </button>
        );
      })()}

      {/* All operational tools — always visible, no unfolding */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {TOOL_ACTIONS.map(action => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => handleTakeAction(action.id)}
              title={action.description}
              className="group text-left bg-[#0f121d] border border-slate-800 hover:border-amber-500/40 rounded-lg p-3.5 flex items-center gap-3 transition-all duration-200"
            >
              <div className="p-2 bg-slate-900 border border-slate-700/60 rounded-md text-amber-400 flex-shrink-0 group-hover:bg-amber-500/10 transition-colors">
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-slate-200 leading-snug">{action.title}</h4>
                <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wide">{action.badge}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-amber-400 transition-colors flex-shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
