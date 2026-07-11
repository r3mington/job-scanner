// Perceptual image hashing for duplicate flyer detection. Computes 64-bit
// aHash (mean luminance) and dHash (horizontal gradient) signatures encoded
// as 16-char hex strings; visual similarity is derived from Hamming distance.
// Both hashes survive re-compression, resizing, and minor recolouring, which
// is exactly how scam syndicates recycle flyer templates.

const HASH_CACHE_KEY = 'sentinel_phash_cache_v1';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to load or blocked by CORS'));
    img.src = src;
  });
}

// Downscale to a w×h grid and return per-pixel luminance values
function grayscaleGrid(source, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }
  return gray;
}

function bitsToHex(bits) {
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    hex += ((bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3]).toString(16);
  }
  return hex;
}

export function computeAHash(source) {
  const gray = grayscaleGrid(source, 8, 8);
  let mean = 0;
  for (let i = 0; i < 64; i++) mean += gray[i];
  mean /= 64;
  return bitsToHex(Array.from(gray, (v) => (v > mean ? 1 : 0)));
}

export function computeDHash(source) {
  // 9×8 grid; each bit encodes whether luminance rises between horizontal neighbours
  const gray = grayscaleGrid(source, 9, 8);
  const bits = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits.push(gray[y * 9 + x] > gray[y * 9 + x + 1] ? 1 : 0);
    }
  }
  return bitsToHex(bits);
}

export function computeImageHashes(source) {
  return { ahash: computeAHash(source), dhash: computeDHash(source) };
}

export async function hashImageUrl(url) {
  const img = await loadImage(url);
  return computeImageHashes(img);
}

export function hammingDistance(hexA, hexB) {
  if (!hexA || !hexB || hexA.length !== hexB.length) return 64;
  let dist = 0;
  for (let i = 0; i < hexA.length; i++) {
    let x = parseInt(hexA[i], 16) ^ parseInt(hexB[i], 16);
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

// Combined 0..1 similarity: bit agreement averaged across both hash families,
// so a match needs both comparable brightness layout AND comparable gradients.
export function hashSimilarity(a, b) {
  const d = hammingDistance(a.dhash, b.dhash) + hammingDistance(a.ahash, b.ahash);
  return 1 - d / 128;
}

// Hashing a remote flyer costs a full image download, so results are cached
// per scan id in localStorage and invalidated when the stored URL changes.
export function loadHashCache() {
  try {
    return JSON.parse(localStorage.getItem(HASH_CACHE_KEY)) || {};
  } catch {
    return {};
  }
}

export function saveHashCache(cache) {
  try {
    localStorage.setItem(HASH_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Quota exceeded — audits still work, they just re-hash next time
  }
}
