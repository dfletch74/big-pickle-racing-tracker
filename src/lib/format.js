// Number formatting helpers.
// Rule: NEVER show raw floats to users. Every numeric display goes through
// one of these so values like 3248.110829357194ft can never leak into the UI.

export const isNum = (v) => typeof v === 'number' && !Number.isNaN(v);

/** Elapsed time, 3 decimals: 9.369 */
export const fmtET = (v) => (isNum(v) ? v.toFixed(3) : '—');

/** Speed, 1 decimal: 146.2 */
export const fmtMPH = (v) => (isNum(v) ? v.toFixed(1) : '—');

/** Reaction time, 3 decimals, keeps sign for red lights: -0.023 */
export const fmtRT = (v) => (isNum(v) ? v.toFixed(3) : '—');

/** Temperature, 1 decimal: 75.0°F */
export const fmtTemp = (v) => (isNum(v) ? `${v.toFixed(1)}°F` : '—');

/** Density altitude, whole feet with thousands separator: 3,248 ft */
export const fmtDA = (v) => (isNum(v) ? `${Math.round(v).toLocaleString('en-US')} ft` : '—');

/** Humidity, whole percent: 50% */
export const fmtRH = (v) => (isNum(v) ? `${Math.round(v)}%` : '—');

/** Generic 2-decimal for small deltas: +0.094 */
export const fmtDelta = (v, digits = 3) => {
  if (!isNum(v)) return '—';
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}${Math.abs(v).toFixed(digits)}`;
};

/** ISO date -> short display: Oct 17, 2026 */
export const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/** "2026-10-17" + "14:30" -> Date for ordering */
export const runDateTime = (run) => {
  const t = run.time && /^\d{2}:\d{2}/.test(run.time) ? run.time : '00:00';
  const d = new Date(`${run.date || '1970-01-01'}T${t}:00`);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
};
