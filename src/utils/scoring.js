import { getMedianSalary } from './countryMedians';
import { checkCrossBorderIncongruency } from './languageMap';

export const RISK_FLAGS = {
  // Critical (40)
  'Upfront Fees': { weight: 40, category: 'critical' },
  'Passport/ID Control': { weight: 40, category: 'critical' },
  'Immediate Travel Pressure': { weight: 40, category: 'critical' },
  'Housing Compound Isolation': { weight: 40, category: 'critical' },
  'Suspect Location Hub': { weight: 40, category: 'critical' },
  // High (25)
  'Employer Anonymity': { weight: 25, category: 'high' },
  'Wage Disparity': { weight: 25, category: 'high' },
  'Encrypted Apps Migration': { weight: 25, category: 'high' },
  'Labor Abuse / High Pressure': { weight: 25, category: 'high' },
  // Medium (10/15)
  'Vague Description': { weight: 10, category: 'medium' },
  'Urgent Timeline': { weight: 10, category: 'medium' },
  'Suspicious Messaging': { weight: 10, category: 'medium' },
  'Demographic Targeting': { weight: 10, category: 'medium' },
  'Excessive Enticements': { weight: 15, category: 'medium' },
  'Minimal Qualifications': { weight: 10, category: 'medium' }
};

/**
 * Flag co-occurrence combos.
 * When ALL flags in a combo are present, a multiplier is applied to the
 * combined raw flag score before contextual bonuses are added.
 * This reflects that certain combinations are textbook trafficking operations,
 * not just additive bad signals.
 */
const DANGER_COMBOS = [
  {
    // Classic compound-confinement pattern
    flags: ['Passport/ID Control', 'Housing Compound Isolation', 'Immediate Travel Pressure'],
    multiplier: 1.4,
    label: 'Compound Confinement Pattern'
  },
  {
    // Cyber-scam compound recruiting pattern
    flags: ['Suspect Location Hub', 'Encrypted Apps Migration', 'Minimal Qualifications'],
    multiplier: 1.35,
    label: 'Cyber-Scam Compound Pattern'
  },
  {
    // Debt bondage recruitment
    flags: ['Upfront Fees', 'Immediate Travel Pressure', 'Excessive Enticements'],
    multiplier: 1.3,
    label: 'Debt Bondage Recruitment Pattern'
  },
  {
    // Full trafficking signature
    flags: ['Passport/ID Control', 'Suspect Location Hub', 'Employer Anonymity'],
    multiplier: 1.3,
    label: 'Trafficking Signature Pattern'
  }
];

/** Generic employer name patterns that suggest deliberate opacity */
const EMPLOYER_OPACITY_TERMS = new Set([
  'team', 'admin', 'hr', 'group', 'management', 'department', 'office',
  'staff', 'agency', 'services', 'company', 'limited', 'ltd', 'inc',
  'enterprise', 'enterprises', 'solutions', 'consulting', 'recruitment',
  'unspecified', 'unknown', 'n/a', 'na', 'none'
]);

/**
 * Score the contact method type.
 * Telegram invite links (anonymous mass-invite) are the highest risk signal.
 */
function scoreContactMethod(contactMethod) {
  if (!contactMethod) return { score: 0, label: null };
  const m = contactMethod.toLowerCase();

  // Telegram invite link  e.g. "Telegram Invite: abc123"
  if (m.includes('telegram invite')) {
    return { score: 20, label: 'Telegram Invite Link (anonymous mass-invite)' };
  }
  // Telegram @handle
  if (m.includes('telegram')) {
    return { score: 10, label: 'Telegram Handle' };
  }
  // WhatsApp
  if (m.includes('whatsapp')) {
    return { score: 5, label: 'WhatsApp Number' };
  }
  return { score: 0, label: null };
}

/**
 * Score the source platform.
 * Ads originating from encrypted/social platforms carry higher baseline risk.
 */
