import { useState } from 'react';
import { Card, Badge, Btn, Icon } from './ui';
import { fmtET, fmtMPH, fmtRT, fmtTemp, fmtRH, fmtDA, fmtDate, isNum } from '../lib/format';
import { detectIssues, segmentSplits, bestSegments, correctedETOf } from '../lib/stats';

const SETUP_LABELS = [
  ['jet', 'Jet'], ['lPsi', 'L PSI'], ['rPsi', 'R PSI'], ['lBar', 'L Bar'], ['rBar', 'R Bar'],
  ['comp', 'Comp'], ['rebound', 'Rebound'], ['revLim', 'Rev Lim'],
];

export default function RunCard({ run, ctx, baseline, onEdit, onDelete, onPrint, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const issues = detectIssues(run, ctx);
  const segs = segmentSplits(run);

  return (
    <Card className="p-0">
      <button onClick={() => setOpen((o) => !o)} className="block w-full p-4 text-left">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="font-bold">{run.track}</span>
          <Badge tone={run.distance === '1/4' ? 'blue' : 'neutral'}>{run.distance} mi</Badge>
          <Badge>{run.runType}</Badge>
          {run.wl === 'W' && <Badge tone="green">W</Badge>}
          {run.wl === 'L' && <Badge tone="red">L</Badge>}
          {issues.map((i) => (
            <Badge key={i.key} tone={i.key === 'red' ? 'red' : 'amber'}>{i.label}</Badge>
          ))}
          <span className="ml-auto text-white/35"><Icon name="chevD" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} /></span>
        </div>
        <div className="text-xs text-white/45">{fmtDate(run.date)}{run.time ? ` · ${run.time}` : ''}</div>
        <div className="mt-2 grid grid-cols-4 gap-2 font-mono text-sm">
          <div><div className="text-[10px] uppercase tracking-wider text-white/40">R/T</div><div className={run.rt < 0 ? 'text-red-400' : ''}>{fmtRT(run.rt)}</div></div>
          <div><div className="text-[10px] uppercase tracking-wider text-white/40">60FT</div><div>{isNum(run.sixty) ? run.sixty.toFixed(3) : '—'}</div></div>
          <div><div className="text-[10px] uppercase tracking-wider text-white/40">ET</div><div className="text-base font-bold text-pickle-400">{fmtET(run.et)}</div></div>
          <div><div className="text-[10px] uppercase tracking-wider text-white/40">MPH</div><div>{fmtMPH(run.mph)}</div></div>
        </div>
        {issues.length > 0 && (
          <div className="mt-2 space-y-1">
            {issues.map((i) => (
              <div key={i.key} className="flex items-center gap-1.5 text-[11px] text-amber-300/90"><Icon name="alert" className="h-3.5 w-3.5 shrink-0" />{i.label} — {i.delta}</div>
            ))}
          </div>
        )}
      </button>

      {open && (
        <div className="border-t border-white/10 p-4 text-sm">
          <div className="mb-3 grid grid-cols-3 gap-2 font-mono text-xs">
            <div><div className="text-white/40">330FT</div>{isNum(run.threeThirty) ? run.threeThirty.toFixed(3) : '—'}</div>
            <div><div className="text-white/40">1/8 ET</div>{fmtET(run.eighthET)}</div>
            <div><div className="text-white/40">1/8 MPH</div>{fmtMPH(run.eighthMPH)}</div>
            <div><div className="text-white/40">1000FT</div>{isNum(run.thousand) ? run.thousand.toFixed(3) : '—'}</div>
            <div><div className="text-white/40">TEMP</div>{fmtTemp(run.tempF)}</div>
            <div><div className="text-white/40">HUM</div>{fmtRH(run.humidity)}</div>
            <div><div className="text-white/40">ALT</div>{isNum(run.altitudeFt) ? `${Math.round(run.altitudeFt).toLocaleString()} ft` : '—'}</div>
            <div><div className="text-white/40">D/A</div>{fmtDA(run.daFt)}</div>
            <div><div className="text-white/40">ET CORR*</div>{fmtET(correctedETOf(run, baseline))}</div>
          </div>
          <div className="mb-1 text-[10px] text-white/35">*Weather-corrected to {baseline.toLocaleString()} ft DA baseline. Higher DA = thinner air = slower.</div>

          <SplitTable run={run} segs={segs} bests={ctx.bestSegs} />

          {(SETUP_LABELS.some(([k]) => isNum(run[k]))) && (
            <div className="mt-3">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/45">Setup</div>
              <div className="flex flex-wrap gap-1.5">
                {SETUP_LABELS.filter(([k]) => isNum(run[k])).map(([k, label]) => (
                  <span key={k} className="rounded-lg bg-white/5 px-2 py-1 font-mono text-[11px] text-white/70">
                    {label} {run[k]}
                  </span>
                ))}
              </div>
            </div>
          )}

          {run.notes && <div className="mt-3 rounded-xl bg-white/5 p-3 text-xs text-white/70">{run.notes}</div>}

          <div className="mt-4 flex gap-2">
            {onEdit && (
              <Btn kind="ghost" onClick={() => onEdit(run)} className="flex-1">Edit</Btn>
            )}
            {onDelete && (
              <Btn kind="quiet" onClick={() => { if (window.confirm('Delete this run?')) onDelete(run.id); }} className="text-red-400/80">Delete</Btn>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

/** Split analysis: segment durations with deltas vs best (labeled, no misleading '+'). */
function SplitTable({ run, segs, bests }) {
  const rows = segs.map((s, i) => {
    const best = bests?.[i]?.best;
    const delta = isNum(s.dur) && isNum(best) ? s.dur - best : null;
    return { ...s, best, delta };
  });
  if (!rows.some((r) => isNum(r.dur))) return null;
  return (
    <div className="mt-3">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/45">Split analysis vs best</div>
      <table className="w-full font-mono text-[11px]">
        <thead>
          <tr className="text-left text-white/40">
            <th className="py-1 font-medium">Segment</th>
            <th className="font-medium">Duration</th>
            <th className="font-medium">Best</th>
            <th className="text-right font-medium">Delta</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-white/5">
              <td className="py-1 text-white/70">{r.name}</td>
              <td>{isNum(r.dur) ? r.dur.toFixed(3) : '—'}</td>
              <td className="text-white/50">{isNum(r.best) ? r.best.toFixed(3) : '—'}</td>
              <td className={`text-right ${r.delta > 0.001 ? 'text-amber-300' : 'text-pickle-400'}`}>
                {r.delta == null ? '—' : r.delta <= 0.0005 ? 'best' : `+${r.delta.toFixed(3)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { bestSegments };
