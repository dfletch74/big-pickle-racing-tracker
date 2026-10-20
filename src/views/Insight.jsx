import { useMemo, useState, useRef, useEffect } from 'react';
import { Card, SectionTitle, Btn, inputCls, Segmented, Badge, EmptyState } from '../components/ui';
import { fmtET, fmtTemp, fmtDA, fmtDate, isNum } from '../lib/format';
import { correctET } from '../lib/physics';
import { runsForCar, filterDistance, latestRun, findSimilar, dialIn, rankSetups, crewChief, crewChiefCall, similarityPct, predictET } from '../lib/stats';
import { useWeatherEntry, WeatherEntryCard } from '../components/WeatherEntry';

export default function Insight({ state, toast, dist, setDist }) {
  const [trackId, setTrackId] = useState(state.tracks[0]?.id || '');
  const [subTab, setSubTab] = useState('overview'); // overview | setup | crew | segments | ai
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

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[['overview', 'Overview'], ['setup', 'Ideal Setup'], ['crew', 'Crew Chief'], ['segments', 'Segments'], ['ai', 'AI Tuner']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSubTab(id)}
            className={`shrink-0 rounded-xl px-4 py-2 font-display text-sm font-semibold uppercase tracking-wider transition ${
              subTab === id ? 'bg-pickle-400 text-black' : 'bg-white/5 text-white/60 hover:bg-white/10'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'overview' && (
      <>
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
      </>
      )}

      {subTab === 'setup' && (
      <>
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
      </>
      )}
      {subTab === 'crew' && (
      <>
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
      </>
      )}
      {subTab === 'segments' && <SegmentAnalysis state={state} />}
      {subTab === 'ai' && (
      <>
      <AiTuner runs={runs} />
      <SetupRecommendations runs={runs} baseline={baseline} />
      </>
      )}
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
function AiTuner({ runs: propRuns }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const answerRef = useRef(null);
  const runs = (propRuns || []).filter((r) => r.source !== 'demo').sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const suggestions = [
    'Why did my 60-ft fall off?',
    'How consistent am I?',
    'How does weather affect my ET?',
    'How are my reaction times?',
    'What should I dial?',
    "What's my best pass?",
    "How's my trap speed trending?",
    'What launch RPM works best?',
    'Where do I run quickest?',
    'Am I red-lighting too much?',
  ];

  const ask = (q) => {
    const ql = q.toLowerCase();
    let ans = null;

    if (ql.includes('dial')) {
      const withDA = runs.filter((r) => r.daFt != null && r.et != null);
      const lastDA = [...runs].reverse().find((r) => r.daFt != null)?.daFt;
      if (lastDA != null && withDA.length >= 3) {
        const p = predictET(withDA, lastDA);
        ans = p?.et != null
          ? `Based on your last recorded air (${Math.round(lastDA).toLocaleString()} ft DA), dial ${Math.floor(p.et * 100) / 100} — predicted ET ${p.et.toFixed(3)} (${p.basis}).`
          : 'Not enough data to predict a dial-in yet.';
      } else {
        ans = 'Need at least 3 runs with DA to predict a dial-in. Log temp on your runs or pull live weather.';
      }
    } else if (ql.includes('best pass') || ql.includes('best run') || ql.includes('quickest pass')) {
      const withET = runs.filter((r) => r.et != null);
      if (withET.length) {
        const b = withET.reduce((m, r) => (r.et < m.et ? r : m), withET[0]);
        ans = `Your best pass is ${Number(b.et).toFixed(3)}${b.mph != null ? ` @ ${Number(b.mph).toFixed(2)} mph` : ''} — ${b.date} at ${b.track}${b.daFt != null ? ` (${Math.round(b.daFt).toLocaleString()} ft DA)` : ''}.`;
      } else {
        ans = 'No runs with ET logged yet.';
      }
    } else if (ql.includes('trap') || ql.includes('mph') || ql.includes('speed')) {
      const withMph = runs.filter((r) => r.mph != null).slice(-10);
      if (withMph.length >= 3) {
        const first3 = withMph.slice(0, 3).reduce((a, r) => a + r.mph, 0) / 3;
        const last3 = withMph.slice(-3).reduce((a, r) => a + r.mph, 0) / 3;
        const diff = last3 - first3;
        ans = diff > 1
          ? `Trap speed is UP ${diff.toFixed(1)} mph (from ${first3.toFixed(1)} to ${last3.toFixed(1)} over the last ${withMph.length} passes). The car is making power — if ET isn't following, look at the launch.`
          : diff < -1
            ? `Trap speed is DOWN ${Math.abs(diff).toFixed(1)} mph (from ${first3.toFixed(1)} to ${last3.toFixed(1)}). That smells like lost power — check plugs, fuel, valve springs, and air.`
            : `Trap speed is steady around ${last3.toFixed(1)} mph. Power is consistent.`;
      } else {
        ans = 'Need at least 3 runs with MPH to read trap-speed trend.';
      }
    } else if (ql.includes('launch') || ql.includes('rpm')) {
      const withRev = runs.filter((r) => r.revLim != null && r.sixty != null);
      if (withRev.length >= 4) {
        const byRev = {};
        for (const r of withRev) {
          const v = r.revLim;
          if (!byRev[v]) byRev[v] = [];
          byRev[v].push(r.sixty);
        }
        const revs = Object.keys(byRev).map(Number).sort((a, b) => a - b);
        if (revs.length >= 2) {
          const rows = revs.map((v) => ({ v, avg: byRev[v].reduce((a, c) => a + c, 0) / byRev[v].length, n: byRev[v].length }));
          rows.sort((a, b) => a.avg - b.avg);
          ans = `Best 60-ft comes at ${rows[0].v} rpm (${rows[0].avg.toFixed(3)} avg over ${rows[0].n} runs). Full picture: ${rows.map((x) => `${x.v}: ${x.avg.toFixed(3)}`).join(' · ')}.`;
        } else {
          ans = `You've only launched at one RPM (${revs[0]}) — try varying it to find what the car likes.`;
        }
      } else {
        ans = 'Need runs with both launch RPM and 60-ft logged to compare.';
      }
    } else if (ql.includes('where') || ql.includes('which track')) {
      const withET = runs.filter((r) => r.et != null && r.track);
      if (withET.length >= 3) {
        const byTrack = {};
        for (const r of withET) {
          if (!byTrack[r.track]) byTrack[r.track] = [];
          byTrack[r.track].push(r.et);
        }
        const rows = Object.entries(byTrack)
          .map(([t, ets]) => ({ t, best: Math.min(...ets), n: ets.length }))
          .sort((a, b) => a.best - b.best);
        ans = `Quickest at ${rows[0].t} — best ${rows[0].best.toFixed(3)} over ${rows[0].n} passes. ${rows.map((x) => `${x.t}: ${x.best.toFixed(3)}`).join(' · ')}`;
      } else {
        ans = 'Need at least 3 runs with track names to compare.';
      }
    } else if (ql.includes('red')) {
      const rts = runs.filter((r) => r.rt != null);
      const reds = rts.filter((r) => r.rt < 0);
      if (rts.length >= 5) {
        const pct = Math.round((reds.length / rts.length) * 100);
        const avgRed = reds.length ? reds.reduce((a, r) => a + r.rt, 0) / reds.length : null;
        ans = reds.length === 0
          ? `Zero red-lights in ${rts.length} runs — disciplined. If your average RT is above 0.080 you might have room to get more aggressive.`
          : `${reds.length} red-lights in ${rts.length} runs (${pct}%), averaging ${avgRed.toFixed(3)}. ${pct > 15 ? 'That is a lot — consider adding delay to the box or staging shallower.' : 'Occasional reds are the cost of cutting close lights.'}`;
      } else {
        ans = 'Need at least 5 runs with reaction times to judge red-light rate.';
      }
    } else if (ql.includes('60') && (ql.includes('fall') || ql.includes('drop') || ql.includes('worse') || ql.includes('slow'))) {
      const with60 = runs.filter((r) => r.sixty != null).slice(-10);
      if (with60.length >= 3) {
        const first3 = with60.slice(0, 3).reduce((a, r) => a + r.sixty, 0) / 3;
        const last3 = with60.slice(-3).reduce((a, r) => a + r.sixty, 0) / 3;
        const diff = last3 - first3;
        if (diff > 0.02) {
          ans = `Your 60-ft has fallen off by ${diff.toFixed(3)}s (from ${first3.toFixed(3)} to ${last3.toFixed(3)} over the last ${with60.length} passes). Common causes: track temp dropping, tire pressure too high, or worn tires. Check your tire pressure logs and compare to when the 60-ft was good.`;
        } else if (diff < -0.02) {
          ans = `Actually your 60-ft has IMPROVED by ${Math.abs(diff).toFixed(3)}s recently. Whatever changed is working — check what setup was different.`;
        } else {
          ans = `Your 60-ft is stable (within 0.02s). If it felt off in a specific round, check that run's tire pressure and track temp vs. your baseline.`;
        }
      } else {
        ans = 'Need at least 3 runs with 60-ft data to analyze the trend.';
      }
    } else if (ql.includes('consistent') || ql.includes('consistency')) {
      const ets = runs.filter((r) => r.et != null).slice(-10).map((r) => r.et);
      if (ets.length >= 5) {
        const avg = ets.reduce((a, c) => a + c, 0) / ets.length;
        const variance = ets.reduce((a, c) => a + Math.pow(c - avg, 2), 0) / ets.length;
        const std = Math.sqrt(variance);
        ans = `Over your last ${ets.length} passes, ET standard deviation is ${std.toFixed(4)}s. ${std < 0.02 ? "That's excellent bracket-racing consistency." : std < 0.05 ? "That's decent — focus on launch repeatability." : "That's high variance — check for setup changes, weather swings, or driving inconsistencies."} Average ET: ${avg.toFixed(3)}.`;
      } else {
        ans = 'Need at least 5 runs to assess consistency.';
      }
    } else if (ql.includes('weather') || ql.includes('da ') || ql.includes('density')) {
      const withDA = runs.filter((r) => r.daFt != null && r.et != null);
      if (withDA.length >= 5) {
        const sorted = [...withDA].sort((a, b) => a.daFt - b.daFt);
        const lowDA = sorted.slice(0, 3);
        const highDA = sorted.slice(-3);
        const lowAvg = lowDA.reduce((a, r) => a + r.et, 0) / lowDA.length;
        const highAvg = highDA.reduce((a, r) => a + r.et, 0) / highDA.length;
        const daDiff = highDA[0].daFt - lowDA[0].daFt;
        const etDiff = highAvg - lowAvg;
        ans = `Weather impact: your ET slows by ~${(etDiff / daDiff * 1000).toFixed(4)}s per 1000 ft DA. In dense air (${Math.round(lowDA[0].daFt)} ft) you average ${lowAvg.toFixed(3)}; in thin air (${Math.round(highDA[0].daFt)} ft) it's ${highAvg.toFixed(3)}. Use this to adjust your dial when conditions change.`;
      } else {
        ans = 'Need at least 5 runs with DA data to analyze weather impact.';
      }
    } else if (ql.includes('reaction') || ql.includes('rt ') || ql.includes('tree') || ql.includes('light')) {
      const rts = runs.filter((r) => r.rt != null).map((r) => r.rt);
      if (rts.length >= 5) {
        const avg = rts.reduce((a, c) => a + c, 0) / rts.length;
        const reds = rts.filter((rt) => rt < 0).length;
        ans = `Your average reaction time is ${avg.toFixed(3)}s over ${rts.length} runs with ${reds} red-lights (${Math.round((reds / rts.length) * 100)}%). ${avg < 0.05 ? "You're cutting it close — great for bracket racing but risky." : avg < 0.1 ? 'Solid, competitive RTs.' : "There's room to improve — practice on the Tree simulator."}`;
      } else {
        ans = 'Need at least 5 runs with reaction times to analyze.';
      }
    } else {
      ans = 'Try one of the suggested questions below — I answer from your logged runs: 60-ft, consistency, weather, reaction times, dial-in, best pass, trap speed, launch RPM, tracks, and red-lights.';
    }

    setAnswer({ q, a: ans });
  };

  useEffect(() => {
    if (answer && answerRef.current) answerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [answer]);

  const doAsk = () => {
    if (question.trim()) ask(question.trim());
  };

  return (
    <div className="space-y-3">
      <Card>
        <SectionTitle>AI Tuner</SectionTitle>
        <div className="mb-3 text-xs text-white/40">
          Ask about your passes — answers are generated from your actual run data.
        </div>
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') doAsk(); }}
            placeholder="Ask about your runs…"
            className={`${inputCls} flex-1`}
          />
          <Btn kind="primary" onClick={doAsk} disabled={!question.trim()} className="shrink-0">Ask</Btn>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => { setQuestion(s); ask(s); }}
              className="rounded-full bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10"
            >
              {s}
            </button>
          ))}
        </div>
      </Card>

      {answer && (
        <Card>
          <div ref={answerRef} className="mb-2 text-sm font-semibold text-white/80">Q: {answer.q}</div>
          <div className="text-sm leading-relaxed text-white/70">{answer.a}</div>
        </Card>
      )}
    </div>
  );
}

