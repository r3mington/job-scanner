// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Light client-side normalization applied before any comparison.
 * Gemini already normalizes, but this adds a safety net for older records.
 */
function normalizeForCompare(s) {
  return s
    .toLowerCase()
    // leet-speak / obfuscation common in trafficking ads
    .replace(/\$/g, 's')
    .replace(/@/g, 'a')
    .replace(/3/g, 'e')
    .replace(/1/g, 'l')
    .replace(/0/g, 'o')
    // collapse all whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sørensen–Dice coefficient on character bigrams.
 * Measures character-level structural overlap.
 */
function diceSimilarity(a, b) {
  const s1 = a.replace(/\s/g, '');
  const s2 = b.replace(/\s/g, '');
  if (s1 === s2) return 1.0;
  if (s1.length < 2 || s2.length < 2) return 0;

  const bigrams = new Map();
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.substr(i, 2);
    bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
  }

  let hits = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.substr(i, 2);
    const c = bigrams.get(bg) || 0;
    if (c > 0) { hits++; bigrams.set(bg, c - 1); }
  }

  return (2.0 * hits) / (s1.length - 1 + s2.length - 1);
}

// ---------------------------------------------------------------------------
// Stop Words & Generic Job Terms (to avoid matching generic vocabulary)
// ---------------------------------------------------------------------------
export const STOP_WORDS = new Set([
  'the', 'and', 'a', 'an', 'of', 'to', 'for', 'with', 'in', 'on', 'at', 'by',
  'from', 'or', 'as', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'have',
  'has', 'had', 'do', 'does', 'did', 'about', 'more', 'most', 'some', 'any',
  'each', 'every', 'other', 'another', 'this', 'that', 'these', 'those', 'it',
  'its', 'they', 'them', 'their', 'our', 'us', 'we', 'you', 'your'
]);

export const GENERIC_JOB_WORDS = new Set([
  'job', 'work', 'position', 'requirements', 'haves', 'english', 'hiring',
  'apply', 'now', 'details', 'company', 'location', 'salary', 'monthly',
  'month', 'day', 'days', 'year', 'years', 'fluent', 'extra', 'candidate',
  'experience', 'ability', 'skills', 'role', 'opportunity', 'benefits',
  'office', 'team', 'preferred', 'requires', 'need', 'able', 'starting',
  'translator', 'translation', 'chinese', 'language', 'resume', 'contact',
  'cv', 'profile', 'applicant', 'recruitment', 'recruiter', 'industry',
  'description', 'responsibilities'
]);

const cleanAlphanumeric = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Word-level Jaccard similarity.
 * Ignores common stopwords and generic job advertisement vocabulary to prevent baseline score inflation.
 */
function wordJaccard(a, b) {
  const tokenize = (s) => {
    const tokens = new Set();
    s.split(/\s+/).forEach(w => {
      const cleaned = cleanAlphanumeric(w);
      if (cleaned.length > 2 && !STOP_WORDS.has(cleaned) && !GENERIC_JOB_WORDS.has(cleaned)) {
        tokens.add(cleaned);
      }
    });
    return tokens;
  };
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersectionCount = 0;
  setA.forEach(w => { if (setB.has(w)) intersectionCount++; });
  const unionCount = setA.size + setB.size - intersectionCount;
  return intersectionCount / unionCount;
}

/**
 * Key-entity matching bonus.
 * Extracts high-value identifiers (Telegram handles, phone numbers, domain names).
 * Reduces weight of generic 4-digit numbers to avoid inflating standard ad similarity.
 */
