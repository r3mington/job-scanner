const SYSTEM_INSTRUCTION = `You are a recruitment safety analyzer. 
Analyze the provided job flyer image or text and extract the structured recruitment parameters.
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
  "detected_red_flags": [
    "array of exact strings from this list: ['Upfront Fees', 'Passport/ID Control', 'Immediate Travel Pressure', 'Housing Compound Isolation', 'Employer Anonymity', 'Wage Disparity', 'Encrypted Apps Migration', 'Vague Description', 'Urgent Timeline', 'Suspicious Messaging']"
  ]
}`;

export async function analyzeJobPosting(apiKey, modelName, { text, imageBase64 }) {
  if (!apiKey) {
    throw new Error('Gemini API key is required');
  }

  const selectedModel = modelName || 'gemini-2.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;

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
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Failed to analyze job posting');
    }

    const data = await response.json();
    
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
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanText = jsonMatch[0];
    }
    
    return JSON.parse(cleanText);
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw error;
  }
}
