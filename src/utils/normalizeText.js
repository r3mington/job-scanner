// Client-side text normalization for similarity matching.
//
// The model used to generate `normalized_text` itself — a full second echo of
// the ad in every response, which roughly doubled output-token spend per scan.
// Deterministic steps (lowercasing, emoji/symbol stripping, whitespace
// collapsing) now run here; the model only returns a compact
// `deobfuscation_map` of the tokens that genuinely need language skills to
// decode (leet-speak like 'T3l3gram', spaced-out words like 'C o m p a n y').

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Emoji, pictographs, dingbats, arrows, box drawing, variation selectors, ZWJ.
// Combining marks (VS15/16, ZWJ, keycap) sit outside the class as alternations
// so the character class holds only standalone code points.
const EMOJI_AND_SYMBOLS =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{2500}-\u{25FF}\u{E0020}-\u{E007F}]|[\u{FE00}-\u{FE0F}]|\u{200D}|\u{20E3}/gu;

// After emoji removal, keep letters/digits/whitespace plus punctuation that
// carries meaning in job ads (money, contacts, ranges). Everything else —
// decorative bullets, stars, kaomoji fragments — becomes a space.
const DISALLOWED_PUNCT = /[^\p{L}\p{N}\s.,:;@+$%/&()\-#'"!?]/gu;

/**
 * Build the normalized similarity text from the (English) ad text and the
 * model's de-obfuscation map. Mirrors what the old model-side instruction
 * asked for: lowercase, no emojis/decorations, obfuscation decoded, digits
 * (salaries, years, dates) preserved.
 */
export function buildNormalizedText(baseText, deobfuscationMap) {
  let text = String(baseText || '');
  if (!text.trim()) return '';

  for (const entry of Array.isArray(deobfuscationMap) ? deobfuscationMap : []) {
    if (!entry || typeof entry.from !== 'string' || typeof entry.to !== 'string') continue;
    const from = entry.from.trim();
    if (!from) continue;
    try {
      text = text.replace(new RegExp(escapeRegExp(from), 'gi'), entry.to);
    } catch { /* defensive: a pathological pattern must never break a scan */ }
  }

  return text
    .toLowerCase()
    .replace(EMOJI_AND_SYMBOLS, ' ')
    .replace(DISALLOWED_PUNCT, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
