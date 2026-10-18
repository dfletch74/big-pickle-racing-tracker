import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Card, SectionTitle, Btn, Field, inputCls, Badge, Icon } from '../components/ui';
import { uid, makeDemoState } from '../lib/store';
import { runsForCar } from '../lib/stats';
import { runsToCSV, downloadFile } from '../lib/io';
import { syncTeamData, teamCsvUrl, teamSyncOnOpen, TEAM_CSV_DEFAULT_URL } from '../lib/teamSync';
import { APP_VERSION } from '../version';
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
    const car = state.cars.find((c) => c.id === id);
    if (!car) return;
    if (state.cars.length === 1) { toast('You need at least one car.', 'error'); return; }
    const n = runsForCar(state, id).length;
    const noun = n === 1 ? 'run' : 'runs';
    if (!window.confirm(`Delete "${car.name}"${n > 0 ? ` and its ${n} ${noun}` : ''}? This can't be undone.`)) return;
    update((s) => {
      s.cars = s.cars.filter((c) => c.id !== id);
      s.runs = s.runs.filter((r) => r.carId !== id);
      if (s.activeCarId === id) s.activeCarId = s.cars[0].id;
    });
    toast(n > 0 ? `Deleted ${car.name} and its ${n} ${noun}.` : `Deleted ${car.name}.`);
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

/* Native tap: React attaches touchstart as a PASSIVE listener, so calling
   preventDefault() in a React onTouchStart is silently a no-op — iOS then
   fires emulated mousedown/mouseup/click after every touch, and those ghosts
   land on whatever re-rendered under the finger (e.g. STAGE AGAIN), wiping
   results. This attaches a real non-passive touchstart that prevents the
   emulation and fires the action directly. Desktop still uses onClick. */
function useNativeTap(fn) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const elRef = useRef(null);
  return useCallback((el) => {
    const old = elRef.current;
    if (old && old._ntap) { old.removeEventListener('touchstart', old._ntap); old._ntap = null; }
    elRef.current = el;
    if (el) {
      const ts = (e) => { e.preventDefault(); fnRef.current(); };
      el._ntap = ts;
      el.addEventListener('touchstart', ts, { passive: false });
    }
  }, []);
}

/* ---------------- Tree simulator ---------------- */

const TREE_DELAY = { '400': 0.4, '500': 0.5 };

function TreeBulb({ on, color, className = 'h-16 w-16' }) {
  return (
    <div
      className={`${className} rounded-full transition-all duration-150`}
      style={
        on
          ? {
              background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.55), rgba(255,255,255,0) 46%), ${color}`,
              boxShadow: `0 0 26px ${color}, 0 0 6px ${color}`,
            }
          : {
              background: '#0a0c10',
              border: '1px solid rgba(255,255,255,0.07)',
              boxShadow: 'inset 0 3px 10px rgba(0,0,0,0.85)',
            }
      }
    />
  );
}

function TreeSeg({ options, value, onChange, labelClass = '', compact = false }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-2xl font-bold transition active:scale-[0.98] ${compact ? 'py-2.5 text-[15px]' : 'py-3.5 text-[17px]'} ${labelClass} ${
            value === o.value ? 'bg-pickle-400 text-black shadow-glow' : 'bg-white/[0.06] text-white/45 hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function RacerPicker({ racers, racerId, onPick, onAdd, onClose }) {
  const [name, setName] = useState('');
  const avgOf = (r) => {
    const clean = r.attempts.filter((a) => !a.red);
    return clean.length ? clean.reduce((a, b) => a + b.rt, 0) / clean.length : null;
  };
  const add = () => {
    const n = name.trim();
    if (!n) return;
    onAdd(n);
    setName('');
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/75 p-4 sm:items-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-[26px] border border-white/10 bg-[#14161b] p-5 shadow-card"
      >
        <div className="mb-1 flex items-center gap-2.5">
          <Icon name="user" className="h-6 w-6 shrink-0 text-pickle-400" />
          <h2 className="font-display text-[30px] font-bold uppercase leading-none tracking-[0.04em]">
            Who&apos;s on the tree?
          </h2>
        </div>
        <p className="mb-4 text-[15px] leading-snug text-white/45">
          Pick a racer or add a new one — reaction times are tracked per racer.
        </p>
        <div className="max-h-[38vh] space-y-2 overflow-y-auto">
          {racers.map((r) => {
            const a = avgOf(r);
            const active = r.id === racerId;
            return (
              <button
                key={r.id}
                onClick={() => onPick(r.id)}
                className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-left transition active:scale-[0.99] ${
                  active
                    ? 'border-pickle-500/60 bg-pickle-500/[0.08]'
                    : 'border-white/[0.08] bg-white/[0.03] hover:border-white/20'
                }`}
              >
                <span className="text-[17px] font-semibold">{r.name}</span>
                <span className="font-mono text-sm text-white/45">avg {a != null ? a.toFixed(3) : '—'}</span>
              </button>
            );
          })}
          {!racers.length && <div className="py-4 text-center text-sm text-white/40">No racers yet — add one below.</div>}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="New racer name…"
            className={`${inputCls} flex-1 !rounded-2xl !bg-white/[0.05] !py-3.5`}
            autoComplete="off"
          />
          <button
            onClick={add}
            className="flex items-center gap-1.5 rounded-2xl bg-pickle-500 px-5 font-display text-xl font-bold uppercase tracking-wide text-black transition hover:bg-pickle-400 active:scale-95"
          >
            <Icon name="plus" className="h-5 w-5" strokeWidth={2.5} /> Add
          </button>
        </div>
      </div>
    </div>
  );
}

