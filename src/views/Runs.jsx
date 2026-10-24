import { useMemo, useState } from 'react';
import { Card, SectionTitle, Badge, Btn, Segmented, Field, inputCls, EmptyState, Icon } from '../components/ui';
import RunCard from '../components/RunCard';
import { fmtET, fmtMPH, fmtRT, fmtDate, isNum, runDateTime } from '../lib/format';
import { runsForCar, filterDistance, latestRun, avg, detectIssues, bestSegments, correctedETOf } from '../lib/stats';
import { parseImportFile, runsToCSV, downloadFile } from '../lib/io';
import { takeSnapshot } from '../lib/snapshots';
import { tombstoneKey } from '../lib/teamSync';
import { jsPDF } from 'jspdf';

const SORTS = [
  ['date', 'Date'], ['rt', 'R/T'], ['sixty', '60ft'], ['threeThirty', '330ft'],
  ['eighthET', '1/8 ET'], ['eighthMPH', '1/8 MPH'], ['thousand', '1000ft'],
  ['et', 'ET'], ['mph', 'MPH'],
];

export default function Runs({ state, update, toast, dist, setDist, onPrint, onAddRun, role }) {
  const [mode, setMode] = useState('list'); // list | compare | import
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('date');
  const [filter, setFilter] = useState('all'); // all | today | issues | local
  // Local date, not UTC — toISOString() would flip to tomorrow at 6pm MDT
  // and hide this evening's runs under the Today filter. Snapshotted at
  // mount; calling `new Date()` inside the memo below is impure.
  const [todayStr] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
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
      list = list.filter((r) => r.date === todayStr);
    }
    if (filter === 'issues') {
      // Bug fix #5: the Issues filter MUST actually filter the list.
      list = list.filter((r) => detectIssues(r, ctx).length > 0);
    }
    if (filter === 'local') {
      // Runs logged or edited on this phone (source unset) — the ones
      // carrying the LOCAL badge. Team-pulled and demo runs excluded.
      list = list.filter((r) => !r.source);
    }
    const key = sort;
    return [...list].sort((a, b) => {
      if (key === 'date') return runDateTime(b) - runDateTime(a);
      const av = a[key], bv = b[key];
      if (!isNum(av)) return 1;
      if (!isNum(bv)) return -1;
      return av - bv;
    });
  }, [carRuns, dist, q, sort, filter, ctx, todayStr]);

  const doExport = () => {
    // Bug fix #1: export produces a REAL download + visible confirmation.
    const csv = runsToCSV(filtered);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`big-pickle-runs-${stamp}.csv`, csv);
    toast(`Exported ${filtered.length} run${filtered.length === 1 ? '' : 's'} to CSV.`);
  };

  const doExportPdf = () => {
    // PDF export of the CURRENT filter selection (same list as CSV).
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'letter' });
      let y = 50;
      doc.setFontSize(18);
      const distLabel = dist === 'all' ? 'All distances' : dist === '1/4' ? '1/4 mile' : '1/8 mile';
      doc.text(`Big Pickle Racing — Runs (${distLabel})`, 40, y);
      y += 20;
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`${filtered.length} runs · exported ${new Date().toLocaleDateString()}`, 40, y);
      doc.setTextColor(0);
      y += 25;

      const headers = ['Date', 'Track', 'Dist', 'R/T', '60ft', '1/8 ET', '1/8 MPH', 'ET', 'MPH', 'DA'];
      const colW = [60, 90, 40, 45, 45, 55, 60, 55, 55, 55];
      const startX = 40;
      const drawHeaders = () => {
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        let x = startX;
        headers.forEach((h, i) => { doc.text(h, x, y); x += colW[i]; });
        doc.setFont(undefined, 'normal');
        y += 14;
      };
      drawHeaders();
      doc.setFontSize(8);
      for (const r of filtered) {
        if (y > 720) { doc.addPage(); y = 50; drawHeaders(); }
        let x = startX;
        const cells = [
          (r.date || '') + (r.backup ? '*' : ''),
          (r.track || '').slice(0, 14),
          r.distance || '',
          r.rt != null ? Number(r.rt).toFixed(3) : '',
          r.sixty != null ? Number(r.sixty).toFixed(3) : '',
          r.eighthET != null ? Number(r.eighthET).toFixed(3) : '',
          r.eighthMPH != null ? Number(r.eighthMPH).toFixed(2) : '',
          r.et != null ? Number(r.et).toFixed(3) : '',
          r.mph != null ? Number(r.mph).toFixed(2) : '',
          r.daFt != null ? String(Math.round(r.daFt)) : '',
        ];
        cells.forEach((c, i) => { doc.text(String(c), x, y); x += colW[i]; });
        y += 12;
      }
      if (filtered.some((r) => r.backup)) {
        y += 6;
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text('* = backup run (lifted/braked/aborted — excluded from predictions)', 40, y);
        doc.setTextColor(0);
      }
      const stamp = new Date().toISOString().slice(0, 10);
      doc.save(`big-pickle-runs-${dist === 'all' ? 'all' : dist.replace('/', '-')}-${stamp}.pdf`);
      toast(`Exported ${filtered.length} run${filtered.length === 1 ? '' : 's'} to PDF.`);
    } catch (e) {
      toast('PDF export failed: ' + (e.message || e), 'error');
    }
  };

  // Flag/unflag a run for admin review (team content moderation). The flag
  // syncs through the sheet's Flagged column so the whole crew sees it.
  const doFlag = (run) => {
    update((s) => {
      const r = s.runs.find((x) => x.id === run.id);
      if (r) r.flagged = r.flagged ? undefined : true;
    });
    toast(run.flagged ? 'Flag removed.' : 'Flagged for review.');
  };

  // Deleting tombstones the run so the team sync doesn't resurrect it —
  // the tombstone propagates to the sheet on the next sync.
  const doDelete = (id) => update((s) => {
    const run = s.runs.find((r) => r.id === id);
    if (run && run.source !== 'demo') {
      s.deletedKeys = s.deletedKeys || [];
      const k = tombstoneKey(run, s.cars);
      if (!s.deletedKeys.includes(k)) {
        s.deletedKeys.push(k);
        if (s.deletedKeys.length > 500) s.deletedKeys = s.deletedKeys.slice(-500);
      }
    }
    s.runs = s.runs.filter((r) => r.id !== id);
  });

  if (mode === 'compare') return <CompareView runs={filterDistance(carRuns, dist)} baseline={baseline} onBack={() => setMode('list')} />;
  if (mode === 'import') return <ImportView state={state} update={update} toast={toast} onBack={() => setMode('list')} onDone={() => setMode('list')} />;

  return (
    <div className="space-y-3">
      <SimilarAirSearch runs={carRuns} />
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={dist} onChange={setDist} options={[
          { value: 'all', label: 'All' }, { value: '1/4', label: '1/4 mi' }, { value: '1/8', label: '1/8 mi' },
        ]} />
        <Segmented value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'All' }, { value: 'today', label: 'Today' }, { value: 'issues', label: filter === 'issues' ? 'Hide issues' : 'Issues' }, { value: 'local', label: 'Local' },
        ]} />
      </div>

      <div className="flex items-end gap-2">
        <Field label="Search" className="min-w-0 flex-1">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Track, notes, type…" className={inputCls} />
        </Field>
        <Field label="Sort by" className="w-32 flex-none">
          <select value={sort} onChange={(e) => setSort(e.target.value)} className={inputCls}>
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        <Btn kind="ghost" onClick={() => setMode('compare')}><span className="flex items-center gap-2"><Icon name="chart" className="h-4 w-4" />Compare</span></Btn>
        <Btn kind="ghost" onClick={() => setMode('import')}><span className="flex items-center gap-2"><Icon name="upload" className="h-4 w-4" />Import</span></Btn>
        <Btn kind="ghost" onClick={doExport}><span className="flex items-center gap-2"><Icon name="download" className="h-4 w-4" />Export CSV</span></Btn>
        <Btn kind="ghost" onClick={doExportPdf}><span className="flex items-center gap-2"><Icon name="download" className="h-4 w-4" />Export PDF</span></Btn>
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
              onEdit={role?.canLog ? (run) => onAddRun(run.id) : null} onDelete={role?.canDelete ? doDelete : null} onPrint={onPrint} onFlag={doFlag} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Similar-air search ---------------- */

