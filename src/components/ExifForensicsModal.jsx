import React, { useState, useEffect, useCallback } from 'react';
import {
  X, FileText, Loader2, AlertTriangle, MapPin, ExternalLink,
  Copy, ChevronDown, ChevronRight, Info, ShieldAlert, Check
} from 'lucide-react';
import exifr from 'exifr';

// Provenance registry: where each EXIF tag physically lives inside the file
// and how it is decoded. Tag IDs per the EXIF 2.32 / TIFF 6.0 specifications.
const TAG_PROVENANCE = {
  Make: {
    id: '0x010F',
    ifd: 'TIFF IFD0',
    how: 'ASCII string written by the capturing device into the primary image directory (IFD0) of the APP1/EXIF segment.'
  },
  Model: {
    id: '0x0110',
    ifd: 'TIFF IFD0',
    how: 'ASCII string identifying the device model, stored alongside Make in IFD0.'
  },
  Software: {
    id: '0x0131',
    ifd: 'TIFF IFD0',
    how: 'Set by the last program that wrote the file. Editors like Photoshop or export tools like Canva overwrite this — a key tampering/compilation indicator.'
  },
  ModifyDate: {
    id: '0x0132',
    ifd: 'TIFF IFD0',
    how: 'Timestamp of the last file modification, from the device’s local clock. No timezone is stored.'
  },
  DateTimeOriginal: {
    id: '0x9003',
    ifd: 'Exif SubIFD',
    how: 'Moment the shutter fired, per the device’s own clock. No timezone — a phone with a wrong clock writes a wrong time.'
  },
  CreateDate: {
    id: '0x9004',
    ifd: 'Exif SubIFD',
    how: 'When the file was digitized (usually identical to DateTimeOriginal on phones).'
  },
  Orientation: {
    id: '0x0112',
    ifd: 'TIFF IFD0',
    how: 'How the camera was rotated at capture; viewers use it to auto-rotate the image.'
  },
  LensModel: {
    id: '0xA434',
    ifd: 'Exif SubIFD',
    how: 'Lens identifier written by the camera firmware.'
  },
  GPSLatitude: {
    id: '0x0002',
    ifd: 'GPS IFD',
    how: 'Three rational numbers — degrees, minutes, seconds — converted to decimal as D + M/60 + S/3600, signed by GPSLatitudeRef (0x0001, N/S).'
  },
  GPSLongitude: {
    id: '0x0004',
    ifd: 'GPS IFD',
    how: 'Three rationals (degrees/minutes/seconds) converted as D + M/60 + S/3600, signed by GPSLongitudeRef (0x0003, E/W).'
  },
  GPSAltitude: {
    id: '0x0006',
    ifd: 'GPS IFD',
    how: 'Metres above (or below, per GPSAltitudeRef) sea level, as reported by the device GPS chip.'
  }
};

// File-container facts are not EXIF — make that distinction explicit.
const CONTAINER_PROVENANCE = {
  how: 'Derived from the file container itself (byte length, MIME signature, decoded pixel grid) — present in every image and independent of EXIF.'
};

// exifr also surfaces container header fields (e.g. PNG IHDR chunk data). These
// describe the pixel grid, not the capture — don't count them as EXIF evidence.
const CONTAINER_HEADER_KEYS = new Set([
  'ImageWidth', 'ImageHeight', 'BitDepth', 'ColorType',
  'Compression', 'Filter', 'Interlace', 'ResolutionUnit',
  'XResolution', 'YResolution'
]);

function toDms(dec) {
  const abs = Math.abs(dec);
  const d = Math.floor(abs);
  const mFloat = (abs - d) * 60;
  const m = Math.floor(mFloat);
  const s = ((mFloat - m) * 60).toFixed(2);
  return { d, m, s };
}

