import React, { useState } from 'react';
import { HelpCircle, ChevronDown, ChevronUp, Cpu, Key, BarChart3, Fingerprint, MessageSquare, Image, Eye, Languages, ShieldAlert } from 'lucide-react';

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
      id: 'privacy',
      icon: <ShieldAlert className="w-4 h-4 text-amber-500" />,
      title: 'Model Provider & Data Privacy Disclosure',
      summary: 'Data protection policies, model providers, and how API keys are secured.',
      details: (
        <div className="space-y-3 leading-relaxed text-slate-355 text-slate-300">
          <p>
            Sentinel AI processes job listings and uploaded threat graphics using Google’s enterprise-tier developer API endpoints (specifically <strong>Gemini 2.5 Flash</strong> and <strong>Gemini 1.5 Pro</strong>).
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Data Retention Policy:</strong> To align with UN Do No Harm guidelines, all API calls are made directly from the analyst's browser to the official Google API endpoint. No text, image metadata, or document bytes are stored on intermediary servers.</li>
            <li><strong>Training Data Exclusion:</strong> According to Google Cloud’s standard developer API terms, data transmitted via commercial API keys is not used to train Google’s public foundation models.</li>
            <li><strong>Local Credential Security:</strong> Your Gemini API keys are stored solely in the local browser cache (LocalStorage / Settings) and are never transmitted to any third-party databases.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'architecture',
      icon: <Cpu className="w-4 h-4 text-amber-500" />,
      title: 'Overall App Architecture',
      summary: 'How Sentinel AI fits together: local browser components, databases, and secure analysis channels.',
      details: (
        <div className="space-y-3 leading-relaxed text-slate-350">
          <p>
            Sentinel AI is structured as a decentralized, <strong>analyst-first OSINT workspace</strong> designed to minimize data leakage and maintain high performance. The application operates primarily inside the analyst's browser as a single-page application built on React 18, Tailwind CSS, and Vite. This client-side runtime communicates directly with cloud-hosted database and intelligence services, eliminating the need for complex intermediate servers.
          </p>
          <div className="p-3 bg-[#0a0c12] border border-slate-800 rounded font-mono text-[11px] text-slate-400 space-y-1.5">
            <div><strong className="text-slate-300">Frontend Layer:</strong> React 18 SPA rendering interactive dashboards, real-time telemetry consoles, and network visualization graphs.</div>
            <div><strong className="text-slate-300">Storage Layer:</strong> Supabase PostgreSQL instances storing scans, analyzed metadata, burner profiles, and audit log history.</div>
            <div><strong className="text-slate-300">Local Caching:</strong> IndexedDB managed through Dexie.js, caching ongoing scans to prevent data loss during network disruptions.</div>
            <div><strong className="text-slate-300">Cognitive Services:</strong> Direct HTTPS REST endpoints communicating with Google Gemini API gateways using JSON structured outputs.</div>
          </div>
          <p>
            By executing processing logic directly in the browser (such as similarity checks and canvas image cropping) and using a cloud database for persistence, the platform scales efficiently. This prevents single points of failure and ensures analysts can run high-throughput sweeps while keeping operational infrastructure costs extremely low.
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
            Sentinel AI harnesses Google's state-of-the-art Gemini Large Language Models (LLMs) to perform high-precision Optical Character Recognition (OCR), entity extraction, and dialect analysis. To keep scans reliable and cost-effective, the app is optimized to handle rate limits (Resource Exhausted errors) and quota boundaries transparently.
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Model Tiering & Selection:</strong> The system defaults to <code>gemini-2.5-flash</code> for primary analyses due to its low latency and superior performance in structured JSON extraction. If more complex reasoning is required (e.g. detailed forensic analysis), the app supports manual or automatic escalation to high-reasoning models like <code>gemini-1.5-pro</code>.</li>
            <li><strong>Structured Schema Routing:</strong> Unlike generic chatbots, Sentinel utilizes structured schemas. Prompts are routed through the <code>/v1beta/</code> REST API path, passing strict JSON schemas to the model parameters. This forces the model to return syntactically valid JSON matching our internal TypeScript interfaces, avoiding parser failures.</li>
            <li><strong>Automated Fallback Cascades:</strong> To protect batch operations from API downtime or individual key rate limits, the system runs an automatic fallback chain. If a request fails, the service cycles through backup models (e.g., trying <code>gemini-2.5-flash</code>, then falling back to <code>gemini-1.5-flash</code>, <code>gemini-1.5-flash-latest</code>, or <code>gemini-1.5-pro</code>) in real-time.</li>
          </ul>
          <p>
            Additionally, the system tracks API calls through a visual telemetry console on the scanning screen, displaying connection metrics, attempts, warnings, and success logs. This makes it easy for analysts to diagnose API key health or quota limitations during bulk operations.
          </p>
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
            The Risk Score is a composite mathematical representation of how likely a job advertisement is to be associated with human trafficking, forced labor, or financial scams. Rather than relying on simple keywords, the platform uses a multi-layered scoring matrix that evaluates base indicators alongside contextual anomalies.
          </p>
          <div className="p-3 bg-[#0a0c12] border border-slate-800 rounded font-mono text-[11px] text-slate-400 space-y-3">
            <div>
              <strong className="text-slate-300">1. Base Threat Weights (Additive):</strong>
              <div className="text-slate-500 mt-0.5">Every detected indicator has a pre-defined severity weight. For example, "Passport/ID Control" adds +40, "Labor Abuse & Restrictions" adds +25, and "Excessive Enticements" adds +15.</div>
            </div>
            <div>
              <strong className="text-slate-300">2. Co-occurrence Combo Multipliers (Synergy):</strong>
              <div className="text-slate-500 mt-0.5">When multiple critical flags appear together, they suggest an active threat campaign. If flags like "Passport Control" and "High Pressure / Restrictions" are present simultaneously, the base score is scaled by a combo multiplier (e.g., 1.25×), adding a compounding threat bonus.</div>
            </div>
            <div>
              <strong className="text-slate-300">3. Contextual Anomalies (Adjustments):</strong>
              <div className="text-slate-500 mt-0.5">Calculates dynamic indicators like Local Salary Anomalies (+30 if the offered wage is &gt;150% above the country's median salary, or +15 if &gt;50%), suspicious messaging handles (+10 for Telegram/WhatsApp links), and employer anonymity (+5 for unverified companies).</div>
            </div>
          </div>
          <p>
            The raw score is capped at <strong>100% (High Risk)</strong>. Any changes made by an analyst—such as manually toggling red flags or updating employer notes—re-evaluate the score matrix in real-time, instantly refreshing the visual gauge on the review screen and updating database records.
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
            Recruitment networks frequently reuse exact job templates, flyers, and descriptions across hundreds of messaging channels (such as different Telegram chatrooms or WhatsApp groups). Sentinel AI identifies these interconnected networks by running real-time similarity audits.
          </p>
          <p>
            The system employs a **character n-gram Jaccard similarity algorithm**. When a job ad is parsed, the text is normalized (stripped of whitespace, punctuation, and capitalization) and broken down into overlapping character sequences of length N (n-grams). The similarity score represents the ratio of shared n-grams (intersection) to the total unique n-grams (union) between two postings.
          </p>
          <div className="p-3 bg-[#0a0c12] border border-slate-800 rounded font-mono text-[11px] text-slate-400">
            Formula: Similarity(A, B) = |n-grams(A) ∩ n-grams(B)| / |n-grams(A) ∪ n-grams(B)|
          </div>
          <p>
            If the similarity between the current ad and a historical record exceeds **40%**, the system marks them as connected. The dashboard and connections graph automatically link these records, allowing analysts to trace burner phone handles or syndicate recruiters operating under multiple aliases.
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
            Interacting with suspected human trafficking recruiters requires high operational security (OpSec). The **Decoy Engagement Control** panel provides tools that allow analysts to safely converse with recruiters, extract location details, and document transaction channels.
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Synthetic Personas:</strong> To prevent reverse profiling by recruiters, the system dynamically rolls randomized candidate identities complete with native regional names, ages, hometowns, and realistic background profiles reflecting the demographics commonly sought by exploitative recruiters.</li>
            <li><strong>Sanitized PDF Resume Builder:</strong> Automatically generates custom PDF CVs using professional templates. The generator outputs clean binary files that strip out EXIF metadata, tracking identifiers, creation timestamps, and GPS headers, preventing recruiters from tracing back the analyst's workstation.</li>
            <li><strong>Phased Conversation Blueprints:</strong> Organizes communication strategies into structured phases. Standard Outreach (establishing contact), Visa Audit (checking if passport withholding is mandatory), and Location Discovery (asking for compound transit details) help gather evidence systematically.</li>
          </ul>
          <p>
            By keeping the interaction structured and sanitizing all transmitted artifacts, analysts can trace payment wallets or alternative recruiter handles while keeping their true identity protected.
          </p>
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
            Recruiting materials are often distributed as graphics, memes, or screenshots in closed chat groups. Finding the original publisher of an image is a critical step in identifying human trafficking rings.
          </p>
          <p>
            Sentinel AI simplifies this process by integrating with reverse search indexes (including Google Images, TinEye, and Yandex). When a flyer is scanned, the tool calculates visual hash checks and generates search URLs.
          </p>
          <p>
            This allows analysts to run visual checks to see if the flyer has been indexed on public forums, linked to specific social media profiles (Facebook, LinkedIn, Twitter), or previously reported on anti-trafficking advisory channels. This helps analysts map the distribution reach of specific campaigns.
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
            Whenever a digital camera captures a photo or editing software saves a screenshot, hidden technical tags are embedded inside the image file structure. This information is called EXIF (Exchangeable Image File Format) metadata.
          </p>
          <p>
            The **File Forensics** engine opens a binary stream of uploaded PNG or JPEG flyers to read these hidden sections directly inside the browser.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>GPS Coordinates:</strong> Extracts geographic latitude and longitude indicating exactly where the camera took the photo.</li>
            <li><strong>Device Details:</strong> Retrieves details about camera models, phone manufacturers, and software build IDs.</li>
            <li><strong>Software Footprints:</strong> Detects editing applications (such as Photoshop, Canva, or screenshot tools) used to modify the flyer, along with original creation timestamps.</li>
          </ul>
          <p>
            This forensic evidence is displayed in a dedicated panel on the review screen, providing key location leads to help trace threat actors.
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
            Many recruitment ads target specific regional demographics but are written by foreign handlers. These handlers often rely on machine translation (such as Google Translate or DeepL) or have varying levels of local language fluency, which introduces unique dialect errors.
          </p>
          <p>
            The **Language OSINT Dialect Analyzer** uses Gemini models to analyze the grammatical syntax, vocabulary choices, spelling errors, and idioms in the advertisement text.
          </p>
          <p>
            The analyzer checks for literal word-for-word translations, unusual character choices (e.g. mixing Simplified Chinese symbols into regional scripts), or incorrect syntax. The system then outputs a probability profile highlighting the writer's native language origin.
          </p>
          <p>
            This analysis is logged to the investigation notes to help identify the location of the threat syndicate's operators.
          </p>
        </div>
      )
    }
  ];

  return (
    <div className="flex flex-col flex-1 p-4 max-w-screen-md w-full mx-auto space-y-6">
      
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
