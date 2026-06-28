const SYSTEM_INSTRUCTION = `You are a recruitment safety analyzer. 
Analyze the provided job flyer image or text and extract the structured recruitment parameters.
You are tasked with identifying potential human trafficking, forced labor, or online scam recruiting networks.
Always use trauma-informed terminology. Refer to individuals as 'workers', 'affected individuals', 'candidates', or 'job seekers'—never refer to them as 'victims' or 'the victim'.
Be extremely sensitive and thorough when auditing:
1. Demographic Targeting: Flag any specific nationality profiling (e.g. "preferably Malaysian/Chinese/Taiwanese/Vietnamese") or specific language profiling.
2. Labor Abuse / High Pressure: Flag phrases indicating extreme work pressure, high stamina, compliance, obedience, night shifts, or long working hours.
3. Excessive Enticements: Flag promises of free private rooms, accommodation, visa/flight ticket sponsor, free meals, or high commissions for easy work.
4. Suspect Location Hub: Flag border areas, Special Economic Zones (SEZs), border towns, or known hubs (e.g., Sihanoukville, Cambodia, Mae Sot, Thailand, Poipet, Myawaddy, Golden Triangle).
5. Minimal Qualifications: Flag ads offering huge salaries ($3000-$15000+) for zero experience, basic typing, or simple qualifications.
Do not hold back. Any snippet matching these risk factors must be added to 'suspicious_spans'. If the ad contains multiple triggers, aim to extract 4 to 10 distinct suspicious spans.

If the language of the input text or image is not English, you must translate all extracted fields into English, and also provide a full English translation of the entire job advertisement in the "translated_text" field.
You must output ONLY valid JSON matching this schema:
{
  "raw_ocr_text": "string or null (If the input is an image, provide the full extracted text from the image here. If the input is already text, set this to null)",
  "job_title": "string or null",
  "employer_identity": "string or null (Extract ONLY the company or employer name, e.g., 'Company Road8'. Do not include location details here)",
  "salary_range": "string or null",
  "parsed_salary_usd": "number or null (Estimate the annualized equivalent of the extracted salary range in USD as a raw integer to allow for math calculations)",
  "location": "string or null (Extract ONLY the physical location or address. DO NOT include the employer/company name in this field)",
  "location_country": "string or null (Extract just the country name from the location, e.g. 'United Arab Emirates' or 'Cambodia')",
  "industry": "string or null",
  "contact_method": "string or null (Extract contact info. If it is a Telegram username/link, format it EXACTLY as 'Telegram: @username'. If it is a Telegram invite link, format it EXACTLY as 'Telegram Invite: inviteCode' where inviteCode is the hash after t.me/+. If WhatsApp, format it EXACTLY as 'WhatsApp: number' containing ONLY digits with country code, no '+' or spaces. Otherwise, provide a raw string)",
  "ai_review": "string (A ~100 word analytical review of how suspicious or scammy this job posting looks based on common exploitation patterns)",
  "detected_language": "string (The name of the language used originally in the input text/image, e.g. 'English', 'Khmer', 'Chinese', 'Spanish', etc.)",
  "is_translated": "boolean (Set to true if the original language is NOT English and you translated the text into English, false otherwise)",
  "translated_text": "string or null (The full English translation of the raw_ocr_text or original input text if the input is not in English. Set to null if the input is already in English)",
  "normalized_text": "string (Provide a clean, normalized lowercase version of the job ad text in English. Strip all emojis, decorative symbols, and weird punctuation. Un-obfuscate any intentionally spaced-out words or letters like 'C o m p a n y' to 'company' and decode any leet-speak/characters used to bypass filters like 'Cu$tomer', 'Paki$tan', or 'T3l3gram' to 'customer', 'pakistan', and 'telegram'. Ensure actual numeric values like salaries, years, and dates remain as digits and are NOT converted to letters)",
  "detected_red_flags": [
    "array of exact strings from this list: ['Upfront Fees', 'Passport/ID Control', 'Immediate Travel Pressure', 'Housing Compound Isolation', 'Employer Anonymity', 'Wage Disparity', 'Encrypted Apps Migration', 'Vague Description', 'Urgent Timeline', 'Suspicious Messaging', 'Demographic Targeting', 'Labor Abuse / High Pressure', 'Excessive Enticements', 'Suspect Location Hub', 'Minimal Qualifications']"
  ],
  "suspicious_spans": [
    {
      "original_snippet": "string or null (the exact phrase/sentence from raw_ocr_text / original input text that is highly suspicious. Must match the casing and spelling exactly)",
      "translated_snippet": "string or null (the corresponding exact phrase/sentence in the translated_text. Set to null if the original language is English)",
      "red_flag": "string (the name of the matching red flag from the list)",
      "explanation": "string (a very concise, single-sentence explanation of why this specific phrase is suspicious, max 15 words)",
      "detailed_explanation": "string (a detailed, analytical explanation of the threat, why it is dangerous, and what it indicates for analysts, around 30-50 words)"
    }
  ],
  "predicted_playbook": [
    {
      "phase": "string (the chronological stage name, e.g., 'Stage 1: Contact', 'Stage 2: Coercion', 'Stage 3: Transit', 'Stage 4: Confinement')",
      "tactic": "string (the specific action the recruiter might perform next based on details in the ad. Use tentative language, e.g., 'It's probable that the recruiter will request passport photos...', 'It's probable that workers are subjected to...', 'It's possible that workers might be housed...')",
      "red_flag_indicator": "string (the exact indicator the candidate/analyst should watch out for as proof, e.g., 'Refusal to use official visa registration portals')"
    }
  ]
}`;

