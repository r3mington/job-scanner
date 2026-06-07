export const RISK_FLAGS = {
  // Critical (40)
  'Upfront Fees': { weight: 40, category: 'critical' },
  'Passport/ID Control': { weight: 40, category: 'critical' },
  'Immediate Travel Pressure': { weight: 40, category: 'critical' },
  'Housing Compound Isolation': { weight: 40, category: 'critical' },
  // High (25)
  'Employer Anonymity': { weight: 25, category: 'high' },
  'Wage Disparity': { weight: 25, category: 'high' },
  'Encrypted Apps Migration': { weight: 25, category: 'high' },
  // Medium (10)
  'Vague Description': { weight: 10, category: 'medium' },
  'Urgent Timeline': { weight: 10, category: 'medium' },
  'Suspicious Messaging': { weight: 10, category: 'medium' }
};

export function calculateRiskScore(activeFlags = []) {
  let score = 0;
  
  activeFlags.forEach(flag => {
    if (RISK_FLAGS[flag]) {
      score += RISK_FLAGS[flag].weight;
    }
  });

  // Cap at 100
  return Math.min(100, score);
}

export function getRiskLevel(score) {
  if (score >= 60) return { label: 'High Risk', color: 'red' };
  if (score >= 30) return { label: 'Medium Risk', color: 'yellow' };
  return { label: 'Low Risk', color: 'green' };
}
