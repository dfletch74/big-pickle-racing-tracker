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

const GEMINI_KEY = 'bpr-gemini-key';
export const getGeminiKey = () => { try { return localStorage.getItem(GEMINI_KEY) || ''; } catch { return ''; } };
export const setGeminiKey = (t) => { try { t ? localStorage.setItem(GEMINI_KEY, t) : localStorage.removeItem(GEMINI_KEY); } catch {} };

/**
 * AI vision via Google Gemini (free tier) — reads the timeslip photo directly
 * and returns structured JSON. Handles faded print, any layout, garbled labels.
 * Needs a free API key from https://aistudio.google.com/app/apikey.
 */
export async function geminiVision(file, apiKey) {
  // Downscale to max 1600px to keep the request small.
  const dataUrl = await new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const maxDim = 1600;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
  const base64 = dataUrl.split(',')[1];

  const prompt = `Read this drag racing timeslip and return ONLY valid JSON (no markdown, no explanation).
If two lanes are shown, return both. Use null for anything unreadable.
{
  "lanes": [
    {
      "rt": "0.123 or null",
      "sixty": "1.234 or null (60 ft)",
      "threeThirty": "3.456 or null (330 ft)",
      "eighthET": "5.678 or null (1/8 mile ET)",
      "eighthMPH": "100.00 or null (1/8 mile MPH)",
      "thousand": "7.890 or null (1000 ft ET)",
      "et": "9.012 or null (1/4 mile ET)",
      "mph": "130.00 or null (1/4 mile MPH)"
    }
  ],
  "date": "YYYY-MM-DD or null",
  "time": "HH:MM (24h) or null"
}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: base64 } }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 800 },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`AI read failed (HTTP ${res.status})${err.includes('API key') ? ' — check your API key' : ''}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text.trim()) throw new Error('AI returned no text');
  // Extract JSON from response (may have markdown fences).
  const jsonM = text.match(/\{[\s\S]*\}/);
  if (!jsonM) throw new Error('AI returned unreadable response');
  let parsed;
  try { parsed = JSON.parse(jsonM[0]); }
  catch { throw new Error('AI returned invalid data'); }
  if (!parsed.lanes || !Array.isArray(parsed.lanes) || !parsed.lanes.length) {
    throw new Error('AI found no lanes on this slip');
  }
  return parsed;
}

/** Convert Gemini lane JSON to the flat field map used by the review UI. */
export function geminiLaneToValues(lane, date, time) {
  const out = {};
  for (const k of ['rt', 'sixty', 'threeThirty', 'eighthET', 'eighthMPH', 'thousand', 'et', 'mph']) {
    if (lane[k] != null && String(lane[k]).trim() !== '') out[k] = String(lane[k]).trim();
  }
  if (date) out.date = date;
  if (time) out.time = time;
  return out;
}
export const getOcrKey = () => { try { return localStorage.getItem(OCRSPACE_KEY) || ''; } catch { return ''; } };
export const setOcrKey = (t) => { try { t ? localStorage.setItem(OCRSPACE_KEY, t) : localStorage.removeItem(OCRSPACE_KEY); } catch {} };

/**
 * Cloud OCR via OCR.space (free tier) — far better on faded thermal print
 * than on-device Tesseract. Needs a free API key from https://ocr.space.
 */
