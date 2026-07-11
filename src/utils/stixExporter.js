import { calculateRiskScore } from './scoring';

const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export function generateStixBundle({
  stixOptions,
  profile,
  user,
  formData,
  activeFlags,
  parsedSalaryUsd,
  locationCountry,
  detectedLanguage,
  suspiciousSpans,
  predictedPlaybook,
  sourcePlatform,
  sourceUrl,
  ingestionMethod,
  ocrText,
  translatedText,
  aiReview
}) {
  const bundleId = `bundle--${generateUUID()}`;
  const objects = [];

  // 1. Identity (Reporter)
  const identityId = `identity--${generateUUID()}`;
  const analystName = stixOptions.redactInvestigator 
    ? "Anonymous Sentinel Analyst" 
    : (profile?.display_name || user?.email || "Sentinel AI Analyst");
  
  objects.push({
    type: "identity",
    spec_version: "2.1",
    id: identityId,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    name: analystName,
    identity_class: "individual",
    description: "Anti-trafficking intelligence investigator using Sentinel AI Safety platform."
  });

  // 2. Threat Actor (Recruiter/Advertiser)
  const threatActorId = `threat-actor--${generateUUID()}`;
  const recruiterContact = formData.contact_method || "Unknown Contact";
  const recruiterEmployer = formData.employer_identity || "Unknown Organization";
  
  objects.push({
    type: "threat-actor",
    spec_version: "2.1",
    id: threatActorId,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    name: recruiterEmployer !== "Unknown Organization" ? recruiterEmployer : recruiterContact,
    description: `Suspected recruitment operations handler. Reported recruitment channels: ${recruiterContact}. Target recruitment sector: ${formData.industry || 'Unspecified'}. Target geolocation: ${formData.location || 'Unknown'}.`,
    threat_actor_types: ["sponsor"],
    goals: ["Deceptive recruitment for forced labor or high-pressure relocation scams"],
    sophistication: "minimal"
  });

  // 3. Indicator (Job advertisement / post)
  const indicatorId = `indicator--${generateUUID()}`;
  const riskScoreResult = calculateRiskScore(activeFlags, {
    parsedSalaryUsd,
    locationCountry,
    detectedLanguage,
    contactMethod: formData.contact_method,
    suspiciousSpans,
    predictedPlaybook,
    sourcePlatform,
    employer: formData.employer_identity
  });
  const currentScore = riskScoreResult.score;

  let indicatorDesc = `Job posting indicator flagged with Sentinel Risk Score of ${currentScore}/100.\n`;
  indicatorDesc += `Title: ${formData.job_title || 'Unspecified'}\n`;
  indicatorDesc += `Target Location: ${formData.location || 'Unspecified'}\n`;
  indicatorDesc += `Salary Offered: ${formData.salary_range || 'Unspecified'}\n`;

  if (stixOptions.includeFlags && activeFlags.length > 0) {
    indicatorDesc += `\nIdentified Risk Indicators:\n` + activeFlags.map(f => `- ${f}`).join('\n') + `\n`;
  }

  if (stixOptions.includeGemini && aiReview) {
    indicatorDesc += `\nSentinel AI Operational Assessment:\n${aiReview}\n`;
  }

  if (!stixOptions.redactText) {
    const rawText = ocrText || formData.job_title; // fallback
    indicatorDesc += `\nIngested Advertisement Text Reference:\n${rawText}\n`;
    if (translatedText) {
      indicatorDesc += `\nTranslated Text Reference:\n${translatedText}\n`;
    }
  } else {
    indicatorDesc += `\n[Ingested Advertisement Text Reference Redacted for Safety/Privacy]\n`;
  }

  // Pattern representation
  let patternParts = [];
  if (formData.contact_method) {
    patternParts.push(`contact-method = '${formData.contact_method}'`);
  }
  if (sourceUrl && sourceUrl !== 'unspecified') {
    patternParts.push(`url = '${sourceUrl}'`);
  }
  const patternStr = patternParts.length > 0 ? `[${patternParts.join(' AND ')}]` : `[job-posting = '${formData.job_title}']`;

  objects.push({
    type: "indicator",
    spec_version: "2.1",
    id: indicatorId,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    name: `Sentinel Indicator: Deceptive Recruitment Campaign - ${formData.job_title || 'Unknown Title'}`,
    description: indicatorDesc.trim(),
    indicator_types: ["compromised-advertisement"],
    pattern: patternStr,
    pattern_type: "stix",
    valid_from: new Date().toISOString()
  });

  // 4. Relationship: Threat Actor is linked to the Indicator
  const relationshipId = `relationship--${generateUUID()}`;
  objects.push({
    type: "relationship",
    spec_version: "2.1",
    id: relationshipId,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    relationship_type: "indicates",
    source_ref: indicatorId,
    target_ref: threatActorId,
    description: `Indicator indicates presence of recruiter networks.`
  });

  // 5. Relationship: Reporter (Identity) created/observed the Indicator
  const observationRelationshipId = `relationship--${generateUUID()}`;
  objects.push({
    type: "relationship",
    spec_version: "2.1",
    id: observationRelationshipId,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    relationship_type: "attributed-to",
    source_ref: indicatorId,
    target_ref: identityId,
    description: `Indicator observed and reported by analyst identity.`
  });

  // 6. Provenance note — data-source transparency for downstream consumers
  const provenanceParts = [
    `Ingestion method: ${ingestionMethod || 'Analyst Upload'}.`,
    `Source platform: ${sourcePlatform || 'Unspecified'}.`,
  ];
  if (sourceUrl && sourceUrl !== 'unspecified') {
    provenanceParts.push(`Source URL: ${sourceUrl}.`);
  }
  provenanceParts.push(
    'All Sentinel AI intelligence derives exclusively from publicly available content (public channel web previews or analyst-supplied material) or synthetic exemplar data. Collection is read-only: no credentialed access, no account interaction, and no live engagement with suspected recruiters or their networks.'
  );
  objects.push({
    type: "note",
    spec_version: "2.1",
    id: `note--${generateUUID()}`,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    abstract: "Data Sources & Provenance",
    content: provenanceParts.join(' '),
    authors: [analystName],
    object_refs: [indicatorId]
  });

  return JSON.stringify({
    type: "bundle",
    id: bundleId,
    spec_version: "2.1",
    objects
  }, null, 2);
}