function SimilarAirSearch({ runs }) {
  const [open, setOpen] = useState(false);
  const [targetDA, setTargetDA] = useState('');
  const [band, setBand] = useState('500');
  const pool = (runs || []).filter((r) => r.source !== 'demo' && !r.backup && r.daFt != null);

  const tda = parseFloat(targetDA);
  const b = parseFloat(band) || 500;
  const matches = !isNaN(tda)
    ? pool
        .filter((r) => Math.abs(r.daFt - tda) <= b)
        .sort((a, b2) => Math.abs(a.daFt - tda) - Math.abs(b2.daFt - tda))
    : [];
  const ets = matches.map((r) => (r.distance === '1/8' ? r.eighthET : r.et)).filter((v) => v != null);
  const avgET = ets.length ? ets.reduce((a, c) => a + c, 0) / ets.length : null;

  return (
    <Card>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between">
        <SectionTitle>Similar air search</SectionTitle>
        <span className="text-xs text-white/40">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="pt-2">
          <div className="grid grid-cols-2 gap-2">
            <input value={targetDA} onChange={(e) => setTargetDA(e.target.value.replace(/[^0-9.-]/g, ''))} inputMode="numeric" placeholder="Target DA (ft)" className={inputCls} />
            <select value={band} onChange={(e) => setBand(e.target.value)} className={inputCls}>
              <option value="250">±250 ft</option>
              <option value="500">±500 ft</option>
              <option value="1000">±1000 ft</option>
            </select>
          </div>
          <div className="mt-1 text-xs text-white/40">What did we run last time conditions were like this?</div>
          {!isNaN(tda) && (
            <div className="mt-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold text-white/60">{matches.length} match{matches.length === 1 ? '' : 'es'}</span>
                {avgET != null && <Badge tone="green">Avg ET {avgET.toFixed(3)}</Badge>}
              </div>
              {matches.length === 0 ? (
                <div className="text-sm text-white/40">No runs within ±{b} ft of {tda} ft DA.</div>
              ) : (
                <div className="space-y-1.5">
                  {matches.slice(0, 20).map((r) => {
                    const et = r.distance === '1/8' ? r.eighthET : r.et;
                    return (
                      <div key={r.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                        <div>
                          <span className="text-white/40">{r.date}</span>{' '}
                          <span className="font-semibold">{et != null ? Number(et).toFixed(3) : '—'}</span>
                          <span className="text-white/40"> · {r.track} · {r.distance}</span>
                        </div>
                        <div className="font-mono text-xs text-white/50">
                          DA {Math.round(r.daFt)} ({r.daFt >= tda ? '+' : ''}{Math.round(r.daFt - tda)})
                        </div>
                      </div>
                    );
                  })}
                  {matches.length > 20 && (
                    <div className="text-center text-xs text-white/40">+{matches.length - 20} more</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
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
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-medium text-pickle-400 hover:text-pickle-300"><Icon name="chevR" className="h-4 w-4 rotate-180" />Back to runs</button>
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
    if (f.size > 25 * 1024 * 1024) {
      setResult({ runs: [], errors: ['File is too large (25 MB max).'], name: f.name });
      e.target.value = '';
      return;
    }
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
    takeSnapshot(state, `Before import (${result.runs.length} runs)`);
    update((s) => { s.runs.push(...result.runs); });
    toast(`Imported ${result.runs.length} runs.`);
    onDone();
  };

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-medium text-pickle-400 hover:text-pickle-300"><Icon name="chevR" className="h-4 w-4 rotate-180" />Back to runs</button>
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
          {result.runs.length > 0 && (
            <div className={`mb-2 text-xs ${(result.airData ?? 0) === 0 ? 'text-amber-300' : 'text-white/50'}`}>
              {(result.airData ?? 0) === 0
                ? '⚠ No air data found — Temp/Altitude (or DA) columns were not recognized. The predictor, cheat sheet and Insight tab need air data.'
                : `${result.airData} of ${result.runs.length} runs have air data.`}
            </div>
          )}
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