function SetupRecommendations({ runs: propRuns, baseline }) {
  const runs = (propRuns || []).filter((r) => r.source !== 'demo').sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const [recs, setRecs] = useState(null);

  const generate = () => {
    const out = [];
    const base = baseline || 2500;
    const withJet = runs.filter((r) => r.jet != null && r.et != null && r.daFt != null);
    const withPsi = runs.filter((r) => (r.lPsi != null || r.rPsi != null) && r.sixty != null);
    const withRev = runs.filter((r) => r.revLim != null && r.sixty != null);

    // Jet analysis: compare DA-CORRECTED ET at different jet settings,
    // so weather differences don't skew the comparison.
    if (withJet.length >= 6) {
      const byJet = {};
      for (const r of withJet) {
        const j = r.jet;
        if (!byJet[j]) byJet[j] = [];
        byJet[j].push(correctET(r.et, r.daFt, base));
      }
      const jets = Object.keys(byJet).map(Number).sort((a, b) => a - b);
      if (jets.length >= 2) {
        let bestJet = null, bestAvg = Infinity;
        const avgs = {};
        for (const j of jets) {
          const rs = byJet[j];
          avgs[j] = rs.reduce((a, c) => a + c, 0) / rs.length;
          if (avgs[j] < bestAvg) { bestAvg = avgs[j]; bestJet = j; }
        }
        const latestJet = withJet[withJet.length - 1].jet;
        const detail = jets.map((j) => `${j} (${byJet[j].length}n): ${avgs[j].toFixed(3)}`).join(' · ');
        if (bestJet !== latestJet) {
          out.push(`Jet: DA-corrected, jet ${bestJet} averages ${bestAvg.toFixed(3)} — best of what you've tried. You're currently on ${latestJet}. Worth testing ${bestJet} again. (${detail})`);
        } else {
          out.push(`Jet: ${bestJet} looks optimal on DA-corrected ET (${bestAvg.toFixed(3)} avg). (${detail})`);
        }
      } else {
        out.push(`Jet: you've only run one jet size (${jets[0]}) with complete data — no comparison possible yet.`);
      }
    } else if (runs.filter((r) => r.jet != null && r.et != null).length >= 6) {
      out.push('Jet: several runs are missing DA, so a fair weather-corrected comparison isn\'t possible yet.');
    }

    // Tire pressure analysis: compare 60-ft at different pressures
    if (withPsi.length >= 6) {
      const pressures = withPsi.map((r) => ({ psi: (r.lPsi + r.rPsi) / 2, sixty: r.sixty }));
      pressures.sort((a, b) => a.psi - b.psi);
      const low = pressures.slice(0, Math.ceil(pressures.length / 2));
      const high = pressures.slice(Math.floor(pressures.length / 2));
      const lowAvg = low.reduce((a, p) => a + p.sixty, 0) / low.length;
      const highAvg = high.reduce((a, p) => a + p.sixty, 0) / high.length;
      if (Math.abs(lowAvg - highAvg) > 0.01) {
        const better = lowAvg < highAvg ? 'lower' : 'higher';
        out.push(`Tire pressure: ${better} pressures average ${Math.min(lowAvg, highAvg).toFixed(3)} 60-ft vs ${Math.max(lowAvg, highAvg).toFixed(3)}. Consider ${better === 'lower' ? 'dropping' : 'raising'} PSI by 0.5 and testing.`);
      } else {
        out.push('Tire pressure: 60-ft is flat across the pressures you\'ve tried — current PSI range looks fine.');
      }
    }

    // Rev limiter analysis: does a higher launch RPM help 60-ft?
    if (withRev.length >= 6) {
      const byRev = {};
      for (const r of withRev) {
        const v = r.revLim;
        if (!byRev[v]) byRev[v] = [];
        byRev[v].push(r.sixty);
      }
      const revs = Object.keys(byRev).map(Number).sort((a, b) => a - b);
      if (revs.length >= 2) {
        const avgs = revs.map((v) => ({ v, avg: byRev[v].reduce((a, c) => a + c, 0) / byRev[v].length, n: byRev[v].length }));
        avgs.sort((a, b) => a.avg - b.avg);
        const best = avgs[0];
        out.push(`Rev limiter: ${best.v} rpm gives your best 60-ft (${best.avg.toFixed(3)} avg over ${best.n} runs). ${avgs.map((a) => `${a.v}: ${a.avg.toFixed(3)}`).join(' · ')}`);
      }
    }

    if (out.length === 0) {
      out.push('Not enough setup data yet. Log runs with jet, tire pressure, and rev limiter to get recommendations.');
    }
    setRecs(out);
  };

  return (
    <Card>
      <SectionTitle>Setup Recommendations</SectionTitle>
      <div className="mb-3 text-xs text-white/40">
        Analyzes your jet and tire pressure history to suggest changes. Advisory only — trust your crew chief.
      </div>
      <Btn kind="primary" onClick={generate} className="w-full mb-3">Generate recommendations</Btn>
      {recs && (
        <div className="space-y-2">
          {recs.map((r, i) => (
            <div key={i} className="rounded-xl bg-white/5 p-3 text-sm text-white/70">{r}</div>
          ))}
        </div>
      )}
    </Card>
  );
}

