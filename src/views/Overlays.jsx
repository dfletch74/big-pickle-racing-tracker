import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, SectionTitle, Btn, Field, inputCls, Badge, Icon } from '../components/ui';
import { uid, makeDemoState } from '../lib/store';
import { runsForCar } from '../lib/stats';
import { runsToCSV, downloadFile } from '../lib/io';
import { syncTeamData, teamCsvUrl, teamSyncOnOpen, getPat, setPat, TEAM_CSV_DEFAULT_URL } from '../lib/teamSync';
import { APP_VERSION } from '../version';
import { fmtET, fmtMPH, fmtRT, fmtTemp, fmtDA, fmtDate, isNum } from '../lib/format';
import { getUser } from '../lib/roles';
import { pullRacers, publishRacers, pruneRacersToCrew } from '../lib/teamSync';
import { makeSetupLink } from '../lib/setupLink';
import { takeSnapshot, listSnapshots, getSnapshot, deleteSnapshot, dropTombstonesForRuns } from '../lib/snapshots';
import QRCode from 'qrcode';

/* ---------------- Garage ---------------- */

export function GarageModal({ state, update, toast, onClose, role }) {
  const canEdit = role?.canLog ?? true;
  const canDelete = role?.canDelete ?? true;
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
              {canEdit && (
                <Btn kind="quiet" onClick={() => { setEditingId(c.id); setForm({ name: c.name, year: c.year, make: c.make, model: c.model }); }} className="!py-1.5 text-xs">Edit</Btn>
              )}
              {canDelete && (
                <Btn kind="quiet" onClick={() => remove(c.id)} className="!py-1.5 text-xs text-red-400/80">Delete</Btn>
              )}
            </div>
          </div>
        ))}
      </div>
      {canEdit && (
        <>
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
        </>
      )}
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
  useEffect(() => { fnRef.current = fn; });
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

function RacerPicker({ racers, racerId, onPick, onClose }) {
  const avgOf = (r) => {
    const clean = r.attempts.filter((a) => !a.red);
    return clean.length ? clean.reduce((a, b) => a + b.rt, 0) / clean.length : null;
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
          Pick a racer — reaction times are tracked per crew member.
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
          {!racers.length && <div className="py-4 text-center text-sm text-white/40">No racers yet.</div>}
        </div>
      </div>
    </div>
  );
}