export function TreeSimModal({ state, update, toast, onClose }) {
  const [racerId, setRacerId] = useState(state.racers[0]?.id || '');
  const [showPicker, setShowPicker] = useState(true);
  const [tree, setTree] = useState('500');
  const [mode, setMode] = useState('sportsman');
  const [showHelp, setShowHelp] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle|staged|running|done
  const [lit, setLit] = useState([]);
  const [lastRT, setLastRT] = useState(null);
  const timers = useRef([]);
  const greenAt = useRef(0);

  const racer = state.racers.find((r) => r.id === racerId);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clearTimers, []);

  const later = (ms, fn) => timers.current.push(setTimeout(fn, ms));

  const stage = () => { setLit(['pre', 'stage']); setPhase('staged'); setLastRT(null); };

  const holdStart = () => {
    if (phase !== 'staged') return;
    // Tree starts the instant you press — no dead zone. Release on green;
    // releasing early is a red-light foul.
    setPhase('running');
    const d = TREE_DELAY[tree] * 1000;
    const t0 = performance.now();
    if (mode === 'sportsman') {
      setLit(['pre', 'stage', 'a1']);
      later(d, () => setLit(['pre', 'stage', 'a1', 'a2']));
      later(2 * d, () => setLit(['pre', 'stage', 'a1', 'a2', 'a3']));
      greenAt.current = t0 + 3 * d;
      later(3 * d, () => setLit((l) => [...l, 'green']));
    } else {
      setLit(['pre', 'stage', 'a1', 'a2', 'a3']);
      greenAt.current = t0 + d;
      later(d, () => setLit((l) => [...l, 'green']));
    }
  };

  const holdEnd = () => {
    if (phase !== 'running') return;
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

  // Ghost-click-proof wiring (see useNativeTap): the hold button gets real
  // non-passive touch handlers; the stage/reset buttons get native taps.
  // React onMouse* props remain for desktop mouse users.
  const holdStartRef = useRef(null);
  const holdEndRef = useRef(null);
  holdStartRef.current = holdStart;
  holdEndRef.current = holdEnd;
  const holdBtnRef = useRef(null);
  const setHoldBtnRef = (el) => {
    const old = holdBtnRef.current;
    if (old) {
      if (old._hts) old.removeEventListener('touchstart', old._hts);
      if (old._hte) old.removeEventListener('touchend', old._hte);
      if (old._htc) old.removeEventListener('touchcancel', old._htc);
      old._hts = old._hte = old._htc = null;
    }
    holdBtnRef.current = el;
    if (el) {
      const ts = (e) => { e.preventDefault(); holdStartRef.current(); };
      const te = (e) => { e.preventDefault(); holdEndRef.current(); };
      const tc = () => holdEndRef.current();
      el._hts = ts; el._hte = te; el._htc = tc;
      el.addEventListener('touchstart', ts, { passive: false });
      el.addEventListener('touchend', te);
      el.addEventListener('touchcancel', tc);
    }
  };
  const stageTapRef = useNativeTap(stage);
  const resetTapRef = useNativeTap(reset);

  const addRacer = (n) => {
    const id = uid();
    update((s) => { s.racers.push({ id, name: n, attempts: [] }); });
    setRacerId(id);
    setShowPicker(false);
    toast(`Racer added — ${n} is on the tree.`);
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

  const actionBar = (
    <>
      {phase === 'idle' && (
        <button
          ref={stageTapRef}
          onClick={stage}
          className="w-full rounded-2xl bg-white/[0.07] py-4 font-display text-[20px] font-bold uppercase tracking-[0.1em] text-white transition hover:bg-white/[0.1] active:scale-[0.99]"
        >
          Tap to stage
        </button>
      )}
      {(phase === 'staged' || phase === 'running') && (
        <button
          ref={setHoldBtnRef}
          onMouseDown={holdStart} onMouseUp={holdEnd} onMouseLeave={holdEnd}
          onContextMenu={(e) => e.preventDefault()}
          className="w-full select-none rounded-2xl bg-pickle-400 py-4 font-display text-[20px] font-bold uppercase tracking-[0.1em] text-black shadow-glow transition active:bg-pickle-300"
          style={{ touchAction: 'none', WebkitTouchCallout: 'none' }}
        >
          Hold — launch
        </button>
      )}
      {phase === 'done' && (
        <>
          {lastRT && (
            <div className={`mb-2 text-center font-mono text-[26px] font-bold leading-none ${lastRT.red ? 'text-red-400' : 'text-pickle-400'}`}>
              {lastRT.red ? `RED LIGHT ${lastRT.rt.toFixed(3)}` : `R/T ${lastRT.rt.toFixed(3)}`}
            </div>
          )}
          <div className="flex gap-2">
            <button
              ref={stageTapRef}
              onClick={stage}
              className="flex-1 rounded-2xl bg-white/[0.07] py-3.5 font-display text-lg font-bold uppercase tracking-[0.1em] transition hover:bg-white/[0.1] active:scale-[0.99]"
            >
              Stage again
            </button>
            <button
              ref={resetTapRef}
              onClick={reset}
              className="rounded-2xl border border-white/15 px-5 font-display text-lg font-bold uppercase tracking-[0.08em] text-white/70 transition hover:bg-white/5"
            >
              Reset
            </button>
          </div>
        </>
      )}
    </>
  );

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 sm:items-center" onClick={onClose}>
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-coal-950 sm:max-w-md sm:rounded-3xl"
        >
          {/* header — fixed */}
          <div className="flex shrink-0 items-center gap-2.5 px-5 pt-4">
            <Icon name="timer" className="h-5 w-5 shrink-0 text-pickle-400" />
            <h2 className="font-display text-[26px] font-bold uppercase leading-none tracking-[0.06em]">Tree</h2>
            <button
              onClick={() => setShowPicker(true)}
              className="ml-auto flex max-w-[140px] items-center gap-1.5 rounded-full border border-pickle-500/50 px-3 py-1.5 text-[13px] font-semibold text-pickle-300 transition hover:bg-pickle-500/10 active:scale-95"
            >
              <span className="truncate">{racer?.name || 'Pick racer'}</span>
              <Icon name="chevD" className="h-3.5 w-3.5 shrink-0" />
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              <Icon name="x" className="h-5 w-5" />
            </button>
          </div>

          {/* scrollable middle */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
            <div className="space-y-2">
              <TreeSeg
                options={[{ value: '400', label: '.400' }, { value: '500', label: '.500' }]}
                value={tree} onChange={setTree} labelClass="font-mono" compact
              />
              <TreeSeg
                options={[{ value: 'sportsman', label: 'SPORTSMAN' }, { value: 'pro', label: 'PRO' }]}
                value={mode} onChange={setMode} labelClass="font-display tracking-[0.08em]" compact
              />
            </div>

            <button onClick={() => setShowHelp((s) => !s)} className="mx-auto flex items-center gap-1.5 py-2.5 text-sm text-white/55 transition hover:text-white">
              <Icon name="info" className="h-4 w-4" />
              How each tree works
              <Icon name="chevD" className={`h-3.5 w-3.5 transition-transform ${showHelp ? 'rotate-180' : ''}`} />
            </button>
            {showHelp && (
              <div className="mx-auto mb-1 max-w-sm rounded-2xl bg-white/[0.04] p-3.5 text-[13px] leading-relaxed text-white/60">
                <p><b className="text-white/85">Sportsman (.500):</b> the ambers light one at a time, 0.5s apart — leave on the last amber.</p>
                <p className="mt-1.5"><b className="text-white/85">Pro (.400):</b> all three ambers flash together, then green 0.4s later — go when you see amber.</p>
                <p className="mt-1.5">Release the instant you see green. Red means you left early — foul.</p>
              </div>
            )}

            {/* the tree — compact so bulbs + action bar share one screen */}
            <div className="mx-auto mt-1 w-full max-w-[250px] rounded-[22px] border border-white/[0.08] bg-[#12141a] px-6 py-4">
              <div className="flex items-start justify-center gap-8">
                <div className="flex flex-col items-center gap-1.5">
                  <TreeBulb on={lit.includes('pre')} color="#3b82f6" className="h-8 w-8 sm:h-9 sm:w-9" />
                  <span className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">Pre</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <TreeBulb on={lit.includes('stage')} color="#3b82f6" className="h-8 w-8 sm:h-9 sm:w-9" />
                  <span className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">Stage</span>
                </div>
              </div>
              <div className="my-3 h-px bg-white/[0.07]" />
              <div className="space-y-3">
                {[
                  ['a1', 'Amber', '#fbbf24'],
                  ['a2', 'Amber', '#fbbf24'],
                  ['a3', 'Amber', '#fbbf24'],
                  ['green', 'Go', '#22c55e'],
                  ['red', 'Foul', '#ef4444'],
                ].map(([id, label, color]) => (
                  <div key={id} className="flex items-center gap-4">
                    <TreeBulb on={lit.includes(id)} color={color} className="h-11 w-11 sm:h-14 sm:w-14" />
                    <span className="font-display text-[13px] font-semibold uppercase tracking-[0.24em] text-white/45">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3 text-center text-[15px] font-medium text-white/55">
              {phase === 'idle' && 'Tap Stage to begin'}
              {phase === 'staged' && 'Press and HOLD — the tree starts instantly, release on green'}
              {phase === 'running' && <span className="font-bold text-pickle-400">RELEASE ON GREEN!</span>}
              {phase === 'done' && lastRT && (lastRT.red
                ? <span className="font-bold text-red-400">RED LIGHT — {lastRT.rt.toFixed(3)} (foul)</span>
                : <span className="font-bold text-pickle-400">R/T {lastRT.rt.toFixed(3)}</span>)}
            </div>

            {/* rankings */}
            <div className="mb-1 mt-4 rounded-3xl border border-white/[0.08] bg-[#12141a] p-4">
                <div className="mb-2.5 flex items-center gap-2">
                  <Icon name="trophy" className="h-5 w-5 text-pickle-400" />
                <h3 className="font-display text-[20px] font-bold uppercase tracking-[0.06em]">Racer Rankings</h3>
              </div>
              <div className="space-y-2">
                {ranked.map(({ r, s }, i) => {
                  const top = i === 0 && s.n > 0;
                  return (
                    <div
                      key={r.id}
                      className={`rounded-2xl border p-3 ${top ? 'border-pickle-500/50 bg-pickle-500/[0.06]' : 'border-white/[0.06] bg-white/[0.02]'}`}
                    >
                      <div className="mb-1.5 flex items-center gap-1.5">
                        {top && <Icon name="crown" className="h-3.5 w-3.5 shrink-0 text-pickle-400" />}
                        <span className={`truncate text-sm font-bold ${top ? 'text-pickle-300' : ''}`}>{r.name}</span>
                        {top && <span className="shrink-0 text-[11px] text-white/40">· Top</span>}
                        <span className="ml-auto shrink-0 text-[11px] text-white/40">{s.n} att.</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-right font-mono">
                        {[
                          ['AVG', s.avg, s.avg != null],
                          ['BEST', s.best, s.best != null],
                          ['WORST', s.worst, s.worst != null],
                          ['RL', s.rl, true],
                        ].map(([label, v, has]) => (
                          <div key={label}>
                            <div className="text-[9px] uppercase tracking-wider text-white/40">{label}</div>
                            <div className={`text-[13px] font-bold ${label === 'AVG' && has ? 'text-pickle-300' : label === 'RL' && v > 0 ? 'text-red-400' : ''}`}>
                              {label === 'RL' ? v : has ? v.toFixed(3) : '—'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {!ranked.length && <div className="py-2 text-center text-sm text-white/40">No racers yet.</div>}
              </div>
            </div>
          </div>

          {/* sticky action bar — always visible during play */}
          <div
            className="shrink-0 border-t border-white/10 bg-coal-950/95 px-5 pt-3 backdrop-blur"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            {actionBar}
          </div>
        </div>
      </div>

      {showPicker && (
        <RacerPicker
          racers={state.racers}
          racerId={racerId}
          onPick={(id) => { setRacerId(id); setShowPicker(false); }}
          onAdd={addRacer}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}



/* ---------------- Settings ---------------- */

function bundleHash() {
  try {
    const src = [...document.scripts].map((x) => x.src).find((u) => /index-[A-Za-z0-9_-]+\.js/.test(u)) || '';
    const m = src.match(/index-([A-Za-z0-9_-]+)\.js/);
    return m ? m[1] : 'dev';
  } catch {
    return 'dev';
  }
}

export function SettingsModal({ state, update, reset, toast, onClose }) {
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [teamUrl, setTeamUrl] = useState(teamCsvUrl(state));
  const current = bundleHash();
  const loadDemo = () => {
    if (!window.confirm('Load demo data? This REPLACES everything currently in the app.')) return;
    reset(makeDemoState());
    toast('Demo data loaded — clearly fake, delete anytime.');
    onClose();
  };
  const clearAll = () => {
    if (!window.confirm('Delete ALL runs, notes, events and racers from THIS DEVICE? The car and tracks stay. The GitHub team sheet is not touched.')) return;
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
    const carNameOf = (id) => state.cars.find((c) => c.id === id)?.name || '';
    downloadFile(`big-pickle-runs-${new Date().toISOString().slice(0, 10)}.csv`, runsToCSV(carRuns, carNameOf));
    toast(`Exported ${carRuns.length} runs (${car?.name || 'car'}) to CSV.`);
  };

  // Team data: pull the shared sheet from GitHub on demand.
  const syncNow = async () => {
    setSyncing(true);
    try {
      const { added, carNames } = await syncTeamData(state, update);
      toast(`Team data synced — ${added} runs (${carNames.join(', ')}).`);
    } catch (e) {
      toast(`Team sync failed: ${e.message}`, 'error');
    }
    setSyncing(false);
  };
  const saveTeamUrl = () => {
    update((s) => { s.settings = s.settings || {}; s.settings.teamCsvUrl = teamUrl.trim() || TEAM_CSV_DEFAULT_URL; });
    setTeamUrl(teamUrl.trim() || TEAM_CSV_DEFAULT_URL);
    toast('Team sheet URL saved.');
  };
  const toggleAutoSync = () => {
    update((s) => { s.settings = s.settings || {}; s.settings.teamSyncOnOpen = !teamSyncOnOpen(s); });
  };
  const lastSync = state.settings?.lastTeamSync ? new Date(state.settings.lastTeamSync) : null;

  // iOS home-screen apps cache aggressively — this lets the user pull a new
  // version on demand without deleting the icon (data is preserved).
  const checkForUpdate = async () => {
    setChecking(true);
    try {
      const base = import.meta.env.BASE_URL;
      const res = await fetch(`${base}index.html?ts=${Date.now()}`, { cache: 'no-store' });
      const html = await res.text();
      const m = html.match(/assets\/index-([A-Za-z0-9_-]+)\.js/);
      if (m && m[1] !== current) {
        if (window.confirm(`Version ${m[1].slice(0, 7)} is available (you have ${current.slice(0, 7)}). Reload now to update?`)) {
          window.location.href = `${base}?v=${Date.now()}`;
        }
      } else if (m) {
        toast('You are on the latest version.');
      } else {
        toast('Could not read the latest version.', 'error');
      }
    } catch (e) {
      toast('Update check failed — are you online?', 'error');
    }
    setChecking(false);
  };

  return (
    <Modal title="Settings" onClose={onClose}>
      <SectionTitle>Data</SectionTitle>
      <div className="mb-4 flex flex-wrap gap-2">
        <Btn kind="ghost" onClick={exportCSV}>Export runs (CSV)</Btn>
        <Btn kind="ghost" onClick={backup}>Full backup (JSON)</Btn>
      </div>
      <SectionTitle>Team data</SectionTitle>
      <div className="mb-2 text-xs text-white/50">
        Pulls the shared run sheet from GitHub into the Big Pickle car on every open.
        Runs you log in the app are never touched; spreadsheet edits flow in on the next sync.
        {lastSync && <span className="text-white/70"> Last synced {lastSync.toLocaleString()} ({state.settings?.lastTeamSyncCount ?? 0} runs).</span>}
      </div>
      <div className="mb-2 flex gap-2">
        <Btn kind="ghost" onClick={syncNow} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync now'}</Btn>
        <Btn kind={teamSyncOnOpen(state) ? 'ghost' : 'quiet'} onClick={toggleAutoSync}>
          Auto-sync: {teamSyncOnOpen(state) ? 'on' : 'off'}
        </Btn>
      </div>
      <div className="mb-4 flex gap-2">
        <input value={teamUrl} onChange={(e) => setTeamUrl(e.target.value)} placeholder="Team CSV URL" className={`${inputCls} min-w-0 flex-1 font-mono !text-xs`} />
        <Btn kind="quiet" onClick={saveTeamUrl} className="shrink-0 !py-1.5 text-xs">Save</Btn>
      </div>
      <SectionTitle>Demo data</SectionTitle>
      <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200/90">
        Demo data is ~36 clearly-fake runs (2025–2026, 3 tracks) for trying the app's charts and predictors.
        Loading it <b>replaces</b> everything currently on this device. Remove it anytime with "Clear all data".
      </div>
      <div className="mb-4"><Btn kind="ghost" onClick={loadDemo}>Load demo data</Btn></div>
      <SectionTitle>Danger zone</SectionTitle>
      <div className="mb-2 text-xs text-white/50">Clear all data wipes this device's local data only — the GitHub team sheet is never touched.</div>
      <Btn kind="ghost" onClick={clearAll} className="!border-red-500/40 !text-red-300">Clear all data</Btn>
      <div className="mt-6 text-[11px] text-white/35">
        Local-first: everything lives in this browser's localStorage. No account, no server, no tracking.
        The team sheet sync is a one-way pull from your GitHub file — the app never sends data anywhere.
        Density altitude uses the standard humidity-corrected formula; ET/MPH weather correction is a simplified
        air-density-ratio model (documented in src/lib/physics.js) — directionally correct: thinner air = slower.
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
        <span className="font-mono text-[11px] text-white/40">v{APP_VERSION} <span className="text-white/25">({current.slice(0, 7)})</span></span>
        <Btn kind="ghost" onClick={checkForUpdate} disabled={checking} className="!py-1.5 text-xs">
          {checking ? 'Checking…' : 'Check for updates'}
        </Btn>
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
