import { useState, useCallback, useEffect } from 'react';
import { useStore, uid } from './lib/store';
import { Toasts } from './components/ui';
import Dash from './views/Dash';
import Runs from './views/Runs';
import AddRun from './views/AddRun';
import TrackDay from './views/TrackDay';
import Insight from './views/Insight';
import { GarageModal, TreeSimModal, SettingsModal, PrintSheet } from './views/Overlays';

const NAV = [
  { id: 'dash', label: 'DASH', icon: '▦' },
  { id: 'runs', label: 'RUNS', icon: '≣' },
  { id: 'add', label: 'ADD', icon: '＋' },
  { id: 'track', label: 'TRACK', icon: '◎' },
  { id: 'insight', label: 'INSIGHT', icon: '◈' },
];

export default function App() {
  const [state, update, reset] = useStore();
  const [view, setView] = useState('dash');
  const [editId, setEditId] = useState(null);
  const [dist, setDist] = useState('1/4');
  const [overlay, setOverlay] = useState(null); // garage | tree | settings
  const [toasts, setToasts] = useState([]);
  const [printRun, setPrintRun] = useState(null);

  const toast = useCallback((text, kind = 'ok') => {
    const id = uid();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const goAdd = useCallback((id = null) => {
    setEditId(id);
    setView('add');
  }, []);

  // Printing: render the sheet, then print, then clear.
  useEffect(() => {
    if (!printRun) return;
    const t = setTimeout(() => window.print(), 150);
    const done = () => setPrintRun(null);
    window.addEventListener('afterprint', done);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', done);
    };
  }, [printRun]);

  const car = state.cars.find((c) => c.id === state.activeCarId);

  return (
    <div className="min-h-screen bg-coal-950 text-white">
      {/* header */}
      <header className="app-chrome sticky top-0 z-40 border-b border-white/10 bg-coal-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-2.5">
          <button onClick={() => setOverlay('garage')} className="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-white/5" title="Garage">
            <span className="text-xl">🥒</span>
            <span className="text-left leading-tight">
              <span className="block text-sm font-black tracking-wide">BIG PICKLE</span>
              <span className="block text-[10px] text-white/45">{car?.name} · Garage</span>
            </span>
          </button>
          <div className="flex gap-1.5">
            <button onClick={() => setOverlay('tree')} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-white/80 hover:bg-white/5" title="Tree simulator">
              🌲 TREE
            </button>
            <button onClick={() => setOverlay('settings')} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-white/80 hover:bg-white/5" title="Settings">
              ⚙
            </button>
          </div>
        </div>
      </header>

      {/* main */}
      <main className="app-chrome mx-auto max-w-3xl px-4 pb-28 pt-4">
        {view === 'dash' && (
          <Dash state={state} dist={dist} setDist={setDist}
            onAddRun={() => goAdd()} onImport={() => setView('runs')} onSeeRuns={() => setView('runs')} />
        )}
        {view === 'runs' && (
          <Runs state={state} update={update} toast={toast} dist={dist} setDist={setDist}
            onPrint={setPrintRun} onAddRun={goAdd} />
        )}
        {view === 'add' && (
          <AddRun state={state} update={update} toast={toast} editId={editId}
            onDone={() => { setEditId(null); setView('runs'); }} />
        )}
        {view === 'track' && (
          <TrackDay state={state} update={update} toast={toast} dist={dist} setDist={setDist} onAddRun={() => goAdd()} />
        )}
        {view === 'insight' && (
          <Insight state={state} toast={toast} dist={dist} setDist={setDist} />
        )}
      </main>

      {/* bottom nav */}
      <nav className="app-chrome fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-coal-950/95 backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => { if (n.id === 'add') goAdd(); else setView(n.id); }}
              className={`flex flex-col items-center py-2.5 text-[10px] font-bold tracking-wider transition ${
                view === n.id ? 'text-pickle-400' : 'text-white/45 hover:text-white'
              }`}
            >
              <span className="text-lg leading-none">{n.icon}</span>
              <span className="mt-1">{n.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* overlays */}
      {overlay === 'garage' && <GarageModal state={state} update={update} toast={toast} onClose={() => setOverlay(null)} />}
      {overlay === 'tree' && <TreeSimModal state={state} update={update} toast={toast} onClose={() => setOverlay(null)} />}
      {overlay === 'settings' && <SettingsModal state={state} update={update} reset={reset} toast={toast} onClose={() => setOverlay(null)} />}

      <Toasts toasts={toasts} />

      {/* printable run sheet (visible only in print) */}
      {printRun && <PrintSheet run={printRun} baseline={state.settings.daBaseline} />}
    </div>
  );
}
