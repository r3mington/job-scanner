/**
 * Calculates string similarity using the Sørensen–Dice coefficient on character bigrams.
 * Returns a score between 0.0 (no similarity) and 1.0 (exact match).
 */
export function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  // Strip whitespace for bigram comparison
  const s1 = str1.replace(/\s+/g, '');
  const s2 = str2.replace(/\s+/g, '');
  
  if (s1 === s2) return 1.0;
  if (s1.length < 2 || s2.length < 2) return 0;

  const bigrams1 = new Map();
  for (let i = 0; i < s1.length - 1; i++) {
    const bigram = s1.substr(i, 2);
    bigrams1.set(bigram, (bigrams1.get(bigram) || 0) + 1);
  }

  let intersection = 0;
  const totalBigrams = s2.length - 1;
  
  for (let i = 0; i < s2.length - 1; i++) {
    const bigram = s2.substr(i, 2);
    const count = bigrams1.get(bigram) || 0;
    if (count > 0) {
      intersection++;
      bigrams1.set(bigram, count - 1);
    }
  }

  return (2.0 * intersection) / (s1.length - 1 + totalBigrams);
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
