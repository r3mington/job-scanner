// Client-side flyer compression: downscale + re-encode before the image ever
// reaches Supabase Storage. A 12 MP phone photo typically shrinks 5-10x with
// no loss of OCR legibility at these settings. NOTE: canvas re-encoding strips
// EXIF metadata — callers must let the analyst opt out when original bytes
// matter (EXIF forensics, ELA).

const MAX_DIMENSION = 1600; // long edge, px — plenty for flyer text OCR
const QUALITY = 0.8;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to decode'));
    img.src = src;
  });
}

// Approximate decoded byte size of a base64 data URL
export function dataUrlByteSize(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return 0;
  const b64 = dataUrl.split(',')[1] || '';
  return Math.floor((b64.length * 3) / 4);
}

export function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Returns { dataUrl, bytes, originalBytes, width, height, skipped }.
// `skipped` is true when re-encoding would not actually save space (already
// small/optimised input) — in that case the original data URL is returned.
export async function compressImageDataUrl(dataUrl, { maxDim = MAX_DIMENSION, quality = QUALITY } = {}) {
  const originalBytes = dataUrlByteSize(dataUrl);
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight, 1));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);

  // Prefer WebP (~25-30% smaller); browsers without WebP encoding silently
  // return PNG from toDataURL, so verify the MIME and fall back to JPEG.
  let out = canvas.toDataURL('image/webp', quality);
  if (!out.startsWith('data:image/webp')) {
    out = canvas.toDataURL('image/jpeg', quality);
  }

  const bytes = dataUrlByteSize(out);
  if (bytes >= originalBytes) {
    return { dataUrl, bytes: originalBytes, originalBytes, width: img.naturalWidth, height: img.naturalHeight, skipped: true };
  }
  return { dataUrl: out, bytes, originalBytes, width: w, height: h, skipped: false };
}
