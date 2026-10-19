import { useState, useCallback, useEffect } from 'react';
import { useStore, uid } from './lib/store';
import { Toasts, Icon } from './components/ui';
import { LOGO_DATA_URI } from './components/logo';
import { LockScreen, CrewModal } from './components/Crew';
import { ROLES, getSavedRole, clearRole } from './lib/roles';
import { checkForAppUpdate, reloadForUpdate } from './lib/updater';
import { parseSetupLink, clearSetupLink } from './lib/setupLink';
import { setPat } from './lib/teamSync';
import Dash from './views/Dash';
import Runs from './views/Runs';
import AddRun from './views/AddRun';
import TrackDay from './views/TrackDay';
import Insight from './views/Insight';
import { GarageModal, TreeSimModal, SettingsModal, PrintSheet } from './views/Overlays';
import { syncTeamData, teamSyncOnOpen } from './lib/teamSync';

const NAV = [
  { id: 'dash', label: 'DASH', icon: 'gauge' },
  { id: 'runs', label: 'RUNS', icon: 'list' },
  { id: 'add', label: 'ADD', icon: 'plus', fab: true },
  { id: 'track', label: 'TRACK', icon: 'flag' },
  { id: 'insight', label: 'INSIGHT', icon: 'chart' },
];

export default function App() {
  const [state, update, reset] = useStore();
  const [view, setView] = useState('dash');
  const [editId, setEditId] = useState(null);
  const [dist, setDist] = useState('1/4');
  const [overlay, setOverlay] = useState(null); // garage | tree | settings | crew
  const [toasts, setToasts] = useState([]);
  const [printRun, setPrintRun] = useState(null);
  // Crew lock: if a team PIN is set, require unlock on launch.
  const [roleId, setRoleId] = useState(() => {
    // If no PIN is set, default to admin (full access, current behavior).
    return null;
  });
  const [locked, setLocked] = useState(() => {
    // Check after store loads; default to unlocked until we know.
    return false;
  });
  const [lockChecked, setLockChecked] = useState(false);

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

  // Team data: pull the shared sheet from GitHub on every open (silent —
  // offline or unchanged is fine, local runs are never touched).
  useEffect(() => {
    if (!teamSyncOnOpen(state)) return;
    syncTeamData(state, update).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Magic setup link: if the URL has #setup=..., save the token automatically.
  useEffect(() => {
    const setup = parseSetupLink();
    if (setup?.token) {
      setPat(setup.token);
      clearSetupLink();
      toast('Team setup complete! Publishing is enabled.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Crew lock: if a team PIN is set, lock on launch.
  useEffect(() => {
    if (lockChecked) return;
    setLockChecked(true);
    if (state.settings.teamPinHash) {
      const saved = getSavedRole();
      if (saved) {
        // Role remembered from last time, but still require PIN.
        setLocked(true);
      } else {
        setLocked(true);
      }
    } else {
      setRoleId('admin');
    }
  }, [state.settings.teamPinHash, lockChecked]);

  const role = ROLES[roleId] || ROLES.admin;
  const isLocked = locked;

  const handleUnlock = (newRoleId) => {
    setRoleId(newRoleId);
    setLocked(false);
    // Auto-check for app updates after unlock — keeps crew devices current
    // without them needing Settings access.
    checkForAppUpdate().then((latest) => {
      if (latest) {
        toast(`Update available — reloading to latest version…`);
        setTimeout(() => reloadForUpdate(), 1500);
      }
    }).catch(() => {});
  };

  const handleLock = () => {
    clearRole();
    setRoleId(null);
    setLocked(true);
  };

  const car = state.cars.find((c) => c.id === state.activeCarId);

  // Show lock screen if PIN is set and not yet unlocked.
  if (isLocked) {
    return (
      <div className="min-h-screen bg-coal-950 text-white">
        <LockScreen pinHash={state.settings.teamPinHash} onUnlock={handleUnlock} />
        <Toasts toasts={toasts} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-coal-950 text-white">
      {/* header */}
      <header className="app-chrome asphalt sticky top-0 z-40 border-b border-white/10 bg-coal-950/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-2.5">
          <button
            onClick={() => setOverlay('garage')}
            className="flex items-center gap-3 rounded-xl px-1 py-1 transition hover:bg-white/5 active:scale-[0.98]"
            title="Garage"
          >
            <img src={LOGO_DATA_URI} alt="Big Pickle Racing" className="h-12 w-auto" />
            <span className="text-left leading-none">
              <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.16em] text-white/45">
                {car?.name || 'Garage'}
              </span>
              <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.16em] text-white/25">
                {[car?.year, car?.make, car?.model].filter(Boolean).join(' · ')}
              </span>
            </span>
          </button>
          <div className="flex gap-1.5">
            <button
              onClick={() => {
                // Ensure the logged-in user has a racer profile so Tree stats stay separate.
                const label = roleId ? ROLES[roleId]?.label : null;
                if (label && !state.racers.some((r) => r.name.toLowerCase() === label.toLowerCase())) {
                  update((s) => { s.racers.push({ id: uid(), name: label, attempts: [] }); });
                }
                setOverlay('tree');
              }}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 font-display text-[15px] font-semibold uppercase tracking-wider text-white/75 transition hover:bg-white/5 hover:text-white active:scale-95"
              title="Tree simulator"
            >
              <Icon name="tree" className="h-4 w-4" />
              Tree
            </button>
            {role.canSettings && (
              <button
                onClick={() => setOverlay('crew')}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-white/70 transition hover:bg-white/5 hover:text-white active:scale-95"
                title="Crew management"
                aria-label="Crew management"
              >
                <Icon name="users" className="h-5 w-5" />
              </button>
            )}
            {role.canSettings ? (
              <button
                onClick={() => setOverlay('settings')}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-white/70 transition hover:bg-white/5 hover:text-white active:scale-95"
                title="Settings"
                aria-label="Settings"
              >
                <Icon name="gear" className="h-5 w-5" />
              </button>
            ) : (
              <button
                onClick={handleLock}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-white/70 transition hover:bg-white/5 hover:text-white active:scale-95"
                title="Switch user"
                aria-label="Switch user"
              >
                <Icon name="lock" className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* main */}
      <main className="app-chrome mx-auto max-w-3xl px-4 pb-32 pt-4">
        <div key={view} className="animate-fadein">
          {view === 'dash' && (
            <Dash state={state} onAddRun={() => goAdd()} onImport={() => setView('runs')} onSeeRuns={() => setView('runs')} />
          )}
          {view === 'runs' && (
            <Runs state={state} update={update} toast={toast} dist={dist} setDist={setDist}
              onPrint={setPrintRun} onAddRun={goAdd} role={role} />
          )}
          {view === 'add' && (
            <AddRun state={state} update={update} toast={toast} editId={editId}
              onDone={() => { setEditId(null); setView('runs'); }} />
          )}
          {view === 'track' && (
            <TrackDay state={state} update={update} toast={toast} dist={dist} setDist={setDist} onAddRun={() => goAdd()} role={role} />
          )}
          {view === 'insight' && (
            <Insight state={state} toast={toast} dist={dist} setDist={setDist} />
          )}
        </div>
      </main>

      {/* bottom nav */}
      <nav className="app-chrome fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-coal-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className={`mx-auto grid max-w-3xl items-end px-2 ${role.canLog ? 'grid-cols-5' : 'grid-cols-4'}`}>
          {NAV.filter((n) => n.id !== 'add' || role.canLog).map((n) =>
            n.fab ? (
              <button
                key={n.id}
                onClick={() => goAdd()}
                aria-label="Log a run"
                className="relative mx-auto -mt-7 flex h-16 w-16 items-center justify-center rounded-full bg-pickle-400 text-black shadow-glow transition hover:bg-pickle-300 active:scale-95"
              >
                <Icon name="plus" className="h-7 w-7" strokeWidth={2.4} />
                <span className="sr-only">{n.label}</span>
              </button>
            ) : (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                className={`relative flex flex-col items-center py-2.5 font-display text-[15px] font-semibold uppercase tracking-[0.12em] transition ${
                  view === n.id ? 'text-pickle-400' : 'text-white/40 hover:text-white/75'
                }`}
              >
                {view === n.id && (
                  <span className="absolute -top-px h-0.5 w-10 rounded-full bg-pickle-400 shadow-glow" />
                )}
                <Icon name={n.icon} className="h-[22px] w-[22px]" />
                <span className="mt-0.5">{n.label}</span>
              </button>
            ),
          )}
        </div>
      </nav>

      {/* overlays */}
      {overlay === 'garage' && <GarageModal state={state} update={update} toast={toast} onClose={() => setOverlay(null)} role={role} />}
      {overlay === 'tree' && <TreeSimModal state={state} update={update} toast={toast} onClose={() => setOverlay(null)} roleId={roleId} />}
      {overlay === 'settings' && <SettingsModal state={state} update={update} reset={reset} toast={toast} onClose={() => setOverlay(null)} />}
      {overlay === 'crew' && <CrewModal state={state} update={update} toast={toast} onClose={() => setOverlay(null)} />}

      <Toasts toasts={toasts} />

      {/* printable run sheet (visible only in print) */}
      {printRun && <PrintSheet run={printRun} baseline={state.settings.daBaseline} />}
    </div>
  );
}