async function loadImageBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image bytes (HTTP ${res.status})`);
  return await res.blob();
}

function getImageDimensions(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// A single metadata row with an expandable "how was this found" panel
function ProvenanceRow({ label, value, provenance, mono = true }) {
  const [open, setOpen] = useState(false);
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="border-b border-slate-850 pb-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex justify-between items-center gap-2 text-left hover:bg-slate-900/50 rounded px-1 -mx-1 transition-colors"
      >
        <span className="flex items-center gap-1 shrink-0">
          {open ? <ChevronDown className="w-3 h-3 text-slate-600" /> : <ChevronRight className="w-3 h-3 text-slate-600" />}
          {label}:
        </span>
        <span className={`text-slate-200 font-bold text-right break-all ${mono ? '' : 'font-sans'}`}>{String(value)}</span>
      </button>
      {open && (
        <div className="mt-1.5 mb-1 ml-4 p-2 bg-slate-900/60 border-l-2 border-amber-500/40 rounded-r text-[10px] leading-relaxed text-slate-400 font-sans">
          {provenance?.id && (
            <span className="block font-mono text-amber-500/80 mb-1">
              Tag {provenance.id} · {provenance.ifd}
            </span>
          )}
          {provenance?.how || CONTAINER_PROVENANCE.how}
        </div>
      )}
    </div>
  );
}

export default function ExifForensicsModal({ isOpen, onClose, flyerImageUrl, onLog }) {
  const [status, setStatus] = useState('idle'); // idle | parsing | done | error
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [showMethodology, setShowMethodology] = useState(false);
  const [copiedCoords, setCopiedCoords] = useState(false);

  const runParse = useCallback(async () => {
    if (!flyerImageUrl) {
      setError('No reference image attached to this case.');
      setStatus('error');
      return;
    }
    setStatus('parsing');
    setError('');
    setResult(null);

    try {
      let blob = null;
      try {
        blob = await loadImageBytes(flyerImageUrl);
      } catch {
        // CORS can block byte access on remote URLs; exifr can still try the URL directly
      }

      const input = blob || flyerImageUrl;

      // Full parse of TIFF/Exif/GPS IFDs. sanitize:false keeps raw-ish structures
      // out; we also grab the untranslated GPS rationals for the derivation panel.
      const [parsed, dims] = await Promise.all([
        exifr.parse(input, { tiff: true, exif: true, gps: true, xmp: false, icc: false }).catch(() => null),
        getImageDimensions(flyerImageUrl)
      ]);

      const gpsRaw = await exifr
        .parse(input, { gps: true, translateValues: false, reviveValues: false, tiff: false, exif: false })
        .catch(() => null);

      const container = {
        fileSize: blob ? `${Math.round(blob.size / 1024)} KB` : 'Unavailable (cross-origin)',
        mimeType: blob?.type || (flyerImageUrl.startsWith('data:') ? flyerImageUrl.split(';')[0].split(':')[1] : 'unknown'),
        resolution: dims ? `${dims.width} x ${dims.height} pixels` : 'Unavailable'
      };

      const gps = (parsed?.latitude !== undefined && parsed?.longitude !== undefined)
        ? {
            latitude: parsed.latitude,
            longitude: parsed.longitude,
            altitude: parsed.GPSAltitude ?? null,
            rawLat: gpsRaw?.GPSLatitude || null,
            rawLatRef: gpsRaw?.GPSLatitudeRef || null,
            rawLng: gpsRaw?.GPSLongitude || null,
            rawLngRef: gpsRaw?.GPSLongitudeRef || null
          }
        : null;

      const exifTagCount = parsed
        ? Object.keys(parsed).filter((k) => !CONTAINER_HEADER_KEYS.has(k)).length
        : 0;

      setResult({ container, exif: parsed, gps, exifTagCount });
      setStatus('done');

      if (onLog) {
        const logMessage = `[${new Date().toLocaleString()}] SYSTEM LOG: EXIF parse of flyer image completed. ${
          exifTagCount > 0
            ? `${exifTagCount} metadata field(s) present.${gps ? ' GPS coordinates found — treat as unverified, self-reported data.' : ' No GPS tags present.'}`
            : 'No EXIF metadata present (consistent with screenshot, chat-app relay, or web-tool export).'
        }\n`;
        onLog(logMessage);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to parse image metadata.');
      setStatus('error');
    }
  }, [flyerImageUrl, onLog]);

  useEffect(() => {
    if (isOpen) runParse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const exif = result?.exif;
  const gps = result?.gps;
  const hasExif = (result?.exifTagCount || 0) > 0 && exif;

  const copyCoords = () => {
    if (!gps) return;
    navigator.clipboard.writeText(`${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}`);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  const osmBbox = gps
    ? `${(gps.longitude - 0.02).toFixed(5)},${(gps.latitude - 0.012).toFixed(5)},${(gps.longitude + 0.02).toFixed(5)},${(gps.latitude + 0.012).toFixed(5)}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-[#111318] w-full max-w-6xl h-[85vh] rounded border border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#0c0f16]">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-500" />
            <div>
              <h3 className="font-mono text-xs uppercase tracking-widest text-slate-200">EXIF &amp; Metadata Forensics</h3>
              <p className="text-xs text-slate-500 mt-0.5 font-mono">
                Parses the EXIF (APP1) segment of the flyer file, client-side. Nothing is uploaded.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Reliability caveat banner — always visible */}
        <div className="px-4 py-2.5 bg-amber-950/40 border-b border-amber-500/30 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed text-amber-200/90">
            <span className="font-bold">Treat everything below as a lead, never as evidence.</span>{' '}
            EXIF is self-reported by whatever software last saved the file: it can be freely edited, forged, or wrong
            (device clocks drift, GPS can be spoofed). Most flyers arrive via Telegram, WhatsApp, or screenshots —
            all of which <span className="font-bold">strip metadata entirely</span> — so an empty result is the normal
            case, not a failure. Coordinates, if present, show where the file was <em>created or last saved</em>,
            which is often a designer&apos;s desk and not the scam operation itself. Corroborate independently before
            citing any of this in a report or takedown request.
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          {status === 'parsing' ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#0a0c12] text-slate-400 font-mono text-xs gap-3">
              <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
              <span>Reading APP1/EXIF segment from image bytes...</span>
            </div>
          ) : status === 'error' ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#0a0c12] text-red-400 font-mono text-xs p-6 text-center">
              <AlertTriangle className="w-10 h-10 text-red-500 mb-3" />
              <span>Error parsing metadata: {error}</span>
            </div>
          ) : result ? (
            <>
              {/* Left column: parsed fields with provenance */}
              <div className="w-full lg:w-[360px] border-r border-slate-800 p-5 overflow-y-auto bg-[#0d1117] font-mono text-[11px] text-slate-400">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">File Container</span>
                  <span className="text-[9px] text-slate-600 font-sans italic">click a row for its origin</span>
                </div>

                <div className="space-y-2.5">
                  <ProvenanceRow label="Resolution" value={result.container.resolution} />
                  <ProvenanceRow label="MIME Type" value={result.container.mimeType} />
                  <ProvenanceRow label="File Size" value={result.container.fileSize} />
                </div>

                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block pt-5 pb-3">
                  EXIF Segment {hasExif ? `(${result.exifTagCount} fields)` : ''}
                </span>

                {hasExif ? (
                  <div className="space-y-2.5">
                    <ProvenanceRow label="Device Make" value={exif.Make} provenance={TAG_PROVENANCE.Make} />
                    <ProvenanceRow label="Device Model" value={exif.Model} provenance={TAG_PROVENANCE.Model} />
                    <ProvenanceRow label="Software" value={exif.Software} provenance={TAG_PROVENANCE.Software} />
                    <ProvenanceRow
                      label="Capture Time"
                      value={exif.DateTimeOriginal ? new Date(exif.DateTimeOriginal).toLocaleString() : null}
                      provenance={TAG_PROVENANCE.DateTimeOriginal}
                    />
                    <ProvenanceRow
                      label="Modified"
                      value={exif.ModifyDate ? new Date(exif.ModifyDate).toLocaleString() : null}
                      provenance={TAG_PROVENANCE.ModifyDate}
                    />
                    <ProvenanceRow label="Lens" value={exif.LensModel} provenance={TAG_PROVENANCE.LensModel} />
                    <ProvenanceRow label="Orientation" value={exif.Orientation} provenance={TAG_PROVENANCE.Orientation} />
                    {!exif.Make && !exif.Model && (
                      <p className="text-[10px] text-slate-500 font-sans leading-relaxed pt-1">
                        EXIF fields exist but no camera hardware tags — typical of files exported by
                        design software rather than captured by a phone camera.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-slate-900/60 border border-slate-800 rounded text-[10px] font-sans leading-relaxed text-slate-400">
                    <span className="font-bold text-slate-300 block mb-1">No EXIF segment in this file.</span>
                    This is expected, not suspicious in itself: Telegram, WhatsApp, Facebook and most chat/social
                    platforms re-encode images and discard metadata, screenshots never contain camera data, and web
                    design tools (e.g. Canva) export clean files. What it does tell you: this file is{' '}
                    <span className="text-slate-300">not a straight-from-camera original</span>, so no hardware or
                    location conclusions can be drawn from it.
                  </div>
                )}

                {/* Methodology explainer */}
                <button
                  type="button"
                  onClick={() => setShowMethodology(!showMethodology)}
                  className="mt-5 w-full flex items-center gap-1.5 text-[10px] font-bold text-amber-500/80 hover:text-amber-400 uppercase tracking-wider transition-colors"
                >
                  <Info className="w-3.5 h-3.5" />
                  How this extraction works
                  {showMethodology ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
                {showMethodology && (
                  <div className="mt-2 p-3 bg-slate-900/60 border border-slate-800 rounded text-[10px] font-sans leading-relaxed text-slate-400 space-y-2">
                    <p>
                      A JPEG file is a chain of segments. It opens with the SOI marker (<span className="font-mono">0xFFD8</span>);
                      metadata lives in an <span className="font-mono">APP1</span> segment (<span className="font-mono">0xFFE1</span>)
                      near the start, prefixed with the ASCII string <span className="font-mono">&quot;Exif\0\0&quot;</span>.
                    </p>
                    <p>
                      Inside APP1 is a TIFF structure of Image File Directories (IFDs): <span className="font-mono">IFD0</span> for
                      device/software tags, an <span className="font-mono">Exif SubIFD</span> for capture settings, and a{' '}
                      <span className="font-mono">GPS IFD</span> for location. Each entry is a numbered tag (shown per field above)
                      with a type and value — this tool walks those directories in the browser and decodes each tag.
                    </p>
                    <p>
                      The parsing is done locally by the open-source <span className="font-mono">exifr</span> library; the image
                      never leaves this device during extraction.
                    </p>
                  </div>
                )}
              </div>

              {/* Center column: geolocation */}
              <div className="flex-1 bg-slate-950 flex flex-col border-r border-slate-800 min-h-[300px] overflow-y-auto">
                <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider p-5 pb-3">
                  GPS Geolocation
                </span>

                {gps ? (
                  <div className="flex-1 flex flex-col px-5 pb-5 gap-3">
                    {/* Real map */}
                    <div className="relative w-full h-56 lg:h-64 border border-slate-800 rounded overflow-hidden bg-[#090b10]">
                      <iframe
                        title="EXIF GPS location map"
                        className="w-full h-full"
                        src={`https://www.openstreetmap.org/export/embed.html?bbox=${osmBbox}&layer=mapnik&marker=${gps.latitude.toFixed(6)},${gps.longitude.toFixed(6)}`}
                        style={{ border: 0, filter: 'invert(0.9) hue-rotate(180deg) saturate(0.7)' }}
                      />
                    </div>
                    <p className="text-[9px] text-slate-600 font-sans -mt-1">
                      Map tiles load from openstreetmap.org — the coordinates are sent to that service to render this view.
                    </p>

                    <div className="bg-slate-950/60 p-3 border border-slate-850 rounded space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-slate-500 uppercase">Decoded Coordinates</span>
                        <button
                          type="button"
                          onClick={copyCoords}
                          className="flex items-center gap-1 text-[10px] font-mono text-slate-400 hover:text-slate-200 transition-colors"
                        >
                          {copiedCoords ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          {copiedCoords ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <span className="text-sm font-mono font-bold text-amber-500 block">
                        {gps.latitude.toFixed(6)}, {gps.longitude.toFixed(6)}
                      </span>
                      {gps.altitude !== null && (
                        <span className="text-[10px] font-mono text-slate-400 block">Altitude: {Math.round(gps.altitude)} m</span>
                      )}
                      <div className="flex gap-2 pt-1">
                        <a
                          href={`https://www.google.com/maps?q=${gps.latitude.toFixed(6)},${gps.longitude.toFixed(6)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-slate-300 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" /> Google Maps
                        </a>
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${gps.latitude.toFixed(6)}&mlon=${gps.longitude.toFixed(6)}#map=14/${gps.latitude.toFixed(5)}/${gps.longitude.toFixed(5)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-slate-300 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" /> OpenStreetMap
                        </a>
                      </div>
                    </div>

                    {/* DMS derivation */}
                    {gps.rawLat && gps.rawLng && (
                      <div className="bg-slate-950/60 p-3 border border-slate-850 rounded text-[10px] font-sans leading-relaxed text-slate-400">
                        <span className="font-bold text-slate-300 block mb-1 font-mono text-[9px] uppercase tracking-wider">
                          How these coordinates were decoded
                        </span>
                        The GPS IFD stores position as degrees/minutes/seconds rationals, not decimals:
                        <div className="font-mono text-amber-500/80 my-1.5 text-[10px]">
                          Lat (tag 0x0002): [{Array.from(gps.rawLat).join(', ')}] {gps.rawLatRef}<br />
                          Lng (tag 0x0004): [{Array.from(gps.rawLng).join(', ')}] {gps.rawLngRef}
                        </div>
                        Converted as D + M/60 + S/3600, signed negative for {`S/W`} hemisphere references — e.g.{' '}
                        <span className="font-mono">
                          {toDms(gps.latitude).d} + {toDms(gps.latitude).m}/60 + {toDms(gps.latitude).s}/3600 = {Math.abs(gps.latitude).toFixed(6)}
                        </span>.
                      </div>
                    )}

                    <div className="bg-red-950/30 border border-red-500/20 p-3 rounded text-[10px] font-sans leading-relaxed text-red-200/80">
                      <span className="font-bold">Interpretation caveat:</span> this is where the device that wrote the
                      file <em>claimed</em> to be — often a designer, reseller, or the last person to re-save the image,
                      not the scam compound. GPS tags survive editing and can be inserted deliberately as misdirection.
                      Cross-reference with the ad&apos;s claimed location and network graph before drawing conclusions.
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3 max-w-md mx-auto">
                    <MapPin className="w-12 h-12 text-slate-700" />
                    <span className="text-xs font-mono text-slate-400 block uppercase">No GPS tags in this file</span>
                    <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
                      {hasExif
                        ? 'The file carries EXIF data but its GPS IFD is absent — the capturing device had location off, or an editor removed it.'
                        : 'The file has no EXIF segment at all, so no location data can exist in it.'}{' '}
                      This is the outcome for the vast majority of scam flyers, which circulate as screenshots or
                      through metadata-stripping chat platforms. Use Reverse Image OSINT
                      for geolocation leads instead.
                    </p>
                  </div>
                )}
              </div>

              {/* Right column: raw parsed output */}
              <div className="w-full lg:w-[330px] p-5 flex flex-col overflow-hidden bg-[#0d1117]">
                <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-1 block">Raw Parsed Registry</span>
                <span className="text-[9px] text-slate-600 font-sans block mb-2">
                  Every field exifr decoded from the file, verbatim. Empty object = no EXIF segment.
                </span>
                <pre className="flex-1 overflow-auto bg-[#0a0c12] border border-slate-850 rounded p-4 font-mono text-[9px] text-amber-500/80 leading-relaxed whitespace-pre select-all">
                  {JSON.stringify(exif || {}, (key, value) => {
                    if (value instanceof Uint8Array || ArrayBuffer.isView(value)) return Array.from(value);
                    return value;
                  }, 2)}
                </pre>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-[#0c0f16] flex items-center justify-between gap-4">
          <p className="text-[10px] text-slate-600 font-sans leading-snug max-w-2xl">
            Usefulness is limited by design: metadata survives only on original, unrelayed files. Expect this tool to
            yield hard leads on a small minority of cases — its main value is confirming <em>how</em> a file was produced
            (camera vs. design tool vs. screenshot) and flagging inconsistencies against the ad&apos;s claims.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-855 hover:bg-slate-800 text-slate-200 text-xs font-mono font-bold rounded shadow-sm transition-colors border border-slate-700 shrink-0"
          >
            Close Modal
          </button>
        </div>
      </div>
    </div>
  );
}
