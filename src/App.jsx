import { useState, useCallback, useEffect } from 'react';
import { useStore, uid } from './lib/store';
import { Toasts, Icon } from './components/ui';
import { LOGO_DATA_URI } from './components/logo';
import { LockScreen, CrewModal, hasAnyPin, getPinHashes } from './components/Crew';
import { clearRole, hashPin, getUser, effectiveUsers } from './lib/roles';
import { checkForAppUpdate, reloadForUpdate } from './lib/updater';
import { parseSetupLink, clearSetupLink } from './lib/setupLink';
import { setPat, getPat, fetchTeamPins, publishTeamPins, getCachedTeamPins, setCachedTeamPins, fetchTeamUsers, publishTeamUsers, getCachedTeamUsers, setCachedTeamUsers } from './lib/teamSync';
import Dash from './views/Dash';
import Runs from './views/Runs';
import AddRun from './views/AddRun';
import TrackDay from './views/TrackDay';
import Insight from './views/Insight';
import Garage from './views/Garage';
import { GarageModal, TreeSimModal, SettingsModal, PrintSheet } from './views/Overlays';
import { syncTeamData, teamSyncOnOpen, pullTracks } from './lib/teamSync';

const NAV = [
  { id: 'dash', label: 'DASH', icon: 'gauge' },
  { id: 'runs', label: 'RUNS', icon: 'list' },
  { id: 'track', label: 'TRACK', icon: 'flag' },
  { id: 'insight', label: 'INSIGHT', icon: 'chart' },
  { id: 'add', label: 'ADD', icon: 'plus', fab: true },
  { id: 'garage', label: 'GARAGE', icon: 'wrench' },
];

