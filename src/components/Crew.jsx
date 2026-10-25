import { useState, useEffect } from 'react';
import { Modal, Btn, inputCls } from './ui';
import { hashPin, saveRole, PERM_FLAGS, PERM_LABELS, USER_TITLES, defaultUsers, PIN_KEYS, PIN_KEY_TO_GROUP, PIN_GROUP_LABELS, getPinHashes, hasAnyPin, usersForPin } from '../lib/roles';
import { getPat, publishTeamPins, publishTeamUsers } from '../lib/teamSync';
import { uid } from '../lib/store';
import { APP_VERSION } from '../version';

// Access templates for the "add user" form.
const ACCESS_TEMPLATES = {
  admin: { title: 'Admin', canLog: true, canDelete: true, canSettings: true, canSync: true, canGarage: true },
  driver: { title: 'Driver', canLog: true, canDelete: false, canSettings: false, canSync: true, canGarage: true },
  crew: { title: 'Crew', canLog: true, canDelete: false, canSettings: false, canSync: true, canGarage: false },
  viewer: { title: 'Viewer', canLog: false, canDelete: false, canSettings: false, canSync: true, canGarage: false },
};

// PIN slot label with the current holders' names, e.g. "Viewer PIN (Hughie, Grog)".
// Derived from the live user list so adding/removing members updates it.
function pinLabel(pinKey, users) {
  const group = PIN_KEY_TO_GROUP[pinKey];
  const base = PIN_GROUP_LABELS[group] || 'PIN';
  const holders = (users || [])
    .filter((u) => u && u.pinGroup === group && u.name && u.name.trim())
    .map((u) => u.name.trim());
  return holders.length ? `${base} (${holders.join(', ')})` : base;
}

/**
 * Lock screen: PIN entry, then role picker (only roles unlocked by that PIN).
 * Shown on EVERY app start, on every device. `pinHashes` is the effective
 * set of team PIN hashes (shared team file, falling back to this device's).
 * No PIN = no entry.
 */
