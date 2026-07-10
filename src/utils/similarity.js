// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Light client-side normalization applied before any comparison.
 * Gemini already normalizes, but this adds a safety net for older records.
 */
function normalizeForCompare(s) {
  if (!s) return '';
  return s
    .toLowerCase()
    // leet-speak / obfuscation common in trafficking ads: replace ONLY within word tokens containing letters
    .replace(/\b\w*[a-z]\w*\b/g, (match) => {
      return match
        .replace(/3/g, 'e')
        .replace(/1/g, 'l')
        .replace(/0/g, 'o');
    })
    // Now safe to replace symbols globally without triggering digit de-leeting on pure numbers
    .replace(/\$/g, 's')
    .replace(/@/g, 'a')
    // collapse all whitespace
    .replace(/\s+/g, ' ')
    .trim();
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
function tokenizeForJaccard(s) {
  const tokens = new Set();
  s.split(/\s+/).forEach(w => {
    const cleaned = cleanAlphanumeric(w);
    if (cleaned.length > 2 && !STOP_WORDS.has(cleaned) && !GENERIC_JOB_WORDS.has(cleaned)) {
      tokens.add(cleaned);
    }
  });
  return tokens;
}

function jaccardFromSets(setA, setB) {
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
function extractEntities(s) {
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
}

function entityBonus(entA, entB) {
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
 * Precompute everything pairwise comparison needs (normalization, bigram
 * counts, token set, key entities) for one text. For all-pairs workloads this
 * turns O(n²·len) re-tokenization into O(n·len) preparation + cheap pair ops.
 */
export function prepareSimilarity(str) {
  if (!str) return null;
  const normalized = normalizeForCompare(str);
  const compact = normalized.replace(/\s/g, '');
  const bigrams = new Map();
  for (let i = 0; i < compact.length - 1; i++) {
    const bg = compact.substr(i, 2);
    bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
  }
  return {
    normalized,
    compact,
    bigrams,
    tokens: tokenizeForJaccard(normalized),
    entities: extractEntities(str)
  };
}

function diceFromPrepared(a, b) {
  const s1 = a.compact;
  const s2 = b.compact;
  if (s1 === s2) return 1.0;
  if (s1.length < 2 || s2.length < 2) return 0;

  const used = new Map();
  let hits = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.substr(i, 2);
    const u = used.get(bg) || 0;
    if (u < (a.bigrams.get(bg) || 0)) {
      hits++;
      used.set(bg, u + 1);
    }
  }
  return (2.0 * hits) / (s1.length - 1 + s2.length - 1);
}

/**
 * Blended 3-signal similarity score between two prepared texts.
 *
 * Signals:
 *  20% — Dice bigrams  (character-level structure, weighted lower to avoid baseline language inflation)
 *  40% — Word Jaccard  (specific keyword/concept overlap, excluding generic job terms)
 *  40% — Key entity bonus / exact matches
 */
export function similarityFromPrepared(a, b) {
  if (!a || !b) return 0;
  if (a.normalized === b.normalized) return 1.0;

  const bonus   = entityBonus(a.entities, b.entities);
  const dice    = diceFromPrepared(a, b);
  const jaccard = jaccardFromSets(a.tokens, b.tokens);

  const blended = 0.20 * dice + 0.40 * jaccard + bonus;
  return Math.min(1.0, blended);
}

/** One-shot convenience wrapper around the prepared pipeline. */
export function calculateSimilarity(str1, str2) {
  return similarityFromPrepared(prepareSimilarity(str1), prepareSimilarity(str2));
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
/**
 * Explains why two ads matched by surfacing shared handles, phone numbers, or template text overlap.
 */
export function getMatchReasons(currentText, otherText) {
  const cur = currentText || '';
  const other = otherText || '';
  const reasons = [];

  const handleRe = /@[\w]{3,}/g;
  const curHandles = new Set((cur.match(handleRe) || []).map(h => h.toLowerCase()));
  const otherHandles = new Set((other.match(handleRe) || []).map(h => h.toLowerCase()));
  const sharedHandle = [...curHandles].find(h => otherHandles.has(h));
  if (sharedHandle) {
    reasons.push({ kind: 'critical', label: `Shared handle ${sharedHandle}` });
  }

  const phoneRe = /\b\d{7,}\b/g;
  const curPhones = new Set(cur.match(phoneRe) || []);
  const otherPhones = new Set(other.match(phoneRe) || []);
  const sharedPhone = [...curPhones].find(p => otherPhones.has(p));
  if (sharedPhone) {
    reasons.push({ kind: 'critical', label: `Shared number ···${sharedPhone.slice(-4)}` });
  }

  const clean = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, '');
  const tokenize = (s) => new Set(
    s.split(/\s+/).map(clean).filter(c => c.length > 2 && !STOP_WORDS.has(c) && !GENERIC_JOB_WORDS.has(c))
  );
  const otherTokens = tokenize(other);
  const sharedTerms = [...tokenize(cur)].filter(k => otherTokens.has(k));
  if (sharedTerms.length >= 4) {
    reasons.push({ kind: 'template', label: `Template reuse · ${sharedTerms.length} shared terms` });
  }

  if (reasons.length === 0) {
    reasons.push({ kind: 'structural', label: 'Structural text match' });
  }
  return reasons;
}
