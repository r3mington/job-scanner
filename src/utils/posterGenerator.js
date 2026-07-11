import { calculateRiskScore } from './scoring';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function buildPosterPrintHtml({
  generatedPosterData,
  posterMode,
  posterLanguage,
  customLanguage,
  formData,
  activeFlags,
  parsedSalaryUsd,
  locationCountry,
  detectedLanguage,
  suspiciousSpans,
  predictedPlaybook,
  sourcePlatform,
  ingestionMethod,
  scanInput
}) {
  if (!generatedPosterData) return '';

  const isCommunity = posterMode === 'community';
  const finalLanguage = posterLanguage === 'Other' ? customLanguage : posterLanguage;
  const currentScoreResult = calculateRiskScore(activeFlags, {
    parsedSalaryUsd,
    locationCountry,
    detectedLanguage,
    contactMethod: formData.contact_method,
    suspiciousSpans,
    predictedPlaybook,
    sourcePlatform,
    employer: formData.employer_identity
  });
  const currentScore = currentScoreResult.score;

  const communityAlertHtml = isCommunity ? '<div class="community-alert">⚠️ EMPLOYMENT SAFETY ALERT</div>' : '';

  const metadataHtml = !isCommunity ? `
    <div class="metadata-grid">
      <div class="metadata-item">
        <div class="metadata-label">Case Reference</div>
        <div class="metadata-val">SENTINEL-SCAN-${esc((scanInput?.id || 'NEW').substring(0, 8).toUpperCase())}</div>
      </div>
      <div class="metadata-item">
        <div class="metadata-label">Advertiser Handle</div>
        <div class="metadata-val">${esc(formData.contact_method || 'Unknown')}</div>
      </div>
      <div class="metadata-item">
        <div class="metadata-label">Source Platform</div>
        <div class="metadata-val">${esc(sourcePlatform || 'Unspecified')}</div>
      </div>
      <div class="metadata-item">
        <div class="metadata-label">Ingested By</div>
        <div class="metadata-val">${esc(ingestionMethod || 'Analyst Upload')}</div>
      </div>
    </div>
  ` : '';

  const flagsHtml = (generatedPosterData.redFlags || []).map(flag => 
    '<div class="flag-card">' +
      '<div class="flag-card-header">' +
        '<span class="flag-badge"></span>' +
        '<span>' + esc(flag.flagName) + '</span>' +
      '</div>' +
      (flag.indicatorText ? '<div class="flag-snippet">"' + esc(flag.indicatorText) + '"</div>' : '') +
      '<div class="flag-desc">' + esc(flag.dangerExplanation) + '</div>' +
    '</div>'
  ).join('');

  const resourcesHtml = (generatedPosterData.helpResources || []).map(res => 
    '<div class="resource-card">' +
      '<div class="resource-name">' + esc(res.organization) + '</div>' +
      '<div class="resource-contact">' + esc(res.contact) + '</div>' +
      '<div class="resource-desc">' + esc(res.description) + '</div>' +
    '</div>'
  ).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <title>Sentinel_${isCommunity ? 'COMMUNITY_SAFETY' : 'ANALYST_INTEL'}_${esc(finalLanguage)}</title>
  <meta charset="utf-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=Roboto+Mono:wght@400;700&display=swap');
    
    @page {
      size: A4;
      margin: 12mm 15mm 15mm 15mm;
    }
    
    body {
      margin: 0;
      font-family: 'Outfit', sans-serif;
      color: #0f172a;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      line-height: 1.5;
    }
    
    .poster-container {
      border: ${isCommunity ? '5px solid #ef4444' : '2px solid #1e293b'};
      border-radius: 4px;
      padding: 24px;
      min-height: 260mm;
      box-sizing: border-box;
      position: relative;
      background-color: #ffffff;
    }
    
    .community-alert {
      background: #ef4444;
      color: white;
      text-align: center;
      padding: 10px;
      font-weight: 800;
      letter-spacing: 2px;
      font-size: 14px;
      margin: -24px -24px 24px -24px;
      text-transform: uppercase;
    }
    
    .header {
      text-align: center;
      margin-bottom: 24px;
      border-bottom: 2px solid ${isCommunity ? '#fee2e2' : '#cbd5e1'};
      padding-bottom: 16px;
    }
    
    .header h1 {
      margin: 0 0 6px 0;
      font-size: 26px;
      font-weight: 800;
      color: ${isCommunity ? '#dc2626' : '#0f172a'};
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .header-badge {
      display: inline-block;
      background: ${isCommunity ? '#fef2f2' : '#f8fafc'};
      border: 1px solid ${isCommunity ? '#fca5a5' : '#cbd5e1'};
      color: ${isCommunity ? '#dc2626' : '#334155'};
      font-size: 11px;
      font-weight: 800;
      padding: 4px 14px;
      border-radius: 4px;
      font-family: 'Roboto Mono', monospace;
      letter-spacing: 1px;
    }
    
    .warning-section {
      background: ${isCommunity ? '#fff5f5' : '#f8fafc'};
      border-left: 5px solid ${isCommunity ? '#ef4444' : '#0f172a'};
      padding: 16px;
      margin-bottom: 24px;
      border-radius: 0 6px 6px 0;
    }
    
    .warning-title {
      font-weight: 800;
      font-size: 15px;
      color: ${isCommunity ? '#991b1b' : '#0f172a'};
      text-transform: uppercase;
      margin: 0 0 8px 0;
      letter-spacing: 0.5px;
    }
    
    .warning-body {
      font-size: 12.5px;
      color: #334155;
      line-height: 1.6;
    }
    
    .score-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: ${isCommunity ? '#fef2f2' : '#f1f5f9'};
      border: 1px solid ${isCommunity ? '#fca5a5' : '#e2e8f0'};
      padding: 12px 20px;
      border-radius: 6px;
      margin-bottom: 24px;
    }
    
    .score-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: ${isCommunity ? '#991b1b' : '#475569'};
    }
    
    .score-value {
      font-size: 22px;
      font-weight: 800;
      font-family: 'Roboto Mono', monospace;
      color: ${isCommunity ? '#dc2626' : '#0f172a'};
    }
    
    .section-title {
      font-size: 14px;
      font-weight: 800;
      text-transform: uppercase;
      color: ${isCommunity ? '#991b1b' : '#1e293b'};
      border-bottom: 1.5px solid ${isCommunity ? '#fee2e2' : '#e2e8f0'};
      padding-bottom: 6px;
      margin-bottom: 16px;
      letter-spacing: 0.5px;
    }
    
    .flag-grid {
      margin-bottom: 24px;
    }
    
    .flag-card {
      margin-bottom: 14px;
      padding: 12px;
      background: #fbfbfb;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
    }
    
    .flag-card-header {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 700;
      font-size: 13px;
      color: #0f172a;
    }
    
    .flag-badge {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${isCommunity ? '#ef4444' : '#1e293b'};
    }
    
    .flag-snippet {
      font-family: 'Roboto Mono', monospace;
      font-size: 11px;
      background: #f1f5f9;
      padding: 6px 10px;
      border-radius: 4px;
      margin: 6px 0;
      color: #334155;
      font-style: italic;
      word-break: break-all;
    }
    
    .flag-desc {
      font-size: 12px;
      color: #475569;
      line-height: 1.5;
    }
    
    .playbook-container {
      margin-bottom: 24px;
      font-size: 12.5px;
      line-height: 1.6;
      color: #334155;
    }
    
    .resources-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 40px;
    }
    
    .resource-card {
      border: 1px solid #e2e8f0;
      background: #fafafa;
      border-radius: 6px;
      padding: 12px;
      font-size: 11.5px;
    }
    
    .resource-name {
      font-weight: 700;
      font-size: 12.5px;
      color: #0f172a;
      margin-bottom: 4px;
    }
    
    .resource-contact {
      font-family: 'Roboto Mono', monospace;
      font-size: 11.5px;
      color: #dc2626;
      font-weight: 700;
      margin-bottom: 6px;
    }
    
    .resource-desc {
      color: #64748b;
      line-height: 1.45;
    }
    
    .footer {
      position: absolute;
      bottom: 20px;
      left: 24px;
      right: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9.5px;
      color: #94a3b8;
      font-family: 'Roboto Mono', monospace;
      border-top: 1px solid #e2e8f0;
      padding-top: 10px;
    }
    
    .metadata-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 24px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      padding: 12px;
      border-radius: 6px;
    }
    
    .metadata-item {
      font-size: 11.5px;
    }
    
    .metadata-label {
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
      font-size: 10px;
      margin-bottom: 2px;
    }
    
    .metadata-val {
      font-family: 'Roboto Mono', monospace;
      color: #0f172a;
    }
  </style>
