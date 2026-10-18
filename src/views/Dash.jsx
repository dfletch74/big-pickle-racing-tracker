import { useMemo, useState } from 'react';
import { Card, SectionTitle, Badge, Segmented, EmptyState, Btn } from '../components/ui';
import { LineChart, WinBar } from '../components/charts';
import { fmtET, fmtMPH, fmtRT, fmtTemp, fmtDate, isNum } from '../lib/format';
import {
  runsForCar, filterDistance, latestRun, personalBests, consistency,
  rankOf, winLoss, avg,
} from '../lib/stats';

export default function Dash({ state, dist, setDist, onAddRun, onImport, onSeeRuns }) {
  const car = state.cars.find((c) => c.id === state.activeCarId);
  const [year, setYear] = useState('all');

  const runs = useMemo(
    () => filterDistance(runsForCar(state, state.activeCarId), dist),
    [state, dist],
  );
  const yearRuns = useMemo(
    () => (year === 'all' ? runs : runs.filter((r) => (r.date || '').startsWith(year))),
    [runs, year],
  );
  const years = useMemo(
    () => [...new Set(runs.map((r) => (r.date || '').slice(0, 4)).filter(Boolean))].sort().reverse(),
    [runs],
  );

  const pb = useMemo(() => personalBests(runs), [runs]);
  const con = useMemo(() => consistency(runs), [runs]);
  const last = useMemo(() => latestRun(yearRuns.length ? yearRuns : runs), [yearRuns, runs]);
  const wl = useMemo(() => winLoss(runs), [runs]);
  const avgRT = useMemo(() => avg(runs.map((r) => r.rt).filter((v) => isNum(v) && v >= 0)), [runs]);

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

  if (!runsForCar(state, state.activeCarId).length) {
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
    et: rankOf(runs, last, 'et', true),
    mph: rankOf(runs, last, 'mph', false),
    sixty: rankOf(runs, last, 'sixty', true),
    rt: rankOf(runs.filter((r) => isNum(r.rt) && r.rt >= 0), last, 'rt', true),
  } : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-display text-[26px] font-bold uppercase leading-none tracking-wide">{car?.name || 'Garage'}</div>
          <div className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-white/40">{[car?.year, car?.make, car?.model].filter(Boolean).join(' · ')}</div>
        </div>
        <Segmented
          value={dist}
          onChange={setDist}
          options={[{ value: '1/4', label: '1/4 mi' }, { value: '1/8', label: '1/8 mi' }]}
        />
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        <Stat label="Runs" value={runs.length} />
        <Stat label="Best ET" value={fmtET(pb.et?.et)} sub={pb.et ? `${pb.et.track}` : ''} accent />
        <Stat label="Best MPH" value={fmtMPH(pb.mph?.mph)} sub={pb.mph ? `${pb.mph.track}` : ''} />
        <Stat label="Best 60ft" value={pb.sixty && isNum(pb.sixty.sixty) ? pb.sixty.sixty.toFixed(3) : '—'} />
        <Stat label="Avg R/T" value={fmtRT(avgRT)} />
      </div>

      {dist === '1/8' && (
        <Card>
          <SectionTitle>Win rate</SectionTitle>
          <WinBar w={wl.w} l={wl.l} />
        </Card>
      )}

      {/* consistency */}
      {con && (
        <Card>
          <SectionTitle>Consistency</SectionTitle>
          <div className="flex items-center gap-4">
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-black ${
              con.grade === 'A' ? 'bg-pickle-500 text-black' : con.grade === 'B' ? 'bg-pickle-500/30 text-pickle-300'
              : con.grade === 'C' ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'}`}>
              {con.grade}
            </div>
            <div className="grid flex-1 grid-cols-3 gap-2 text-center">
              <div><div className="font-mono text-lg font-bold">{con.streak}</div><div className="text-[10px] text-white/45">STREAK</div></div>
              <div><div className="font-mono text-lg font-bold">{Math.round(con.score)}%</div><div className="text-[10px] text-white/45">WITHIN ±0.05s</div></div>
              <div><div className="font-mono text-lg font-bold">{con.spread.toFixed(3)}</div><div className="text-[10px] text-white/45">SPREAD</div></div>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-white/40">Avg ET {con.avgET.toFixed(3)}s over {con.n} runs.</div>
        </Card>
      )}

      {/* last run */}
      {last && (
        <Card>
          <SectionTitle>Last run</SectionTitle>
          <div className="mb-1 text-sm font-bold">{last.track} <span className="font-normal text-white/45">· {fmtDate(last.date)}</span></div>
          <div className="grid grid-cols-4 gap-2 font-mono text-sm">
            <Split label="R/T" value={fmtRT(last.rt)} rank={lastRanks.rt} />
            <Split label="60FT" value={isNum(last.sixty) ? last.sixty.toFixed(3) : '—'} rank={lastRanks.sixty} />
            <Split label="ET" value={fmtET(last.et)} rank={lastRanks.et} accent />
            <Split label="MPH" value={fmtMPH(last.mph)} rank={lastRanks.mph} />
          </div>
        </Card>
      )}

      {/* test sessions */}
      {sessions.length > 0 && (
        <div>
          <SectionTitle>Test sessions</SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            {sessions.map((s) => (
              <Card key={s.date} className="py-3">
                <div className="mb-1 text-sm font-bold">{fmtDate(s.date)} <span className="font-normal text-white/40">· {s.n} runs</span></div>
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

      {/* charts */}
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <SectionTitle>Season performance</SectionTitle>
          <select value={year} onChange={(e) => setYear(e.target.value)} className="rounded-lg border border-white/10 bg-coal-900 px-2 py-1 text-xs">
            <option value="all">All years</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="mb-1 text-[11px] font-semibold text-white/50">ET over time</div>
        <LineChart runs={yearRuns} valueKey="et" formatY={(v) => v.toFixed(2)} />
        <div className="mb-1 mt-4 text-[11px] font-semibold text-white/50">MPH over time</div>
        <LineChart runs={yearRuns} valueKey="mph" formatY={(v) => v.toFixed(0)} />
      </Card>

      {/* personal bests */}
      <Card>
        <SectionTitle>Personal bests</SectionTitle>
        <PBRow label="Reaction" run={pb.rt} text={pb.rt ? fmtRT(pb.rt.rt) : '—'} />
        <PBRow label="60 ft" run={pb.sixty} text={pb.sixty && isNum(pb.sixty.sixty) ? pb.sixty.sixty.toFixed(3) : '—'} />
        <PBRow label="330 ft" run={pb.threeThirty} text={pb.threeThirty && isNum(pb.threeThirty.threeThirty) ? pb.threeThirty.threeThirty.toFixed(3) : '—'} />
        <PBRow label="1/8 ET" run={pb.eighthET} text={fmtET(pb.eighthET?.eighthET)} />
        <PBRow label="1000 ft" run={pb.thousand} text={pb.thousand && isNum(pb.thousand.thousand) ? pb.thousand.thousand.toFixed(3) : '—'} />
        <PBRow label="1/4 ET" run={pb.et} text={fmtET(pb.et?.et)} accent />
        <PBRow label="1/4 MPH" run={pb.mph} text={fmtMPH(pb.mph?.mph)} />
      </Card>

      <PbByTrack runs={runs} dist={dist} />

      {/* recent */}
      <div>
        <SectionTitle right={<button onClick={onSeeRuns} className="text-xs text-pickle-400">See all →</button>}>Recent runs</SectionTitle>
        <div className="space-y-2">
          {[...runs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5).map((r) => (
            <Card key={r.id} className="flex items-center justify-between py-3">
              <div className="text-sm"><b>{r.track}</b> <span className="text-white/40">· {fmtDate(r.date)}</span></div>
              <div className="font-mono text-sm"><b className="text-pickle-400">{fmtET(r.et)}</b> <span className="text-white/50">@ {fmtMPH(r.mph)}</span></div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent }) {
  return (
    <Card className="p-3 text-center">
      <div className="text-[10px] uppercase tracking-wider text-white/45">{label}</div>
      <div className={`font-mono text-lg font-black ${accent ? 'text-pickle-400' : ''}`}>{value}</div>
      {sub && <div className="truncate text-[10px] text-white/40">{sub}</div>}
    </Card>
  );
}

function Split({ label, value, rank, accent }) {
  return (
    <div>
      <div className="text-[10px] text-white/40">{label}</div>
      <div className={accent ? 'font-bold text-pickle-400' : ''}>{value}</div>
      {rank && <div className="text-[10px] text-white/35">{rank.rank} of {rank.of}</div>}
    </div>
  );
}

function PBRow({ label, run, text, accent }) {
  return (
    <div className="flex items-center justify-between border-t border-white/5 py-1.5 text-sm first:border-0">
      <span className="text-white/60">{label}</span>
      <span className="font-mono">
        <b className={accent ? 'text-pickle-400' : ''}>{text}</b>
        {run && <span className="ml-2 text-[11px] text-white/40">{run.track} · {fmtDate(run.date)}</span>}
      </span>
    </div>
  );
}

function PbByTrack({ runs, dist }) {
  const [tab, setTab] = useState('et');
  const tracks = [...new Set(runs.map((r) => r.track))];
  const key = tab === 'et' ? 'et' : tab === 'mph' ? 'mph' : 'rt';
  const lower = tab !== 'mph';
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <SectionTitle>PB by track</SectionTitle>
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
          <div key={t} className="flex items-center justify-between border-t border-white/5 py-1.5 text-sm first:border-0">
            <span className="text-white/70">{t}</span>
            <span className="font-mono"><b className="text-pickle-400">{val}</b> <span className="ml-2 text-[11px] text-white/40">{fmtDate(best.date)}</span></span>
          </div>
        );
      })}
      {!tracks.length && <div className="text-sm text-white/40">No runs in this view.</div>}
    </Card>
  );
}
