/**
 * Sanitizes terminology to be trauma-informed (e.g. replacing 'victim' with 'worker').
 */
export const sanitizeTraumaLanguage = (text) => {
  if (!text) return text;
  return text.replace(/\bvictim\b/gi, "worker").replace(/\bvictims\b/gi, "workers");
};

/**
 * Normalizes text to start with a tentative phrasing appropriate for threat predictions.
 */
export const makeTentative = (text) => {
  if (!text) return text;
  let t = sanitizeTraumaLanguage(text.trim());
  
  // If it already starts with a tentative prefix, leave it
  if (/^(it's probable|it is probable|it's possible|it is possible|it might|recruiter might|workers might|probably|possibly)/i.test(t)) {
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // Handle present participle (-ing) verb starts
  if (/^[a-zA-Z]+ing\b/i.test(t)) {
    t = t.charAt(0).toLowerCase() + t.slice(1);
    return `It is probable that this stage involves ${t}`;
  }
  
  // Specific replacements for common patterns
  t = t.replace(/^workers are subjected to/i, "it's probable that workers are subjected to");
  t = t.replace(/^recruiter will likely use/i, "it's probable that the recruiter will use");
  t = t.replace(/^recruiter will use/i, "it's probable that the recruiter will use");
  t = t.replace(/^workers might be/i, "it's possible that workers might be");
  t = t.replace(/^workers are/i, "it is possible that workers are");
  t = t.replace(/^recruiter requests/i, "it is probable that the recruiter will request");
  t = t.replace(/^recruiter demands/i, "it is probable that the recruiter will demand");
  t = t.replace(/^arranges/i, "it is probable that the recruiter will arrange");
  
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/**
 * Generates pre-populated email templates for trust and safety report dispatches.
 */
export const getTakedownDetails = (contactMethod, jobUrl) => {
  const method = (contactMethod || '').toLowerCase();
  const url = (jobUrl || '').toLowerCase();
  
  if (method.includes('telegram') || method.includes('@') || url.includes('t.me') || url.includes('telegram.org')) {
    const handle = contactMethod.replace(/Telegram:\s*@?/i, '').replace(/@/, '').trim() || 'suspect_recruiter';
    return {
      platform: 'Telegram',
      target: 'abuse@telegram.org',
      webLink: 'https://telegram.org/support',
      subject: `[ALERT] Severe Exploitation & Trafficking Activity - Telegram Handle: @${handle}`,
      body: `Dear Telegram Trust & Safety Team,\n\nI am writing to report the Telegram handle @${handle} for severe violations of Telegram's Terms of Service regarding human exploitation and deceptive recruiting.\n\nOur OSINT safety scanner, Sentinel AI, has analyzed recruitment advertisements posted by this account and flagged multiple high-confidence indicators of labor trafficking, including:\n- Migration to encrypted chat platforms for isolation\n- Promises of high-pressure offshore relocation\n- Suspect security profiles\n\nEvidence Details:\n- Handle: @${handle}\n- Target Group/Posting Reference: ${jobUrl || 'Not specified'}\n\nPlease review and terminate this account immediately to protect people at risk from exploitation.\n\nSincerely,\nSentinel AI Safety Operations & Investigators`
    };
  }
  
  if (method.includes('whatsapp') || method.includes('+') || url.includes('wa.me') || url.includes('whatsapp.com')) {
    const phone = contactMethod.replace(/WhatsApp:\s*/i, '').trim() || 'unknown_number';
    return {
      platform: 'WhatsApp',
      target: 'support@whatsapp.com',
      webLink: 'https://www.whatsapp.com/contact/',
      subject: `[ALERT] Severe Human Exploitation & Deceptive Recruiting - WhatsApp: ${phone}`,
      body: `Dear WhatsApp Trust & Safety Team,\n\nI am reporting the WhatsApp account associated with the phone number ${phone} for violations of the WhatsApp Terms of Service, specifically involving human exploitation and fraudulent recruiting.\n\nOur system has identified threat indicators linked to this recruiter, including deceptive job postings reaching people in situations of vulnerability with promises of high salaries and relocation under high-pressure conditions.\n\nEvidence Details:\n- Phone/Account: ${phone}\n- Active Posting: ${jobUrl || 'Not specified'}\n\nWe request immediate investigation and suspension of this account to mitigate ongoing risk.\n\nSincerely,\nSentinel AI Safety Operations & Investigators`
    };
  }

  if (method.includes('email') || method.includes('.') && method.includes('@')) {
    const email = contactMethod.replace(/Email:\s*/i, '').trim() || 'abuse@domain.com';
    const domain = email.includes('@') ? email.split('@')[1] : 'domain.com';
    return {
      platform: 'Email Host',
      target: `abuse@${domain}`,
      webLink: null,
      subject: `[ALERT] Abuse Report: Human Exploitation & Fraudulent Recruiting - ${email}`,
      body: `Dear Abuse Operations Team,\n\nI am reporting the email address ${email} hosted on your network for engaging in human exploitation, forced labor, or deceptive recruiting campaigns.\n\nOur security scanner has compiled verified red-flag indicators associated with job advertisements utilizing this contact email. We request immediate suspension of this address.\n\nDetails:\n- Target Email: ${email}\n- Associated URL: ${jobUrl || 'Not specified'}\n\nSincerely,\nSentinel AI Safety Operations`
    };
  }
  
  // Default fallback for custom websites
  const domain = url.replace(/https?:\/\/(www\.)?/, '').split('/')[0] || 'domain.com';
  return {
    platform: 'Web Host',
    target: `abuse@${domain}`,
    webLink: null,
    subject: `[ALERT] Abuse Report: Deceptive Recruiting & Labor Exploitation on ${domain}`,
    body: `Dear Abuse Department,\n\nI am writing to report deceptive recruiting practices and human exploitation hosted at the following URL:\n${jobUrl || 'http://' + domain}\n\nOur safety analysis engine has flagged this posting with severe risk metrics, indicating recruitment campaigns linked to labor trafficking rings.\n\nPlease suspend the hosting or domain registration for this site immediately to protect public safety.\n\nSincerely,\nSentinel AI Safety Operations`
  };
};

/**
 * Builds a plain text summary representation of the case dossier.
 */
export const buildCaseSummary = ({
  caseId,
  jobTitle,
  score,
  riskLabel,
  auditStatus,
  location,
  contactMethod,
  sourcePlatform,
  salaryRange,
  employer,
  scoreDetails = [],
  playbookData = [],
  notes = ''
}) => {
  const L = [];
  L.push('SENTINEL AI — CASE SUMMARY');
  L.push('==========================');
  L.push(`Case ID:    ${caseId}`);
  L.push(`Job Title:  ${jobTitle || 'Unknown'}`);
  L.push(`Risk Score: ${score}/100 (${riskLabel})`);
  L.push(`Status:     ${auditStatus}`);
  if (location) L.push(`Location:   ${location}`);
  if (contactMethod) L.push(`Contact:    ${contactMethod}`);
  if (sourcePlatform && sourcePlatform !== 'unspecified') L.push(`Platform:   ${sourcePlatform}`);
  if (salaryRange) L.push(`Salary:     ${salaryRange}`);
  if (employer) L.push(`Employer:   ${employer}`);

  if (scoreDetails && scoreDetails.length > 0) {
    L.push('');
    L.push('RISK BREAKDOWN');
    [...scoreDetails].sort((a, b) => b.weight - a.weight).forEach(d => L.push(`  • ${d.name} (+${d.weight})`));
  }

  if (playbookData.length > 0) {
    L.push('');
    L.push('PREDICTED ESCALATION STAGES');
    playbookData.forEach((s, i) => {
      const stage = s.phase?.replace(/^Stage \d+:\s*/i, '') || s.phase || `Stage ${i + 1}`;
      L.push(`  ${i + 1}. ${stage}: ${makeTentative(s.tactic)}`);
    });
  }

  if (notes && notes.trim()) {
    L.push('');
    L.push('ANALYST NOTES');
    L.push(`  ${notes.trim()}`);
  }

  L.push('');
  L.push(`Generated ${new Date().toLocaleString()} · Sentinel AI OSINT Registry`);
  return L.join('\n');
};

export const getCleanContactValue = (val) => {
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

// Local-timezone day bucket key, shared by the poster activity timeline and evidence log filter
export const dayKeyOf = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
