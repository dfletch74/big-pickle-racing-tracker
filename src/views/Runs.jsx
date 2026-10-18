import { useMemo, useState } from 'react';
import { Card, SectionTitle, Badge, Btn, Segmented, Field, inputCls, EmptyState } from '../components/ui';
import RunCard from '../components/RunCard';
import { fmtET, fmtMPH, fmtRT, fmtDate, isNum, runDateTime } from '../lib/format';
import { runsForCar, filterDistance, latestRun, avg, detectIssues, bestSegments, correctedETOf } from '../lib/stats';
import { parseImportFile, runsToCSV, downloadFile } from '../lib/io';

const SORTS = [
  ['date', 'Date'], ['rt', 'R/T'], ['sixty', '60ft'], ['threeThirty', '330ft'],
  ['eighthET', '1/8 ET'], ['eighthMPH', '1/8 MPH'], ['thousand', '1000ft'],
  ['et', 'ET'], ['mph', 'MPH'],
];

export default function Runs({ state, update, toast, dist, setDist, onPrint, onAddRun }) {
  const [mode, setMode] = useState('list'); // list | compare | import
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('date');
  const [filter, setFilter] = useState('all'); // all | today | issues
  const baseline = state.settings.daBaseline;

  const carRuns = useMemo(() => runsForCar(state, state.activeCarId), [state]);
  const ctx = useMemo(() => {
    const pool = filterDistance(carRuns, dist);
    return {
      avgRT: avg(pool.map((r) => r.rt).filter((v) => isNum(v) && v >= 0)),
      avgMPH: avg(pool.map((r) => r.mph).filter(isNum)),
      avgSixty: avg(pool.map((r) => r.sixty).filter(isNum)),
      bestSegs: bestSegments(pool),
    };
  }, [carRuns, dist]);

  const filtered = useMemo(() => {
    let list = filterDistance(carRuns, dist);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = list.filter((r) => `${r.track} ${r.notes} ${r.runType}`.toLowerCase().includes(s));
    }
    if (filter === 'today') {
      const today = new Date().toISOString().slice(0, 10);
      list = list.filter((r) => r.date === today);
    }
    if (filter === 'issues') {
      // Bug fix #5: the Issues filter MUST actually filter the list.
      list = list.filter((r) => detectIssues(r, ctx).length > 0);
    }
    const key = sort;
    return [...list].sort((a, b) => {
      if (key === 'date') return runDateTime(b) - runDateTime(a);
      const av = a[key], bv = b[key];
      if (!isNum(av)) return 1;
      if (!isNum(bv)) return -1;
      return av - bv;
    });
  }, [carRuns, dist, q, sort, filter, ctx]);

  const doExport = () => {
    // Bug fix #1: export produces a REAL download + visible confirmation.
    const csv = runsToCSV(filtered);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`big-pickle-runs-${stamp}.csv`, csv);
    toast(`Exported ${filtered.length} run${filtered.length === 1 ? '' : 's'} to CSV.`);
  };

  const doDelete = (id) => update((s) => { s.runs = s.runs.filter((r) => r.id !== id); });

  if (mode === 'compare') return <CompareView runs={filterDistance(carRuns, dist)} baseline={baseline} onBack={() => setMode('list')} />;
  if (mode === 'import') return <ImportView state={state} update={update} toast={toast} onBack={() => setMode('list')} onDone={() => setMode('list')} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={dist} onChange={setDist} options={[
          { value: 'all', label: 'All' }, { value: '1/4', label: '1/4 mi' }, { value: '1/8', label: '1/8 mi' },
        ]} />
        <Segmented value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'All' }, { value: 'today', label: 'Today' }, { value: 'issues', label: filter === 'issues' ? 'Hide issues' : 'Issues' },
        ]} />
      </div>

      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search track, notes…" className={`${inputCls} flex-1`} />
        <select value={sort} onChange={(e) => setSort(e.target.value)} className={`${inputCls} w-32 flex-none`}>
          {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        <Btn kind="ghost" onClick={() => setMode('compare')}>Compare</Btn>
        <Btn kind="ghost" onClick={() => setMode('import')}>Import</Btn>
        <Btn kind="ghost" onClick={doExport}>Export CSV</Btn>
      </div>

      <div className="text-xs text-white/40">{filtered.length} of {carRuns.length} runs</div>

      {filtered.length === 0 ? (
        <EmptyState
          title={carRuns.length ? 'No runs match' : 'No runs yet'}
          body={carRuns.length ? 'Try clearing the search or filters.' : 'Log your first pass or import a spreadsheet.'}
          action={carRuns.length ? null : <div className="flex justify-center gap-2"><Btn onClick={onAddRun}>Log a run</Btn><Btn kind="ghost" onClick={() => setMode('import')}>Import</Btn></div>}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <RunCard key={r.id} run={r} ctx={ctx} baseline={baseline}
              onEdit={(run) => onAddRun(run.id)} onDelete={doDelete} onPrint={onPrint} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Compare ---------------- */

function CompareView({ runs, baseline, onBack }) {
  // Bug fix #6: default to same-distance pairings.
  const latest = latestRun(runs);
  const sameDist = latest ? runs.filter((r) => r.distance === latest.distance && r.id !== latest.id) : [];
  const [aId, setAId] = useState(latest?.id || '');
  const [bId, setBId] = useState(latestRun(sameDist)?.id || '');

  const A = runs.find((r) => r.id === aId);
  const B = runs.find((r) => r.id === bId);

  const opt = (r) => `${fmtDate(r.date)} · ${r.track} · ${r.distance} · ${fmtET(r.et)}`;

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-sm text-pickle-400">← Back to runs</button>
      <SectionTitle>Compare runs</SectionTitle>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Run A"><select value={aId} onChange={(e) => setAId(e.target.value)} className={inputCls}>
          {runs.map((r) => <option key={r.id} value={r.id}>{opt(r)}</option>)}
        </select></Field>
        <Field label="Run B"><select value={bId} onChange={(e) => setBId(e.target.value)} className={inputCls}>
          {runs.map((r) => <option key={r.id} value={r.id}>{opt(r)}</option>)}
        </select></Field>
      </div>
      {A && B && A.distance !== B.distance && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          Different distances ({A.distance} vs {B.distance}) — ET/MPH rows are not comparable.
        </div>
      )}
      {A && B && (
        <>
          <Card className="overflow-x-auto p-0">
            <table className="w-full font-mono text-xs">
              <thead><tr className="text-left text-white/40">
                <th className="p-3 font-medium">Split</th><th className="p-3 font-medium">A</th><th className="p-3 font-medium">B</th><th className="p-3 text-right font-medium">Δ (B−A)</th>
              </tr></thead>
              <tbody>
                <CmpRow label="R/T" a={fmtRT(A.rt)} b={fmtRT(B.rt)} d={delta(B.rt, A.rt)} />
                <CmpRow label="60FT" a={f3(A.sixty)} b={f3(B.sixty)} d={delta(B.sixty, A.sixty)} />
                <CmpRow label="330FT" a={f3(A.threeThirty)} b={f3(B.threeThirty)} d={delta(B.threeThirty, A.threeThirty)} />
                <CmpRow label="1/8 ET" a={fmtET(A.eighthET)} b={fmtET(B.eighthET)} d={delta(B.eighthET, A.eighthET)} />
                <CmpRow label="1/8 MPH" a={fmtMPH(A.eighthMPH)} b={fmtMPH(B.eighthMPH)} d={delta(B.eighthMPH, A.eighthMPH, 1)} flip />
                <CmpRow label="1000FT" a={f3(A.thousand)} b={f3(B.thousand)} d={delta(B.thousand, A.thousand)} />
                <CmpRow label="ET" a={fmtET(A.et)} b={fmtET(B.et)} d={A.distance === B.distance ? delta(B.et, A.et) : null} bold />
                <CmpRow label="MPH" a={fmtMPH(A.mph)} b={fmtMPH(B.mph)} d={A.distance === B.distance ? delta(B.mph, A.mph, 1) : null} flip bold />
                <CmpRow label="ET corr*" a={fmtET(correctedETOf(A, baseline))} b={fmtET(correctedETOf(B, baseline))} d={delta(correctedETOf(B, baseline), correctedETOf(A, baseline))} />
              </tbody>
            </table>
          </Card>
          <div className="text-[10px] text-white/35">*Weather-corrected to {baseline.toLocaleString()} ft DA.</div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Card>
              <SectionTitle>Weather</SectionTitle>
              <CmpLine label="Temp" a={A.tempF?.toFixed(1) + '°F'} b={B.tempF?.toFixed(1) + '°F'} />
              <CmpLine label="Humidity" a={A.humidity + '%'} b={B.humidity + '%'} />
              <CmpLine label="D/A" a={A.daFt?.toLocaleString() + ' ft'} b={B.daFt?.toLocaleString() + ' ft'} />
            </Card>
            <Card>
              <SectionTitle>Car setup</SectionTitle>
              {['jet', 'lPsi', 'rPsi', 'lBar', 'rBar', 'comp', 'rebound', 'revLim'].map((k) => (
                <CmpLine key={k} label={k} a={A[k] ?? '—'} b={B[k] ?? '—'} diff={A[k] !== B[k]} />
              ))}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

const f3 = (v) => (isNum(v) ? v.toFixed(3) : '—');
const delta = (b, a, digits = 3) => {
  if (!isNum(a) || !isNum(b)) return null;
  const d = b - a;
  const s = d > 0 ? '+' : d < 0 ? '−' : '';
  return `${s}${Math.abs(d).toFixed(digits)}`;
};

function CmpRow({ label, a, b, d, flip, bold }) {
  const good = d == null ? '' : (flip ? d.startsWith('−') : d.startsWith('+')) ? 'text-amber-300' : d === '0.000' || d === '0.0' ? '' : 'text-pickle-400';
  return (
    <tr className="border-t border-white/5">
      <td className="p-3 text-white/50">{label}</td>
      <td className={`p-3 ${bold ? 'font-bold' : ''}`}>{a}</td>
      <td className={`p-3 ${bold ? 'font-bold' : ''}`}>{b}</td>
      <td className={`p-3 text-right ${good}`}>{d ?? '—'}</td>
    </tr>
  );
}

function CmpLine({ label, a, b, diff }) {
  return (
    <div className="flex justify-between py-1 font-mono text-xs">
      <span className="text-white/45">{label}</span>
      <span><span className={diff ? 'text-amber-300' : ''}>{a ?? '—'}</span><span className="text-white/30"> → </span><span className={diff ? 'text-amber-300' : ''}>{b ?? '—'}</span></span>
    </div>
  );
}

/* ---------------- Import ---------------- */

function ImportView({ state, update, toast, onBack, onDone }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setBusy(true);
    try {
      const { runs, errors } = await parseImportFile(f, state.activeCarId, state.tracks[0]?.name);
      setResult({ runs, errors, name: f.name });
    } catch (err) {
      setResult({ runs: [], errors: [String(err.message || err)], name: f.name });
    }
    setBusy(false);
  };

  const commit = () => {
    update((s) => { s.runs.push(...result.runs); });
    toast(`Imported ${result.runs.length} runs.`);
    onDone();
  };

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-sm text-pickle-400">← Back to runs</button>
      <SectionTitle>Import spreadsheet</SectionTitle>
      <Card>
        <div className="mb-2 text-sm text-white/70">Drop a CSV or XLSX export here. <b>Required columns:</b> Date, E.T.</div>
        <div className="mb-3 text-xs text-white/45">Recommended: Track, 60ft, 330ft, 1/8 ET, 1/8 MPH, 1000ft, MPH, R/T, Temp, Humidity, Altitude, Jet, Notes. Headers are matched case-insensitively.</div>
        <input type="file" accept=".csv,.xlsx,.xls" onChange={onFile} className="text-sm text-white/70" />
        {busy && <div className="mt-2 text-sm text-white/50">Parsing…</div>}
      </Card>
      {result && (
        <Card>
          <div className="mb-2 text-sm font-bold">{result.name}: {result.runs.length} runs ready</div>
          {result.errors.length > 0 && (
            <div className="mb-2 max-h-32 overflow-y-auto rounded-xl bg-amber-500/10 p-3 text-xs text-amber-200">
              {result.errors.slice(0, 20).map((e, i) => <div key={i}>{e}</div>)}
              {result.errors.length > 20 && <div>…and {result.errors.length - 20} more</div>}
            </div>
          )}
          {result.runs.length > 0 && <Btn onClick={commit}>Import {result.runs.length} runs</Btn>}
        </Card>
      )}
    </div>
  );
}