</head>
<body>
  <div class="poster-container">
    ${communityAlertHtml}
    
    <div class="header">
      <h1>${esc(generatedPosterData.title || (isCommunity ? 'Employment Safety Alert' : 'Intelligence Profile Dossier'))}</h1>
      <div class="header-badge">${isCommunity ? 'COMMUNITY EMPLOYMENT SAFETY INFORMATION' : 'CONFIDENTIAL TACTICAL INTEL REPORT'}</div>
    </div>
    
    <div class="warning-section">
      <h3 class="warning-title">${esc(generatedPosterData.warningHeader || 'Warning Alert')}</h3>
      <div class="warning-body">${esc(generatedPosterData.riskAssessment || '')}</div>
    </div>
    
    <div class="score-banner">
      <span class="score-title">Sentinel Assessment Score</span>
      <span class="score-value">${currentScore}/100</span>
    </div>
    
    ${metadataHtml}
    
    <div class="section-title">${isCommunity ? 'Warning Signs Identified in This Posting' : 'Operational Flag Profile'}</div>
    <div class="flag-grid">
      ${flagsHtml}
    </div>
    
    <div class="section-title">${isCommunity ? 'How to Verify a Job Offer is Legitimate' : 'Synthesized Campaign Modus Operandi'}</div>
    <div class="playbook-container">
      ${esc(generatedPosterData.playbookWarning || '')}
    </div>
    
    <div class="section-title">${isCommunity ? 'Where to Report or Get Help' : 'Key Enforcement Contacts & Task Forces'}</div>
    <div class="resources-grid">
      ${resourcesHtml}
    </div>
    
    <div class="footer">
      <span>SENTINEL CORE INTEL · SOURCE LANGUAGE: ${esc(detectedLanguage)}</span>
      <span>EXPORTED ON: ${new Date().toLocaleDateString()}</span>
    </div>
  </div>
  
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
        setTimeout(function() { window.close(); }, 500);
      }, 500);
    }
  </script>
</body>
</html>
  `;
}
