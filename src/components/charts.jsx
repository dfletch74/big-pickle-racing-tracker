import { useMemo, useId } from 'react';
import { isNum, fmtDate } from '../lib/format';

const TRACK_COLORS = ['#a3e635', '#38bdf8', '#f472b6', '#fbbf24', '#c084fc', '#fb7185'];

/**
 * Hand-rolled SVG line chart: ET or MPH over time, one series per track,
 * with a soft area gradient under each line.
 */
export function LineChart({ runs, valueKey, formatY, height = 190 }) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const { series, minX, maxX, minY, maxY } = useMemo(() => {
    const pts = runs.filter((r) => isNum(r[valueKey]) && r.date);
    const byTrack = new Map();
    for (const r of pts) {
      const t = byTrack.get(r.track) || [];
      t.push({ x: new Date(`${r.date}T12:00:00`).getTime(), y: r[valueKey], run: r });
      byTrack.set(r.track, t);
    }
    const all = pts.map((r) => r[valueKey]);
    const xs = [...byTrack.values()].flat().map((p) => p.x);
    return {
      series: [...byTrack.entries()].map(([track, p], i) => ({
        track,
        color: TRACK_COLORS[i % TRACK_COLORS.length],
        pts: p.sort((a, b) => a.x - b.x),
      })),
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...all),
      maxY: Math.max(...all),
    };
  }, [runs, valueKey]);

  if (!series.length) {
    return <div className="py-10 text-center text-sm text-white/40">No data yet — log a run to light up the chart.</div>;
  }

  const W = 360;
  const H = height;
  const pad = { l: 46, r: 10, t: 12, b: 24 };
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const X = (x) => pad.l + ((x - minX) / spanX) * (W - pad.l - pad.r);
  const Y = (y) => pad.t + (1 - (y - minY) / spanY) * (H - pad.t - pad.b);
  const baseY = H - pad.b;

  const ticks = [0, 0.5, 1].map((f) => minY + f * spanY);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <defs>
          {series.map((s, i) => (
            <linearGradient key={i} id={`${gid}-g${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} stroke="#ffffff" strokeOpacity="0.07" />
            <text x={pad.l - 8} y={Y(t) + 3.5} textAnchor="end" fontSize="10" fill="#ffffff" opacity="0.45" fontFamily="'JetBrains Mono', monospace">
              {formatY(t)}
            </text>
          </g>
        ))}
        {series.map((s, i) => {
          const line = s.pts.map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
          const area = `${X(s.pts[0].x).toFixed(1)},${baseY} ${line} ${X(s.pts[s.pts.length - 1].x).toFixed(1)},${baseY}`;
          return (
            <g key={s.track}>
              <polygon points={area} fill={`url(#${gid}-g${i})`} />
              <polyline
                points={line}
                fill="none"
                stroke={s.color}
                strokeWidth="2.25"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {s.pts.map((p, j) => (
                <circle key={j} cx={X(p.x)} cy={Y(p.y)} r="3.25" fill="#0a0d0a" stroke={s.color} strokeWidth="2">
                  <title>{`${s.track} · ${fmtDate(p.run.date)} · ${formatY(p.y)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        <text x={pad.l} y={H - 7} fontSize="10" fill="#ffffff" opacity="0.4" fontFamily="'JetBrains Mono', monospace">
          {fmtDate(new Date(minX).toISOString().slice(0, 10))}
        </text>
        <text x={W - pad.r} y={H - 7} fontSize="10" fill="#ffffff" opacity="0.4" textAnchor="end" fontFamily="'JetBrains Mono', monospace">
          {fmtDate(new Date(maxX).toISOString().slice(0, 10))}
        </text>
      </svg>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.track} className="flex items-center gap-1.5 text-[11px] font-medium text-white/60">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.track}
          </span>
        ))}
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
