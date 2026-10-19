import { uid } from './store';
import { densityAltitudeFt, stationPressureHpa } from './physics';
import { isNum } from './format';

// SheetJS is loaded lazily (dynamic import inside parseImportFile) so the
// main bundle stays lean — it is only fetched when the user imports a file.

/**
 * Import mapping. Headers are normalized (lowercase, non-alphanumeric
 * stripped) and matched against these aliases.
 *
 * REQUIRED columns: Date, E.T.
 * RECOMMENDED: Track, 60ft, 330ft, 1/8 ET, 1/8 MPH, 1000ft, MPH, R/T,
 *              Temp, Humidity, Altitude
 */
const COLUMNS = {
  car: ['car', 'carname', 'vehicle'],
  date: ['date'],
  time: ['time'],
  et: ['et'],
  distance: ['distance', 'dist', 'tracklength'],
  track: ['track'],
  runType: ['runtype'],
  sixty: ['60ft'],
  threeThirty: ['330ft'],
  eighthET: ['18et'],
  eighthMPH: ['18mph'],
  thousand: ['1000ft'],
  mph: ['mph'],
  rt: ['rt', 'reaction'],
  tempF: ['temp', 'temperature', 'tempf', 'airtemp', 'oat', 'airtemperature', 'ambienttemp'],
  humidity: ['humidity', 'humiditypct', 'rh', 'relhumidity', 'relativehumidity'],
  // "Altitude" alone = the old app's DA number (user convention); "Altitude ft" =
  // the track's raw elevation. Kept as separate aliases so the two never collide.
  altitudeFt: ['altitudeft', 'elevation', 'elevationft', 'trackaltitude', 'trackelevation'],
  daFt: ['daft', 'densityaltitude', 'densityalt', 'da', 'altitude'],
  jet: ['jet'],
  lPsi: ['lpsi', 'leftpsi'],
  rPsi: ['rpsi', 'rightpsi'],
  lBar: ['lbar', 'leftbar'],
  rBar: ['rbar', 'rightbar'],
  comp: ['comp', 'compress', 'compression'],
  rebound: ['rebound', 'reb'],
  revLim: ['revlim', 'rev', 'revlimit', 'revlimiter'],
  notes: ['notes'],
};