export default function App() {
  const [state, update, reset] = useStore();
  const [view, setView] = useState('dash');
  const [editId, setEditId] = useState(null);
  const [dist, setDist] = useState('1/4');
  const [overlay, setOverlay] = useState(null); // garage | tree | settings | crew
  const [toasts, setToasts] = useState([]);
  const [printRun, setPrintRun] = useState(null);
  // Crew lock: ALWAYS require unlock on launch, on every device.
  // PIN hashes come from the shared team file (data/team-pins.json),
  // falling back to this device's PINs until the team file exists.
  const [roleId, setRoleId] = useState(() => {
    return null;
  });
  const [locked, setLocked] = useState(() => true);
  const [lockChecked, setLockChecked] = useState(false);
  const [teamPins, setTeamPins] = useState(() => getCachedTeamPins());
  const [teamUsers, setTeamUsers] = useState(() => getCachedTeamUsers());

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
    pullTracks(state, update).catch(() => {});
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

  // Crew lock: lock on EVERY launch, on every device. The shared team PIN
  // Crew lock: lock on EVERY launch, on every device. The shared team PIN
  // file is the authority; this device's PINs are the fallback until the
  // team file exists. If this device has local PINs and a token but the
  // team file is missing, publish them once (bootstrap).
  // One-time migration from the old single PIN to per-role PINs.
  useEffect(() => {
    if (lockChecked) return;
    setLockChecked(true);
    // Migrate old single PIN to the per-role PINs the user requested.
    if (state.settings.teamPinHash && !hasAnyPin(state.settings)) {
      update((s) => {
        s.settings.pinHashAdmin = hashPin('1966');
        s.settings.pinHashDriver = hashPin('1966');
        s.settings.pinHashCrew = hashPin('2007');
        s.settings.pinHashViewer = hashPin('0000');
        s.settings.teamPinHash = null;
      });
    }
    setLocked(true);
    // Shared team users: pull the crew list; bootstrap-publish from this
    // device when missing or when this device's edits are newer.
    fetchTeamUsers()
      .then((data) => {
        const teamList = data && Array.isArray(data.users) ? data.users : [];
        const teamTs = data && data.updatedAt ? Date.parse(data.updatedAt) || 0 : 0;
        const localTs = state.settings.usersUpdatedAt || 0;
        if (teamList.length && teamTs >= localTs) {
          setCachedTeamUsers(data);
          setTeamUsers(data);
          update((s) => { s.settings.users = teamList; s.settings.usersUpdatedAt = teamTs; });
        } else if (getPat()) {
          const seed = effectiveUsers(state.settings.users);
          publishTeamUsers(seed)
            .then((r) => {
              if (r.pushed) {
                toast('Team users published — crew list is now shared.');
                update((s) => { s.settings.usersUpdatedAt = Date.now(); });
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
    fetchTeamPins()
      .then((data) => {
        if (data && data.pins && hasAnyPin(data.pins)) {
          setCachedTeamPins(data);
          setTeamPins(data);
        } else {
          const local = getPinHashes(state.settings);
          if (hasAnyPin(local) && getPat()) {
            publishTeamPins(local)
              .then((r) => {
                if (r.pushed) {
                  toast('Team PINs published — every device now locks on launch.');
                  fetchTeamPins()
                    .then((d2) => {
                      if (d2 && d2.pins) {
                        setCachedTeamPins(d2);
                        setTeamPins(d2);
                      }
                    })
                    .catch(() => {});
                }
              })
              .catch(() => {});
          }
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockChecked]);

  // Dynamic crew: users list (seeded from defaults until the team file lands).
  const users = effectiveUsers(state.settings.users);
  const role = getUser(users, roleId) || users[0];
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

  // PWA install: capture Chrome's install prompt so Android users get an
  // in-app "Install" button that triggers the proper WebAPK flow (the menu
  // path is where the Play Protect legacy-wrapper block comes from).
  const [installEvt, setInstallEvt] = useState(null);
  const [installDismissed, setInstallDismissed] = useState(false);
  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setInstallEvt(e); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);
  const isAndroid = /android/i.test(navigator.userAgent || '');
  const isStandalone = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  const showInstallBanner = isAndroid && !isStandalone && installEvt && !installDismissed;
  const doInstall = async () => {
    try { installEvt.prompt(); await installEvt.userChoice; } catch { /* dismissed */ }
    setInstallEvt(null);
  };

  // Effective PIN hashes: shared team file wins, this device's PINs are the
  // fallback. When neither exists, nobody can unlock (except this device
  // still bootstrapping its own PINs via Crew Management).
  const teamHashObj = teamPins && teamPins.pins;
  const effectiveHashes =
    teamHashObj && hasAnyPin(teamHashObj) ? teamHashObj : getPinHashes(state.settings);

  // Show lock screen on every launch until unlocked with a crew PIN.
  if (isLocked) {
    return (
      <div className="min-h-screen bg-coal-950 text-white">
        <LockScreen pinHashes={effectiveHashes} users={users} onUnlock={handleUnlock} />
        <Toasts toasts={toasts} />
      </div>
    );
  }

  // Bottom nav: every role sees the same six items in the same order.
  // Items the role can't use are greyed out, not hidden — so the menu
  // never changes shape between users.
  const navDisabled = (n) => {
    if (n.id === 'add' && !role.canLog) return true;
    if (n.id === 'garage' && !role.canGarage) return true;
    return false;
  };

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
                const label = role?.name || null;
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

      {/* Android install banner (Chrome install prompt captured) */}
      {showInstallBanner && (
        <div className="mx-auto flex max-w-3xl items-center gap-3 border-b border-pickle-400/30 bg-pickle-400/10 px-4 py-2.5">
          <div className="min-w-0 flex-1 text-sm text-white/80">
            Install <span className="font-semibold text-white">Big Pickle</span> as an app on this phone.
          </div>
          <Btn onClick={doInstall} className="!py-1.5 text-xs">Install</Btn>
          <button onClick={() => setInstallDismissed(true)} aria-label="Dismiss" className="px-1 text-white/50 transition hover:text-white">✕</button>
        </div>
      )}

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
          {view === 'garage' && (roleId === 'admin' || roleId === 'driver') && (
            <Garage state={state} update={update} toast={toast} role={role} />
          )}
        </div>
      </main>

      {/* bottom nav */}
      <nav className="app-chrome fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-coal-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-6 items-end px-2">
          {NAV.map((n) => {
            const off = navDisabled(n);
            return n.fab ? (
              <button
                key={n.id}
                onClick={() => goAdd()}
                aria-label="Log a run"
                title={off ? 'Not available for your role' : 'Log a run'}
                disabled={off}
                className={`relative mx-auto -mt-7 flex h-16 w-16 items-center justify-center rounded-full shadow-glow transition active:scale-95 ${
                  off ? 'cursor-not-allowed bg-coal-700 text-white/25' : 'bg-pickle-400 text-black hover:bg-pickle-300'
                }`}
              >
                <Icon name="plus" className="h-7 w-7" strokeWidth={2.4} />
                <span className="sr-only">{n.label}</span>
              </button>
            ) : (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                title={off ? 'Not available for your role' : n.label}
                disabled={off}
                className={`relative flex flex-col items-center py-2.5 font-display text-[15px] font-semibold uppercase tracking-[0.12em] transition ${
                  off ? 'cursor-not-allowed text-white/20' : view === n.id ? 'text-pickle-400' : 'text-white/40 hover:text-white/75'
                }`}
              >
                {view === n.id && !off && (
                  <span className="absolute -top-px h-0.5 w-10 rounded-full bg-pickle-400 shadow-glow" />
                )}
                <Icon name={n.icon} className="h-[22px] w-[22px]" />
                <span className="mt-0.5">{n.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* overlays */}
      {overlay === 'garage' && <GarageModal state={state} update={update} toast={toast} onClose={() => setOverlay(null)} role={role} />}
      {overlay === 'tree' && <TreeSimModal state={state} update={update} toast={toast} onClose={() => setOverlay(null)} roleId={roleId} users={users} />}
      {overlay === 'settings' && <SettingsModal state={state} update={update} reset={reset} toast={toast} onClose={() => setOverlay(null)} />}
      {overlay === 'crew' && <CrewModal state={state} update={update} toast={toast} onClose={() => setOverlay(null)} users={users} currentUserId={roleId} />}

      <Toasts toasts={toasts} />

      {/* printable run sheet (visible only in print) */}
      {printRun && <PrintSheet run={printRun} baseline={state.settings.daBaseline} />}
    </div>
  );
}