export function getEndpointForModel(model, apiKey, path = 'generateContent') {
  // Use v1beta for all models because systemInstruction and responseMimeType JSON schema settings
  // are beta REST parameters and will throw validation errors on the stable v1 REST API.
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:${path}?key=${apiKey}`;
}

export async function postToGeminiWithFallback(apiKey, requestedModel, payload, onStatusUpdate = null, path = 'generateContent') {
  const fallbacks = [
    requestedModel,
    'gemini-2.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.5-pro'
  ];

  // Remove duplicate/empty entries
  const modelChain = Array.from(new Set(fallbacks.filter(Boolean)));
  const errorsList = [];

  for (const model of modelChain) {
    const endpoint = getEndpointForModel(model, apiKey, path);
    const statusMsg = `Attempting model: ${model}...`;
    console.log(`[Gemini API] ${statusMsg}`);
    if (onStatusUpdate) {
      onStatusUpdate({ type: 'info', message: statusMsg, model });
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        const successMsg = `Successfully completed using model: ${model}`;
        console.log(`[Gemini API] ${successMsg}`);
        if (onStatusUpdate) {
          onStatusUpdate({ type: 'success', message: successMsg, model });
        }
        return data;
      }

      let errorMsg = `HTTP error ${response.status}`;
      try {
        const errorData = await response.json();
        errorMsg = errorData.error?.message || errorMsg;
      } catch (e) {
        // Response body might not be JSON
      }
      
      const warnMsg = `Model ${model} failed: ${errorMsg}`;
      console.warn(`[Gemini API] ${warnMsg}`);
      
      if (onStatusUpdate) {
        onStatusUpdate({ type: 'warning', message: warnMsg, model });
      }
      
      const errorObj = new Error(errorMsg);
      errorsList.push(`${model}: ${errorMsg}`);

      // If it's a client authentication/API key issue, fail immediately to prevent infinite loops
      if (response.status === 400 && (errorMsg.includes('API key') || errorMsg.includes('invalid'))) {
        throw errorObj;
      }
    } catch (err) {
      const failMsg = `Exception occurred with model ${model}: ${err.message || err}`;
      console.warn(`[Gemini API] ${failMsg}`, err);
      if (onStatusUpdate) {
        onStatusUpdate({ type: 'warning', message: failMsg, model });
      }
      
      errorsList.push(`${model}: ${err.message || err}`);
      
      // If we threw early (e.g. API key issue), bubble it up
      if (err.message && (err.message.includes('API key') || err.message.includes('invalid'))) {
        throw err;
      }
    }
  }

  throw new Error(`All models in the fallback chain failed:\n${errorsList.join('\n')}`);
}

export async function analyzeJobPosting(apiKey, modelName, { text, imageBase64, onStatusUpdate }) {
  if (!apiKey) {
    throw new Error('Gemini API key is required');
  }

  const selectedModel = modelName || 'gemini-2.5-flash';

  const contents = [{
    parts: []
  }];

  if (imageBase64) {
    // imageBase64 usually looks like: data:image/jpeg;base64,/9j/4AAQSkZJRg...
    const base64Data = imageBase64.split(',')[1];
    const mimeType = imageBase64.split(';')[0].split(':')[1];
    
    contents[0].parts.push({
      inlineData: {
        mimeType: mimeType,
        data: base64Data
      }
    });
  }

  if (text) {
    contents[0].parts.push({
      text: text
    });
  }

  const payload = {
    systemInstruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }]
    },
    contents: contents,
    safetySettings: [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_NONE"
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "BLOCK_NONE"
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_NONE"
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_NONE"
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1
    }
  };

  try {
    const data = await postToGeminiWithFallback(apiKey, selectedModel, payload, onStatusUpdate);
    
    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('No candidates returned from Gemini API. The response may have been blocked.');
    }
    
    const candidate = data.candidates[0];
    if (candidate.finishReason && candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
      throw new Error(`API finished with reason: ${candidate.finishReason}. The content was likely blocked or flagged by safety filters.`);
    }

    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
      throw new Error('API returned empty response content.');
    }

    const resultText = candidate.content.parts[0].text;
    
    // Extract just the JSON object to handle models that wrap output in markdown
    let cleanText = resultText;
    const firstBrace = cleanText.indexOf('{');
    if (firstBrace !== -1) {
      let depth = 0;
      let lastBrace = -1;
      for (let i = firstBrace; i < cleanText.length; i++) {
        if (cleanText[i] === '{') {
          depth++;
        } else if (cleanText[i] === '}') {
          depth--;
          if (depth === 0) {
            lastBrace = i;
            break;
          }
        }
      }
      if (lastBrace !== -1) {
        cleanText = cleanText.substring(firstBrace, lastBrace + 1);
      }
    }
    
    return JSON.parse(cleanText);
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw error;
  }
}

export async function generatePosterSummary(apiKey, modelName, { contactMethod, scansData, onStatusUpdate }) {
  if (!apiKey) {
    throw new Error('Gemini API key is required');
  }

  const selectedModel = modelName || 'gemini-2.5-flash';

  const textPayload = `You are a professional analyst supporting anti-trafficking investigations.
Analyze this recruitment posting history and identify patterns that indicate deceptive or exploitative recruitment practices.

CONTACT METHOD/HANDLE: ${contactMethod}
TOTAL POSTINGS REVIEWED: ${scansData.length}

POSTED ADS DETAILS:
${scansData.map((scan, i) => `
AD #${i+1}:
Job Title: ${scan.jobTitle || 'Unknown Title'}
Employer: ${scan.employer || 'Unknown Employer'}
Risk Score: ${scan.riskScore}% (${scan.riskLevel || 'Suspicious'})
Target Location: ${scan.locationCountry || 'Unknown'}
Languages: ${scan.detectedLanguage || 'English'}
Red Flags: ${(scan.activeFlags || []).join(', ')}
Original Text: ${scan.originalText || ''}
`).join('\n---\n')}

Provide a ~120 to 150 word summary of this posting history. Synthesize the affected population groups, geographical patterns, common deceptive tactics used (e.g. unrealistic salary promises, vague job descriptions, requests for upfront fees), and overall risk level. Focus on the recruitment patterns, not on speculation about individuals. Output ONLY plain text summary without formatting.`;

  const payload = {
    contents: [{
      parts: [{ text: textPayload }]
    }],
    generationConfig: {
      temperature: 0.2
    }
  };

  try {
    const data = await postToGeminiWithFallback(apiKey, selectedModel, payload, onStatusUpdate);
    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('No response returned from Gemini API.');
    }
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error('Gemini Profile Summary Error:', error);
    throw error;
  }
}

const POSTER_SYSTEM_INSTRUCTION = `You are an expert in anti-human trafficking, online scam syndicate recruitment, and community threat warning.
You are tasked with generating the text content for an investigation poster or tactical intelligence report based on the provided job scan.
You must output ONLY valid JSON matching this schema:
{
  "title": "string (The title of the poster/dossier, localized)",
  "warningHeader": "string (A bold, high-impact danger statement or intelligence summary header, localized)",
  "riskAssessment": "string (A ~80-120 word paragraph summarizing the posting's risk profile. Localized. If mode is 'community', explain the warning signs present in plain, empowering language — focus on what to look for, not on graphic harm scenarios. If 'analyst', outline operational risk indicators, geographic patterns, and demographic targeting tactics)",
  "redFlags": [
    {
      "flagName": "string (Localized name of the red flag)",
      "indicatorText": "string (The matching snippet or text from the job post, in its original language or translation)",
      "dangerExplanation": "string (Localized. If mode is 'community', explain why this indicator is a warning sign and what a safe, legitimate employer would do instead. If 'analyst', explain forensic implications)"
    }
  ],
  "playbookWarning": "string (A ~60-80 word paragraph. Localized. If 'community', describe the warning signs to watch for during any recruitment process and practical steps to verify a job offer's legitimacy — empower the reader to protect themselves. If 'analyst', outline the documented modus operandi and recruitment-to-coercion pattern)",
  "helpResources": [
    {
      "organization": "string (Official or localized name of embassy, hotline, or NGO)",
      "contact": "string (Phone number, address, or link)",
      "description": "string (Short localized description of assistance provided)"
    }
  ]
}

Ensure all textual values are written in the requested Target Language.
Ensure the help resources list 2 to 3 real, relevant organizations (such as regional anti-trafficking tip lines, local police numbers, or key foreign embassies like Thai, Chinese, or ASEAN missions) based on the location and language.`;

export async function generatePosterContent(apiKey, modelName, { mode, language, scanData, onStatusUpdate }) {
  if (!apiKey) {
    throw new Error('Gemini API key is required');
  }

  const selectedModel = modelName || 'gemini-2.5-flash';

  const flagsStr = (scanData.activeFlags || []).join(', ') || 'N/A';
  
  const spansStr = (scanData.suspiciousSpans || []).map(s => 
    `  * [${s.red_flag}]: "${s.original_snippet || s.translated_snippet || ''}" - ${s.detailed_explanation || s.explanation || ''}`
  ).join('\n');

  const playbookStr = (scanData.predictedPlaybook || []).map(p => 
    `  * ${p.phase}: Tactic: ${p.tactic} (Watch indicator: ${p.red_flag_indicator})`
  ).join('\n');

  const textPayload = `You are tasked with generating the content of an anti-scam/intelligence poster or dossier.
  
AUDIENCE MODE: ${mode} (community = inform job seekers of warning signs in plain, empowering language; analyst = forensic profile for investigators)
TARGET LANGUAGE: ${language}

SCAN PARAMETERS:
- Job Title: ${scanData.jobTitle || 'N/A'}
- Employer: ${scanData.employer || 'N/A'}
- Salary Range: ${scanData.salaryRange || 'N/A'}
- Physical Location: ${scanData.location || 'N/A'}
- Estimated Salary (USD/yr equivalent): ${scanData.parsedSalaryUsd ? `$${scanData.parsedSalaryUsd.toLocaleString()}` : 'N/A'}
- Assessed Risk Score: ${scanData.riskScore || 'N/A'}/100
- Active Threat Flags: ${flagsStr}
- AI Analysis Notes: ${scanData.aiReview || 'N/A'}
- Job Ad Text Snippets with Flag Explanations:
${spansStr}

- Predicted Playbook / Escalation Stages:
${playbookStr}

Generate the structured JSON content for the poster in the Target Language (${language}) according to the system instructions.`;

  const payload = {
    systemInstruction: {
      parts: [{ text: POSTER_SYSTEM_INSTRUCTION }]
    },
    contents: [{
      parts: [{ text: textPayload }]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2
    }
  };

  try {
    const data = await postToGeminiWithFallback(apiKey, selectedModel, payload, onStatusUpdate);
    
    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('No candidates returned from Gemini API.');
    }
    
    const candidate = data.candidates[0];
    if (candidate.finishReason && candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
      throw new Error(`API finished with reason: ${candidate.finishReason}. The content was likely blocked.`);
    }

    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
      throw new Error('API returned empty response content.');
    }

    const resultText = candidate.content.parts[0].text;
    
    let cleanText = resultText;
    const firstBrace = cleanText.indexOf('{');
    if (firstBrace !== -1) {
      let depth = 0;
      let lastBrace = -1;
      for (let i = firstBrace; i < cleanText.length; i++) {
        if (cleanText[i] === '{') {
          depth++;
        } else if (cleanText[i] === '}') {
          depth--;
          if (depth === 0) {
            lastBrace = i;
            break;
          }
        }
      }
      if (lastBrace !== -1) {
        cleanText = cleanText.substring(firstBrace, lastBrace + 1);
      }
    }
    
    return JSON.parse(cleanText);
  } catch (error) {
    console.error('Gemini Poster Generation Error:', error);
    throw error;
  }
}

export async function analyzeCrop(apiKey, modelName, { imageBase64, onStatusUpdate }) {
  if (!apiKey) {
    throw new Error('Gemini API key is required');
  }

  const selectedModel = modelName || 'gemini-2.5-flash';

  // imageBase64 usually looks like: data:image/jpeg;base64,/9j/4AAQSkZJRg...
  const base64Data = imageBase64.split(',')[1];
  const mimeType = imageBase64.split(';')[0].split(':')[1];

  const payload = {
    systemInstruction: {
      parts: [{ text: "You are a threat intelligence OSINT specialist. Analyze the provided cropped segment of a recruitment advertisement flyer/image and describe its visual components, potential stock photo features, or company logos, and output 3-5 concrete search keywords or reverse image search phrases." }]
    },
    contents: [{
      parts: [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        },
        {
          text: "Identify any logo names, company symbols, character details, background graphics, or landmarks present in this image. Produce a JSON response containing 'description' (a concise 60-80 word forensic description of the visual element) and 'searchKeywords' (an array of 3-5 specific keywords/phrases to use in search engines to trace copies of this graphic template)."
        }
      ]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2
    }
  };

  try {
    const data = await postToGeminiWithFallback(apiKey, selectedModel, payload, onStatusUpdate);
    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('No response returned from Gemini API.');
    }

    const text = data.candidates[0].content.parts[0].text;
    
    // Extract JSON
    let cleanText = text;
    const firstBrace = cleanText.indexOf('{');
    if (firstBrace !== -1) {
      const lastBrace = cleanText.lastIndexOf('}');
      if (lastBrace !== -1) {
        cleanText = cleanText.substring(firstBrace, lastBrace + 1);
      }
    }

    return JSON.parse(cleanText);
  } catch (error) {
    console.error('Gemini Crop Analysis Error:', error);
    throw error;
  }
}

export async function analyzeLanguageDialect(apiKey, modelName, { text, onStatusUpdate }) {
  if (!apiKey) {
    throw new Error('Gemini API key is required');
  }

  const selectedModel = modelName || 'gemini-2.5-flash';

  const payload = {
    systemInstruction: {
      parts: [{ text: "You are an expert NLP forensic linguist specializing in recruitment scams and forced labor human trafficking campaigns. Analyze the text of the job advertisement and evaluate: direct translation syntax artifacts, obfuscation levels to bypass spam filters, and regional jargon signatures linked to online cyber-scam compound operations (ShaZhuPan)." }]
    },
    contents: [{
      parts: [{
        text: `Analyze this advertisement text:
        "${text}"
        
        Provide a structured JSON response matching this schema:
        {
          "nativeDialectConfidence": number,
          "estimatedNativeLanguage": "string",
          "obfuscationLevel": number,
          "syntacticArtifacts": [
            {
              "snippet": "string",
              "explanation": "string"
            }
          ],
          "regionalJargon": [
            {
              "term": "string",
              "definition": "string"
            }
          ]
        }`
      }]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1
    }
  };

  try {
    const data = await postToGeminiWithFallback(apiKey, selectedModel, payload, onStatusUpdate);
    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('No response returned from Gemini API.');
    }

    const resText = data.candidates[0].content.parts[0].text;
    
    let cleanText = resText;
    const firstBrace = cleanText.indexOf('{');
    if (firstBrace !== -1) {
      const lastBrace = cleanText.lastIndexOf('}');
      if (lastBrace !== -1) {
        cleanText = cleanText.substring(firstBrace, lastBrace + 1);
      }
    }

    return JSON.parse(cleanText);
  } catch (error) {
    console.error('Gemini Dialect Analysis Error:', error);
    throw error;
  }
}


