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

/**
 * Word-level Jaccard similarity.
 * Less sensitive to length differences; rewards shared keywords.
 */
function wordJaccard(a, b) {
  const tokenize = (s) => new Set(s.split(/\s+/).filter(w => w.length > 2));
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
 * Extracts high-value identifiers (Telegram handles, phone numbers, salary
 * figures, specific domain names) and returns a bonus score (0–0.30) based
 * on how many are shared. Even one matching Telegram handle is a strong signal
 * that two ads originate from the same operation.
 */
function keyEntityBonus(a, b) {
  const extract = (s) => {
    const entities = new Set();
    // @handles (Telegram, WhatsApp usernames)
    (s.match(/@[\w]{3,}/g) || []).forEach(m => entities.add(m.toLowerCase()));
    // phone numbers (7+ consecutive digits, ignoring salary-style numbers)
    (s.match(/\b\d{7,}\b/g) || []).forEach(m => entities.add(m));
    // salary/numeric figures like 1100, 2000, 3000 (4-digit numbers)
    (s.match(/\b\d{4}\b/g) || []).forEach(m => entities.add(m));
    // domain names
    (s.match(/\b[\w-]+\.(com|net|org|io|me)\b/gi) || []).forEach(m => entities.add(m.toLowerCase()));
    return entities;
  };

  const entA = extract(a);
  const entB = extract(b);
  if (entA.size === 0 || entB.size === 0) return 0;

  let matches = 0;
  entA.forEach(e => { if (entB.has(e)) matches++; });

  // Each matching entity contributes, capped at 0.30
  // First match is worth the most (strong signal), diminishing returns after
  if (matches === 0) return 0;
  if (matches === 1) return 0.15;
  if (matches === 2) return 0.22;
  return Math.min(0.30, 0.22 + (matches - 2) * 0.04);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Blended 3-signal similarity score.
 *
 * Signals:
 *  35% — Dice bigrams  (character-level structure)
 *  35% — Word Jaccard  (keyword/concept overlap)
 *  30% — Key entity bonus (shared @handles, numbers, domains)
 *
 * Returns a value between 0.0 and 1.0.
 */
export function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;

  // Entity bonus must run on raw strings BEFORE normalization strips @ and digits
  const bonus = keyEntityBonus(str1, str2);

  const n1 = normalizeForCompare(str1);
  const n2 = normalizeForCompare(str2);

  if (n1 === n2) return 1.0;

  const dice    = diceSimilarity(n1, n2);
  const jaccard = wordJaccard(n1, n2);

  // Weighted blend — entity bonus is additive on top of text signals
  const blended = 0.35 * dice + 0.35 * jaccard + bonus;
  return Math.min(1.0, blended);
}

/**
 * Computes word-level diff between two texts using a Longest Common Subsequence (LCS) algorithm.
 * Returns an array of tokens with type: 'unchanged', 'added', or 'removed'.
 */
export function computeWordDiff(oldStr, newStr) {
  // Split strings keeping whitespace delimiters so formatting is preserved
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
