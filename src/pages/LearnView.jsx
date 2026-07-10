import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, Circle, Heart, AlertTriangle, Shield, Users, Globe, FileText, BarChart3, Upload, Network, Scale, Leaf, HelpCircle, Award, Download } from 'lucide-react';

const WELLBEING_KEY = 'sentinel_learn_wellbeing_acknowledged';
const PROGRESS_KEY = 'sentinel_learn_progress';

// ─── Module definitions ───────────────────────────────────────────────────────

const PLATFORM_MODULES = [
  {
    id: 'risk-score',
    icon: <BarChart3 className="w-4 h-4" />,
    title: 'Understanding the risk score',
    duration: '5 min',
    content: (
      <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
        <p>
          The risk score is a weighted indicator — not a verdict. A high score means a posting contains
          multiple patterns associated with deceptive recruitment. It does not confirm that exploitation
          has occurred, and a low score does not mean a posting is safe.
        </p>
        <div className="bg-[#0a0c12] border border-slate-800 rounded p-4 space-y-3">
          <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold">Score thresholds</p>
          <div className="space-y-2">
            {[
              { range: '0–29%', label: 'Low indicators', color: 'text-emerald-400', note: 'Few or no flags. Analyst review still recommended.' },
              { range: '30–59%', label: 'Moderate indicators', color: 'text-amber-400', note: 'Multiple flags present. Warrants closer review.' },
              { range: '60–100%', label: 'High indicators', color: 'text-red-400', note: 'Strong pattern match. Prioritise for investigation.' },
            ].map(t => (
              <div key={t.range} className="flex items-start gap-3">
                <span className={`font-mono text-xs font-bold w-16 flex-shrink-0 mt-0.5 ${t.color}`}>{t.range}</span>
                <div>
                  <span className={`font-mono text-xs font-bold ${t.color}`}>{t.label}</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">{t.note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-slate-400">
          <strong className="text-slate-200">Analyst judgment is always required.</strong> The score is one input
          among many. Context — platform, region, labour market conditions, local salary norms — must
          inform every review. The tool flags; analysts decide.
        </p>
        <div className="border-l-2 border-amber-500/40 pl-4 text-slate-400 text-sm italic">
          Each record in this system represents a real posting that may have reached real people.
          Treat every scan with that weight.
        </div>
      </div>
    ),
    quiz: {
      question: "Which of the following best describes the Sentinel AI risk score?",
      options: [
        "A definitive verdict confirming whether exploitation has occurred.",
        "A weighted indicator of suspicious patterns where analyst judgment is always required.",
        "An automated system that replaces the need for human analysts."
      ],
      correctIndex: 1,
      explanation: "The risk score flags patterns, but analyst judgment is always required to review region, local norms, and platform context."
    }
  },
  {
    id: 'scan-posting',
    icon: <Upload className="w-4 h-4" />,
    title: 'Scanning a single posting',
    duration: '7 min',
    content: (
      <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
        <p>
          The scanner accepts three input types. Choose whichever matches how you encountered the posting.
        </p>
        <div className="space-y-3">
          {[
            { method: 'Camera / screenshot', when: 'You have a photo of a physical flyer or a screengrab of a digital post.', tip: 'Ensure text is legible. The AI will OCR and translate automatically.' },
            { method: 'Image upload', when: 'You have a saved image file (JPG, PNG, PDF).', tip: 'EXIF metadata is stripped automatically before processing.' },
            { method: 'Paste text', when: 'You can copy the text of the posting directly.', tip: 'Most reliable for accuracy — no OCR step needed.' },
          ].map(m => (
            <div key={m.method} className="bg-[#0a0c12] border border-slate-800 rounded p-3 space-y-1">
              <p className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider">{m.method}</p>
              <p className="text-[12px] text-slate-300"><strong>When:</strong> {m.when}</p>
              <p className="text-[11px] text-slate-500">{m.tip}</p>
            </div>
          ))}
        </div>
        <p className="text-slate-400">
          After scanning, the <strong className="text-slate-200">Review screen</strong> shows the original text
          with suspicious phrases highlighted. Hover any highlight to see which indicator it matched and why.
          Use the playbook panel to understand the recruitment pattern identified — this is investigative
          context, not a prediction of what will happen to any individual.
        </p>
        <p className="text-slate-400">
          Before saving, add the source platform and URL in the metadata panel. This improves network
          analysis and makes takedown reporting more effective.
        </p>
      </div>
    )
  },
  {
    id: 'batch-import',
    icon: <FileText className="w-4 h-4" />,
    title: 'Batch CSV import',
    duration: '5 min',
    content: (
      <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
        <p>
          Batch import lets you analyse multiple postings at once — useful when working with data exports
          from partner organisations or scraped listing archives.
        </p>
        <div className="bg-[#0a0c12] border border-slate-800 rounded p-4 space-y-2">
          <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold">Minimum required columns</p>
          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
            {['job_title', 'description', 'location', 'contact_method', 'salary', 'employer'].map(col => (
              <div key={col} className="flex items-center gap-1.5 text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                {col}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Column names are flexible — the importer will ask you to map your columns before processing.
          </p>
        </div>
        <p className="text-slate-400">
          Each row is processed individually. Results are saved to the scan history under a named batch,
          so you can review, filter, or export them as a group. Suspicious spans and risk scores are
          preserved across batch imports.
        </p>
        <div className="border border-amber-500/20 bg-amber-500/5 rounded p-3 text-[12px] text-amber-300">
          <strong>Data handling reminder:</strong> If a CSV contains data sourced from affected individuals
          (e.g. community reports), ensure you have appropriate consent and handling protocols before
          importing. Do not include personal identifiers of people who sought help.
        </div>
      </div>
    )
  },
  {
    id: 'network-graph',
    icon: <Network className="w-4 h-4" />,
    title: 'Reading the connection graph',
    duration: '6 min',
    content: (
      <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
        <p>
          The network graph maps shared contact methods across postings. A hub forms when the same
          Telegram handle, WhatsApp number, or email address appears in multiple job ads.
        </p>
        <div className="space-y-3">
          {[
            { term: 'Hub', def: 'A contact method shared by 2 or more postings. Hub size scales with the number of postings linked to it.' },
            { term: 'Edge', def: 'A connection between a posting and a contact hub. A single posting can have multiple edges if it lists multiple contacts.' },
            { term: 'Cluster', def: 'A group of postings and hubs that are densely interconnected — suggesting coordinated posting activity from a single origin.' },
          ].map(item => (
            <div key={item.term} className="flex gap-3 bg-[#0a0c12] border border-slate-800 rounded p-3">
              <span className="font-mono text-xs font-bold text-purple-400 w-14 flex-shrink-0 mt-0.5">{item.term}</span>
              <p className="text-[12px] text-slate-400">{item.def}</p>
            </div>
          ))}
        </div>
        <p className="text-slate-400">
          <strong className="text-slate-200">Limitations:</strong> A shared contact does not prove coordination.
          Legitimate recruitment agencies also reuse contact methods across postings. Always review the
          content of linked postings before drawing conclusions. The graph is a pattern-finding tool,
          not evidence of wrongdoing.
        </p>
      </div>
    )
  },
  {
    id: 'wellbeing',
    icon: <Heart className="w-4 h-4" />,
    title: 'Analyst wellbeing and vicarious trauma',
    duration: '4 min',
    content: (
      <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
        <div className="border border-amber-500/30 bg-amber-500/5 rounded p-4 space-y-2">
          <p className="text-amber-300 font-mono text-[11px] font-bold uppercase tracking-wider">Before continuing</p>
          <p className="text-slate-300">
            This work involves sustained exposure to content describing deceptive and harmful practices.
            That exposure has a cumulative effect. This module exists because your wellbeing matters —
            not as a checkbox, but as a prerequisite for doing this work sustainably and well.
          </p>
        </div>
        <p className="text-slate-400">
          <strong className="text-slate-200">Vicarious trauma</strong> can develop from repeated exposure
          to accounts of harm, even indirectly through documents and data. Signs include:
        </p>
        <ul className="list-none space-y-1.5 text-slate-400">
          {[
            'Intrusive thoughts about cases outside of working hours',
            'Emotional numbness or detachment from the work',
            'Difficulty concentrating or increased cynicism',
            'Changes in your sense of safety or trust in the world',
          ].map(sign => (
            <li key={sign} className="flex items-start gap-2 text-[12px]">
              <span className="text-amber-500 mt-1 flex-shrink-0">•</span>
              {sign}
            </li>
          ))}
        </ul>
        <p className="text-slate-400">
          These are normal responses to difficult work — not weaknesses. If you notice them, speak to
          your organisation's designated support contact or a licensed counsellor.
        </p>
        <div className="bg-[#0a0c12] border border-slate-800 rounded p-4 space-y-2">
          <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold">Practical boundaries for this tool</p>
          <ul className="space-y-1.5 text-[12px] text-slate-400">
            {[
              'Set a daily time limit for scanning and reviewing content.',
              'Do not work alone on high-volume batch imports of distressing content.',
              'Take breaks between reviewing individual high-risk postings.',
              'The playbook and context sections are analytical — step away if they feel activating.',
            ].map(tip => (
              <li key={tip} className="flex items-start gap-2">
                <span className="text-emerald-500 mt-1 flex-shrink-0">•</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  },
  {
    id: 'data-dignity',
    icon: <Shield className="w-4 h-4" />,
    title: 'Data dignity and responsible handling',
    duration: '4 min',
    content: (
      <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
        <p>
          Every scan record in this system corresponds to a real job posting that may have been seen —
          and acted upon — by real people. Treating records as data points alone misses that weight.
        </p>
        <div className="space-y-3">
          {[
            {
              heading: 'Do not enter personal information about affected individuals',
              body: 'The investigator notes field is for case analysis — not for storing names, phone numbers, or identifying details of people who responded to a posting. Those belong in secure, consent-governed case management systems.'
            },
            {
              heading: 'Anonymise before sharing',
              body: 'If exporting a scan or sharing a PDF poster, remove or obscure any information that could identify an individual who encountered the posting.'
            },
            {
              heading: 'STIX exports are for law enforcement and partner NGOs only',
              body: 'Intelligence exports contain aggregated evidence. They should only be shared through verified, secure channels with authorised partners.'
            },
            {
              heading: 'Deletion is available',
              body: 'Individual scans and entire batches can be deleted from history. If you imported data that should not have been in the system, remove it promptly.'
            },
          ].map(item => (
            <div key={item.heading} className="bg-[#0a0c12] border border-slate-800 rounded p-3 space-y-1">
              <p className="text-[12px] font-bold text-slate-200">{item.heading}</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    ),
    quiz: {
      question: "Where should personal identifiers (names, phone numbers) of affected individuals be stored?",
      options: [
        "In the investigator notes field of the scan for easy access.",
        "In secure, consent-governed case management systems—never in the investigator notes field.",
        "They should not be stored anywhere and should be deleted immediately from all systems."
      ],
      correctIndex: 1,
      explanation: "Investigator notes are for case analysis. Personal identifiers of people who sought help belong in secure, consent-governed systems."
    }
  },
];

const CONTEXT_MODULES = [
  {
    id: 'structural-causes',
    icon: <Globe className="w-4 h-4" />,
    title: 'Structural causes: why deceptive recruitment persists',
    duration: '8 min',
    content: (
      <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
        <p>
          Deceptive recruitment does not arise from individual bad actors alone. It is enabled by
          structural conditions — economic, political, and legal — that create both the supply of
          people in situations of vulnerability and the demand for exploitable labour.
        </p>
        <div className="space-y-3">
          {[
            {
              factor: 'Labour migration pressures',
              detail: 'Across Southeast Asia, millions of people migrate for work each year. Formal, safe migration channels are expensive, bureaucratically complex, and often inaccessible to people without higher education or resources. This gap is filled by informal recruiters — some legitimate, some not. Deceptive advertisers exploit the same pathways that legitimate migration uses.'
            },
            {
              factor: 'Land displacement and rural precarity',
              detail: 'Cambodia in particular has seen significant land dispossession since the 1990s, as large-scale agricultural concessions displaced rural communities. People who lose land-based livelihoods enter a labour market with limited options. This economic vulnerability is structural — created by policy decisions, not individual choices.'
            },
            {
              factor: 'Border economies and special economic zones',
              detail: 'The Cambodia–Thailand–Myanmar border region hosts a network of special economic zones operating with limited labour oversight. Some zones have been documented as locations where coerced labour is concentrated. Deceptive ads frequently target workers toward these zones under the guise of legitimate employment.'
            },
            {
              factor: 'Digital platform accountability gaps',
              detail: 'Facebook, Telegram, and WhatsApp are the primary vectors for deceptive job advertising in Southeast Asia. Platform content moderation in local languages (Khmer, Burmese, Thai) remains inadequate. Job listings that would be flagged in English pass without review.'
            },
            {
              factor: 'Demand for unregulated labour',
              detail: 'Online fraud operations — the primary destination for coerced workers in the SEA cyber-scam compound phenomenon — are driven by demand for workers who can be controlled. That demand is not incidental; it is profit-driven and organised. Understanding this is essential to targeting interventions effectively.'
            },
          ].map(item => (
            <div key={item.factor} className="border-l-2 border-amber-500/30 pl-4 space-y-1">
              <p className="text-[12px] font-bold text-amber-300">{item.factor}</p>
              <p className="text-[12px] text-slate-400 leading-relaxed">{item.detail}</p>
            </div>
          ))}
        </div>
        <p className="text-slate-500 text-[12px] italic">
          Sources: ILO reports on labour migration in ASEAN; LICADHO land rights documentation;
          IJM cyber-scam compound reports; UN Special Rapporteur on Trafficking in Persons.
        </p>
      </div>
    )
  },
  {
    id: 'recruitment-design',
    icon: <AlertTriangle className="w-4 h-4" />,
    title: 'How deceptive recruitment is designed',
    duration: '7 min',
    content: (
      <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
        <p>
          Deceptive job advertisements are not random — they are carefully engineered. Understanding
          their design helps analysts recognise patterns that may not be obvious from a single ad.
        </p>
        <div className="space-y-3">
          {[
            {
              tactic: 'Salary anchoring above local norms',
              explanation: 'Advertised salaries are set significantly above the median for the target country and job type. This is not generosity — it is calibration. The figure is high enough to be compelling but not so extreme as to seem implausible. The scanner\'s salary comparison feature flags this automatically.'
            },
            {
              tactic: 'Vague job titles and shifting descriptions',
              explanation: '"Customer service", "online assistant", "data entry" — titles that are plausible and broad. The job description is often deliberately vague. Specific duties are disclosed only after the worker has committed to travel or signed documents.'
            },
            {
              tactic: 'Urgency and exclusivity framing',
              explanation: '"Immediate vacancy", "only 3 spots left", "apply today". Urgency reduces the time a person has to verify the opportunity, consult family, or seek a second opinion — all of which might reveal the deception.'
            },
            {
              tactic: 'Benefits that transfer risk to the worker',
              explanation: '"Flight covered" or "housing provided" sound like benefits. They are also mechanisms: once a worker has travelled and is housed in an employer-controlled location, their ability to leave is severely constrained.'
            },
            {
              tactic: 'Platform migration as an early signal',
              explanation: 'Initial contact often happens on public platforms (Facebook, job boards), then quickly moves to private messaging (Telegram, WhatsApp). This migration serves two purposes: it moves the interaction out of visible, monitorable space, and it begins the process of isolation.'
            },
          ].map(item => (
            <div key={item.tactic} className="bg-[#0a0c12] border border-slate-800 rounded p-3 space-y-1.5">
              <p className="text-[12px] font-bold text-slate-200">{item.tactic}</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">{item.explanation}</p>
            </div>
          ))}
        </div>
        <p className="text-slate-400">
          These tactics are not unique to any one country or network — they appear across different
          regions and languages because they are effective. The scanner's flag system is built on
          documented patterns from field research and prosecution records.
        </p>
      </div>
    )
  },
  {
    id: 'cambodia-context',
    icon: <Leaf className="w-4 h-4" />,
    title: 'Cambodia: community context and the SEA corridor',
    duration: '10 min',
    needsWellbeing: true,
    content: (
      <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
        <div className="border border-slate-700 bg-slate-900/40 rounded p-4 space-y-2">
          <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold">Before reading</p>
          <p className="text-slate-400 text-[12px]">
            This module discusses the experiences of communities affected by deceptive recruitment in
            Cambodia and the broader Southeast Asia corridor. The focus is on structural context and
            community response — not individual accounts of harm. If at any point the content feels
            activating, step away and return when ready. There is no requirement to complete this
            module in a single sitting.
          </p>
        </div>
        <p>
          Cambodia sits at the centre of one of the most documented deceptive recruitment corridors
          in Southeast Asia. Understanding why requires understanding the country's recent history —
          not as a backdrop for tragedy, but as a context for community resilience and organised resistance.
        </p>
        <div className="space-y-3">
          <div className="border-l-2 border-teal-500/40 pl-4 space-y-1">
            <p className="text-[12px] font-bold text-teal-300">Economic context</p>
            <p className="text-[12px] text-slate-400 leading-relaxed">
              Cambodia is one of the fastest-growing economies in Southeast Asia, yet growth has been
              concentrated. A garment sector employing over 700,000 workers — mostly women — has faced
              significant disruption from global supply chain shifts. Rural communities displaced by
              agricultural land concessions have few formal employment alternatives. These conditions
              create the economic pressure that deceptive recruiters exploit.
            </p>
          </div>
          <div className="border-l-2 border-teal-500/40 pl-4 space-y-1">
            <p className="text-[12px] font-bold text-teal-300">The border zone phenomenon</p>
            <p className="text-[12px] text-slate-400 leading-relaxed">
              The Cambodia–Thailand border at Poipet, and border areas adjacent to Myanmar's Myawaddy,
              have been documented by IJM, UNODC, and Cambodian NGOs as locations where coerced
              labour operations are concentrated. These areas operate within "special economic zones"
              that have limited labour law enforcement. Job advertisements targeting workers toward
              these zones are a primary focus of this platform's detection logic.
            </p>
          </div>
          <div className="border-l-2 border-teal-500/40 pl-4 space-y-1">
            <p className="text-[12px] font-bold text-teal-300">Who is targeted — and why framing matters</p>
            <p className="text-[12px] text-slate-400 leading-relaxed">
              People who respond to deceptive advertisements are not naive. They are making rational
              decisions based on the information available to them. Research by CHAB DAI and others
              shows that many are educated, employed, and actively weighing options — they are targeted
              precisely because they are capable and motivated. Framing affected individuals as
              "vulnerable" without acknowledging their agency misrepresents their experience and
              undermines effective prevention.
            </p>
          </div>
          <div className="border-l-2 border-emerald-500/40 pl-4 space-y-1">
            <p className="text-[12px] font-bold text-emerald-300">Community response and survivor leadership</p>
            <p className="text-[12px] text-slate-400 leading-relaxed">
              Cambodia has a strong survivor-led advocacy movement. Organisations including{' '}
              <strong className="text-slate-200">CHAB DAI Coalition</strong>, founded and led by
              survivors of exploitation, conduct community education, survivor reintegration support,
              and policy advocacy. <strong className="text-slate-200">LICADHO</strong> documents land
              rights violations and their connection to labour displacement.{' '}
              <strong className="text-slate-200">Cambodian Women's Crisis Center (CWCC)</strong> provides
              survivor-centred support services. These organisations — not external actors — are the
              primary authorities on community experience and effective response.
            </p>
          </div>
        </div>
        <p className="text-slate-500 text-[12px] italic">
          Key references: CHAB DAI Coalition (chabdai.org); LICADHO (licadho-cambodia.org);
          IJM Cambodia; UNODC reports on trafficking in the Mekong sub-region;
          ILO Mekong Labour Migration programme.
        </p>
      </div>
    )
  },
  {
    id: 'legal-framework',
    icon: <Scale className="w-4 h-4" />,
    title: 'Legal framework: rights, protections, and non-prosecution',
    duration: '6 min',
    content: (
      <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
        <p>
          Analysts using this platform should understand the legal frameworks that protect affected
          individuals — because those frameworks should shape every decision about how findings are
          used.
        </p>
        <div className="space-y-3">
          {[
            {
              title: 'Palermo Protocol (2000)',
              body: 'The UN Protocol to Prevent, Suppress and Punish Trafficking in Persons establishes the international definition of trafficking and obliges states to protect and assist trafficked persons — including those who may have been involved in unlawful acts as a direct result of being trafficked. This is the foundation of the non-prosecution principle.'
            },
            {
              title: 'Non-prosecution principle',
              body: 'Persons who have been trafficked should not be prosecuted for offences they committed as a direct consequence of being trafficked (e.g. immigration violations, document offences, or participation in illegal activities under coercion). This principle is recognised by OHCHR guidelines and is reflected in the laws of many countries — though implementation is inconsistent. If your investigation results in a referral, ensure the receiving agency understands and applies this principle.'
            },
            {
              title: 'Right to remain and reflection period',
              body: 'Many jurisdictions provide an official "reflection period" during which a trafficked person cannot be expelled and is entitled to support services, regardless of immigration status. Analysts working on live cases should know whether this applies in the relevant jurisdiction before any referral.'
            },
            {
              title: 'ILO Forced Labour Convention (No. 29) and Protocol (2014)',
              body: 'The ILO forced labour framework covers labour exploitation more broadly than the Palermo Protocol. The 2014 Protocol specifically requires states to take measures to prevent forced labour, protect affected workers, and ensure access to remedies including compensation.'
            },
            {
              title: 'Cambodian legal context',
              body: 'Cambodia\'s Law on Suppression of Human Trafficking and Sexual Exploitation (2008) provides a legal basis for prosecution, but enforcement is inconsistent. People who have been trafficked within Cambodia often encounter barriers to accessing justice, including fear of police, lack of legal identity documents, and retaliation risk. Referrals should go through organisations with established local trust, such as CHAB DAI or IJM Cambodia.'
            },
          ].map(item => (
            <div key={item.title} className="bg-[#0a0c12] border border-slate-800 rounded p-3 space-y-1.5">
              <p className="text-[12px] font-bold text-blue-300">{item.title}</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    ),
    quiz: {
      question: "What is the core meaning of the non-prosecution principle under human rights frameworks?",
      options: [
        "Recruiters who post deceptive ads cannot be prosecuted.",
        "Trafficked persons should not be prosecuted for offences committed as a direct consequence of being trafficked.",
        "NGOs are legally prohibited from reporting cases to local law enforcement."
      ],
      correctIndex: 1,
      explanation: "The non-prosecution principle ensures that affected individuals are not penalized for immigration, document, or other coerced offenses resulting from their trafficking."
    }
  },
  {
    id: 'community-response',
    icon: <Users className="w-4 h-4" />,
    title: 'Community-led response and survivor organisations',
    duration: '5 min',
    content: (
      <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
        <p>
          The most effective responses to deceptive recruitment are led by the communities most
          affected. Survivor-led organisations should be the primary point of contact for referrals,
          and their guidance should take precedence over external analytical conclusions.
        </p>
        <div className="space-y-3">
          {[
            {
              org: 'CHAB DAI Coalition',
              region: 'Cambodia',
              url: 'chabdai.org',
              focus: 'Survivor-led organisation founded in 2005. Conducts survivor reintegration support, community education, and policy advocacy. Considered the primary survivor-led authority in Cambodia.',
            },
            {
              org: 'LICADHO',
              region: 'Cambodia',
              url: 'licadho-cambodia.org',
              focus: 'Documents human rights violations including land rights abuses that contribute to labour displacement. Provides legal assistance and publishes field research.',
            },
            {
              org: 'IJM Cambodia',
              region: 'Cambodia / Regional',
              url: 'ijm.org',
              focus: 'International Justice Mission operates in Cambodia on forced labour and trafficking cases. Works with law enforcement on prosecutions. Produces detailed field reports on cyber-scam compound operations.',
            },
            {
              org: 'UNODC Regional Office for Southeast Asia',
              region: 'SEA region',
              url: 'unodc.org/roseap',
              focus: 'UN Office on Drugs and Crime coordinates regional responses, provides country data, and publishes the Global Report on Trafficking in Persons.',
            },
            {
              org: 'ILO Mekong Labour Migration programme',
              region: 'Mekong region',
              url: 'ilo.org',
              focus: 'Provides research, data, and practical tools for labour migration governance across Cambodia, Thailand, Myanmar, Laos, and Vietnam.',
            },
          ].map(org => (
            <div key={org.org} className="bg-[#0a0c12] border border-slate-800 rounded p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[12px] font-bold text-emerald-300">{org.org}</p>
                <span className="text-[9px] font-mono text-slate-500 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded flex-shrink-0">{org.region}</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">{org.focus}</p>
              <p className="text-[10px] font-mono text-amber-500/70">{org.url}</p>
            </div>
          ))}
        </div>
        <div className="border border-emerald-500/20 bg-emerald-500/5 rounded p-3 text-[12px] text-emerald-300">
          <strong>Referral principle:</strong> If your analysis leads to a case that requires direct
          support for an affected individual, do not act unilaterally. Route all referrals through
          established survivor-centred organisations with local presence and trust.
        </div>
      </div>
    )
  },
];

// ─── Module card ──────────────────────────────────────────────────────────────

function ModuleCard({ module, completed, onToggleComplete }) {
  const [open, setOpen] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizIsCorrect, setQuizIsCorrect] = useState(false);

  useEffect(() => {
    if (completed && module.quiz) {
      setQuizIsCorrect(true);
      setQuizSubmitted(true);
      setSelectedOption(module.quiz.correctIndex);
    } else if (!completed && module.quiz) {
      setQuizIsCorrect(false);
      setQuizSubmitted(false);
      setSelectedOption(null);
    }
  }, [completed, module.quiz]);

  return (
    <div className={`bg-[#111318] border rounded transition-all duration-200 ${open ? 'border-slate-700' : 'border-slate-800'}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-900/30 transition-colors rounded-t"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={`flex-shrink-0 ${completed ? 'text-emerald-400' : 'text-slate-500'}`}>
            {completed ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
          </span>
          <span className={`flex-shrink-0 ${completed ? 'text-emerald-400' : 'text-amber-500'}`}>
            {module.icon}
          </span>
          <div className="min-w-0">
            <p className={`text-xs font-mono font-bold uppercase tracking-wider truncate ${completed ? 'text-slate-400' : 'text-slate-200'}`}>
              {module.title}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-[9px] font-mono text-slate-600 hidden sm:block">{module.duration}</span>
          {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-slate-800/60">
          {module.content}

          {module.quiz && (
            <div className="bg-[#0a0c12] border border-slate-850 rounded p-4 mt-5 space-y-3">
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-amber-500 font-bold">
                <HelpCircle className="w-3.5 h-3.5" />
                Knowledge Check
              </div>
              <p className="text-xs text-slate-200 font-semibold">{module.quiz.question}</p>
              <div className="space-y-2">
                {module.quiz.options.map((option, idx) => {
                  const isSelected = selectedOption === idx;
                  const isCorrect = idx === module.quiz.correctIndex;
                  let btnStyle = "border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/30 text-slate-300";
                  if (quizSubmitted) {
                    if (isCorrect) {
                      btnStyle = "border-emerald-500/30 bg-emerald-950/20 text-emerald-400";
                    } else if (isSelected) {
                      btnStyle = "border-red-500/30 bg-red-950/20 text-red-400";
                    } else {
                      btnStyle = "border-slate-900/40 text-slate-500 opacity-60";
                    }
                  } else if (isSelected) {
                    btnStyle = "border-amber-500/40 bg-amber-500/5 text-amber-400";
                  }

                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={quizSubmitted}
                      onClick={() => setSelectedOption(idx)}
                      className={`w-full text-left p-3 rounded border text-xs transition-all flex items-start gap-2.5 ${btnStyle}`}
                    >
                      <span className="font-mono text-[10px] mt-0.5 opacity-60">[{String.fromCharCode(65 + idx)}]</span>
                      <span>{option}</span>
                    </button>
                  );
                })}
              </div>

              {!quizSubmitted ? (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    disabled={selectedOption === null}
                    onClick={() => {
                      setQuizSubmitted(true);
                      if (selectedOption === module.quiz.correctIndex) {
                        setQuizIsCorrect(true);
                      }
                    }}
                    className={`px-3 py-1.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider transition-all border ${
                      selectedOption === null
                        ? 'border-slate-800 text-slate-600 cursor-not-allowed'
                        : 'border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                    }`}
                  >
                    Submit Answer
                  </button>
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  {quizIsCorrect ? (
                    <div className="text-emerald-400 text-xs bg-emerald-950/10 border border-emerald-500/20 rounded p-3 space-y-1">
                      <p className="font-bold flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Correct!
                      </p>
                      <p className="text-slate-400 text-[11px] leading-relaxed">{module.quiz.explanation}</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-red-400 text-xs bg-red-950/10 border border-red-500/20 rounded p-3 space-y-1">
                        <p className="font-bold flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" /> Incorrect
                        </p>
                        <p className="text-slate-400 text-[11px] leading-relaxed">Review the content above and try again.</p>
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setQuizSubmitted(false);
                            setSelectedOption(null);
                          }}
                          className="px-3 py-1.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider transition-all border border-slate-700 text-slate-300 hover:bg-slate-900/30"
                        >
                          Try Again
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              disabled={!completed && module.quiz && !quizIsCorrect}
              onClick={() => onToggleComplete(module.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-mono font-bold uppercase tracking-wider transition-all border ${
                completed
                  ? 'border-slate-700 text-slate-500 hover:border-slate-600'
                  : (!completed && module.quiz && !quizIsCorrect)
                    ? 'border-slate-800 text-slate-600 opacity-50 cursor-not-allowed'
                    : 'border-emerald-700/50 bg-emerald-950/30 text-emerald-400 hover:bg-emerald-950/50'
              }`}
            >
              {completed ? (
                <><Circle className="w-3 h-3" /> Mark as unread</>
              ) : (
                <><CheckCircle2 className="w-3 h-3" /> Mark as complete</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export default function LearnView() {
  const [activeTab, setActiveTab] = useState('platform');
  const [progress, setProgress] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
    } catch {
      return {};
    }
  });
  const [wellbeingAck, setWellbeingAck] = useState(() =>
    localStorage.getItem(WELLBEING_KEY) === 'true'
  );

  useEffect(() => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  }, [progress]);

  const toggleComplete = (id) => {
    setProgress(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleExportCertificate = () => {
    const dateStr = new Date().toISOString();
    const hashInput = `SENTINEL-AI-CERT-${dateStr}-${completedCount}`;
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    const signature = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
    const certId = `SEN-LND-${signature}-${new Date().getFullYear()}`;

    const textContent = `========================================================================
                      SENTINEL AI PLATFORM
                 CERTIFICATE OF ONBOARDING COMPLETION
========================================================================

Certificate ID: ${certId}
Verification Date: ${new Date().toLocaleString()}
Status: VERIFIED (100% Onboarding Completed)

This document certifies that the holder has successfully completed all
required theoretical training modules on Sentinel AI for identification
of deceptive recruitment.

COMPLETED CURRICULUM:
------------------------------------------------------------------------
I. Platform Training
   - Understanding the Risk Score (Knowledge Verified)
   - Scanning a Single Posting
   - Batch CSV Import
   - Reading the Connection Graph
   - Analyst Wellbeing & Vicarious Trauma
   - Data Dignity & Responsible Handling (Knowledge Verified)

II. Context & Community
   - Structural Causes
   - How Deceptive Recruitment is Designed
   - Cambodia & Southeast Asia Corridor Context
   - Legal Framework & Non-Prosecution Principle (Knowledge Verified)
   - Community-Led Response & Survivor Organisations
------------------------------------------------------------------------

CRITICAL ETHICAL UNDERSTANDING:
1. Do No Harm: Analyst judgment is always required. Sentinel AI flags
   suspicious indicators, but humans make the final assessment.
2. Data Dignity: Personal identifiers of affected individuals must 
   NEVER be stored in investigator notes.
3. Non-Prosecution: Ensure that potential affected individuals are protected, not
   penalized for coerced offenses.
4. Referral Principle: All case referrals must go through established
   survivor-centered local organizations.

========================================================================
                      SECURE VERIFICATION TOKEN
                [ ${signature}-${dateStr.substring(0, 10)} ]
========================================================================
`;

    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sentinel_onboarding_certificate_${signature}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const allModules = [...PLATFORM_MODULES, ...CONTEXT_MODULES];
  const completedCount = allModules.filter(m => progress[m.id]).length;
  const totalCount = allModules.length;
  const progressPct = Math.round((completedCount / totalCount) * 100);

  const platformCompleted = PLATFORM_MODULES.filter(m => progress[m.id]).length;
  const contextCompleted = CONTEXT_MODULES.filter(m => progress[m.id]).length;

  return (
    <div className="flex flex-col flex-1 mt-4 max-w-screen-md w-full mx-auto space-y-6 pb-20 select-none">

      {/* Page header */}
      <div>
        <h1 className="font-mono text-sm uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
          <span className="text-amber-500 font-bold">▸</span> Learning & Development
        </h1>
        <p className="text-slate-500 text-xs mt-0.5">
          Platform training and community context — required reading before active investigation work.
        </p>
      </div>

      {/* Framing statement */}
      <div className="bg-[#0d1117] border border-amber-500/20 rounded p-5 space-y-2">
        <p className="text-[11px] font-mono uppercase tracking-widest text-amber-500/80 font-bold">Mission statement</p>
        <p className="text-sm text-slate-300 leading-relaxed">
          This platform exists to support the identification of deceptive recruitment — not to
          document suffering. Every posting in this system may have reached a real person who made
          a reasonable decision based on available information. This training exists to help you
          serve those people well: accurately, ethically, and without causing further harm.
        </p>
        <p className="text-xs text-slate-500 italic mt-1">
          Content in this L&D section is informed by UN Do No Harm guidelines, the OHCHR
          Recommended Principles on Human Rights and Human Trafficking, and the Palermo Protocol.
          Community context draws on published research by CHAB DAI Coalition, LICADHO, IJM,
          and the ILO Mekong Labour Migration programme.
        </p>
      </div>

      {/* Progress overview */}
      <div className="bg-[#111318] border border-slate-800 rounded p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold">Overall progress</span>
          <span className="text-[10px] font-mono text-slate-400">{completedCount} / {totalCount} modules</span>
        </div>
        <div className="w-full bg-slate-900 border border-slate-800 h-2 rounded-sm overflow-hidden">
          <div
            className="bg-amber-500 h-full rounded-sm transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="text-[10px] font-mono text-slate-500">
            Platform training: <span className="text-slate-300 font-bold">{platformCompleted}/{PLATFORM_MODULES.length}</span>
          </div>
          <div className="text-[10px] font-mono text-slate-500">
            Context & community: <span className="text-slate-300 font-bold">{contextCompleted}/{CONTEXT_MODULES.length}</span>
          </div>
        </div>

        {progressPct === 100 && (
          <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 bg-amber-500/5 -mx-4 -mb-4 p-4 rounded-b">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded border border-amber-500/20 text-amber-500">
                <Award className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <p className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider">Onboarding Completed</p>
                <p className="text-[11px] text-slate-400">All modules successfully read and knowledge verified.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleExportCertificate}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-md shadow-amber-500/10 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export Certificate
            </button>
          </div>
        )}
      </div>

      {/* Tab selector */}
      <div className="flex gap-2">
        {[
          { id: 'platform', label: 'Platform training', count: PLATFORM_MODULES.length },
          { id: 'context', label: 'Context & community', count: CONTEXT_MODULES.length },
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2.5 px-4 rounded border text-[11px] font-mono font-bold uppercase tracking-wider transition-all ${
              activeTab === tab.id
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                : 'border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'
            }`}
          >
            {tab.label}
            <span className="ml-2 text-[9px] opacity-60">({tab.count})</span>
          </button>
        ))}
      </div>

      {/* Platform training tab */}
      {activeTab === 'platform' && (
        <div className="space-y-3">
          <p className="text-[11px] text-slate-500 font-mono">
            Complete these modules before using the scanner for the first time, or when onboarding new team members.
          </p>
          {PLATFORM_MODULES.map(module => (
            <ModuleCard
              key={module.id}
              module={module}
              completed={!!progress[module.id]}
              onToggleComplete={toggleComplete}
            />
          ))}
        </div>
      )}

      {/* Context & community tab */}
      {activeTab === 'context' && (
        <div className="space-y-3">
          {/* Wellbeing acknowledgement gate */}
          {!wellbeingAck && (
            <div className="bg-[#111318] border border-amber-500/30 rounded p-5 space-y-4">
              <div className="flex items-start gap-3">
                <Heart className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400">Before reading this section</p>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    This section discusses the structural conditions and community experiences connected
                    to deceptive recruitment in Southeast Asia. Content is written to be informative
                    rather than graphic, and focuses on community agency and organised response.
                  </p>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    If at any point the material feels activating, step away. There is no time pressure.
                    If you have an organisational wellbeing contact, their details should be accessible
                    before you begin. If you need immediate support, contact your national crisis line.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setWellbeingAck(true);
                  localStorage.setItem(WELLBEING_KEY, 'true');
                }}
                className="w-full py-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[11px] font-mono font-bold uppercase tracking-wider rounded transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                I understand — continue to content
              </button>
            </div>
          )}

          {wellbeingAck && (
            <>
              <p className="text-[11px] text-slate-500 font-mono">
                Understanding the structural context behind deceptive recruitment makes analysis more
                accurate and referrals more appropriate. This section focuses on causes, not harm narratives.
              </p>
              {CONTEXT_MODULES.map(module => (
                <ModuleCard
                  key={module.id}
                  module={module}
                  completed={!!progress[module.id]}
                  onToggleComplete={toggleComplete}
                />
              ))}

              {/* Reset wellbeing acknowledgement */}
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setWellbeingAck(false);
                    localStorage.removeItem(WELLBEING_KEY);
                  }}
                  className="text-[10px] font-mono text-slate-600 hover:text-slate-500 transition-colors"
                >
                  Reset wellbeing acknowledgement
                </button>
              </div>
            </>
          )}
        </div>
      )}

    </div>
  );
}
