import { useMemo, useState } from 'react';
import { Card, SectionTitle, inputCls, Segmented, Badge, EmptyState } from '../components/ui';
import { fmtET, fmtTemp, fmtDA, fmtDate, isNum } from '../lib/format';
import { runsForCar, filterDistance, latestRun, findSimilar, dialIn, rankSetups, crewChief, crewChiefCall, similarityPct, predictET } from '../lib/stats';
import { useWeatherEntry, WeatherEntryCard } from '../components/WeatherEntry';

export default function Insight({ state, toast, dist, setDist }) {
  const [trackId, setTrackId] = useState(state.tracks[0]?.id || '');
  const baseline = state.settings.daBaseline;

  const track = state.tracks.find((t) => t.id === trackId) || state.tracks[0];
  const weather = useWeatherEntry(track);
  const carRuns = useMemo(() => runsForCar(state, state.activeCarId), [state]);
  const runs = useMemo(() => filterDistance(carRuns, dist), [carRuns, dist]);
  const last = useMemo(() => latestRun(runs), [runs]);

  const target = {
    tempF: weather.manualTemp,
    humidity: weather.manualHum,
    daFt: weather.effDA,
    distance: dist,
  };

  const similar = useMemo(
    () => (target.daFt != null ? findSimilar(runs, target) : []),
    [runs, target.daFt, target.tempF, dist],
  );
  const dial = useMemo(() => dialIn(runs, target), [runs, target.daFt, target.tempF, dist]);
  // Fallback: no runs inside the similar-air band — derive from whatever exists,
  // with an honest basis note (same tiers as the Track tab predictor).
  const dialFallback = useMemo(
    () => (dial.n === 0 && target.daFt != null ? predictET(runs, target.daFt) : null),
    [dial.n, runs, target.daFt],
  );
  const dialShow = dial.n > 0 ? { ...dial, kind: 'similar' } : dialFallback ? {
    n: 0,
    kind: 'derived',
    predicted: dialFallback.et,
    dial: Math.ceil((dialFallback.et + 0.015) * 100) / 100,
    confidence: dialFallback.confidence.toUpperCase(),
    basis: dialFallback.basis,
    detail: dialFallback.detail,
  } : null;
  const ranked = useMemo(() => rankSetups(runs, baseline), [runs, baseline]);
  const chief = useMemo(() => crewChief(runs, baseline, null), [runs, baseline]);
  const call = useMemo(
    () => (target.daFt != null ? crewChiefCall(runs, target, baseline, last) : null),
    [runs, target.daFt, target.tempF, baseline, last],
  );
  const top = ranked[0];
  const nAir = useMemo(() => runs.filter((r) => isNum(r.et) && isNum(r.daFt)).length, [runs]);

  const similarSorted = useMemo(
    () => [...similar].map((r) => ({ r, pct: similarityPct(r, target) })).sort((a, b) => b.pct - a.pct).slice(0, 8),
    [similar],
  );

  if (!carRuns.length) {
    return <EmptyState title="No data yet" body="Log some runs with weather data to unlock dial-in predictions and setup advice." action={null} />;
  }

  const confTone = !dialShow ? 'amber' : dialShow.confidence === 'HIGH' ? 'green' : dialShow.confidence === 'MEDIUM' ? 'blue' : 'amber';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={track?.id || ''} onChange={(e) => setTrackId(e.target.value)} className={`${inputCls} flex-1`}>
          {state.tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <Segmented value={dist} onChange={setDist} options={[{ value: '1/4', label: '1/4 mi' }, { value: '1/8', label: '1/8 mi' }]} />
      </div>

      <WeatherEntryCard title="Race conditions" weather={weather} />

      {/* dial-in predictor */}
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <SectionTitle>Dial-in predictor</SectionTitle>
          {dialShow && <Badge tone={confTone}>{dialShow.confidence} CONFIDENCE</Badge>}
        </div>
        {dialShow == null ? (
          <div className="text-sm text-white/50">{target.daFt == null ? 'Live weather or manual entries above will feed the prediction.' : 'Log a run to get a prediction.'}</div>
        ) : (
          <div>
            <div className="font-mono text-2xl font-black text-pickle-400">{dialShow.predicted.toFixed(3)}s</div>
            <div className="mt-1 text-sm">Suggested dial: <b className="font-mono">{dialShow.dial.toFixed(2)}</b></div>
            {dialShow.kind === 'similar' ? (
              <div className="text-xs text-white/50">Expected range {dialShow.lo.toFixed(3)} – {dialShow.hi.toFixed(3)}s</div>
            ) : (
              <div className="text-xs text-white/50">{dialShow.detail}</div>
            )}
            <div className="mt-2 text-[11px] text-white/40">{dialShow.basis}</div>
          </div>
        )}
      </Card>

      {/* ideal setup — same ranking function as the crew chief below */}
      <Card>
        <SectionTitle>Ideal setup</SectionTitle>
        <div className="mb-2 text-[11px] text-white/40">Ranked by mean weather-corrected ET (baseline {baseline.toLocaleString()} ft DA).</div>
        {ranked.length === 0 && (
          <div className="text-sm text-white/50">
            {nAir === 0
              ? `None of your ${runs.length} ${dist}-mile runs have air data yet — add Temp + Altitude when logging (or re-import your spreadsheet) to unlock setup ranking.`
              : `${nAir} run${nAir === 1 ? '' : 's'} have air data but none record setup fields (Jet, tire PSI, …) — add them on the run form to rank configurations.`}
          </div>
        )}
        {ranked.slice(0, 5).map((g, i) => (
          <div key={i} className="border-t border-white/5 py-2 first:border-0">
            <div className="flex items-center justify-between">
              <div className="font-mono text-sm font-bold">#{i + 1} <span className="text-pickle-400">{g.avgCorrET.toFixed(3)}s</span> <span className="font-normal text-white/40">corr. avg</span></div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-white/45">{g.runs} run{g.runs === 1 ? '' : 's'}</span>
                {g.lowSample && <Badge tone="amber">small sample</Badge>}
              </div>
            </div>
            <div className="mt-1 font-mono text-[11px] text-white/60">{setupSummary(g.fields)}</div>
            <div className="text-[11px] text-white/40">best corrected {g.best.toFixed(3)}s</div>
          </div>
        ))}
        {top && last && <SetupDeltas top={top} last={last} />}
      </Card>

      {/* crew chief's call — data-driven with structured explanations */}
      <Card>
        <SectionTitle>Crew chief's call</SectionTitle>
        {!call ? (
          <div className="text-sm text-white/50">Enter conditions above to get the crew chief's analysis.</div>
        ) : !call.hasData ? (
          <div className="text-sm text-white/50">Log runs with weather data to unlock air analysis.</div>
        ) : (
          <div className="space-y-3 text-sm text-white/75">
            <p className="leading-relaxed">{call.opening}</p>
            
            {call.setup.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/45">1. Recommended Setup</div>
                <div className="space-y-1">
                  {call.setup.map((s) => (
                    <div key={s.field} className="flex gap-2">
                      <span className="min-w-[110px] font-semibold text-white/90">{s.label}:</span>
                      <span className="font-mono text-pickle-400">{s.value}{s.unit}</span>
                      {s.why && <span className="text-white/60">{s.why}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {call.rationale && (
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/45">2. Rationale</div>
                <p className="leading-relaxed">{call.rationale}</p>
              </div>
            )}
            
            {call.advice.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/45">3. Key Advice</div>
                <div className="space-y-1.5">
                  {call.advice.map((a, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-pickle-400">▸</span>
                      <span>{renderBold(a)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="pt-1 text-[10px] text-white/35">
              Data-driven from {runs.length} runs. Get it done.
            </div>
          </div>
        )}
      </Card>

      {/* similar past runs */}
      <Card>
        <SectionTitle>Similar past runs</SectionTitle>
        {target.daFt == null ? (
          <div className="text-sm text-white/50">Enter conditions to find similar runs.</div>
        ) : similarSorted.length === 0 ? (
          <div className="text-sm text-white/50">No runs within DA ±750 ft / temp ±12°F yet.</div>
        ) : (
          similarSorted.map(({ r, pct }) => (
            <div key={r.id} className="flex items-center justify-between border-t border-white/5 py-1.5 text-sm first:border-0">
              <span><b className="font-mono text-pickle-400">{pct}%</b> <span className="text-white/60">{r.track} · {fmtDate(r.date)}</span></span>
              <span className="font-mono"><b>{fmtET(r.et)}</b> <span className="text-white/45">@ {r.mph?.toFixed(1)}</span></span>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

function renderBold(text) {
  // Render **bold** markers as <b> elements without dangerouslySetInnerHTML.
  const parts = text.split(/(\*\*.+?\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') && p.length > 4
      ? <b key={i}>{p.slice(2, -2)}</b>
      : <span key={i}>{p}</span>
  );
}

function setupSummary(f) {
  const parts = [];
  if (isNum(f.jet)) parts.push(`Jet ${f.jet}`);
  if (isNum(f.lPsi)) parts.push(`PSI ${f.lPsi}/${f.rPsi}`);
  if (isNum(f.lBar) || isNum(f.rBar)) parts.push(`Bar ${f.lBar ?? '–'}/${f.rBar ?? '–'}`);
  if (isNum(f.comp)) parts.push(`Comp ${f.comp}`);
  if (isNum(f.rebound)) parts.push(`Reb ${f.rebound}`);
  if (isNum(f.revLim)) parts.push(`Rev ${f.revLim}`);
  return parts.join(' · ') || 'No setup recorded';
}

function SetupDeltas({ top, last }) {
  const rows = [];
  const labels = { jet: 'Jet', lPsi: 'L PSI', rPsi: 'R PSI', lBar: 'L Bar', rBar: 'R Bar', comp: 'Comp', rebound: 'Rebound', revLim: 'Rev Lim' };
  for (const [k, label] of Object.entries(labels)) {
    const a = top.fields[k], b = last[k];
    if (isNum(a) && isNum(b) && a !== b) rows.push(`${label}: ${b} → ${a}`);
  }
  if (!rows.length) return <div className="mt-2 text-xs text-white/45">Latest run already matches the top-ranked setup.</div>;
  return (
    <div className="mt-2 rounded-xl bg-white/5 p-3">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/45">Changes vs your latest run ({fmtDate(last.date)})</div>
      {rows.map((r) => <div key={r} className="font-mono text-xs text-amber-200">{r}</div>)}
    </div>
  );
}
