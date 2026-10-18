import { useEffect, useMemo, useState } from 'react';
import { Card, SectionTitle, Btn, Field, inputCls, Segmented, Badge, EmptyState } from '../components/ui';
import { fmtET, fmtTemp, fmtDA, fmtDate, isNum } from '../lib/format';
import { runsForCar, filterDistance, latestRun, findSimilar, dialIn, rankSetups, crewChief, similarityPct } from '../lib/stats';
import { fetchTrackWeather } from '../lib/weather';

export default function Insight({ state, toast, dist, setDist }) {
  const [trackId, setTrackId] = useState(state.tracks[0]?.id || '');
  const [cond, setCond] = useState({ tempF: '', humidity: '', daFt: '' });
  const [wxBusy, setWxBusy] = useState(false);
  const baseline = state.settings.daBaseline;

  const track = state.tracks.find((t) => t.id === trackId) || state.tracks[0];
  const carRuns = useMemo(() => runsForCar(state, state.activeCarId), [state]);
  const runs = useMemo(() => filterDistance(carRuns, dist), [carRuns, dist]);
  const last = useMemo(() => latestRun(runs), [runs]);

  const target = {
    tempF: cond.tempF === '' ? null : Number(cond.tempF),
    humidity: cond.humidity === '' ? null : Number(cond.humidity),
    daFt: cond.daFt === '' ? null : Number(cond.daFt),
    distance: dist,
  };

  const findMatching = async () => {
    if (!track) return;
    setWxBusy(true);
    try {
      const w = await fetchTrackWeather(track);
      setCond({
        tempF: w.current.tempF.toFixed(1),
        humidity: String(Math.round(w.current.humidity)),
        daFt: String(Math.round(w.current.daFt)),
      });
      toast(`Live conditions at ${track.name}: ${w.current.tempF.toFixed(1)}°F, DA ${fmtDA(w.current.daFt)}.`);
    } catch (e) {
      toast(`Weather fetch failed: ${e.message}`);
    }
    setWxBusy(false);
  };

  useEffect(() => { setCond({ tempF: '', humidity: '', daFt: '' }); }, [trackId, dist]);

  const similar = useMemo(
    () => (target.daFt != null ? findSimilar(runs, target) : []),
    [runs, target.daFt, target.tempF, dist],
  );
  const dial = useMemo(() => dialIn(runs, target), [runs, target.daFt, target.tempF, dist]);
  const ranked = useMemo(() => rankSetups(runs, baseline), [runs, baseline]);
  const chief = useMemo(() => crewChief(runs, baseline, null), [runs, baseline]);
  const top = ranked[0];

  const similarSorted = useMemo(
    () => [...similar].map((r) => ({ r, pct: similarityPct(r, target) })).sort((a, b) => b.pct - a.pct).slice(0, 8),
    [similar],
  );

  if (!carRuns.length) {
    return <EmptyState title="No data yet" body="Log some runs with weather data to unlock dial-in predictions and setup advice." action={null} />;
  }

  const confTone = dial.confidence === 'HIGH' ? 'green' : dial.confidence === 'MEDIUM' ? 'blue' : 'amber';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={track?.id || ''} onChange={(e) => setTrackId(e.target.value)} className={`${inputCls} flex-1`}>
          {state.tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <Segmented value={dist} onChange={setDist} options={[{ value: '1/4', label: '1/4 mi' }, { value: '1/8', label: '1/8 mi' }]} />
      </div>

      <Card>
        <SectionTitle>Race conditions</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Temp °F"><input type="number" value={cond.tempF} onChange={(e) => setCond({ ...cond, tempF: e.target.value })} className={inputCls} /></Field>
          <Field label="Humidity %"><input type="number" value={cond.humidity} onChange={(e) => setCond({ ...cond, humidity: e.target.value })} className={inputCls} /></Field>
          <Field label="DA ft"><input type="number" value={cond.daFt} onChange={(e) => setCond({ ...cond, daFt: e.target.value })} className={inputCls} /></Field>
        </div>
        <div className="mt-2 flex gap-2">
          <Btn kind="ghost" onClick={findMatching} disabled={wxBusy} className="!py-1.5 text-xs">{wxBusy ? 'Fetching…' : 'Find matching runs (live weather)'}</Btn>
        </div>
        <div className="mt-1 text-[11px] text-white/40">Or enter conditions manually. Predictions key off density altitude.</div>
      </Card>

      {/* dial-in predictor */}
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <SectionTitle>Dial-in predictor</SectionTitle>
          {dial.n > 0 && <Badge tone={confTone}>{dial.confidence} CONFIDENCE</Badge>}
        </div>
        {dial.n === 0 ? (
          <div className="text-sm text-white/50">{target.daFt == null ? 'Enter a density altitude above to get a prediction.' : dial.basis}</div>
        ) : (
          <div>
            <div className="font-mono text-2xl font-black text-pickle-400">{dial.predicted.toFixed(3)}s</div>
            <div className="mt-1 text-sm">Suggested dial: <b className="font-mono">{dial.dial.toFixed(2)}</b></div>
            <div className="text-xs text-white/50">Expected range {dial.lo.toFixed(3)} – {dial.hi.toFixed(3)}s</div>
            <div className="mt-2 text-[11px] text-white/40">{dial.basis}</div>
          </div>
        )}
      </Card>

      {/* ideal setup — same ranking function as the crew chief below */}
      <Card>
        <SectionTitle>Ideal setup</SectionTitle>
        <div className="mb-2 text-[11px] text-white/40">Ranked by mean weather-corrected ET (baseline {baseline.toLocaleString()} ft DA).</div>
        {ranked.length === 0 && <div className="text-sm text-white/50">Log runs with setup + weather data to rank configurations.</div>}
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

      {/* crew chief — rule-based, derived from the SAME ranking above */}
      <Card>
        <SectionTitle>Crew chief's call</SectionTitle>
        <div className="space-y-2 text-sm text-white/75">
          {chief.bullets.map((b, i) => <div key={i} className="flex gap-2"><span className="text-pickle-400">▸</span><span>{b}</span></div>)}
        </div>
        <div className="mt-2 text-[10px] text-white/35">Rule-based analysis — no AI involved. Setup advice always matches the Ideal Setup ranking above.</div>
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