function SegmentAnalysis({ state }) {
  const runs = (state.runs || [])
    .filter((r) => r.source !== 'demo' && r.distance === '1/4')
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 10);

  const segments = runs.map((r) => {
    const s60 = r.sixty, s330 = r.threeThirty, e8 = r.eighthET, t1000 = r.thousand, et = r.et;
    return {
      run: r,
      to330: s60 != null && s330 != null ? s330 - s60 : null,
      toEighth: s330 != null && e8 != null ? e8 - s330 : null,
      to1000: e8 != null && t1000 != null ? t1000 - e8 : null,
      toQuarter: t1000 != null && et != null ? et - t1000 : null,
    };
  }).filter((s) => s.to330 != null || s.toEighth != null);

  const avg = (arr) => arr.length ? arr.reduce((a, c) => a + c, 0) / arr.length : null;
  const avg330 = avg(segments.map((s) => s.to330).filter((v) => v != null));
  const avgEighth = avg(segments.map((s) => s.toEighth).filter((v) => v != null));

  return (
    <div className="space-y-3">
      <Card>
        <SectionTitle>Interval Averages (1/4 mi)</SectionTitle>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-white/5 p-3">
            <div className="text-[10px] uppercase tracking-wider text-white/40">60–330 ft</div>
            <div className="font-mono text-xl font-bold text-white/90">{avg330 != null ? avg330.toFixed(3) : '—'}</div>
          </div>
          <div className="rounded-xl bg-white/5 p-3">
            <div className="text-[10px] uppercase tracking-wider text-white/40">330–1/8</div>
            <div className="font-mono text-xl font-bold text-white/90">{avgEighth != null ? avgEighth.toFixed(3) : '—'}</div>
          </div>
        </div>
        <div className="mt-2 text-xs text-white/40">
          Isolates launch vs. back-half performance across your last {segments.length} full-split passes.
        </div>
      </Card>

      {segments.length > 0 && (
        <Card>
          <SectionTitle>Recent intervals</SectionTitle>
          <div className="mb-2 text-xs text-white/40">Green = quicker than your previous pass, red = slower.</div>
          <div className="space-y-1.5">
            {segments.map(({ run: r, to330, toEighth, to1000, toQuarter }, i) => {
              const prev = segments[i + 1]; // runs are date-desc, so next in list = previous pass
              const cls = (cur, old) => {
                if (cur == null || old == null) return 'text-white/80';
                if (cur < old - 0.0005) return 'text-pickle-400 font-bold';
                if (cur > old + 0.0005) return 'text-red-400';
                return 'text-white/80';
              };
              const cells = [
                ['60-330', to330, prev?.to330],
                ['330-⅛', toEighth, prev?.toEighth],
                ['⅛-1000', to1000, prev?.to1000],
                ['1000-¼', toQuarter, prev?.toQuarter],
              ];
              return (
                <div key={r.id} className="rounded-lg bg-white/5 px-3 py-2">
                  <div className="mb-1 text-xs text-white/40">{r.date} · {r.track} · ET {r.et != null ? Number(r.et).toFixed(3) : '—'}</div>
                  <div className="grid grid-cols-4 gap-1 font-mono text-xs">
                    {cells.map(([label, cur, old]) => (
                      <div key={label} className={cls(cur, old)}>
                        <span className="text-white/35">{label}:</span> {cur != null ? cur.toFixed(3) : '—'}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
