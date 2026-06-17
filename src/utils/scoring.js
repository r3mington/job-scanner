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

export function calculateRiskScore(activeFlags = [], contextInfo = null) {
  let score = 0;
  const details = [];
  
  // Calculate standard flags
  activeFlags.forEach(flag => {
    if (RISK_FLAGS[flag]) {
      const weight = RISK_FLAGS[flag].weight;
      score += weight;
      details.push({ name: flag, weight });
    }
  });

  if (contextInfo) {
    const { parsedSalaryUsd, locationCountry, detectedLanguage, contactMethod } = contextInfo;

    // 1. Calculate salary anomalies if values exist
    if (parsedSalaryUsd && locationCountry) {
      const median = getMedianSalary(locationCountry);
      if (median) {
        const percentDiff = Math.round(((parsedSalaryUsd - median) / median) * 100);
        
        if (percentDiff >= 150) {
          score += 30;
          details.push({
            name: `Salary Anomaly (+${percentDiff}% vs local median)`,
            weight: 30,
            isSalaryAnomaly: true
          });
        } else if (percentDiff >= 50) {
          score += 15;
          details.push({
            name: `Mild Salary Disparity (+${percentDiff}% vs local median)`,
            weight: 15,
            isSalaryAnomaly: true
          });
        }
      }
    }

    // 2. Calculate Cross-Border & Language Incongruencies
    if (locationCountry) {
      const { isLanguageIncongruent, isContactIncongruent, contactCountryName } = checkCrossBorderIncongruency(
        detectedLanguage,
        locationCountry,
        contactMethod
      );

      if (isLanguageIncongruent) {
        score += 20;
        details.push({
          name: `Language Mismatch (${detectedLanguage || 'Unknown'} ad in ${locationCountry})`,
          weight: 20,
          isCrossBorderMismatch: true
        });
      }

      if (isContactIncongruent) {
        score += 20;
        details.push({
          name: `Contact Mismatch (${contactCountryName || 'Unknown Country'} caller code for ${locationCountry} job)`,
          weight: 20,
          isCrossBorderMismatch: true
        });
      }
    }
  }

  // Cap at 100
  const finalScore = Math.min(100, score);

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
