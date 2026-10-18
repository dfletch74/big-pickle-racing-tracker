import { useEffect, useRef, useState } from 'react';
import { Modal, Card, SectionTitle, Btn, Field, inputCls, Badge } from '../components/ui';
import { uid, makeDemoState } from '../lib/store';
import { runsForCar } from '../lib/stats';
import { runsToCSV, downloadFile } from '../lib/io';
import { fmtET, fmtMPH, fmtRT, fmtTemp, fmtDA, fmtDate, isNum } from '../lib/format';

/* ---------------- Garage ---------------- */

export function GarageModal({ state, update, toast, onClose }) {
  const [form, setForm] = useState({ name: '', year: '', make: '', model: '' });
  const [editingId, setEditingId] = useState(null);

  const save = () => {
    const name = form.name.trim();
    if (!name) { toast('Give the car a name.', 'error'); return; }
    const wasEditing = !!editingId;
    const id = editingId || uid();
    update((s) => {
      if (wasEditing) {
        const c = s.cars.find((x) => x.id === id);
        if (c) Object.assign(c, { name, year: form.year.trim(), make: form.make.trim(), model: form.model.trim() });
      } else {
        s.cars.push({ id, name, year: form.year.trim(), make: form.make.trim(), model: form.model.trim() });
        // A new car starts clean and becomes active — its runs, setups and
        // analysis are fully separate from the other cars.
        s.activeCarId = id;
      }
    });
    setForm({ name: '', year: '', make: '', model: '' });
    setEditingId(null);
    toast(wasEditing ? 'Car updated.' : `Car added — switched to ${name}.`);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ name: '', year: '', make: '', model: '' });
  };

  const remove = (id) => {
    const n = runsForCar(state, id).length;
    if (n > 0) { toast(`That car has ${n} runs — delete its runs first.`, 'error'); return; }
    if (state.cars.length === 1) { toast('You need at least one car.', 'error'); return; }
    if (!window.confirm('Delete this car?')) return;
    update((s) => {
      s.cars = s.cars.filter((c) => c.id !== id);
      if (s.activeCarId === id) s.activeCarId = s.cars[0].id;
    });
    toast('Car deleted.');
  };

  return (
    <Modal title="Garage" onClose={onClose} wide>
      <div className="mb-2 text-xs text-white/45">
        Every car keeps its own runs, setups and analysis — switching cars switches all numbers on every screen.
      </div>
      <div className="space-y-2">
        {state.cars.map((c) => (
          <div key={c.id} className={`flex items-center justify-between gap-2 rounded-xl border p-3 ${c.id === state.activeCarId ? 'border-pickle-500/50 bg-pickle-500/5' : 'border-white/10'}`}>
            <div className="min-w-0">
              <div className="font-bold">{c.name} {c.id === state.activeCarId && <Badge tone="green">ACTIVE</Badge>}</div>
              <div className="text-xs text-white/45">{[c.year, c.make, c.model].filter(Boolean).join(' ')} · {runsForCar(state, c.id).length} runs</div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              {c.id !== state.activeCarId && <Btn kind="ghost" onClick={() => { update((s) => { s.activeCarId = c.id; }); toast(`Switched to ${c.name} — all screens now show its numbers.`); }} className="!py-1.5 text-xs">Use</Btn>}
              <Btn kind="quiet" onClick={() => { setEditingId(c.id); setForm({ name: c.name, year: c.year, make: c.make, model: c.model }); }} className="!py-1.5 text-xs">Edit</Btn>
              <Btn kind="quiet" onClick={() => remove(c.id)} className="!py-1.5 text-xs text-red-400/80">Delete</Btn>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Name *"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="Big Pickle" autoComplete="off" /></Field>
        <Field label="Year"><input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className={inputCls} autoComplete="off" /></Field>
        <Field label="Make"><input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} className={inputCls} autoComplete="off" /></Field>
        <Field label="Model"><input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className={inputCls} autoComplete="off" /></Field>
      </div>
      {/* sticky action bar — always tappable, even with the keyboard open */}
      <div className="sticky bottom-0 -mx-5 -mb-5 mt-4 flex gap-2 border-t border-white/10 bg-coal-900/95 px-5 py-4 backdrop-blur">
        <Btn onClick={save} className="flex-1 !py-3 text-base">{editingId ? 'Save car' : 'Add car'}</Btn>
        {editingId && <Btn kind="ghost" onClick={cancelEdit}>Cancel</Btn>}
      </div>
    </Modal>
  );
}

/* ---------------- Tree simulator ---------------- */

const TREE_DELAY = { '400': 0.4, '500': 0.5 };

export function TreeSimModal({ state, update, toast, onClose }) {
  const [racerId, setRacerId] = useState(state.racers[0]?.id || '');
  const [tree, setTree] = useState('400');
  const [mode, setMode] = useState('pro'); // pro | sportsman
  const [phase, setPhase] = useState('idle'); // idle|staged|holding|running|done
  const [lit, setLit] = useState([]);
  const [lastRT, setLastRT] = useState(null);
  const [newName, setNewName] = useState('');
  const timers = useRef([]);
  const greenAt = useRef(0);

  const racer = state.racers.find((r) => r.id === racerId);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clearTimers, []);

  const later = (ms, fn) => timers.current.push(setTimeout(fn, ms));

  const stage = () => { setLit(['pre', 'stage']); setPhase('staged'); setLastRT(null); };

  const holdStart = () => {
    if (phase !== 'staged') return;
    setPhase('holding');
    // brief "ready" beat, then the tree runs
    later(600, () => {
      setPhase('running');
      const d = TREE_DELAY[tree] * 1000;
      const t0 = performance.now();
      if (mode === 'sportsman') {
        setLit(['pre', 'stage', 'a1']); later(d, () => setLit(['pre', 'stage', 'a1', 'a2'])); later(2 * d, () => setLit(['pre', 'stage', 'a1', 'a2', 'a3']));
        greenAt.current = t0 + 3 * d;
        later(3 * d, () => setLit((l) => [...l, 'green']));
      } else {
        setLit(['pre', 'stage', 'a1', 'a2', 'a3']);
        greenAt.current = t0 + d;
        later(d, () => setLit((l) => [...l, 'green']));
      }
    });
  };

  const holdEnd = () => {
    if (phase !== 'running') { if (phase === 'holding') { clearTimers(); setPhase('staged'); } return; }
    const now = performance.now();
    const rt = (now - greenAt.current) / 1000;
    const red = rt < 0;
    clearTimers();
    setLit((l) => (red ? [...l, 'red'] : l));
    setPhase('done');
    setLastRT({ rt, red });
    update((s) => {
      const r = s.racers.find((x) => x.id === racerId);
      if (r) r.attempts.push({ rt: Math.round(rt * 1000) / 1000, red, date: new Date().toISOString().slice(0, 10), tree, mode });
    });
  };

  const reset = () => { clearTimers(); setLit([]); setPhase('idle'); setLastRT(null); };

  const addRacer = () => {
    const n = newName.trim();
    if (!n) return;
    const id = uid();
    update((s) => { s.racers.push({ id, name: n, attempts: [] }); });
    setRacerId(id);
    setNewName('');
  };

  const stats = (r) => {
    const clean = r.attempts.filter((a) => !a.red);
    const rl = r.attempts.length - clean.length;
    return {
      n: r.attempts.length, rl,
      avg: clean.length ? clean.reduce((a, b) => a + b.rt, 0) / clean.length : null,
      best: clean.length ? Math.min(...clean.map((a) => a.rt)) : null,
      worst: clean.length ? Math.max(...clean.map((a) => a.rt)) : null,
    };
  };

  const ranked = [...state.racers].map((r) => ({ r, s: stats(r) })).sort((a, b) => (a.s.avg ?? 9) - (b.s.avg ?? 9));

  const bulb = (id, color, size = 'h-10 w-10') => (
    <div className={`${size} rounded-full border-2 ${lit.includes(id) ? '' : 'opacity-25'}`}
      style={lit.includes(id) ? { background: color, borderColor: color, boxShadow: `0 0 18px ${color}` } : { borderColor: '#333', background: '#111' }} />
  );

  return (
    <Modal title="Tree simulator" onClose={onClose}>
      <div className="mb-3 flex flex-wrap gap-2">
        <select value={racerId} onChange={(e) => setRacerId(e.target.value)} className={`${inputCls} flex-1`}>
          {state.racers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select value={tree} onChange={(e) => setTree(e.target.value)} className={inputCls}>
          <option value="400">.400 Pro tree</option>
          <option value="500">.500 Sportsman</option>
        </select>
        <select value={mode} onChange={(e) => setMode(e.target.value)} className={inputCls}>
          <option value="pro">Pro</option>
          <option value="sportsman">Sportsman</option>
        </select>
      </div>
      <div className="mb-3 flex gap-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New racer name…" className={`${inputCls} flex-1`} />
        <Btn kind="ghost" onClick={addRacer}>Add</Btn>
      </div>

      {/* the tree */}
      <div className="mb-3 flex justify-center gap-3 rounded-2xl bg-black p-5">
        <div className="flex flex-col items-center gap-2">
          {bulb('pre', '#3b82f6', 'h-6 w-6')}{bulb('stage', '#3b82f6', 'h-6 w-6')}
        </div>
        <div className="flex items-center gap-2">
          {bulb('a1', '#fbbf24')}{bulb('a2', '#fbbf24')}{bulb('a3', '#fbbf24')}
        </div>
        <div className="flex items-center gap-2">
          {bulb('green', '#22c55e')}{bulb('red', '#ef4444')}
        </div>
      </div>

      <div className="mb-1 text-center text-sm text-white/60">
        {phase === 'idle' && 'Tap STAGE, then press and HOLD — release on green.'}
        {phase === 'staged' && 'Staged. Press and HOLD the button.'}
        {phase === 'holding' && 'Get ready…'}
        {phase === 'running' && 'RELEASE ON GREEN!'}
        {phase === 'done' && lastRT && (lastRT.red
          ? <span className="font-bold text-red-400">RED LIGHT — {lastRT.rt.toFixed(3)} (foul)</span>
          : <span className="font-bold text-pickle-400">R/T {lastRT.rt.toFixed(3)}</span>)}
      </div>

      <div className="flex gap-2">
        {phase === 'idle' && <Btn onClick={stage} className="flex-1 !py-3">TAP TO STAGE</Btn>}
        {(phase === 'staged' || phase === 'holding' || phase === 'running') && (
          <button
            onMouseDown={holdStart} onMouseUp={holdEnd} onMouseLeave={holdEnd}
            onTouchStart={(e) => { e.preventDefault(); holdStart(); }} onTouchEnd={(e) => { e.preventDefault(); holdEnd(); }}
            className="flex-1 select-none rounded-xl bg-pickle-500 py-4 font-black text-black active:bg-pickle-400"
          >HOLD — LAUNCH</button>
        )}
        {phase === 'done' && <><Btn onClick={stage} className="flex-1 !py-3">STAGE AGAIN</Btn><Btn kind="ghost" onClick={reset}>Reset</Btn></>}
      </div>

      <div className="mt-4">
        <SectionTitle>Racer rankings</SectionTitle>
        {ranked.map(({ r, s }, i) => (
          <div key={r.id} className="flex items-center justify-between border-t border-white/5 py-1.5 text-sm first:border-0">
            <span>#{i + 1} <b>{r.name}</b> <span className="text-white/40">· {s.n} attempts</span></span>
            <span className="font-mono text-xs">
              avg <b className="text-pickle-400">{s.avg != null ? s.avg.toFixed(3) : '—'}</b>{' '}
              best {s.best != null ? s.best.toFixed(3) : '—'} · RL {s.rl}
            </span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* ---------------- Settings ---------------- */

export function SettingsModal({ state, update, reset, toast, onClose }) {
  const loadDemo = () => {
    if (!window.confirm('Load demo data? This REPLACES everything currently in the app.')) return;
    reset(makeDemoState());
    toast('Demo data loaded — clearly fake, delete anytime.');
    onClose();
  };
  const clearAll = () => {
    if (!window.confirm('Delete ALL runs, notes, events and racers? The car and tracks stay.')) return;
    update((s) => { s.runs = []; s.trackNotes = []; s.events = []; s.presets = []; s.racers.forEach((r) => { r.attempts = []; }); });
    toast('All data cleared.');
  };
  const backup = () => {
    downloadFile(`big-pickle-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 2), 'application/json');
    toast('Full backup downloaded (JSON).');
  };
  const car = state.cars.find((c) => c.id === state.activeCarId);
  const exportCSV = () => {
    // Per-car separation: CSV exports the active car's runs only.
    const carRuns = runsForCar(state, state.activeCarId);
    downloadFile(`big-pickle-runs-${new Date().toISOString().slice(0, 10)}.csv`, runsToCSV(carRuns));
    toast(`Exported ${carRuns.length} runs (${car?.name || 'car'}) to CSV.`);
  };

  return (
    <Modal title="Settings" onClose={onClose}>
      <SectionTitle>Data</SectionTitle>
      <div className="mb-4 flex flex-wrap gap-2">
        <Btn kind="ghost" onClick={exportCSV}>Export runs (CSV)</Btn>
        <Btn kind="ghost" onClick={backup}>Full backup (JSON)</Btn>
      </div>
      <SectionTitle>Demo data</SectionTitle>
      <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200/90">
        Demo data is 36 clearly-synthetic runs for trying the app. Loading it <b>replaces</b> your current data. Remove it anytime with "Clear all data".
      </div>
      <div className="mb-4"><Btn kind="ghost" onClick={loadDemo}>Load demo data</Btn></div>
      <SectionTitle>Danger zone</SectionTitle>
      <Btn kind="ghost" onClick={clearAll} className="!border-red-500/40 !text-red-300">Clear all data</Btn>
      <div className="mt-6 text-[11px] text-white/35">
        Local-first: everything lives in this browser's localStorage. No account, no server, no tracking.
        Density altitude uses the standard humidity-corrected formula; ET/MPH weather correction is a simplified
        air-density-ratio model (documented in src/lib/physics.js) — directionally correct: thinner air = slower.
      </div>
    </Modal>
  );
}

/* ---------------- Printable run sheet ---------------- */

export function PrintSheet({ run, baseline }) {
  if (!run) return null;
  return (
    <div className="print-sheet p-8">
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>Big Pickle Racing — Timeslip</h1>
      <p>{run.track} · {fmtDate(run.date)}{run.time ? ` · ${run.time}` : ''} · {run.distance} mile · {run.runType}</p>
      <table style={{ width: '100%', marginTop: 16, borderCollapse: 'collapse' }} border="1" cellPadding="8">
        <tbody>
          <tr><td>Reaction</td><td><b>{fmtRT(run.rt)}</b></td><td>60 ft</td><td><b>{isNum(run.sixty) ? run.sixty.toFixed(3) : '—'}</b></td></tr>
          <tr><td>330 ft</td><td>{isNum(run.threeThirty) ? run.threeThirty.toFixed(3) : '—'}</td><td>1/8 ET / MPH</td><td>{fmtET(run.eighthET)} / {fmtMPH(run.eighthMPH)}</td></tr>
          <tr><td>1000 ft</td><td>{isNum(run.thousand) ? run.thousand.toFixed(3) : '—'}</td><td>1/4 ET / MPH</td><td><b>{fmtET(run.et)} / {fmtMPH(run.mph)}</b></td></tr>
          <tr><td>Temp / Humidity</td><td>{fmtTemp(run.tempF)} / {run.humidity ?? '—'}%</td><td>DA (corr. baseline {baseline.toLocaleString()} ft)</td><td>{fmtDA(run.daFt)}</td></tr>
        </tbody>
      </table>
      <p style={{ marginTop: 12 }}>Setup: Jet {run.jet ?? '—'} · PSI {run.lPsi ?? '—'}/{run.rPsi ?? '—'} · Bar {run.lBar ?? '—'}/{run.rBar ?? '—'} · Comp {run.comp ?? '—'} · Reb {run.rebound ?? '—'} · Rev {run.revLim ?? '—'}</p>
      {run.notes && <p>Notes: {run.notes}</p>}
    </div>
  );
}