function keyEntityBonus(a, b) {
  const extract = (s) => {
    const handles = new Set();
    const phones = new Set();
    const numbers = new Set();
    
    // @handles (Telegram, WhatsApp usernames)
    (s.match(/@[\w]{3,}/g) || []).forEach(m => handles.add(m.toLowerCase()));
    // phone numbers (7+ consecutive digits)
    (s.match(/\b\d{7,}\b/g) || []).forEach(m => phones.add(m));
    // numeric figures (4-digit numbers)
    (s.match(/\b\d{4}\b/g) || []).forEach(m => numbers.add(m));
    
    return { handles, phones, numbers };
  };

  const entA = extract(a);
  const entB = extract(b);

  let bonus = 0;

  // Social handles matching is a major match (+0.35)
  let handleMatches = 0;
  entA.handles.forEach(h => { if (entB.handles.has(h)) handleMatches++; });
  if (handleMatches > 0) bonus += 0.35;

  // Phone number matches (+0.30)
  let phoneMatches = 0;
  entA.phones.forEach(p => { if (entB.phones.has(p)) phoneMatches++; });
  if (phoneMatches > 0) bonus += 0.30;

  // Generic 4-digit numbers (like salary) contribute very little (+0.02 each, capped at +0.05)
  let numberMatches = 0;
  entA.numbers.forEach(n => { if (entB.numbers.has(n)) numberMatches++; });
  if (numberMatches > 0) {
    bonus += Math.min(0.05, numberMatches * 0.02);
  }

  return bonus;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Blended 3-signal similarity score.
 *
 * Signals:
 *  20% — Dice bigrams  (character-level structure, weighted lower to avoid baseline language inflation)
 *  40% — Word Jaccard  (specific keyword/concept overlap, excluding generic job terms)
 *  40% — Key entity bonus / exact matches
 */
export function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;

  const bonus = keyEntityBonus(str1, str2);

  const n1 = normalizeForCompare(str1);
  const n2 = normalizeForCompare(str2);

  if (n1 === n2) return 1.0;

  const dice    = diceSimilarity(n1, n2);
  const jaccard = wordJaccard(n1, n2);

  const blended = 0.20 * dice + 0.40 * jaccard + bonus;
  return Math.min(1.0, blended);
}

/**
 * Computes word-level diff between two texts using a Longest Common Subsequence (LCS) algorithm.
 * Returns an array of tokens with type: 'unchanged', 'added', or 'removed'.
 */
export function computeWordDiff(oldStr, newStr) {
  const oldWords = (oldStr || '').split(/(\s+)/);
  const newWords = (newStr || '').split(/(\s+)/);

  const dp = Array(oldWords.length + 1)
    .fill(null)
    .map(() => Array(newWords.length + 1).fill(0));

  for (let i = 1; i <= oldWords.length; i++) {
    for (let j = 1; j <= newWords.length; j++) {
      if (oldWords[i - 1] === newWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const diff = [];
  let i = oldWords.length;
  let j = newWords.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      diff.unshift({ type: 'unchanged', value: oldWords[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diff.unshift({ type: 'added', value: newWords[j - 1] });
      j--;
    } else {
      diff.unshift({ type: 'removed', value: oldWords[i - 1] });
      i--;
    }
  }

  return diff;
}

/**
 * Identifies matching keywords (order-independent) between two text strings,
 * ignoring common stopwords and generic job advertisement words.
 */
export function computeKeywordMatches(oldStr, newStr) {
  const oldWords = (oldStr || '').split(/(\s+)/);
  const newWords = (newStr || '').split(/(\s+)/);

  const cleanOld = new Set(oldWords.map(w => cleanAlphanumeric(w)).filter(c => c.length > 2 && !STOP_WORDS.has(c) && !GENERIC_JOB_WORDS.has(c)));
  const cleanNew = new Set(newWords.map(w => cleanAlphanumeric(w)).filter(c => c.length > 2 && !STOP_WORDS.has(c) && !GENERIC_JOB_WORDS.has(c)));

  const shared = new Set(Array.from(cleanOld).filter(c => cleanNew.has(c)));

  const oldResult = oldWords.map(w => {
    const cleaned = cleanAlphanumeric(w);
    const isMatch = cleaned.length > 2 && shared.has(cleaned);
    return { value: w, isMatch };
  });

  const newResult = newWords.map(w => {
    const cleaned = cleanAlphanumeric(w);
    const isMatch = cleaned.length > 2 && shared.has(cleaned);
    return { value: w, isMatch };
  });

  return { oldResult, newResult };
}


