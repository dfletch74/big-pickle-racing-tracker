import { useMemo } from 'react';
import { isNum, fmtDate } from '../lib/format';

const TRACK_COLORS = ['#a3e635', '#38bdf8', '#f472b6', '#fbbf24', '#c084fc', '#fb7185'];

/**
 * Season-style chart: one dot per run in RUN ORDER (evenly spaced — no
 * timeline gaps), dashed connector, dashed y gridlines, solid axes,
 * date labels sampled across the runs. `invert` puts higher numbers at
 * the top (used for ET: slower = higher = top).
 */
export function LineChart({ runs, valueKey, invert = false, formatY, height = 240, distLabel }) {
  const { pts, loY, hiY, tracks } = useMemo(() => {
    const list = runs
      .filter((r) => isNum(r[valueKey]) && r.date)
      .map((r) => ({ x: new Date(`${r.date}T12:00:00`).getTime(), y: r[valueKey], run: r }))
      .sort((a, b) => a.x - b.x || a.run.createdAt - b.run.createdAt);
    if (!list.length) return { pts: [], tracks: [] };
    const ys = list.map((p) => p.y);
    const rawMin = Math.min(...ys);
    const rawMax = Math.max(...ys);
    const padY = (rawMax - rawMin || Math.abs(rawMin) * 0.05 || 1) * 0.15;
    return {
      pts: list,
      loY: rawMin - padY,
      hiY: rawMax + padY,
      tracks: [...new Set(list.map((p) => p.run.track))],
    };
  }, [runs, valueKey]);

  if (!pts.length) {
    return <div className="py-10 text-center text-sm text-white/40">No data yet — log a run to light up the chart.</div>;
  }

  const colorOf = (track) => TRACK_COLORS[tracks.indexOf(track) % TRACK_COLORS.length];

  const W = 360;
  const H = height;
  const pad = { l: 44, r: 8, t: 12, b: 28 };
  const n = pts.length;
  const spanY = hiY - loY || 1;
  // run-order x: evenly spaced, immune to date gaps
  const X = (i) => pad.l + (n === 1 ? 0.5 : i / (n - 1)) * (W - pad.l - pad.r);
  const Y = invert
    ? (y) => pad.t + ((y - loY) / spanY) * (H - pad.t - pad.b)
    : (y) => pad.t + (1 - (y - loY) / spanY) * (H - pad.t - pad.b);
  const baseY = H - pad.b;

  const yTicks = [0, 1 / 3, 2 / 3, 1].map((f) => loY + f * spanY);
  // sample ~5 run dates for x labels
  const xIdx = [...new Set([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (n - 1))))];
  const fmtX = (t) => {
    const d = new Date(t);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${mm}/${dd}/${String(d.getFullYear()).slice(2)}`;
  };

  const line = pts.map((p, i) => `${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} stroke="#ffffff" strokeOpacity="0.14" strokeDasharray="4 4" />
            <text x={pad.l - 8} y={Y(t) + 4} textAnchor="end" fontSize="11" fill="#9aa0aa" fontFamily="'JetBrains Mono', monospace">
              {formatY(t)}
            </text>
          </g>
        ))}
        <line x1={pad.l} x2={pad.l} y1={pad.t - 4} y2={baseY} stroke="#3a3f47" strokeWidth="1.5" />
        <line x1={pad.l} x2={W - pad.r} y1={baseY} y2={baseY} stroke="#3a3f47" strokeWidth="1.5" />
        {xIdx.map((i) => (
          <text key={i} x={X(i)} y={baseY + 19} textAnchor="middle" fontSize="10.5" fill="#9aa0aa" fontFamily="'JetBrains Mono', monospace">
            {fmtX(pts[i].x)}
          </text>
        ))}
        <polyline points={line} fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="5 4" />
        {pts.map((p, i) => (
          <circle key={i} cx={X(i)} cy={Y(p.y)} r="5" fill={colorOf(p.run.track)}>
            <title>{`Run ${i + 1} · ${p.run.track} · ${fmtDate(p.run.date)} · ${p.run.distance} · ${formatY(p.y)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-2.5 text-[13px] text-white/55">
          <svg width="30" height="8" aria-hidden>
            <line x1="0" x2="30" y1="4" y2="4" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="1.5" strokeDasharray="5 4" />
          </svg>
          {distLabel} each run
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {tracks.map((t) => (
            <span key={t} className="flex items-center gap-2 text-[13px] text-white/55">
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: colorOf(t) }} />
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Win/loss bar for the 1/8-mile view. */
export function WinBar({ w, l }) {
  const total = w + l;
  if (!total) return <div className="text-sm text-white/40">No elimination runs yet.</div>;
  const wpct = Math.round((w / total) * 100);
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="font-display text-lg font-bold text-pickle-400">{w} W</span>
        <span className="font-mono text-xs text-white/55">{wpct}% win rate</span>
        <span className="font-display text-lg font-bold text-red-400">{l} L</span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-white/10">
        <div className="bg-gradient-to-r from-pickle-600 to-pickle-400 transition-all" style={{ width: `${wpct}%` }} />
        <div className="bg-red-500/60" style={{ width: `${100 - wpct}%` }} />
      </div>
    </div>
  );
}
