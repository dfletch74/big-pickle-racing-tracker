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

/**
 * Axis tick label for charts. Thousands read as plain numbers ("2,900"),
 * never "2.9e+3" — DA in feet lives in the thousands and exponential axis
 * labels are unreadable (Dwayne, 2026-10-26).
 */
export function fmtAxisTick(v) {
  const a = Math.abs(v);
  if (a >= 1000) return Math.round(v).toLocaleString('en-US');
  if (a !== 0 && a < 0.01) return v.toExponential(1);
  return String(Math.round(v * 1000) / 1000);
}