function scoreSourcePlatform(sourcePlatform) {
  if (!sourcePlatform) return 0;
  const p = sourcePlatform.toLowerCase();
  if (p.includes('telegram')) return 10;
  if (p.includes('whatsapp')) return 8;
  if (p.includes('facebook') || p.includes('fb')) return 5;
  if (p.includes('tiktok') || p.includes('instagram')) return 4;
  return 0;
}

/**
 * Employer opacity score.
 * Short or generic employer strings suggest deliberate anonymity.
 */
function scoreEmployerOpacity(employer) {
  if (!employer || employer.trim() === '') return { score: 8, label: 'Missing Employer Identity' };

  const clean = employer.toLowerCase().trim();

  // Very short (likely a codename or abbreviation)
  if (clean.length < 8) return { score: 6, label: `Suspicious Employer Name (too short: "${employer}")` };

  // Only numbers  e.g. "Company 8", "Road 8"
  const words = clean.split(/\s+/);
  const meaningfulWords = words.filter(w => !EMPLOYER_OPACITY_TERMS.has(w) && isNaN(w));
  if (meaningfulWords.length === 0) {
    return { score: 8, label: `Generic Employer Name ("${employer}")` };
  }
  if (meaningfulWords.length === 1 && clean.length < 20) {
    return { score: 5, label: `Vague Employer Identity ("${employer}")` };
  }
  return { score: 0, label: null };
}