export function TreeSimModal({ state, update, toast, onClose, roleId, users }) {
  const [racerId, setRacerId] = useState(() => {
    const label = roleId ? getUser(users, roleId)?.name : null;
    if (label) {
      const match = state.racers.find((r) => r.name.toLowerCase() === label.toLowerCase());
      if (match) return match.id;
    }
    return state.racers[0]?.id || '';
  });

  // Pull shared racer stats on open; publish on close (if a token is saved).
  useEffect(() => {
    pullRacers(state, update)
      .then(() => pruneRacersToCrew(update, users))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = () => {
    publishRacers(state).catch(() => {});
    onClose();
  };
  const [showPicker, setShowPicker] = useState(true);
  const [tree, setTree] = useState('500');
  const [mode, setMode] = useState('sportsman');
  const [showHelp, setShowHelp] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle|staged|running|done
  const [lit, setLit] = useState([]);
  const [lastRT, setLastRT] = useState(null);
  const [delayBox, setDelayBox] = useState(() => state.settings?.delayBox || 0);
  const [crossTalk, setCrossTalk] = useState(false);
  const [oppLit, setOppLit] = useState([]);
  const timers = useRef([]);
  const greenAt = useRef(0);

  // Delay box persists in settings so it survives closing the Tree.
  const persistDelay = (v) => {
    update((s) => { s.settings = s.settings || {}; s.settings.delayBox = Math.round(v * 1000) / 1000; });
  };
  const bumpDelay = (delta) => {
    const v = Math.min(1, Math.max(0, Math.round((delayBox + delta) * 1000) / 1000));
    setDelayBox(v);
    persistDelay(v);
  };

  const racer = state.racers.find((r) => r.id === racerId);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clearTimers, []);

  const later = (ms, fn) => timers.current.push(setTimeout(fn, ms));

  const stage = () => { setLit(['pre', 'stage']); setOppLit([]); setPhase('staged'); setLastRT(null); };

  const holdStart = () => {
    if (phase !== 'staged') return;
    // Tree starts the instant you press — no dead zone. Release on green;
    // releasing early is a red-light foul.
    setPhase('running');
    const d = TREE_DELAY[tree] * 1000;
    const t0 = performance.now();
    // Cross Talk: opponent's tree runs 0.15s ahead (staggered start).
    // Watch YOUR tree, not theirs.
    const oppOffset = crossTalk ? -150 : 0;
    if (mode === 'sportsman') {
      setLit(['pre', 'stage', 'a1']);
      if (crossTalk) setOppLit(['pre', 'stage', 'a1']);
      later(d, () => setLit(['pre', 'stage', 'a1', 'a2']));
      if (crossTalk) later(d + oppOffset, () => setOppLit(['pre', 'stage', 'a1', 'a2']));
      later(2 * d, () => setLit(['pre', 'stage', 'a1', 'a2', 'a3']));
      if (crossTalk) later(2 * d + oppOffset, () => setOppLit(['pre', 'stage', 'a1', 'a2', 'a3']));
      greenAt.current = t0 + 3 * d;
      later(3 * d, () => setLit((l) => [...l, 'green']));
      if (crossTalk) later(3 * d + oppOffset, () => setOppLit((l) => [...l, 'green']));
    } else {
      setLit(['pre', 'stage', 'a1', 'a2', 'a3']);
      if (crossTalk) setOppLit(['pre', 'stage', 'a1', 'a2', 'a3']);
      greenAt.current = t0 + d;
      later(d, () => setLit((l) => [...l, 'green']));
      if (crossTalk) later(d + oppOffset, () => setOppLit((l) => [...l, 'green']));
    }
  };

  const holdEnd = () => {
    if (phase !== 'running') return;
    const now = performance.now();
    // Delay box: effective RT = raw release time + box delay.
    // Add delay if red-lighting, remove if late.
    const rawRt = (now - greenAt.current) / 1000;
    const rt = rawRt + delayBox;
    const red = rt < 0;
    clearTimers();
    setLit((l) => (red ? [...l, 'red'] : l));
    setPhase('done');
    setLastRT({ rt, red, rawRt, delayBox });
    update((s) => {
      const r = s.racers.find((x) => x.id === racerId);
      if (r) r.attempts.push({ id: uid(), rt: Math.round(rt * 1000) / 1000, red, date: new Date().toISOString().slice(0, 10), tree, mode, delayBox });
    });
  };

  const reset = () => { clearTimers(); setLit([]); setOppLit([]); setPhase('idle'); setLastRT(null); };

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

  const ranked = [...state.racers].map((r) => ({ r, s: stats(r) })).sort((a, b) => (a.s.best ?? 9) - (b.s.best ?? 9));
  const isAdmin = !!getUser(users, roleId)?.canDelete;

  const resetRankings = () => {
    if (!window.confirm('Reset the leaderboard? This deletes all racers and their stats, on all devices.')) return;
    const resetAt = Date.now();
    update((s) => {
      s.racers = [];
      s.settings = s.settings || {};
      s.settings.lastRacerReset = resetAt;
    });
    // Publish the wipe so other devices clear too.
    publishRacers({ ...state, racers: [] }, true).catch(() => {});
    toast('Leaderboard reset.');
  };

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
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 sm:items-center" onClick={handleClose}>
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
              onClick={handleClose}
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
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/60">Delay box</span>
                  <span className="font-mono text-sm font-bold text-pickle-400">{delayBox.toFixed(3)}s</span>
                </div>
                <div className="mb-2 flex items-center gap-2">
                  <button
                    onClick={() => bumpDelay(-0.005)}
                    className="flex-1 rounded-xl bg-white/10 py-2 font-mono text-lg font-bold text-white/80 active:bg-white/20"
                  >−</button>
                  <button
                    onClick={() => bumpDelay(0.005)}
                    className="flex-1 rounded-xl bg-white/10 py-2 font-mono text-lg font-bold text-white/80 active:bg-white/20"
                  >+</button>
                  <button
                    onClick={() => { setDelayBox(0); persistDelay(0); }}
                    className="rounded-xl bg-white/5 px-3 py-2 text-xs text-white/50 active:bg-white/10"
                  >Clear</button>
                </div>
                <input
                  type="range" min="0" max="1" step="0.005" value={delayBox}
                  onChange={(e) => { const v = parseFloat(e.target.value); setDelayBox(v); persistDelay(v); }}
                  className="w-full accent-pickle-400"
                />
                <div className="mt-1 flex justify-between text-[10px] text-white/35">
                  <span>0.000</span><span>±0.005 per tap</span><span>1.000</span>
                </div>
                <div className="mt-2 text-[11px] text-white/40">
                  Bump up if red-lighting, down if late. Saved automatically. Effective RT = your hit + box.
                </div>
              </div>
              <button
                onClick={() => setCrossTalk((v) => !v)}
                className={`w-full rounded-2xl border px-3 py-2.5 text-sm font-semibold transition ${
                  crossTalk ? 'border-pickle-500/50 bg-pickle-500/10 text-pickle-300' : 'border-white/10 bg-white/5 text-white/60'
                }`}
              >
                Cross Talk {crossTalk ? 'ON' : 'OFF'}
              </button>
              {crossTalk && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-200/80">
                  Opponent's tree lights first — watch YOUR tree, not theirs. Simulates staggered bracket racing.
                </div>
              )}
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
            <div className="flex items-start justify-center gap-4">
              <div className="mx-auto mt-1 w-full max-w-[250px] rounded-[22px] border border-white/[0.08] bg-[#12141a] px-6 py-4">
                <div className="mb-2 text-center text-[10px] uppercase tracking-[0.2em] text-white/40">You</div>
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

              {crossTalk && (
                <div className="mt-1 w-full max-w-[140px] rounded-[22px] border border-white/[0.06] bg-[#0f1116] px-4 py-4 opacity-70">
                  <div className="mb-2 text-center text-[10px] uppercase tracking-[0.2em] text-white/30">Opponent</div>
                  <div className="space-y-2">
                    {[
                      ['a1', '#fbbf24'],
                      ['a2', '#fbbf24'],
                      ['a3', '#fbbf24'],
                      ['green', '#22c55e'],
                    ].map(([id, color]) => (
                      <div key={id} className="flex justify-center">
                        <TreeBulb on={oppLit.includes(id)} color={color} className="h-8 w-8" />
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-center text-[9px] text-white/30">Ignore this tree</div>
                </div>
              )}
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
                {isAdmin && ranked.some(({ s }) => s.n > 0) && (
                  <button onClick={resetRankings} className="ml-auto shrink-0 text-xs text-red-400/70 hover:text-red-400">
                    Reset
                  </button>
                )}
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
                            <div className={`text-[13px] font-bold ${label === 'BEST' && has ? 'text-pickle-300' : label === 'RL' && v > 0 ? 'text-red-400' : ''}`}>
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
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}



/* ---------------- Settings ---------------- */

import { currentBundleHash, checkForAppUpdate, reloadForUpdate } from '../lib/updater';

export function SettingsModal({ state, update, reset, toast, onClose }) {
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [teamUrl, setTeamUrl] = useState(teamCsvUrl(state));
  const [patInput, setPatInput] = useState('');
  const [hasPat, setHasPat] = useState(!!getPat());
  const [showQr, setShowQr] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const [snaps, setSnaps] = useState(() => listSnapshots());
  const current = currentBundleHash();

  // Generate QR code for the setup link when the share modal opens.
  // QR setup link: generated when Share is tapped (async — the modal opens
  // immediately and the code pops in), cleared on close.
  const openQrShare = () => {
    setShowQr(true);
    const pat = getPat();
    if (pat) {
      QRCode.toDataURL(makeSetupLink(pat), { width: 256, margin: 2 }).then(setQrUrl).catch(() => setQrUrl(''));
    } else {
      setQrUrl('');
    }
  };
  const closeQrShare = () => { setShowQr(false); setQrUrl(''); };
  const loadDemo = () => {
    if (!window.confirm('Load demo data? This REPLACES everything currently in the app.')) return;
    takeSnapshot(state, 'Before demo data');
    const s = makeDemoState();
    s.settings = s.settings || {};
    s.settings.teamSyncOnOpen = false; // don't mix real team runs into the fake set
    reset(s);
    setSnaps(listSnapshots());
    toast('Demo data loaded — team auto-sync paused (re-enable in Team data).');
    onClose();
  };
  const clearAll = () => {
    if (!window.confirm('Delete ALL runs, notes, events and racers from THIS DEVICE? The car and tracks stay. The GitHub team sheet is not touched.')) return;
    takeSnapshot(state, 'Before clear all data');
    update((s) => { s.runs = []; s.trackNotes = []; s.events = []; s.presets = []; s.racers.forEach((r) => { r.attempts = []; }); });
    setSnaps(listSnapshots());
    toast('All data cleared.');
  };
  const backup = () => {
    downloadFile(`big-pickle-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 2), 'application/json');
    toast('Full backup downloaded (JSON).');
  };
  const takeManualSnap = () => {
    const meta = takeSnapshot(state, 'Manual');
    setSnaps(listSnapshots());
    toast(`Snapshot saved (${meta.runs} runs).`);
  };
  const restoreSnap = (id) => {
    const snap = getSnapshot(id);
    if (!snap) { toast('Snapshot not found.'); return; }
    const when = new Date(snap.at).toLocaleString();
    if (!window.confirm(`Restore the snapshot from ${when} (${snap.reason}, ${snap.runs} runs)? Your current data will be snapshotted first so this can be undone.`)) return;
    takeSnapshot(state, 'Before restore');
    const s = dropTombstonesForRuns(structuredClone(snap.state));
    reset(s);
    setSnaps(listSnapshots());
    toast('Snapshot restored.');
  };
  const delSnap = (id) => {
    if (!window.confirm('Delete this snapshot?')) return;
    deleteSnapshot(id);
    setSnaps(listSnapshots());
  };
  const car = state.cars.find((c) => c.id === state.activeCarId);
  const exportCSV = () => {
    // Per-car separation: CSV exports the active car's runs only.
    const carRuns = runsForCar(state, state.activeCarId);
    const carNameOf = (id) => state.cars.find((c) => c.id === id)?.name || '';
    downloadFile(`big-pickle-runs-${new Date().toISOString().slice(0, 10)}.csv`, runsToCSV(carRuns, carNameOf));
    toast(`Exported ${carRuns.length} runs (${car?.name || 'car'}) to CSV.`);
  };

  // Team data: pull the shared sheet from GitHub on demand, publishing local
  // runs back when a token is saved.
  const syncNow = async () => {
    setSyncing(true);
    try {
      const { added, carNames, published } = await syncTeamData(state, update);
      let msg = `Team data synced — ${added} runs pulled (${carNames.join(', ')}).`;
      if (published) {
        msg = published.error
          ? `${msg} Publish failed: ${published.error}`
          : published.pushed
            ? `${msg} Published ${published.published} local run(s) to GitHub.`
            : `${msg} GitHub sheet already up to date.`;
      } else if (hasPat) {
        msg = `${msg} Publish skipped (offline?).`;
      }
      toast(msg, published?.error ? 'error' : 'ok');
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
  // Runs logged or edited on this phone (source unset) are "local": the phone's
  // copy is the master, so the sheet's version is skipped on pull and they never
  // count as "pulled". Pulled + local = everything on the device.
  const localCount = (state.runs || []).filter((r) => !r.source).length;
  // Live total, not the per-sync "pulled" delta: the pulled count only covers
  // runs downloaded in that one sync, so it can never match the log when a
  // run was already on the phone. The total always does.
  const totalRuns = (state.runs || []).length;

  // iOS home-screen apps cache aggressively — this lets the user pull a new
  // version on demand without deleting the icon (data is preserved).
  const checkForUpdate = async () => {
    setChecking(true);
    try {
      const latest = await checkForAppUpdate();
      if (latest) {
        if (window.confirm(`Version ${latest.slice(0, 7)} is available (you have ${current.slice(0, 7)}). Reload now to update?`)) {
          reloadForUpdate();
        }
      } else {
        toast('You are on the latest version.');
      }
    } catch {
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
        Two-way sync with the GitHub sheet: every sync pulls the latest sheet down, and — with a token saved —
        publishes runs you logged in the app back up. Demo runs are never published.
      </div>
      <div className="mb-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-xs">
        <div className="mb-1 flex items-center justify-between">
          <span className="font-semibold text-white/70">Sync status</span>
          {state.settings?.lastTeamSyncError || state.settings?.lastTeamPublishError ? (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 font-semibold text-red-300">attention needed</span>
          ) : lastSync ? (
            <span className="rounded-full bg-pickle-500/15 px-2 py-0.5 font-semibold text-pickle-300">healthy</span>
          ) : (
            <span className="rounded-full bg-white/10 px-2 py-0.5 font-semibold text-white/50">never synced</span>
          )}
        </div>
        <div className="space-y-0.5 text-white/55">
          <div>Last sync: {lastSync ? `${lastSync.toLocaleString()} (${totalRuns} runs on this phone · ${localCount} local)` : '—'}</div>
          {state.settings?.lastTeamSyncError && (
            <div className="text-red-300">Last sync failed: {state.settings.lastTeamSyncError.message} ({new Date(state.settings.lastTeamSyncError.at).toLocaleString()})</div>
          )}
          <div>Last publish: {state.settings?.lastTeamPublish ? new Date(state.settings.lastTeamPublish).toLocaleString() : '—'}</div>
          {state.settings?.lastTeamPublishError && (
            <div className="text-red-300">Last publish failed: {state.settings.lastTeamPublishError.message} ({new Date(state.settings.lastTeamPublishError.at).toLocaleString()})</div>
          )}
        </div>
      </div>
      <div className="mb-2 flex gap-2">
        <Btn kind="ghost" onClick={syncNow} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync now'}</Btn>
        <Btn kind={teamSyncOnOpen(state) ? 'ghost' : 'quiet'} onClick={toggleAutoSync}>
          Auto-sync: {teamSyncOnOpen(state) ? 'on' : 'off'}
        </Btn>
      </div>
      <div className="mb-2 flex gap-2">
        <input value={teamUrl} onChange={(e) => setTeamUrl(e.target.value)} placeholder="Team CSV URL" className={`${inputCls} min-w-0 flex-1 font-mono !text-xs`} />
        <Btn kind="quiet" onClick={saveTeamUrl} className="shrink-0 !py-1.5 text-xs">Save</Btn>
      </div>
      <div className="mb-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
        <div className="mb-1 text-xs font-semibold text-white/70">
          GitHub publishing {hasPat ? <span className="text-pickle-400">· enabled</span> : <span className="text-white/40">· off</span>}
        </div>
        {hasPat ? (
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] text-white/45">Runs you log will be published to the sheet on sync.</div>
            <div className="flex shrink-0 gap-2">
              <Btn kind="quiet" onClick={openQrShare} className="!py-1.5 text-xs">Share</Btn>
              <Btn kind="quiet" onClick={() => { setPat(''); setHasPat(false); toast('GitHub token removed — publishing off.'); }} className="!py-1.5 text-xs">Remove token</Btn>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-2 text-[11px] text-white/45">
              To publish, create a fine-grained token: GitHub → Settings → Developer settings → Personal access tokens →
              Generate new token · repository access: <b>big-pickle-racing-tracker</b> · permission: <b>Contents (read &amp; write)</b>.
              Paste it below — it stays on this device only.
            </div>
            <div className="flex gap-2">
              <input type="password" value={patInput} onChange={(e) => setPatInput(e.target.value)} placeholder="github_pat_…" className={`${inputCls} min-w-0 flex-1 font-mono !text-xs`} />
              <Btn kind="quiet" onClick={() => { const t = patInput.trim(); if (!t) return; setPat(t); setPatInput(''); setHasPat(true); toast('Token saved — publishing enabled.'); }} className="shrink-0 !py-1.5 text-xs">Save</Btn>
            </div>
          </>
        )}
      </div>
      <SectionTitle>Snapshots</SectionTitle>
      <div className="mb-2 text-xs text-white/50">
        Safety copies of everything on this device — taken automatically before imports, demo data,
        "Clear all data", and restores. Kept on this device only, never uploaded. The newest 10 are kept.
      </div>
      <div className="mb-2"><Btn kind="ghost" onClick={takeManualSnap}>Take snapshot now</Btn></div>
      {snaps.length === 0 ? (
        <div className="mb-4 text-xs text-white/40">No snapshots yet.</div>
      ) : (
        <div className="mb-4 space-y-1.5">
          {snaps.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
              <div className="min-w-0 text-xs">
                <div className="truncate font-semibold text-white/75">{new Date(s.at).toLocaleString()}</div>
                <div className="truncate text-white/45">{s.reason} · {s.runs} runs</div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Btn kind="quiet" onClick={() => restoreSnap(s.id)} className="!py-1 text-xs">Restore</Btn>
                <Btn kind="quiet" onClick={() => delSnap(s.id)} className="!py-1 text-xs !text-red-300">Delete</Btn>
              </div>
            </div>
          ))}
        </div>
      )}
      <SectionTitle>Demo data</SectionTitle>
      <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200/90">
        Demo data is ~36 clearly-fake runs (2025–2026, 3 tracks) for trying the app's charts and predictors.
        Loading it <b>replaces</b> everything currently on this device. Remove it anytime with "Clear all data".
      </div>
      <div className="mb-4"><Btn kind="ghost" onClick={loadDemo}>Load demo data</Btn></div>
      <SectionTitle>Danger zone</SectionTitle>
      <div className="mb-2 text-xs text-white/50">Clear all data wipes this device's local data only — the GitHub team sheet is never touched.</div>
      <Btn kind="ghost" onClick={clearAll} className="!border-red-500/40 !text-red-300">Clear all data</Btn>
      <SectionTitle>About &amp; legal</SectionTitle>
      <div className="mb-2 text-xs text-white/50">
        Local-first: everything lives on this phone until you publish it to the team folder.
        Weather goes to Open-Meteo only when you request it. No accounts, no ads, no analytics.
      </div>
      <Btn kind="ghost" onClick={() => { window.location.href = `${import.meta.env.BASE_URL}privacy.html`; }}>
        Privacy policy &amp; team terms
      </Btn>
      <div className="mt-6 text-[11px] text-white/35">
        Local-first: everything lives in this browser's localStorage. No account, no server, no tracking.
        The only exception is team publishing: with a GitHub token saved, sync sends your runs to your repo's sheet.
        Density altitude uses the standard humidity-corrected formula; ET/MPH weather correction is a simplified
        air-density-ratio model (documented in src/lib/physics.js) — directionally correct: thinner air = slower.
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
        <span className="font-mono text-[11px] text-white/40">v{APP_VERSION} <span className="text-white/25">({current.slice(0, 7)})</span></span>
        <Btn kind="ghost" onClick={checkForUpdate} disabled={checking} className="!py-1.5 text-xs">
          {checking ? 'Checking…' : 'Check for updates'}
        </Btn>
      </div>
      {showQr && <QrShareModal onClose={closeQrShare} qrUrl={qrUrl} toast={toast} />}
    </Modal>
  );
}

function QrShareModal({ onClose, qrUrl, toast }) {
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(makeSetupLink(getPat()));
      toast('Setup link copied — text it to the crew member.');
    } catch {
      toast('Copy failed — try the QR code instead.', 'error');
    }
  };

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(getPat());
      toast('Token copied — paste it into a message to share.');
    } catch {
      toast('Copy failed — try the QR code instead.', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-6" onClick={onClose}>
      <div className="w-full max-w-xs rounded-3xl border border-white/10 bg-coal-900 p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-bold uppercase tracking-wider text-white/90">Share token</h3>
        <div className="mt-1 text-xs text-white/50">
          They tap the link (or scan the code with their camera) and the app sets itself up — no copy/paste needed.
        </div>
        <div className="mx-auto mt-4 flex h-64 w-64 items-center justify-center rounded-2xl bg-white p-2">
          {qrUrl ? (
            <img src={qrUrl} alt="Setup link QR code" className="h-full w-full" />
          ) : (
            <div className="text-sm text-black/50">Generating…</div>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <Btn kind="ghost" onClick={copyLink} className="flex-1">Copy link</Btn>
          <Btn kind="ghost" onClick={copyToken} className="flex-1">Copy token</Btn>
        </div>
        <div className="mt-2">
          <Btn kind="quiet" onClick={onClose} className="w-full">Done</Btn>
        </div>
      </div>
    </div>
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