export function LockScreen({ pinHashes, users, onUnlock, onSetupPin }) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [stage, setStage] = useState('pin'); // pin | role
  const [allowedUsers, setAllowedUsers] = useState([]);
  const [failCount, setFailCount] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);

  const configured = hasAnyPin(pinHashes || {});

  if (!configured) {
    // First-time setup: no PINs in the code and none saved anywhere, so the
    // first person here creates the admin PIN. After unlocking with it,
    // the admin sets the driver/crew/viewer PINs in Crew Management.
    const submitSetup = () => {
      if (pin.length < 4) { setError('PIN must be at least 4 digits.'); return; }
      if (pin !== confirmPin) { setError('PINs do not match.'); return; }
      setError('');
      onSetupPin(pin);
    };
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-coal-950 p-6">
        <div className="w-full max-w-xs space-y-4">
          <div className="text-center">
            <div className="font-display text-2xl font-bold uppercase tracking-wider text-white/90">Big Pickle Racing</div>
            <div className="mt-1 text-xs text-white/40">First-time setup — create the admin PIN</div>
          </div>
          <div className="text-center text-sm text-white/50">
            No team PINs are set on this device yet. Create the admin PIN to get started; you&apos;ll set the driver, crew, and viewer PINs in Crew Management after you unlock.
          </div>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="New admin PIN"
            autoFocus
            className={`${inputCls} text-center font-mono text-2xl tracking-[0.5em]`}
          />
          <input
            type="password"
            inputMode="numeric"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            onKeyDown={(e) => { if (e.key === 'Enter') submitSetup(); }}
            placeholder="Confirm PIN"
            className={`${inputCls} text-center font-mono text-2xl tracking-[0.5em]`}
          />
          {error && <div className="text-center text-sm text-red-400">{error}</div>}
          <Btn kind="primary" onClick={submitSetup} className="w-full" disabled={!pin || !confirmPin}>
            Create admin PIN
          </Btn>
          <div className="text-center font-mono text-[11px] text-white/25">v{APP_VERSION}</div>
        </div>
      </div>
    );
  }

  const submitPin = () => {
    if (Date.now() < lockUntil) return;
    const matched = usersForPin(pin, pinHashes || {}, users || []);
    if (matched.length > 0) {
      setError('');
      setFailCount(0);
      setAllowedUsers(matched);
      setStage('role');
    } else {
      const fails = failCount + 1;
      setFailCount(fails);
      // Progressive lockout: 30s after 5 failures, doubling each time (cap 5 min).
      if (fails >= 5) {
        const secs = Math.min(300, 30 * 2 ** (fails - 5));
        setLockUntil(Date.now() + secs * 1000);
        setError(`Too many wrong attempts. Try again in ${secs}s.`);
      } else {
        setError('Wrong PIN. Try again.');
      }
      setPin('');
    }
  };

  const pickUser = (user) => {
    saveRole(user.id);
    onUnlock(user.id);
  };

  if (stage === 'role') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-coal-950 p-6">
        <div className="w-full max-w-xs space-y-3">
          <div className="text-center">
            <div className="font-display text-2xl font-bold uppercase tracking-wider text-white/90">Who are you?</div>
            <div className="mt-1 text-xs text-white/40">Pick your name to continue</div>
          </div>
          {allowedUsers.map((u) => (
            <button
              key={u.id}
              onClick={() => pickUser(u)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:bg-white/10 active:scale-[0.98]"
            >
              <div className="font-display text-lg font-bold text-white/90">{u.name}</div>
              <div className="text-xs uppercase tracking-wider text-white/40">{u.title}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-coal-950 p-6">
      <div className="w-full max-w-xs space-y-4">
        <div className="text-center">
          <div className="font-display text-2xl font-bold uppercase tracking-wider text-white/90">Big Pickle Racing</div>
          <div className="mt-1 text-xs text-white/40">Enter team PIN to continue</div>
        </div>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          onKeyDown={(e) => { if (e.key === 'Enter') submitPin(); }}
          placeholder="PIN"
          autoFocus
          className={`${inputCls} text-center font-mono text-2xl tracking-[0.5em]`}
        />
        {error && <div className="text-center text-sm text-red-400">{error}</div>}
        {/* eslint-disable-next-line react/purity -- Date.now() snapshot for the lockout button state; benign */}
        <Btn kind="primary" onClick={submitPin} className="w-full" disabled={!pin || Date.now() < lockUntil}>
          Unlock
        </Btn>
        <div className="text-center font-mono text-[11px] text-white/25">v{APP_VERSION}</div>
      </div>
    </div>
  );
}

function PinField({ label, pinKey, settings, update, toast }) {
  const [val, setVal] = useState('');
  const [confirm, setConfirm] = useState('');
  const hasPin = !!settings[pinKey];

  const save = () => {
    if (val.length < 4) {
      toast('PIN must be at least 4 digits.');
      return;
    }
    if (val !== confirm) {
      toast('PINs do not match.');
      return;
    }
    const hash = hashPin(val);
    const newHashes = { ...getPinHashes(settings), [pinKey]: hash };
    update((s) => { s.settings[pinKey] = hash; });
    setVal('');
    setConfirm('');
    toast(`${label} set.`);
    // Push to the shared team file so every crew device uses the new PIN.
    if (getPat()) {
      publishTeamPins(newHashes)
        .then((r) => { if (r.pushed) toast('Published — all crew devices now use this PIN.'); })
        .catch(() => toast('Saved on this device; team publish failed.', 'error'));
    }
  };

  const clear = () => {
    if (!confirm(`Remove the ${label}?`)) return;
    const newHashes = { ...getPinHashes(settings), [pinKey]: null };
    update((s) => { s.settings[pinKey] = null; });
    toast(`${label} removed.`);
    if (getPat()) {
      publishTeamPins(newHashes)
        .then((r) => { if (r.pushed) toast('Published — that PIN no longer unlocks any device.'); })
        .catch(() => toast('Removed on this device; team publish failed.', 'error'));
    }
  };

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-white/80">{label}</div>
        <div className="text-[11px] text-white/40">{hasPin ? 'Set' : 'Not set'}</div>
      </div>
      <div className="flex gap-2">
        <input
          type="password"
          inputMode="numeric"
          value={val}
          onChange={(e) => setVal(e.target.value.replace(/\D/g, '').slice(0, 8))}
          placeholder={hasPin ? 'New PIN' : 'Set PIN'}
          className={`${inputCls} min-w-0 flex-1 font-mono`}
        />
        <input
          type="password"
          inputMode="numeric"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 8))}
          placeholder="Confirm"
          className={`${inputCls} min-w-0 flex-1 font-mono`}
        />
      </div>
      <div className="mt-2 flex gap-2">
        <Btn kind="primary" onClick={save} disabled={!val || !confirm} className="flex-1 !py-2 text-xs">
          {hasPin ? 'Change' : 'Set'}
        </Btn>
        {hasPin && (
          <Btn kind="ghost" onClick={clear} className="flex-1 !py-2 text-xs">Remove</Btn>
        )}
      </div>
    </div>
  );
}

