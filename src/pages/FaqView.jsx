import React, { useState } from 'react';
import { HelpCircle, ChevronDown, ChevronUp, Cpu, Key, BarChart3, Fingerprint, MessageSquare, Image, Eye, Languages } from 'lucide-react';

export default function FaqView() {
  const [openSections, setOpenSections] = useState({});

  const toggleSection = (id) => {
    setOpenSections(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const faqItems = [
    {
      id: 'architecture',
      icon: <Cpu className="w-4 h-4 text-amber-500" />,
      title: 'Overall App Architecture',
      summary: 'How Sentinel AI fits together: local browser components, databases, and secure analysis channels.',
      details: (
        <div className="space-y-3 leading-relaxed text-slate-350">
          <p>
            Sentinel AI is designed as an <strong>analyst-first OSINT workspace</strong>. It runs on a modern web platform integrating a client-side React single-page application with a secure Supabase backend database layer.
          </p>
          <div className="p-3 bg-[#0a0c12] border border-slate-800 rounded font-mono text-[11px] text-slate-400 space-y-1.5">
            <div><strong className="text-slate-300">Frontend:</strong> React 18 / Tailwind CSS / Vite (Bundled client-side runtime)</div>
            <div><strong className="text-slate-300">Storage:</strong> Supabase PostgreSQL (Scan logs, extracted target metadata)</div>
            <div><strong className="text-slate-300">Local Cache:</strong> IndexedDB / Dexie (Offline-first session caching)</div>
            <div><strong className="text-slate-300">AI Services:</strong> Direct API connection to Gemini 1.5/2.5 endpoints</div>
          </div>
          <p>
            This architecture keeps operational costs minimal and lets analysts store target dossiers directly on their secure databases while maintaining fast scanning interfaces.
          </p>
        </div>
      )
    },
    {
      id: 'quotas',
      icon: <Key className="w-4 h-4 text-amber-500" />,
      title: 'Gemini Quotas, Models & API Optimization',
      summary: 'Understanding API limits, structured models, and how Sentinel AI avoids request bottlenecks.',
      details: (
        <div className="space-y-3 leading-relaxed text-slate-350">
          <p>
            The scanner uses advanced Google Gemini Large Language Models (LLMs) to perform OCR (Optical Character Recognition) and threat heuristics extraction.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Model Selection:</strong> Defaults to <code>gemini-2.5-flash</code> for fast extraction speed, with fallbacks to <code>gemini-1.5-flash</code> and <code>gemini-1.5-pro</code>.</li>
            <li><strong>JSON Schema Routing:</strong> All prompts are sent via the <code>/v1beta/</code> REST endpoint to guarantee structure through <code>responseMimeType: "application/json"</code>.</li>
            <li><strong>Fallback Cascade:</strong> If your API key hits rate limits (resource exhaust warnings), Sentinel automatically cycles through backup model variations without failing the active scan.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'scoring',
      icon: <BarChart3 className="w-4 h-4 text-amber-500" />,
      title: 'Risk Scoring Calculation Heuristics',
      summary: 'How threat scores are calculated based on job flags, salary ratios, and operational opacity.',
      details: (
        <div className="space-y-3 leading-relaxed text-slate-350">
          <p>
            The risk score is a composite metric representing the likelihood of a job posting being tied to human trafficking or forced labor rings.
          </p>
          <div className="p-3 bg-[#0a0c12] border border-slate-800 rounded font-mono text-[11px] text-slate-400 space-y-2">
            <div>
              <strong className="text-slate-300">1. Base Flag Weights:</strong>
              <div className="text-slate-500 mt-0.5">Flags like "Passport Control" (+40), "Labor Abuse" (+25), and "Excessive Enticements" (+15) are summed.</div>
            </div>
            <div>
              <strong className="text-slate-300">2. Combo Multipliers:</strong>
              <div className="text-slate-500 mt-0.5">High-danger combinations (e.g. Passport Control + Hostage-like Restrictions) trigger a 1.25× multiplier on base weights.</div>
            </div>
            <div>
              <strong className="text-slate-300">3. Context Additions:</strong>
              <div className="text-slate-500 mt-0.5">Adds score modifiers for Salary Anomalies (+30 for excessive pay over local median), Telegram/WhatsApp contact risks (+10), and unknown employers (+5).</div>
            </div>
          </div>
          <p>
            The final score is capped at <strong>100% (High Risk)</strong>. High-risk indicators are colored red, medium yellow, and low green.
          </p>
        </div>
      )
    },
    {
      id: 'similarity',
      icon: <Fingerprint className="w-4 h-4 text-amber-500" />,
      title: 'Ad Similarities Calculation',
      summary: 'Identifying duplicate recruitment campaigns using character n-gram similarities.',
      details: (
        <div className="space-y-3 leading-relaxed text-slate-350">
          <p>
            Human trafficking operations frequently reuse identical job templates across multiple messaging channels. Sentinel detects these duplicate networks automatically.
          </p>
          <p>
            The system employs a <strong>character n-gram Jaccard similarity algorithm</strong>. It tokenizes the normalized text of job postings into overlapping segments and measures the intersection ratio between them.
          </p>
          <p className="font-mono text-[11px] text-slate-400 bg-[#0a0c12] p-2.5 rounded border border-slate-800">
            Jaccard Similarity = (Set A ∩ Set B) / (Set A ∪ Set B)
          </p>
          <p>
            Any similarity index greater than <strong>40%</strong> is flagged, letting analysts easily link separate advertisements to the same parent operation.
          </p>
        </div>
      )
    },
    {
      id: 'decoy',
      icon: <MessageSquare className="w-4 h-4 text-amber-500" />,
      title: 'Decoy Engagement Control',
      summary: 'Generating burner personas and operational templates to safely engage threat actors.',
      details: (
        <div className="space-y-3 leading-relaxed text-slate-350">
          <p>
            When gathering evidence, analysts must communicate with recruiters without exposing their identity. The <strong>Decoy Engagement Control</strong> helps automate this safely.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Burner Personas:</strong> Randomly generates aged profiles, hometowns, and realistic backstories matching regional target demographics.</li>
            <li><strong>Sanitized Resumes:</strong> Generates a full-length, professional PDF CV containing zero EXIF data, GPS coordinates, or tracking tags.</li>
            <li><strong>Chat Blueprints:</strong> Structured outreach templates grouped by phase (Hook, Visa verification, and Location checks) to systematically extract recruiter handles and coordinates.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'reverse-image',
      icon: <Image className="w-4 h-4 text-amber-500" />,
      title: 'Reverse Image OSINT',
      summary: 'Tracing original image flyer origins across public networks.',
      details: (
        <div className="space-y-3 leading-relaxed text-slate-350">
          <p>
            Images and flyers distributed on WhatsApp or Telegram can often be traced back to original recruitment postings or social media accounts.
          </p>
          <p>
            Sentinel includes built-in links to reverse search engines (Google Images, TinEye, Yandex). This lets analysts perform visual hashing matches to find initial publication sources, linked profiles, or warning posts from other monitoring networks.
          </p>
        </div>
      )
    },
    {
      id: 'exif',
      icon: <Eye className="w-4 h-4 text-amber-500" />,
      title: 'EXIF & Metadata Forensics',
      summary: 'Checking hidden metadata inside uploaded recruitment flyers.',
      details: (
        <div className="space-y-3 leading-relaxed text-slate-350">
          <p>
            Recruiters sometimes capture screenshots or upload document attachments containing hidden EXIF/metadata structures.
          </p>
          <p>
            The **File Forensics** modal extracts binary tag directories from uploaded PNG and JPEG assets, reporting camera manufacturer details, editing software history, creation timestamps, and GPS coordinates. Identifying these details helps locate recruitment operations centers.
          </p>
        </div>
      )
    },
    {
      id: 'heuristics',
      icon: <Languages className="w-4 h-4 text-amber-500" />,
      title: 'Dialect & Language Heuristics',
      summary: 'Analyzing language syntax anomalies to determine recruiter origin.',
      details: (
        <div className="space-y-3 leading-relaxed text-slate-350">
          <p>
            Many recruitment operations are managed by foreign syndicates writing translation-assisted local copy.
          </p>
          <p>
            The **Dialect Analyzer** runs specialized prompts via Gemini to detect translation patterns, unnatural syntax structures, spelling/vocabulary mix-ups, and regional character choices. The tool outputs a likelihood profile indicating the recruiter's native language origin.
          </p>
        </div>
      )
    }
  ];

  return (
    <div className="flex flex-col flex-1 p-4 max-w-2xl w-full mx-auto space-y-6">
      
      {/* Header */}
      <div className="space-y-1.5 border-b border-slate-800 pb-4">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2 font-mono">
          <HelpCircle className="w-6 h-6 text-amber-500" />
          Technical FAQ Console
        </h1>
        <p className="text-xs text-slate-500 font-mono">
          System documentation, analytical algorithms, and operational architecture guidelines.
        </p>
      </div>

      {/* Accordion List */}
      <div className="space-y-4">
        {faqItems.map((item) => {
          const isOpen = openSections[item.id];
          return (
            <div 
              key={item.id}
              className={`bg-[#111318] border rounded transition-all duration-300 overflow-hidden ${isOpen ? 'border-amber-500/30 shadow-[0_0_15px_-3px_rgba(245,158,11,0.06)]' : 'border-slate-800'}`}
            >
              <button
                type="button"
                onClick={() => toggleSection(item.id)}
                className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-900/30 transition-colors"
              >
                <div className="flex items-center gap-3 pr-4">
                  <div className={`p-2 rounded bg-slate-900 border ${isOpen ? 'border-amber-500/20 text-amber-500' : 'border-slate-800 text-slate-400'}`}>
                    {item.icon}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-200 font-mono tracking-wide">
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {item.summary}
                    </p>
                  </div>
                </div>
                <div>
                  {isOpen ? (
                    <ChevronUp className="w-5 h-5 text-amber-500" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-500" />
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="px-5 pb-5 pt-3 border-t border-slate-800/50 bg-[#0c0f14]/30 text-xs text-slate-300">
                  {item.details}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded font-mono text-[10px] text-slate-500 leading-relaxed text-center">
        This FAQ covers System Version 0.8.0. For technical support, contact the Security Operations Center (SOC).
      </div>

    </div>
  );
}
