import { useMemo, useState } from 'react';
import { Card, SectionTitle, Badge, Segmented, EmptyState, Btn, Icon } from '../components/ui';
import { LineChart, WinBar } from '../components/charts';
import { fmtET, fmtMPH, fmtRT, fmtDate, isNum } from '../lib/format';
import {
  runsForCar, filterDistance, latestRun, personalBests, consistency,
  rankOf, avg,
} from '../lib/stats';

export default function Dash({ state, onAddRun, onImport, onSeeRuns }) {
  const car = state.cars.find((c) => c.id === state.activeCarId);
  const allRuns = useMemo(() => runsForCar(state, state.activeCarId), [state]);

  // Dashboard-local distance scope, defaulting to All.
  const [dist, setDist] = useState('all');

  // Distance scope: 'all' | '1/4' | '1/8' — everything below follows it.
  const distRuns = useMemo(() => filterDistance(allRuns, dist), [allRuns, dist]);

  // Year scope: 'all' or a year with runs. Defaults to the current year.
  const years = useMemo(
    () => [...new Set(distRuns.map((r) => (r.date || '').slice(0, 4)).filter(Boolean))].sort().reverse(),
    [distRuns],
  );
  const curYear = String(new Date().getFullYear());
  const [yearSel, setYearSel] = useState(null); // null = auto (current year)
  const year = yearSel ?? (years.includes(curYear) ? curYear : 'all');

  const runs = useMemo(
    () => (year === 'all' ? distRuns : distRuns.filter((r) => (r.date || '').startsWith(year))),
    [distRuns, year],
  );

  // Dominant distance in scope — keeps ET-based stats apples-to-apples when dist === 'all'.
  const domDist = useMemo(() => {
    if (dist !== 'all') return dist;
    const q = runs.filter((r) => r.distance === '1/4').length;
    const e = runs.filter((r) => r.distance === '1/8').length;
    return e > q ? '1/8' : '1/4';
  }, [runs, dist]);
  const domRuns = useMemo(() => runs.filter((r) => r.distance === domDist), [runs, domDist]);

  const pb = useMemo(() => personalBests(runs), [runs]);
  const last = useMemo(() => latestRun(runs), [runs]);
  const avgRT = useMemo(() => avg(runs.map((r) => r.rt).filter((v) => isNum(v) && v >= 0)), [runs]);

  // Win/loss from elimination rounds (Track tab → Eliminations), scoped like the runs.
  const elimWL = useMemo(() => {
    let w = 0, l = 0;
    for (const ev of state.events || []) {
      if (year !== 'all' && !(ev.date || '').startsWith(year)) continue;
      if (dist !== 'all' && ev.distance !== dist) continue;
      for (const r of ev.rounds || []) {
        if (r.result === 'W') w++;
        else if (r.result === 'L') l++;
      }
    }
    return { w, l, rate: w + l ? Math.round((w / (w + l)) * 100) : null };
  }, [state.events, year, dist]);
  const showWinRate = elimWL.w + elimWL.l > 0;

  // Consistency: season (scoped) or last 5 runs, on the dominant distance.
  const [conMode, setConMode] = useState('season'); // season | last5
  const conRuns = useMemo(() => {
    if (conMode !== 'last5') return domRuns;
    return [...domRuns]
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt)
      .slice(0, 5);
  }, [domRuns, conMode]);
  const con = useMemo(() => consistency(conRuns), [conRuns]);

  // ET improvement: avg of first 3 vs avg of last 3 (dominant distance).
  const etImprovement = useMemo(() => {
    const s = domRuns.filter((r) => isNum(r.et)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    if (s.length < 5) return null;
    const first = avg(s.slice(0, 3).map((r) => r.et));
    const lastAvg = avg(s.slice(-3).map((r) => r.et));
    const d = first - lastAvg; // positive = faster now
    if (Math.abs(d) < 0.001) return null;
    return d > 0 ? { text: `−${d.toFixed(3)}s improvement`, good: true } : { text: `+${Math.abs(d).toFixed(3)}s slower`, good: false };
  }, [domRuns]);

  const bestETOf = (d) => {
    const p = runs.filter((r) => r.distance === d && isNum(r.et));
    return p.length ? p.reduce((a, b) => (b.et < a.et ? b : a)) : null;
  };
  const heroQuarter = bestETOf('1/4');
  const heroEighth = bestETOf('1/8');

  const sessions = useMemo(() => {
    const byDay = new Map();
    for (const r of runs) {
      if (!r.date) continue;
      if (!byDay.has(r.date)) byDay.set(r.date, []);
      byDay.get(r.date).push(r);
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 6)
      .map(([date, dayRuns]) => {
        const ets = dayRuns.map((r) => r.et).filter(isNum);
        const temps = dayRuns.map((r) => r.tempF).filter(isNum);
        const jets = [...new Set(dayRuns.map((r) => r.jet).filter(isNum))];
        const revs = [...new Set(dayRuns.map((r) => r.revLim).filter(isNum))];
        const tune = [...jets.map((j) => `Jet ${j}`), ...revs.map((v) => `Rev ${v}`)].join(' · ');
        return {
          date, n: dayRuns.length,
          best: ets.length ? Math.min(...ets) : null,
          avgET: avg(ets),
          tempLo: temps.length ? Math.min(...temps) : null,
          tempHi: temps.length ? Math.max(...temps) : null,
          tune,
        };
      });
  }, [runs]);

  if (!allRuns.length) {
    return (
      <div className="space-y-4">
        <EmptyState
          title="No runs yet"
          body="Log your first pass or import your existing spreadsheet to light up the dashboard."
          action={<div className="flex justify-center gap-2"><Btn onClick={onAddRun}>Log a run</Btn><Btn kind="ghost" onClick={onImport}>Import</Btn></div>}
        />
      </div>
    );
  }

  const lastRanks = last ? {
    et: rankOf(domRuns, last, 'et', true),
    mph: rankOf(domRuns, last, 'mph', false),
    sixty: rankOf(domRuns, last, 'sixty', true),
    rt: rankOf(domRuns.filter((r) => isNum(r.rt) && r.rt >= 0), last, 'rt', true),
  } : null;

  const scopeLabel = `${dist === 'all' ? 'All distances' : dist + ' mi'} · ${year === 'all' ? 'All years' : year}`;
  const distLabel = dist === 'all' ? 'All runs' : `${dist} mi`;

  return (
    <div className="space-y-4">
      {/* header + distance filter */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-display text-[28px] font-bold uppercase leading-none tracking-wide">
            {car?.name || 'Garage'}
          </div>
          <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-white/40">
            {[car?.year, car?.make, car?.model].filter(Boolean).join(' · ')}
          </div>
        </div>
        <Segmented
          value={dist}
          onChange={setDist}
          options={[
            { value: 'all', label: 'All' },
            { value: '1/4', label: '1/4 mi' },
            { value: '1/8', label: '1/8 mi' },
          ]}
        />
      </div>

      {runs.length === 0 ? (
        <EmptyState
          title="No runs in view"
          body={`Nothing logged for ${scopeLabel.toLowerCase()} yet.`}
          action={<div className="flex justify-center gap-2">
            <Btn kind="ghost" onClick={() => { setYearSel('all'); setDist('all'); }}>Clear filters</Btn>
          </div>}
        />
      ) : (
        <>
          {/* hero: best ET */}
          <Card className="relative overflow-hidden">
            <div className="asphalt pointer-events-none absolute inset-0 opacity-70" />
            <div className="relative">
              <div className="font-display text-[15px] font-semibold uppercase tracking-[0.2em] text-white/50">
                Best ET · {scopeLabel}
              </div>
              {dist === 'all' && heroQuarter && heroEighth ? (
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <HeroET label="1/4 mile" run={heroQuarter} />
                  <HeroET label="1/8 mile" run={heroEighth} />
                </div>
              ) : (
                <HeroET label={dist === 'all' ? domDist + ' mile' : null} run={dist === 'all' ? (domDist === '1/4' ? heroQuarter : heroEighth) : bestETOf(dist)} big />
              )}
            </div>
          </Card>

          {/* stat cards */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Runs" value={runs.length} sub={scopeLabel} />
            <Stat label="Best MPH" value={fmtMPH(pb.mph?.mph)} sub={pb.mph ? pb.mph.track : ''} />
            <Stat label="Best 60ft" value={pb.sixty && isNum(pb.sixty.sixty) ? pb.sixty.sixty.toFixed(3) : '—'} />
            <Stat label="Avg R/T" value={fmtRT(avgRT)} />
          </div>

          {showWinRate && (
            <Card>
              <SectionTitle>Win rate · {scopeLabel}</SectionTitle>
              <WinBar w={elimWL.w} l={elimWL.l} />
            </Card>
          )}

          {/* consistency */}
          <Card>
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h2 className="font-display text-[17px] font-bold uppercase tracking-[0.14em] text-white/55">
                Consistency · {year === 'all' ? 'All years' : year}
              </h2>
              <Segmented
                value={conMode}
                onChange={setConMode}
                options={[{ value: 'season', label: 'Season' }, { value: 'last5', label: 'Last 5' }]}
              />
            </div>
            {con ? (
              <>
                <div className="flex items-center gap-4">
                  <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl font-display text-3xl font-extrabold ${
                    con.grade === 'A' ? 'bg-pickle-400 text-black shadow-glow' : con.grade === 'B' ? 'bg-pickle-500/25 text-pickle-300'
                    : con.grade === 'C' ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'}`}>
                    {con.grade}
                  </div>
                  <div className="grid flex-1 grid-cols-3 gap-2 text-center">
                    <div><div className="font-mono text-lg font-bold">{con.streak}</div><div className="text-[10px] uppercase tracking-wider text-white/45">Streak</div></div>
                    <div><div className="font-mono text-lg font-bold">{Math.round(con.score)}%</div><div className="text-[10px] uppercase tracking-wider text-white/45">±0.05s</div></div>
                    <div><div className="font-mono text-lg font-bold">{con.spread.toFixed(3)}</div><div className="text-[10px] uppercase tracking-wider text-white/45">Spread</div></div>
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-white/40">
                  {conMode === 'last5' ? 'Last 5 runs' : `${year === 'all' ? 'All years' : year} season`} · {domDist} mi · avg ET {con.avgET.toFixed(3)}s over {con.n} runs.
                </div>
              </>
            ) : (
              <div className="py-4 text-center text-sm text-white/40">Need at least 3 runs for a consistency rating.</div>
            )}
          </Card>

          {/* last run */}
          {last && (
            <Card>
              <SectionTitle>Last run</SectionTitle>
              <div className="mb-2 text-sm font-bold">{last.track} <span className="font-normal text-white/45">· {fmtDate(last.date)}</span></div>
              <div className="grid grid-cols-4 gap-2 font-mono text-sm">
                <Split label="R/T" value={fmtRT(last.rt)} rank={lastRanks.rt} />
                <Split label="60FT" value={isNum(last.sixty) ? last.sixty.toFixed(3) : '—'} rank={lastRanks.sixty} />
                <Split label="ET" value={fmtET(last.et)} rank={lastRanks.et} accent />
                <Split label="MPH" value={fmtMPH(last.mph)} rank={lastRanks.mph} />
              </div>
            </Card>
          )}

          {/* season performance */}
          <PerfCard
            title="Season Performance"
            subtitle={`ET over time — ${domRuns.filter((r) => isNum(r.et)).length} runs`}
            improvement={etImprovement}
            years={years} year={year} onYear={setYearSel}
          >
            <LineChart runs={runs} valueKey="et" invert formatY={(v) => v.toFixed(1)} distLabel={distLabel} />
          </PerfCard>

          {/* speed progression */}
          <PerfCard
            title="Speed Progression"
            subtitle={`MPH over time — ${domRuns.filter((r) => isNum(r.mph)).length} runs`}
            years={years} year={year} onYear={setYearSel}
          >
            <LineChart runs={runs} valueKey="mph" formatY={(v) => v.toFixed(0)} distLabel={distLabel} />
          </PerfCard>

          {/* test sessions */}
          {sessions.length > 0 && (
            <div>
              <SectionTitle>Test sessions</SectionTitle>
              <div className="grid gap-2 sm:grid-cols-2">
                {sessions.map((s) => (
                  <Card key={s.date} className="py-3 transition hover:border-white/20">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm font-bold">{fmtDate(s.date)}</span>
                      <Badge tone="neutral">{s.n} run{s.n === 1 ? '' : 's'}</Badge>
                    </div>
                    <div className="flex gap-4 font-mono text-xs">
                      <span>Best <b className="text-pickle-400">{fmtET(s.best)}</b></span>
                      <span>Avg <b>{fmtET(s.avgET)}</b></span>
                      {s.tempLo != null && <span className="text-white/50">{s.tempLo.toFixed(0)}–{s.tempHi.toFixed(0)}°F</span>}
                    </div>
                    {s.tune && <div className="mt-1 text-[11px] text-white/45">{s.tune}</div>}
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* personal bests */}
          <Card>
            <SectionTitle>Personal bests · {scopeLabel}</SectionTitle>
            <PBRow label="Reaction" run={pb.rt} text={pb.rt ? fmtRT(pb.rt.rt) : '—'} />
            <PBRow label="60 ft" run={pb.sixty} text={pb.sixty && isNum(pb.sixty.sixty) ? pb.sixty.sixty.toFixed(3) : '—'} />
            <PBRow label="330 ft" run={pb.threeThirty} text={pb.threeThirty && isNum(pb.threeThirty.threeThirty) ? pb.threeThirty.threeThirty.toFixed(3) : '—'} />
            <PBRow label="1/8 ET" run={pb.eighthET} text={fmtET(pb.eighthET?.eighthET)} />
            <PBRow label="1000 ft" run={pb.thousand} text={pb.thousand && isNum(pb.thousand.thousand) ? pb.thousand.thousand.toFixed(3) : '—'} />
            <PBRow label="1/4 ET" run={pb.et} text={fmtET(pb.et?.et)} />
            <PBRow label="1/4 MPH" run={pb.mph} text={fmtMPH(pb.mph?.mph)} />
          </Card>

          <PbByTrack runs={runs} scopeLabel={scopeLabel} />

          {/* recent */}
          <div>
            <SectionTitle right={<button onClick={onSeeRuns} className="flex items-center gap-1 text-xs font-semibold text-pickle-400 hover:text-pickle-300">See all <Icon name="chevR" className="h-3.5 w-3.5" /></button>}>Recent runs</SectionTitle>
            <div className="space-y-2">
              {[...runs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5).map((r) => (
                <Card key={r.id} className="flex items-center justify-between py-3 transition hover:border-white/20">
                  <div className="text-sm"><b>{r.track}</b> <span className="text-white/40">· {fmtDate(r.date)}</span></div>
                  <div className="font-mono text-sm"><b className="text-pickle-400">{fmtET(r.et)}</b> <span className="text-white/50">@ {fmtMPH(r.mph)}</span></div>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function HeroET({ label, run, big }) {
  return (
    <div className={big ? 'mt-1 flex items-end justify-between gap-3' : ''}>
      <div>
        {label && <div className="font-display text-[13px] font-semibold uppercase tracking-[0.18em] text-white/45">{label}</div>}
        <div className={`font-mono font-bold leading-none text-pickle-400 [text-shadow:0_0_32px_rgba(163,230,53,0.35)] ${big ? 'text-[52px]' : 'text-4xl'}`}>
          {fmtET(run?.et)}
        </div>
        <div className="mt-1.5 text-xs text-white/45">
          {run ? `${run.track} · ${fmtDate(run.date)}` : '—'}
        </div>
      </div>
      {big && (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-pickle-400/10 text-pickle-400">
          <Icon name="trophy" className="h-7 w-7" />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <Card className="p-3 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{label}</div>
      <div className="mt-0.5 font-mono text-xl font-bold">{value}</div>
      {sub && <div className="mt-0.5 truncate text-[10px] text-white/40">{sub}</div>}
    </Card>
  );
}

function Split({ label, value, rank, accent }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={accent ? 'text-base font-bold text-pickle-400' : ''}>{value}</div>
      {rank && <div className="text-[10px] text-white/35">{rank.rank} of {rank.of}</div>}
    </div>
  );
}

function PBRow({ label, run, text }) {
  return (
    <div className="grid grid-cols-[76px_88px_minmax(0,1fr)] items-baseline gap-x-3 border-t border-white/5 py-2 text-sm first:border-0">
      <span className="truncate text-[13px] font-medium text-white/55">{label}</span>
      <span className="text-right font-mono text-[15px] font-bold tabular-nums text-white">{text}</span>
      <span className="truncate text-right text-[11px] text-white/35">
        {run ? `${run.track} · ${fmtDate(run.date)}` : ''}
      </span>
    </div>
  );
}

/** Chart card matching the reference: title + improvement, subtitle, year chips, chart, legend. */
function PerfCard({ title, subtitle, improvement, years, year, onYear, children }) {
  return (
    <Card className="!border-white/[0.07] !bg-[#12141a]">
      <div className="mb-1 flex items-start justify-between gap-2">
        <h3 className="font-display text-[24px] font-bold uppercase leading-none tracking-[0.05em] text-white/90">
          {title}
        </h3>
        {improvement && (
          <div className={`shrink-0 font-mono text-[13px] font-semibold ${improvement.good ? 'text-pickle-400' : 'text-amber-300'}`}>
            {improvement.text}
          </div>
        )}
      </div>
      <div className="mb-3 text-[15px] text-white/40">{subtitle}</div>
      <div className="mb-4">
        <YearChips years={years} value={year} onChange={onYear} />
      </div>
      {children}
    </Card>
  );
}

function YearChips({ years, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {['all', ...years].map((y) => (
        <button
          key={y}
          onClick={() => onChange(y === 'all' ? 'all' : y)}
          className={`rounded-xl px-4 py-2 font-mono text-sm font-semibold transition active:scale-95 ${
            value === y ? 'bg-pickle-400 text-black shadow-glow' : 'bg-white/[0.07] text-white/50 hover:bg-white/[0.12] hover:text-white'
          }`}
        >
          {y === 'all' ? 'All' : y}
        </button>
      ))}
    </div>
  );
}

function PbByTrack({ runs, scopeLabel }) {
  const [tab, setTab] = useState('et');
  const tracks = [...new Set(runs.map((r) => r.track))];
  const key = tab === 'et' ? 'et' : tab === 'mph' ? 'mph' : 'rt';
  const lower = tab !== 'mph';
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <SectionTitle>PB by track · {scopeLabel}</SectionTitle>
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'et', label: 'ET' }, { value: 'mph', label: 'MPH' }, { value: 'rt', label: 'R/T' },
        ]} />
      </div>
      {tracks.map((t) => {
        const tr = runs.filter((r) => r.track === t && isNum(r[key]) && (key !== 'rt' || r.rt >= 0));
        if (!tr.length) return null;
        const best = tr.reduce((a, b) => (lower ? (b[key] < a[key] ? b : a) : (b[key] > a[key] ? b : a)));
        const val = tab === 'et' ? fmtET(best.et) : tab === 'mph' ? fmtMPH(best.mph) : fmtRT(best.rt);
        return (
          <div key={t} className="grid grid-cols-[minmax(0,1fr)_88px_auto] items-baseline gap-x-3 border-t border-white/5 py-2 text-sm first:border-0">
            <span className="truncate font-medium text-white/75">{t}</span>
            <span className="text-right font-mono text-[15px] font-bold tabular-nums text-white">{val}</span>
            <span className="text-right text-[11px] tabular-nums text-white/35">{fmtDate(best.date)}</span>
          </div>
        );
      })}
      {!tracks.length && <div className="text-sm text-white/40">No runs in this view.</div>}
    </Card>
  );
}
