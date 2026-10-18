import { useMemo } from 'react';
import { isNum, fmtDate } from '../lib/format';

const TRACK_COLORS = ['#a3e635', '#38bdf8', '#f472b6', '#fbbf24', '#c084fc', '#fb7185'];

/**
 * Hand-rolled SVG line chart: ET or MPH over time, one series per track.
 * No chart library needed.
 */
export function LineChart({ runs, valueKey, formatY, height = 180 }) {
  const { series, minX, maxX, minY, maxY } = useMemo(() => {
    const pts = runs.filter((r) => isNum(r[valueKey]) && r.date);
    const byTrack = new Map();
    for (const r of pts) {
      const t = (byTrack.get(r.track) || []);
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

  if (!series.length) return <div className="py-8 text-center text-sm text-white/40">No data yet.</div>;

  const W = 340;
  const H = height;
  const pad = { l: 44, r: 8, t: 10, b: 22 };
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const X = (x) => pad.l + ((x - minX) / spanX) * (W - pad.l - pad.r);
  const Y = (y) => pad.t + (1 - (y - minY) / spanY) * (H - pad.t - pad.b);

  const ticks = [0, 0.5, 1].map((f) => minY + f * spanY);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} stroke="#ffffff" strokeOpacity="0.08" />
            <text x={pad.l - 6} y={Y(t) + 4} textAnchor="end" fontSize="10" fill="#ffffff" opacity="0.45">
              {formatY(t)}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <g key={s.track}>
            <polyline
              points={s.pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
            />
            {s.pts.map((p, i) => (
              <circle key={i} cx={X(p.x)} cy={Y(p.y)} r="3" fill={s.color}>
                <title>{`${s.track} · ${fmtDate(p.run.date)} · ${formatY(p.y)}`}</title>
              </circle>
            ))}
          </g>
        ))}
        <text x={pad.l} y={H - 6} fontSize="10" fill="#ffffff" opacity="0.45">{fmtDate(new Date(minX).toISOString().slice(0, 10))}</text>
        <text x={W - pad.r} y={H - 6} fontSize="10" fill="#ffffff" opacity="0.45" textAnchor="end">{fmtDate(new Date(maxX).toISOString().slice(0, 10))}</text>
      </svg>
      <div className="mt-1 flex flex-wrap gap-3">
        {series.map((s) => (
          <span key={s.track} className="flex items-center gap-1.5 text-[11px] text-white/60">
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
      <div className="mb-1 flex justify-between text-xs text-white/60">
        <span className="font-bold text-pickle-400">{w} W</span>
        <span>{wpct}% win rate</span>
        <span className="font-bold text-red-400">{l} L</span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-white/10">
        <div className="bg-pickle-500" style={{ width: `${wpct}%` }} />
        <div className="bg-red-500/70" style={{ width: `${100 - wpct}%` }} />
      </div>
    </div>
  );
}