export async function ocrCloud(file, apiKey) {
  const form = new FormData();
  form.append('file', file);
  form.append('apikey', apiKey);
  form.append('OCREngine', '2'); // better for faded/low-contrast
  form.append('scale', 'true');
  form.append('isTable', 'false');
  const res = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Cloud OCR failed (HTTP ${res.status})`);
  const data = await res.json();
  if (data.IsErroredOnProcessing) {
    throw new Error(data.ErrorMessage?.[0] || 'Cloud OCR failed');
  }
  const text = data.ParsedResults?.map((r) => r.ParsedText).join('\n') || '';
  if (!text.trim()) throw new Error('Cloud OCR returned no text');
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
  const cleaned = (rawText || '').replace(/\r/g, '');
  // Normalize per line: fix "2. 0193" -> "2.0193", "5,3309" -> "5.3309",
  // unify dashes, fix pipe-for-1. Uppercase for label matching.
  const norm = (l) => l.toUpperCase()
    .replace(/[|]/g, '1')
    .replace(/(\d)\.\s+(\d)/g, '$1.$2')
    .replace(/(\d),(\d{3,4})\b/g, '$1.$2')
    .replace(/[~—–]/g, '-')
    .trim();
  const lines = cleaned.split('\n').map(norm).filter(Boolean);

  const fields = { rt: [], sixty: [], threeThirty: [], eighthET: [], eighthMPH: [], thousand: [], et: [], mph: [] };

  const labelOf = (l) => {
    if (/REACTION|\bR\s*\/\s*T\b/.test(l)) return 'rt';
    if (/\b60\b/.test(l)) return 'sixty';
    if (/\b3[38]0\b/.test(l)) return 'threeThirty'; // "380" = OCR misread of "330"
    if (/1\s*\/\s*8[^0-9]*\bMPH\b/.test(l) || /\bMID\b[^0-9]*\bMPH\b/.test(l)) return 'eighthMPH';
    if (/1\s*\/\s*8/.test(l)) return 'eighthET';
    if (/\bMPH\b/.test(l)) return 'mphRaw';
    if (/\b1000\b/.test(l)) return 'thousand';
    if (/1\s*\/\s*4[^0-9]*\bMPH\b/.test(l)) return 'mph';
    if (/1\s*\/\s*4|1320|QUARTER/.test(l)) return 'et';
    if (/^\s*-*ET\s*-*$/.test(l)) return 'et'; // standalone "ET" = 1/4 ET (Portatree)
    return null;
  };
  const numOf = (l) => {
    const m = l.match(/-?(\d*\.\d+)/);
    return m ? m[1] : null;
  };
  const usedLines = new Set();
  const push = (key, val, lineIdx) => {
    if (!val || key === 'skip' || key === 'mphRaw') return;
    const arr = fields[key];
    if (arr && !arr.includes(val)) { arr.push(val); if (lineIdx != null) usedLines.add(lineIdx); }
  };

  // Pass 0: same-line "LABEL number" or "number LABEL".
  lines.forEach((line, i) => {
    if (/^\s*RUN\s*:/.test(line)) return;
    const label = labelOf(line);
    const num = numOf(line);
    if (label && num && label !== 'mphRaw') { push(label, num, i); }
  });

  // Strategy 1: value-first (Accutime): number on line i, label on i+1.
  // Strategy 2: label-first (Portatree): label on i, values on i+1, i+2.
  // Run both on a copy, keep the one that finds more.
  const runStrategy = (valueFirst) => {
    const f = { rt: [], sixty: [], threeThirty: [], eighthET: [], eighthMPH: [], thousand: [], et: [], mph: [] };
    const used = new Set(usedLines);
    const p = (key, val, idx) => {
      if (!val || key === 'skip' || key === 'mphRaw') return;
      if (f[key] && !f[key].includes(val)) { f[key].push(val); used.add(idx); }
    };
    if (valueFirst) {
      lines.forEach((line, i) => {
        if (used.has(i) || /^\s*RUN\s*:/.test(line) || labelOf(line)) return;
        const num = numOf(line);
        if (!num) return;
        const nl = lines[i + 1];
        if (!nl) return;
        const label = labelOf(nl);
        if (label && label !== 'mphRaw' && !numOf(nl) && !(f[label] && f[label].length)) {
          p(label, num, i); used.add(i + 1);
        }
      });
    } else {
      lines.forEach((line, i) => {
        if (used.has(i)) return;
        const label = labelOf(line);
        if (!label || label === 'mphRaw' || numOf(line)) return;
        if (f[label] && f[label].length) return;
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          if (used.has(j) || labelOf(lines[j]) || /^\s*RUN\s*:/.test(lines[j])) break;
          const n = numOf(lines[j]);
          if (n) {
            // Don't take an MPH-range number as a second ET (Portatree puts
            // unlabeled 1/4 MPH right after 1/4 ET).
            if (label === 'et' && f[label].length >= 1 && parseFloat(n) > 40) break;
            p(label, n, j);
          }
          else break;
          if (f[label].length >= 2) break;
        }
      });
    }
    return { fields: f, used, count: Object.values(f).reduce((n, a) => n + a.length, 0) };
  };

  const s1 = runStrategy(true);
  const s2 = runStrategy(false);
  const best = s1.count >= s2.count ? s1 : s2;
  for (const k of Object.keys(fields)) fields[k] = [...fields[k], ...best.fields[k]];
  best.used.forEach((i) => usedLines.add(i));

  // MPH disambiguation: collect mphRaw (bare "MPH" label) + unlabeled MPH-range
  // numbers, assign by position relative to the 1/4 ET.
  {
    const mphCands = [];
    lines.forEach((line, i) => {
      if (usedLines.has(i)) return;
      const label = labelOf(line);
      const num = numOf(line);
      if (!num) return;
      const v = parseFloat(num);
      if (v < 40 || v > 250) return; // not MPH range
      if (label === 'mphRaw' || label === 'eighthMPH' || label === 'mph') {
        mphCands.push({ v: num, idx: i, kind: label });
      } else if (!label && !/^\s*RUN\s*:/.test(line)) {
        // Unlabeled MPH-range number — could be 1/4 MPH (1995 slip style).
        mphCands.push({ v: num, idx: i, kind: 'unlabeled' });
      }
    });
    // Find 1/4 ET line index for positional split.
    let etIdx = Infinity;
    lines.forEach((line, i) => {
      if (labelOf(line) === 'et' && fields.et.length) etIdx = Math.min(etIdx, i);
    });
    for (const c of mphCands) {
      if (c.kind === 'eighthMPH') { push('eighthMPH', c.v, c.idx); }
      else if (c.kind === 'mph') { push('mph', c.v, c.idx); }
      else if (c.idx < etIdx) { push('eighthMPH', c.v, c.idx); }
      else { push('mph', c.v, c.idx); }
    }
  }

  // Sequence fallback: for slips with unreadable labels (e.g. 1995 thermal),
  // detect runs of 8 numbers matching the fixed field order by range.
  // Runs if label-based parsing found almost nothing, found only MPH values,
  // or produced implausible values (garbled labels read as numbers).
  const foundCount = Object.values(fields).reduce((n, a) => n + a.length, 0);
  const distinctFields = Object.values(fields).filter((a) => a.length > 0).length;
  const plausible = () => {
    // 1/4 ET must be 7-30s; 1/8 ET 4-20s; 60' 0.8-5s. If a core ET field's
    // first-lane value falls outside that, the labels were misread.
    // (Later lanes may be 0.000 on a BYE run — that's fine.)
    const first = (a) => (a.length ? parseFloat(a[0]) : null);
    const et = first(fields.et); if (et !== null && (et < 7 || et > 30)) return false;
    const e8 = first(fields.eighthET); if (e8 !== null && (e8 < 4 || e8 > 20)) return false;
    const s = first(fields.sixty); if (s !== null && (s < 0.8 || s > 5)) return false;
    return true;
  };
  if (foundCount < 4 || distinctFields < 3 || !plausible()) {
    for (const k of Object.keys(fields)) fields[k] = [];
    usedLines.clear();
    const seqNums = [];
    lines.forEach((line, i) => {
      if (/^\s*RUN\s*:/.test(line)) return;
      const m = line.match(/-?(\d*\.\d+)/);
      // Skip dates/times and lines with labels.
      if (!m || labelOf(line) || /\d{1,2}:\d{2}/.test(line) || /\d+\/\d+\/\d+/.test(line)) return;
      seqNums.push({ v: m[1], f: parseFloat(m[1]), idx: i });
    });
    // A full run: RT, 60, 330, 1/8ET, 1/8MPH, 1000, 1/4ET, 1/4MPH.
    const inRun = (s) => (
      s[0].f >= -1 && s[0].f <= 3 &&      // RT
      s[1].f >= 0.8 && s[1].f <= 4 &&     // 60'
      s[2].f >= 2 && s[2].f <= 10 &&      // 330'
      s[3].f >= 4 && s[3].f <= 15 &&      // 1/8 ET
      s[4].f >= 40 && s[4].f <= 180 &&    // 1/8 MPH
      s[5].f >= 6 && s[5].f <= 20 &&      // 1000'
      s[6].f >= 8 && s[6].f <= 25 &&      // 1/4 ET
      s[7].f >= 50 && s[7].f <= 250 &&    // 1/4 MPH
      s[3].f < s[6].f                     // 1/8 ET < 1/4 ET (sanity)
    );
    const keys = ['rt', 'sixty', 'threeThirty', 'eighthET', 'eighthMPH', 'thousand', 'et', 'mph'];
    for (let i = 0; i + 8 <= seqNums.length; i++) {
      const run = seqNums.slice(i, i + 8);
      // Runs must be on consecutive-ish lines (allow gaps for label garbage).
      if (run[7].idx - run[0].idx > 20) continue;
      if (!inRun(run)) continue;
      run.forEach((s, k) => {
        if (!fields[keys[k]].includes(s.v)) fields[keys[k]].push(s.v);
        usedLines.add(s.idx);
      });
      i += 7; // don't overlap runs
    }
  }
  const upper = ` ${cleaned.toUpperCase()} `;
  const dateM = upper.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  let date = null;
  if (dateM) {
    let [, a, b, c] = dateM;
    if (c.length === 2) c = '20' + c;
    date = `${c}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
  }
  const timeM = upper.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP])(?:\.?M\.?)?\b/);
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
