export const COUNTRY_LANGUAGES = {
  "cambodia": ["khmer", "english"],
  "myanmar": ["burmese", "english"],
  "laos": ["lao", "english"],
  "united arab emirates": ["arabic", "english"],
  "uae": ["arabic", "english"],
  "thailand": ["thai", "english"],
  "philippines": ["tagalog", "english", "waray", "cebuano", "ilocano"],
  "malaysia": ["malay", "english", "chinese"],
  "singapore": ["english", "chinese", "malay", "tamil"],
  "vietnam": ["vietnamese", "english"],
  "india": ["hindi", "english", "bengali", "telugu", "marathi", "tamil", "gujarati", "urdu", "kannada", "odia", "malayalam", "punjabi"],
  "united kingdom": ["english"],
  "uk": ["english"],
  "united states": ["english", "spanish"],
  "usa": ["english", "spanish"]
};

export const PREFIX_COUNTRIES = {
  "855": "Cambodia",
  "95": "Myanmar",
  "66": "Thailand",
  "60": "Malaysia",
  "971": "United Arab Emirates",
  "63": "Philippines",
  "84": "Vietnam",
  "856": "Laos",
  "91": "India",
  "1": "United States/Canada",
  "44": "United Kingdom",
  "65": "Singapore"
};

// Extractor helper to map a country name to its expected dialing prefix
export function getCountryDialPrefix(countryName) {
  if (!countryName) return null;
  const search = countryName.toLowerCase().trim();
  for (const [prefix, country] of Object.entries(PREFIX_COUNTRIES)) {
    if (country.toLowerCase() === search || (search === "uae" && prefix === "971") || (search === "uk" && prefix === "44") || (search === "usa" && prefix === "1")) {
      return prefix;
    }
  }
  return null;
}

// Extractor helper to resolve country from calling code
export function getCountryFromPhonePrefix(phoneNumberDigits) {
  if (!phoneNumberDigits) return null;
  
  // Check 3 digit codes first
  const threeDigit = phoneNumberDigits.substring(0, 3);
  if (PREFIX_COUNTRIES[threeDigit]) {
    return PREFIX_COUNTRIES[threeDigit];
  }

  // Check 2 digit codes
  const twoDigit = phoneNumberDigits.substring(0, 2);
  if (PREFIX_COUNTRIES[twoDigit]) {
    return PREFIX_COUNTRIES[twoDigit];
  }

  // Check 1 digit code
  const oneDigit = phoneNumberDigits.substring(0, 1);
  if (PREFIX_COUNTRIES[oneDigit]) {
    return PREFIX_COUNTRIES[oneDigit];
  }

  return null;
}

export function checkCrossBorderIncongruency(detectedLanguage, locationCountry, contactMethod) {
  let isLanguageIncongruent = false;
  let isContactIncongruent = false;
  let contactCountryName = null;

  const cleanLang = (detectedLanguage || '').toLowerCase().trim();
  const cleanCountry = (locationCountry || '').toLowerCase().trim();

  // 1. Language Mismatch Check
  if (cleanLang && cleanCountry && COUNTRY_LANGUAGES[cleanCountry]) {
    const allowed = COUNTRY_LANGUAGES[cleanCountry];
    if (!allowed.includes(cleanLang)) {
      isLanguageIncongruent = true;
    }
  }

  // 2. Contact Phone Prefix Mismatch Check
  if (cleanCountry && contactMethod) {
    const contactStr = contactMethod.trim();
    let digits = null;

    if (contactStr.startsWith('WhatsApp:')) {
      digits = contactStr.substring(9).replace(/[^0-9]/g, '');
    } else {
      // General WhatsApp parser fallback
      const waMatch = contactStr.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)([0-9]+)/i);
      if (waMatch) {
        digits = waMatch[1];
      }
    }

    if (digits) {
      contactCountryName = getCountryFromPhonePrefix(digits);
      const expectedPrefix = getCountryDialPrefix(locationCountry);
      
      if (expectedPrefix && !digits.startsWith(expectedPrefix)) {
        isContactIncongruent = true;
      }
    }
  }

  return {
    isLanguageIncongruent,
    isContactIncongruent,
    contactCountryName
  };
}
