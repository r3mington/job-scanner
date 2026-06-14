// Map of common homoglyphs (lookalike characters from Cyrillic, Greek, Latin, and Fullwidth ranges)
const HOMOGLYPH_MAP = {
  // Cyrillic to Latin
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ж': 'zh', 'з': 'z', 
  'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 
  'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'x', 'ц': 'ts', 'ч': 'ch', 
  'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  'А': 'a', 'В': 'v', 'Е': 'e', 'К': 'k', 'М': 'm', 'Н': 'n', 'О': 'o', 'Р': 'r', 
  'С': 's', 'Т': 't', 'Х': 'x', 'У': 'u',
  
  // Greek to Latin
  'α': 'a', 'β': 'b', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'h', 'θ': 'th', 
  'ι': 'i', 'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'x', 'ο': 'o', 'π': 'p', 
  'ρ': 'r', 'σ': 's', 'τ': 't', 'υ': 'u', 'φ': 'f', 'χ': 'x', 'ψ': 'ps', 'ω': 'o',
  'Α': 'a', 'Β': 'b', 'Ε': 'e', 'Ζ': 'z', 'Η': 'h', 'Θ': 'th', 'Ι': 'i', 'Κ': 'k', 
  'Μ': 'm', 'Ν': 'n', 'Ο': 'o', 'Р': 'r', 'Τ': 't', 'Υ': 'u', 'Φ': 'f', 'Χ': 'x',
  
  // Other common variations (e.g. full-width forms)
  'ａ': 'a', 'ｂ': 'b', 'ｃ': 'c', 'ｄ': 'd', 'ｅ': 'e', 'ｆ': 'f', 'ｇ': 'g', 'ｈ': 'h',
  'ｉ': 'i', 'ｊ': 'j', 'ｋ': 'k', 'ｌ': 'l', 'ｍ': 'm', 'ｎ': 'n', 'ｏ': 'o', 'ｐ': 'p',
  'ｑ': 'q', 'ｒ': 'r', 'ｓ': 's', 'ｔ': 't', 'ｕ': 'u', 'ｖ': 'v', 'ｗ': 'w', 'ｘ': 'x',
  'ｙ': 'y', 'ｚ': 'z',
  'Ａ': 'a', 'Ｂ': 'b', 'Ｃ': 'c', 'Ｄ': 'd', 'Ｅ': 'e', 'Ｆ': 'f', 'Ｇ': 'g', 'Ｈ': 'h',
  'Ｉ': 'i', 'Ｊ': 'j', 'Ｋ': 'k', 'Ｌ': 'l', 'Ｍ': 'm', 'Ｎ': 'n', 'Ｏ': 'o', 'Ｐ': 'p',
  'Ｑ': 'q', 'Ｒ': 'r', 'Ｓ': 's', 'Ｔ': 't', 'Ｕ': 'u', 'Ｖ': 'v', 'Ｗ': 'w', 'Ｘ': 'x',
  'Ｙ': 'y', 'Ｚ': 'z',
};

// Map of common leet-speak character substitutions to standard letters
const LEET_MAP = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '9': 'g',
  '@': 'a',
  '$': 's',
  '£': 'e',
  '€': 'e',
  '|': 'i',
  '!': 'i'
};

/**
 * Normalizes job posting texts for accurate similarity checks.
 * Strips formatting, homoglyphs, and basic obfuscation.
 * Preserves actual numeric characters (like salaries/dates).
 * 
 * @param {string} text - The input text to normalize
 * @returns {string} - The clean, normalized lowercase string
 */
export function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';

  // 1. Decompose unicode accents/diacritics
  let normalized = text.normalize('NFKD');

  // 2. Process word by word to analyze contextual characters
  const tokens = normalized.split(/\s+/);
  const processedTokens = tokens.map(token => {
    let processedToken = '';
    for (let i = 0; i < token.length; i++) {
      const char = token[i];
      
      // Check homoglyphs first
      if (HOMOGLYPH_MAP[char]) {
        processedToken += HOMOGLYPH_MAP[char];
        continue;
      }

      // If it's a digit in the leet-speak map, apply smart checking
      if (/\d/.test(char) && LEET_MAP[char]) {
        const prevChar = i > 0 ? token[i - 1] : '';
        const nextChar = i < token.length - 1 ? token[i + 1] : '';
        
        // Multi-digit numbers (like 1100, 3000, 6699) should never be mapped to letters
        const isMultiDigit = /\d/.test(prevChar) || /\d/.test(nextChar);
        
        if (isMultiDigit) {
          processedToken += char;
        } else {
          // Single digits (like the 3s in T3l3gram) are mapped ONLY if adjacent to letters
          const isAdjacentToLetter = /[a-zA-Z]/.test(prevChar) || /[a-zA-Z]/.test(nextChar);
          if (isAdjacentToLetter) {
            processedToken += LEET_MAP[char];
          } else {
            processedToken += char;
          }
        }
        continue;
      }

      // Otherwise map symbols (like @, $, £) or keep original character
      if (LEET_MAP[char]) {
        processedToken += LEET_MAP[char];
      } else {
        processedToken += char;
      }
    }
    return processedToken;
  });

  let processed = processedTokens.join(' ');

  // 3. Lowercase everything
  processed = processed.toLowerCase();

  // 4. Merge single letters separated by exactly one space (e.g. "c o m p a n y" -> "company")
  // We run this iteratively to ensure multiple single-spaced characters are combined
  let previousLength;
  do {
    previousLength = processed.length;
    processed = processed.replace(/(\b[a-z0-9])\s(?=[a-z0-9]\b)/g, '$1');
  } while (processed.length < previousLength);

  // 5. Strip punctuation, emojis, and symbols (keep only letters, digits, and spaces)
  processed = processed.replace(/[^a-z0-9\s]/g, '');

  // 6. Compress multiple consecutive spaces
  processed = processed.replace(/\s+/g, ' ').trim();

  return processed;
}