export function calculateRiskScore(activeFlags = [], contextInfo = null) {
  let rawFlagScore = 0;
  const details = [];

  // ── 1. Base flag weights ────────────────────────────────────────────────
  activeFlags.forEach(flag => {
    if (RISK_FLAGS[flag]) {
      const weight = RISK_FLAGS[flag].weight;
      rawFlagScore += weight;
      details.push({ name: flag, weight });
    }
  });

  // ── 2. Co-occurrence combo multipliers ─────────────────────────────────
  let appliedCombo = null;
  let comboMultiplier = 1.0;
  for (const combo of DANGER_COMBOS) {
    if (combo.flags.every(f => activeFlags.includes(f))) {
      if (combo.multiplier > comboMultiplier) {
        comboMultiplier = combo.multiplier;
        appliedCombo = combo;
      }
    }
  }
  const baseScore = Math.round(rawFlagScore * comboMultiplier);
  if (appliedCombo && comboMultiplier > 1.0) {
    const bonus = baseScore - rawFlagScore;
    if (bonus > 0) {
      details.push({
        name: `Combo Multiplier: ${appliedCombo.label} (×${appliedCombo.multiplier})`,
        weight: bonus,
        isComboBonus: true
      });
    }
  }

  let finalScore = baseScore;

  if (contextInfo) {
    const {
      parsedSalaryUsd,
      locationCountry,
      detectedLanguage,
      contactMethod,
      suspiciousSpans,
      predictedPlaybook,
      sourcePlatform,
      employer
    } = contextInfo;

    // ── 3. Salary anomalies ───────────────────────────────────────────────
    if (parsedSalaryUsd && locationCountry) {
      const median = getMedianSalary(locationCountry);
      if (median) {
        const percentDiff = Math.round(((parsedSalaryUsd - median) / median) * 100);

        if (percentDiff >= 150) {
          details.push({
            name: `Salary Anomaly (+${percentDiff}% vs local median)`,
            weight: 30,
            isSalaryAnomaly: true,
            isContextual: true
          });
        } else if (percentDiff >= 50) {
          details.push({
            name: `Mild Salary Disparity (+${percentDiff}% vs local median)`,
            weight: 15,
            isSalaryAnomaly: true,
            isContextual: true
          });
        }

        // Salary floor: suspiciously low for any skilled-sounding title
        if (percentDiff <= -60) {
          details.push({
            name: `Salary Below Floor (${Math.abs(percentDiff)}% below local median)`,
            weight: 10,
            isSalaryAnomaly: true,
            isContextual: true
          });
        }
      }
    }

    // ── 4. Cross-border & language incongruencies ─────────────────────────
    if (locationCountry) {
      const { isLanguageIncongruent, isContactIncongruent, contactCountryName } = checkCrossBorderIncongruency(
        detectedLanguage,
        locationCountry,
        contactMethod
      );

      if (isLanguageIncongruent) {
        details.push({
          name: `Language Mismatch (${detectedLanguage || 'Unknown'} ad in ${locationCountry})`,
          weight: 20,
          isCrossBorderMismatch: true,
          isContextual: true
        });
      }

      if (isContactIncongruent) {
        details.push({
          name: `Contact Mismatch (${contactCountryName || 'Unknown Country'} caller code for ${locationCountry} job)`,
          weight: 20,
          isCrossBorderMismatch: true,
          isContextual: true
        });
      }
    }

    // ── 5. Suspicious span density (Deweighted to max +10) ─────────────────
    if (Array.isArray(suspiciousSpans) && suspiciousSpans.length > 0) {
      const spanBonus = Math.min(10, suspiciousSpans.length * 1);
      if (spanBonus > 0) {
        details.push({
          name: `Suspicious Span Density (${suspiciousSpans.length} flagged phrases)`,
          weight: spanBonus,
          isSpanDensity: true,
          isContextual: true
        });
      }
    }

    // ── 6. Contact method type penalty ────────────────────────────────────
    const contactScore = scoreContactMethod(contactMethod);
    if (contactScore.score > 0) {
      details.push({
        name: `Contact Method Risk: ${contactScore.label}`,
        weight: contactScore.score,
        isContactRisk: true,
        isContextual: true
      });
    }

    // ── 7. Source platform weighting ──────────────────────────────────────
    const platformScore = scoreSourcePlatform(sourcePlatform);
    if (platformScore > 0) {
      details.push({
        name: `High-Risk Source Platform (${sourcePlatform})`,
        weight: platformScore,
        isPlatformRisk: true,
        isContextual: true
      });
    }

    // ── 8. Predicted playbook depth ───────────────────────────────────────
    if (Array.isArray(predictedPlaybook)) {
      let playbookBonus = 0;
      if (predictedPlaybook.length >= 4) playbookBonus = 10;
      else if (predictedPlaybook.length >= 3) playbookBonus = 5;
      if (playbookBonus > 0) {
        details.push({
          name: `Multi-Stage Playbook Detected (${predictedPlaybook.length} escalation stages)`,
          weight: playbookBonus,
          isPlaybook: true,
          isContextual: true
        });
      }
    }

    // ── 9. Employer opacity ───────────────────────────────────────────────
    const employerRisk = scoreEmployerOpacity(employer);
    if (employerRisk.score > 0) {
      details.push({
        name: employerRisk.label,
        weight: employerRisk.score,
        isEmployerOpacity: true,
        isContextual: true
      });
    }

    // ── Contextual Scaling & Capping Logic ──────────────────────────────
    let rawContextualSum = 0;
    details.forEach(d => {
      if (d.isContextual) {
        rawContextualSum += d.weight;
      }
    });

    const scalingFactor = Math.max(0, 1 - (baseScore / 100));
    const scaledContextualSum = Math.round(rawContextualSum * scalingFactor);

    if (rawContextualSum > 0) {
      let allocatedScaledSum = 0;
      const contextualDetails = details.filter(d => d.isContextual);
      
      contextualDetails.forEach((d, idx) => {
        if (idx === contextualDetails.length - 1) {
          d.weight = scaledContextualSum - allocatedScaledSum;
        } else {
          d.weight = Math.round(d.weight * scalingFactor);
          allocatedScaledSum += d.weight;
        }
      });
    }

    finalScore = Math.min(100, baseScore + scaledContextualSum);
  }

  return {
    score: finalScore,
    details
  };
}

export function getRiskLevel(score) {
  if (score >= 60) return { label: 'High Risk', color: 'red' };
  if (score >= 30) return { label: 'Medium Risk', color: 'yellow' };
  return { label: 'Low Risk', color: 'green' };
}
