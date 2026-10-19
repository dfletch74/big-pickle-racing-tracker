/**
 * Timeslip scanner: OCR a photo of a timeslip and extract run fields.
 * Tesseract is lazy-loaded only when the user scans (it's heavy).
 */

let workerPromise = null;

async function getWorker(onProgress) {
  if (!workerPromise) {
    const { createWorker } = await import('tesseract.js');
    workerPromise = (async () => {
      const worker = await createWorker('eng');
      return worker;
    })();
  }
  return workerPromise;
}

/** Downscale + grayscale + contrast stretch for thermal-paper slips. */
function preprocess(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        // Upscale small/faded text — Tesseract reads larger glyphs better.
        const targetLong = 2400;
        const scale = Math.max(1, Math.min(2.5, targetLong / Math.max(img.width, img.height)));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        const px = data.data;
        // Grayscale histogram for percentile-based stretch (ignores outliers
        // like fingers/shadows that would otherwise crush the text contrast).
        const gray = new Uint8ClampedArray(w * h);
        const hist = new Array(256).fill(0);
        for (let i = 0; i < w * h; i++) {
          const g = Math.round(0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]);
          gray[i] = g;
          hist[g]++;
        }
        const total = w * h;
        let lo = 0, hi = 255, acc = 0;
        for (let i = 0; i < 256; i++) {
          acc += hist[i];
          if (acc / total >= 0.02) { lo = i; break; }
        }
        acc = 0;
        for (let i = 255; i >= 0; i--) {
          acc += hist[i];
          if (acc / total >= 0.02) { hi = i; break; }
        }
        const range = Math.max(1, hi - lo);
        for (let i = 0; i < w * h; i++) {
          let v = Math.round(((gray[i] - lo) / range) * 255);
          v = v < 0 ? 0 : v > 255 ? 255 : v;
          px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
          px[i * 4 + 3] = 255;
        }
        ctx.putImageData(data, 0, 0);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Image processing failed'))), 'image/png');
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

export async function ocrTimeslip(file, onProgress) {
  const blob = await preprocess(file);
  const worker = await getWorker(onProgress);
  const { data: { text } } = await worker.recognize(blob);
  return text;
}

// ---- Timeslip text parsing ----

// Each field: list of regexes (first capture group = number). All matches are
// collected so two-lane slips yield two candidates per field.
// Patterns cover BOTH layouts: "R/T .061" and ".061 ------ REACTION".
const PATTERNS = {
  rt: [
    /(?:R\s*\/\s*T|RT|REACTION)\s*[:.]?\s*(-?\d*\.\d+)/gi,
    /(-?\d*\.\d+)\s*[-–—]+\s*(?:R\s*\/\s*T|REACTION)/gi,
  ],
  sixty: [
    /\b60\s*(?:FT|'|′)?\s*(\d+\.\d+)/gi,
    /(\d+\.\d+)\s*[-–—]+\s*60\s*FT/gi,
  ],
  threeThirty: [
    /\b330\s*(?:FT)?\s*(\d+\.\d+)/gi,
    /(\d+\.\d+)\s*[-–—]+\s*330\s*FT/gi,
  ],
  eighthET: [
    /(?:1\s*\/\s*8|660)\s*(?:FT|'|ET)?\s*(\d+\.\d+)/gi,
    /(\d+\.\d+)\s*[-–—]+\s*1\s*\/\s*8\s*ET/gi,
  ],
  thousand: [
    /\b1000\s*(?:FT|'|ET)?\s*(\d+\.\d+)/gi,
    /(\d+\.\d+)\s*[-–—]+\s*1000\s*ET/gi,
  ],
  et: [
    /(?:1\s*\/\s*4|1320|QUARTER)\s*(?:ET)?\s*(\d+\.\d+)/gi,
    /\bE\.?\s*T\.?\s*(\d+\.\d+)/gi,
    /(\d+\.\d+)\s*[-–—]+\s*1\s*\/\s*4\s*ET/gi,
  ],
};

function allMatches(text, patterns) {
  const out = [];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const v = parseFloat(m[1]);
      if (!Number.isNaN(v) && v > 0 && v < 1000 && !out.includes(m[1])) out.push(m[1]);
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return out;
}

/**
 * Parse OCR text into { field: [candidates] } plus a best guess per field.
 * MPH is positional: values in order are 1/8 MPH then 1/4 MPH.
 */
export function parseSlipText(rawText) {
  const text = ` ${rawText.toUpperCase().replace(/[|]/g, '1')} `;
  const fields = {};
  for (const [field, patterns] of Object.entries(PATTERNS)) {
    fields[field] = allMatches(text, patterns);
  }

  // MPH: positional — values before the 1/4 ET are 1/8 MPH, after are 1/4 MPH.
  // (Standard slip layout lists 1/8 MPH, then 1000', 1/4 ET, then 1/4 MPH.)
  // Handles both "MPH 107.27" and "92.08 ------ 1/8 MPH".
  const mphs = [];
  {
    const patterns = [/\bMPH\s*[:.]?\s*(\d+\.\d+)/gi, /(\d+\.\d+)\s*[-–—]+\s*1\s*\/\s*[48]\s*MPH/gi];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(text)) !== null) {
        const v = parseFloat(m[1]);
        if (!Number.isNaN(v) && v > 20 && v < 400 && !mphs.some((x) => x.v === m[1])) {
          mphs.push({ v: m[1], idx: m.index });
        }
      }
    }
  }
  const quarterIdx = (() => {
    const m = text.match(/(?:1\s*\/\s*4|1320|QUARTER)/);
    return m ? m.index : Infinity;
  })();
  fields.eighthMPH = mphs.filter((x) => x.idx < quarterIdx).map((x) => x.v);
  fields.mph = mphs.filter((x) => x.idx > quarterIdx).map((x) => x.v);
  // Fallback: no 1/4 marker found — pair them in order as (1/8, 1/4).
  if (quarterIdx === Infinity && mphs.length >= 2) {
    fields.eighthMPH = [];
    fields.mph = [];
    mphs.forEach((x, i) => (i % 2 === 0 ? fields.eighthMPH : fields.mph).push(x.v));
  }

  // Date / time hints.
  const dateM = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  let date = null;
  if (dateM) {
    let [, a, b, c] = dateM;
    if (c.length === 2) c = '20' + c;
    // Assume MM/DD/YYYY (US slips).
    date = `${c}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
  }
  const timeM = text.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP])(?:\.?M\.?)?\b/);
  let time = null;
  if (timeM) {
    let h = parseInt(timeM[1], 10);
    if (timeM[3] === 'P' && h < 12) h += 12;
    if (timeM[3] === 'A' && h === 12) h = 0;
    time = `${String(h).padStart(2, '0')}:${timeM[2]}`;
  }

  return { fields, date, time, rawText };
}

/** Pick lane `laneIdx` (0-based) from parsed candidates → flat field map. */
export function pickLane(parsed, laneIdx) {
  const out = {};
  for (const [field, cands] of Object.entries(parsed.fields)) {
    if (cands.length > laneIdx) out[field] = cands[laneIdx];
    else if (cands.length > 0) out[field] = cands[0];
  }
  if (parsed.date) out.date = parsed.date;
  if (parsed.time) out.time = parsed.time;
  return out;
}

/** How many lanes the slip seems to have (max candidates across fields). */
export function laneCount(parsed) {
  return Math.max(1, ...Object.values(parsed.fields).map((c) => c.length));
}
