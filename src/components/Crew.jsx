import { useState } from 'react';
import { Modal, Btn, inputCls } from './ui';
import { ROLES, hashPin, verifyPin, saveRole } from '../lib/roles';
import { getPat, publishTeamPins } from '../lib/teamSync';
import { APP_VERSION } from '../version';

// Which roles each PIN unlocks.
const PIN_ROLES = {
  pinHashAdmin: ['admin'],
  pinHashDriver: ['driver'],
  pinHashCrew: ['crew'],
  pinHashViewer: ['viewer', 'temp', 'grog'],
};

const PIN_LABELS = {
  pinHashAdmin: 'Admin PIN (Fletch)',
  pinHashDriver: 'Driver PIN (Dean)',
  pinHashCrew: 'Crew PIN (Ethan)',
  pinHashViewer: 'Viewer PIN (Hughie, Temp, Grog)',
};

const PIN_KEYS = Object.keys(PIN_ROLES);

export function getPinHashes(settings) {
  const out = {};
  for (const k of PIN_KEYS) out[k] = settings[k] || null;
  return out;
}

export function hasAnyPin(settings) {
  return PIN_KEYS.some((k) => !!settings[k]);
}

// Given a PIN, return the role IDs it unlocks.
export function rolesForPin(pin, settings) {
  const h = getPinHashes(settings);
  const roles = [];
  for (const [key, roleIds] of Object.entries(PIN_ROLES)) {
    if (h[key] && verifyPin(pin, h[key])) {
      roles.push(...roleIds);
    }
  }
  return [...new Set(roles)];
}

/**
 * Lock screen: PIN entry, then role picker (only roles unlocked by that PIN).
 * Shown on EVERY app start, on every device. `pinHashes` is the effective
 * set of team PIN hashes (shared team file, falling back to this device's).
 * No PIN = no entry.
 */
export function LockScreen({ pinHashes, onUnlock }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [stage, setStage] = useState('pin'); // pin | role
  const [allowedRoles, setAllowedRoles] = useState([]);
  const [failCount, setFailCount] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);

  const configured = hasAnyPin(pinHashes || {});

  if (!configured) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-coal-950 p-6">
        <div className="w-full max-w-xs space-y-4 text-center">
          <div className="font-display text-2xl font-bold uppercase tracking-wider text-white/90">Big Pickle Racing</div>
          <div className="text-sm text-white/50">Team PINs aren&apos;t set up yet. An admin needs to set them on their device first.</div>
          <div className="font-mono text-[11px] text-white/25">v{APP_VERSION}</div>
        </div>
      </div>
    );
  }

  const submitPin = () => {
    if (Date.now() < lockUntil) return;
    const roles = rolesForPin(pin, pinHashes || {});
    if (roles.length > 0) {
      setError('');
      setFailCount(0);
      setAllowedRoles(roles);
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

  const pickRole = (roleId) => {
    saveRole(roleId);
    onUnlock(roleId);
  };

  if (stage === 'role') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-coal-950 p-6">
        <div className="w-full max-w-xs space-y-3">
          <div className="text-center">
            <div className="font-display text-2xl font-bold uppercase tracking-wider text-white/90">Who are you?</div>
            <div className="mt-1 text-xs text-white/40">Pick your name to continue</div>
          </div>
          {allowedRoles.map((id) => (
            <button
              key={id}
              onClick={() => pickRole(id)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:bg-white/10 active:scale-[0.98]"
            >
              <div className="font-display text-lg font-bold text-white/90">{ROLES[id].label}</div>
              <div className="text-xs uppercase tracking-wider text-white/40">{ROLES[id].title}</div>
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
 * Crew management modal: set/change per-role PINs, view roles.
 * Only accessible to admin (Fletch).
 */
export function CrewModal({ state, update, toast, onClose }) {
  // Factory defaults are visible in the public repo — warn until they're changed.
  const usingDefaults =
    state.settings.pinHashAdmin === hashPin('1966') ||
    state.settings.pinHashCrew === hashPin('2007') ||
    state.settings.pinHashViewer === hashPin('0000');
  return (
    <Modal title="Crew Management" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <div className="mb-2 text-sm font-semibold text-white/80">Team PINs</div>
          {usingDefaults && (
            <div className="mb-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
              You're still on the factory-default PINs, which are visible in the public code. Change them below so only the crew knows them.
            </div>
          )}
          <div className="mb-3 text-xs text-white/50">
            Each PIN unlocks only its roles. The app locks on every launch, on every device, and asks for a PIN — no PIN, no entry. PINs publish to the team automatically, so all crew devices share the same PINs.
          </div>
          <div className="space-y-2">
            {PIN_KEYS.map((k) => (
              <PinField key={k} label={PIN_LABELS[k]} pinKey={k} settings={state.settings} update={update} toast={toast} />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold text-white/80">Roles</div>
          <div className="space-y-1.5">
            {Object.entries(ROLES).map(([id, r]) => {
              const perms = [];
              if (r.canLog) perms.push('log runs');
              if (r.canDelete) perms.push('delete');
              if (r.canSettings) perms.push('settings');
              if (!perms.length) perms.push('view only');
              return (
                <div key={id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                  <div>
                    <div className="text-sm font-semibold text-white/90">{r.label}</div>
                    <div className="text-[11px] uppercase tracking-wider text-white/40">{r.title}</div>
                  </div>
                  <div className="text-xs text-white/50">{perms.join(' · ')}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