/**
 * Crew management modal: team PINs + team users (admin only).
 * User edits publish to the shared team file so every device agrees.
 */
export function CrewModal({ state, update, toast, onClose, users, currentUserId }) {
  // Heal: fill blank names/titles on existing users from the defaults.
  // Never recreates missing users — a deleted member stays deleted.
  // Re-runs when the user list changes so blanks arriving via sync get healed
  // too; the heal is idempotent (no-op once names/titles are filled).
  useEffect(() => {
    const stored = state.settings.users;
    if (!Array.isArray(stored) || !stored.length) return;
    const seeds = defaultUsers();
    const byId = Object.fromEntries(seeds.map((u) => [u.id, u]));
    let changed = false;
    const next = stored.map((u) => {
      if (!u) return u;
      const seed = byId[u.id];
      if (!seed) return u;
      const name = u.name && u.name.trim() ? u.name : seed.name;
      const title = USER_TITLES.includes(u.title) ? u.title : seed.title;
      if (name !== u.name || title !== u.title) { changed = true; return { ...u, name, title }; }
      return u;
    });
    if (changed) update((s) => { s.settings.users = next; s.settings.usersUpdatedAt = Date.now(); });
  }, [state.settings.users, update]);
  const saveUsers = (next, msg, tombstones) => {
    update((s) => {
      s.settings.users = next;
      s.settings.usersUpdatedAt = Date.now();
      if (tombstones) s.settings.deletedUserIds = { ...(s.settings.deletedUserIds || {}), ...tombstones };
    });
    if (msg) toast(msg);
    if (getPat()) {
      const deleted = { ...(state.settings.deletedUserIds || {}), ...(tombstones || {}) };
      publishTeamUsers(next, deleted)
        .then((r) => {
          if (r.pushed) toast('Published — all crew devices updated.');
          // Adopt the merged result so a concurrent edit elsewhere isn't lost.
          if (r.merged) {
            update((s) => {
              s.settings.users = r.merged.users;
              s.settings.deletedUserIds = r.merged.deletedUserIds;
              s.settings.usersUpdatedAt = Date.now();
            });
          }
        })
        .catch(() => toast('Saved on this device; team publish failed.', 'error'));
    }
  };
  return (
    <Modal title="Crew Management" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <div className="mb-2 text-sm font-semibold text-white/80">Team PINs</div>
          <div className="mb-3 text-xs text-white/50">
            Each PIN unlocks only its roles. The app locks on every launch, on every device, and asks for a PIN — no PIN, no entry. PINs publish to the team automatically, so all crew devices share the same PINs.
          </div>
          <div className="space-y-2">
            {PIN_KEYS.map((k) => (
              <PinField key={k} label={pinLabel(k, users)} pinKey={k} settings={state.settings} update={update} toast={toast} />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-white/80">Team users</div>
            <div className="text-[11px] text-white/40">{users.length} {users.length === 1 ? 'user' : 'users'}</div>
          </div>
          <div className="mb-3 text-xs text-white/50">
            Change what each person can do, or add someone new. Changes publish to the whole crew automatically.
          </div>
          <div className="space-y-2">
            {users.map((u) => (
              <UserCard key={u.id} user={u} users={users} currentUserId={currentUserId} saveUsers={saveUsers} toast={toast} />
            ))}
          </div>
          <AddUserForm users={users} saveUsers={saveUsers} toast={toast} />
        </div>
      </div>
    </Modal>
  );
}

/** Toggle chip for one permission flag. */
function PermChip({ active, label, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition active:scale-95 ${
        active
          ? 'border-pickle-500/60 bg-pickle-500/20 text-pickle-200'
          : 'border-white/10 bg-white/[0.03] text-white/35'
      }`}
    >
      {label}
    </button>
  );
}

/** Edit one user: name, title, PIN group, permission flags, remove. */
function UserCard({ user, users, currentUserId, saveUsers, toast }) {
  const set = (patch, msg) => {
    const now = Date.now();
    const next = users.map((u) => (u.id === user.id ? { ...u, ...patch, updatedAt: now } : u));
    // Guard: at least one user must keep Settings access (or nobody can
    // ever open Crew Management again).
    if (!next.some((u) => u.canSettings)) {
      toast('Blocked: at least one user must keep Settings access.', 'error');
      return;
    }
    saveUsers(next, msg || `${patch.name || user.name} updated.`);
  };

  const remove = () => {
    if (users.length <= 1) {
      toast("Can't remove the last user.", 'error');
      return;
    }
    if (user.id === currentUserId) {
      toast("You can't remove the user you're logged in as.", 'error');
      return;
    }
    if (!confirm(`Remove ${user.name} from the crew?`)) return;
    const next = users.filter((u) => u.id !== user.id);
    if (!next.some((u) => u.canSettings)) {
      toast('Blocked: at least one user must keep Settings access.', 'error');
      return;
    }
    saveUsers(next, `${user.name} removed.`, { [user.id]: Date.now() });
  };

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <div>
        <div className="mb-1 text-[11px] uppercase tracking-wider text-white/40">Name</div>
        <input
          key={user.id + '-' + (user.name || 'blank')}
          defaultValue={user.name || ''}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== user.name) set({ name: v });
          }}
          placeholder="First name"
          autoComplete="off"
          aria-label="Name"
          className={`${inputCls} w-full font-semibold`}
        />
        <div className="mt-2 flex items-center gap-2">
          <select
            value={USER_TITLES.includes(user.title) ? user.title : 'Viewer'}
            onChange={(e) => set({ title: e.target.value })}
            aria-label="Title"
            className={`${inputCls} min-w-0 flex-1 font-semibold`}
          >
            {USER_TITLES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <Btn kind="ghost" onClick={remove} className="!px-2.5 !py-2 text-xs" title={`Remove ${user.name}`}>
            ✕
          </Btn>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="text-[11px] uppercase tracking-wider text-white/40">Unlocked by</div>
        <select
          value={user.pinGroup}
          onChange={(e) => set({ pinGroup: e.target.value })}
          className={`${inputCls} min-w-0 flex-1 !py-1.5 text-xs`}
        >
          {Object.entries(PIN_GROUP_LABELS).map(([g, label]) => (
            <option key={g} value={g}>{label}</option>
          ))}
        </select>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PERM_FLAGS.map((f) => (
          <PermChip key={f} active={!!user[f]} label={PERM_LABELS[f]} onToggle={() => set({ [f]: !user[f] })} />
        ))}
      </div>
    </div>
  );
}

/** Add a new user: name + PIN group + access template. */
function AddUserForm({ users, saveUsers, toast }) {
  const [name, setName] = useState('');
  const [pinGroup, setPinGroup] = useState('viewer');
  const [template, setTemplate] = useState('viewer');

  const add = () => {
    const clean = name.trim();
    if (!clean) {
      toast('Enter a name first.', 'error');
      return;
    }
    if (users.some((u) => u.name.toLowerCase() === clean.toLowerCase())) {
      toast('That name is already on the crew.', 'error');
      return;
    }
    const t = ACCESS_TEMPLATES[template] || ACCESS_TEMPLATES.viewer;
    const next = [...users, { id: 'u-' + uid(), name: clean, title: t.title, pinGroup, updatedAt: Date.now(), ...Object.fromEntries(PERM_FLAGS.map((f) => [f, !!t[f]])) }];
    setName('');
    saveUsers(next, `${clean} added — unlocked by the ${PIN_GROUP_LABELS[pinGroup]}.`);
  };

  return (
    <div className="mt-2 rounded-xl border border-dashed border-white/15 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">Add user</div>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          placeholder="First name"
          autoComplete="off"
          className={`${inputCls} min-w-0 flex-1`}
        />
        <Btn kind="primary" onClick={add} className="!py-2 text-xs">Add</Btn>
      </div>
      <div className="mt-2 text-[11px] text-white/40">First names only.</div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block">
          <div className="mb-1 text-[11px] uppercase tracking-wider text-white/40">Unlocked by</div>
          <select value={pinGroup} onChange={(e) => setPinGroup(e.target.value)} className={`${inputCls} w-full !py-1.5 text-xs`}>
            {Object.entries(PIN_GROUP_LABELS).map(([g, label]) => (
              <option key={g} value={g}>{label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className="mb-1 text-[11px] uppercase tracking-wider text-white/40">Access</div>
          <select value={template} onChange={(e) => setTemplate(e.target.value)} className={`${inputCls} w-full !py-1.5 text-xs`}>
            <option value="admin">Admin — everything</option>
            <option value="driver">Driver — log + garage</option>
            <option value="crew">Crew — log runs</option>
            <option value="viewer">Viewer — view only</option>
          </select>
        </label>
      </div>
    </div>
  );
}