const norm = (h) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function parseDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    // Excel serial date
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})/);
  if (m) {
    let [y, mo, d] = [m[1], m[2], m[3]];
    if (y.length <= 2) [y, mo, d] = [m[3], m[1], m[2]]; // MM/DD/YYYY
    const iso = `${String(y).padStart(4, '20')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dt = new Date(`${iso}T12:00:00`);
    return Number.isNaN(dt.getTime()) ? null : iso;
  }
  return null;
}

const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isNaN(n) ? null : n;
};

/** '1/8', '1/8 mile', 'Eighth', … → '1/8'; anything else → '1/4'. */
const parseDistance = (v) => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // Excel auto-converts a typed "1/8" into Jan 8 (and "1/4" into Jan 4).
    if (v.getMonth() === 0 && v.getDate() === 8) return '1/8';
    return '1/4';
  }
  const s = String(v ?? '').toLowerCase();
  return s.includes('1/8') || s.includes('eighth') ? '1/8' : '1/4';
};

/** Parse a CSV/XLSX file into run-shaped objects. Never throws on bad rows. */
export async function parseImportFile(file, carId, fallbackTrack) {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  if (!rows.length) return { runs: [], errors: ['The file is empty.'] };

  const headers = rows[0].map(norm);
  const colIdx = {};
  for (const [key, aliases] of Object.entries(COLUMNS)) {
    // Try aliases in order — first alias with a matching header wins. This
    // prefers an exact "DA" column over a looser "Altitude" one when both exist.
    for (const a of aliases) {
      const i = headers.indexOf(a);
      if (i >= 0) { colIdx[key] = i; break; }
    }
  }
  const errors = [];
  if (colIdx.date == null) errors.push('Missing required column: Date.');
  if (colIdx.et == null) errors.push('Missing required column: E.T.');
  if (errors.length) return { runs: [], errors };

  const runs = [];
  rows.slice(1).forEach((row, i) => {
    const get = (k) => (colIdx[k] == null ? null : row[colIdx[k]]);
    // Silently ignore fully-blank rows (trailing empties, cleared example rows).
    if (row.every((v) => v == null || String(v).trim() === '')) return;
    const date = parseDate(get('date'));
    const distance = parseDistance(get('distance'));
    const eighthETCol = num(get('eighthET'));
    const eighthMPHCol = num(get('eighthMPH'));
    let mphCol = num(get('mph'));
    // Some exports leave E.T. blank for 1/8-mile runs and put the time in the
    // 1/8 ET split column — fall back to it rather than dropping the run.
    let et = num(get('et'));
    if (!isNum(et) && distance === '1/8' && isNum(eighthETCol)) et = eighthETCol;
    if (!isNum(mphCol) && distance === '1/8' && isNum(eighthMPHCol)) mphCol = eighthMPHCol;
    if (!date || !isNum(et)) {
      errors.push(`Row ${i + 2}: skipped (needs a valid Date and E.T.).`);
      return;
    }
    // Time column may come through as a Date (SheetJS) or a "HH:MM" string.
    const timeRaw = get('time');
    let time = '12:00';
    if (timeRaw instanceof Date && !Number.isNaN(timeRaw.getTime())) {
      time = `${String(timeRaw.getHours()).padStart(2, '0')}:${String(timeRaw.getMinutes()).padStart(2, '0')}`;
    } else if (typeof timeRaw === 'string' && /^\d{1,2}:\d{2}/.test(timeRaw.trim())) {
      const [h, m] = timeRaw.trim().split(':');
      time = `${h.padStart(2, '0')}:${m}`;
    }
    const runTypeRaw = String(get('runType') ?? '').trim().toUpperCase();
    const runType = ['T/T', 'QUALIFYING', 'ELIMINATIONS'].includes(runTypeRaw) ? runTypeRaw : 'T/T';
    const tempF = num(get('tempF'));
    let humidity = num(get('humidity'));
    // Some sheets record humidity as a fraction (0.58 = 58%).
    if (isNum(humidity) && humidity > 0 && humidity < 1) humidity = Math.round(humidity * 100);
    const altitudeFt = num(get('altitudeFt'));
    let daFt = num(get('daFt'));
    if (!isNum(daFt) && isNum(tempF) && isNum(altitudeFt)) {
      // Same standard-pressure assumption the run logger uses (humidity optional).
      const p = stationPressureHpa(1013.25, altitudeFt);
      daFt = Math.round(densityAltitudeFt({ tempF, humidityPct: humidity ?? 0, pressureHpa: p }));
    }
    runs.push({
      id: uid(),
      carId,
      carName: String(get('car') ?? '').trim() || null,
      date,
      time,
      track: String(get('track') ?? fallbackTrack ?? '').trim() || 'Unknown track',
      trackId: null,
      distance,
      runType,
      rt: num(get('rt')),
      sixty: num(get('sixty')),
      threeThirty: num(get('threeThirty')),
      // For a 1/8-mile run the E.T./MPH columns ARE the eighth-mile figures —
      // mirror them into the split fields so the run detail reads correctly.
      eighthET: isNum(eighthETCol) ? eighthETCol : (distance === '1/8' ? et : null),
      eighthMPH: isNum(eighthMPHCol) ? eighthMPHCol : (distance === '1/8' ? mphCol : null),
      thousand: num(get('thousand')),
      et,
      mph: mphCol,
      tempF,
      humidity: isNum(humidity) ? Math.round(humidity) : null,
      altitudeFt,
      daFt,
      jet: num(get('jet')),
      lPsi: num(get('lPsi')),
      rPsi: num(get('rPsi')),
      lBar: num(get('lBar')),
      rBar: num(get('rBar')),
      comp: num(get('comp')),
      rebound: num(get('rebound')),
      revLim: num(get('revLim')),
      wl: null,
      notes: String(get('notes') ?? '').trim(),
      createdAt: Date.now(),
    });
  });
  const airData = runs.filter((r) => isNum(r.daFt)).length;
  return { runs, errors, matched: Object.keys(colIdx), airData };
}

const CSV_COLS = [
  ['carName', 'Car'], ['date', 'Date'], ['time', 'Time'], ['track', 'Track'], ['distance', 'Distance'],
  ['runType', 'Run Type'], ['rt', 'R/T'], ['sixty', '60ft'], ['threeThirty', '330ft'],
  ['eighthET', '1/8 ET'], ['eighthMPH', '1/8 MPH'], ['thousand', '1000ft'],
  ['et', 'E.T.'], ['mph', 'MPH'], ['tempF', 'Temp F'], ['humidity', 'Humidity %'],
  ['altitudeFt', 'Altitude ft'], ['daFt', 'DA ft'], ['jet', 'Jet'],
  ['lPsi', 'L PSI'], ['rPsi', 'R PSI'], ['lBar', 'L Bar'], ['rBar', 'R Bar'],
  ['comp', 'Comp'], ['rebound', 'Rebound'], ['revLim', 'Rev Lim'],
  ['wl', 'W/L'], ['notes', 'Notes'],
];

export function runsToCSV(runs, carNameOf = () => '') {
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = CSV_COLS.map(([, label]) => label).join(',');
  const lines = runs.map((r) => CSV_COLS.map(([k]) => esc(k === 'carName' ? (r.carName || carNameOf(r.carId)) : r[k])).join(',')).join('\n');
  return `${head}\n${lines}\n`;
}

/** Trigger a real file download (bug fix #1: export must do something). */
export function downloadFile(filename, content, mime = 'text/csv') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
