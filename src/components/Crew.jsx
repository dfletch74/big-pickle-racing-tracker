import { useState } from 'react';
import { Modal, Btn, inputCls } from './ui';
import { ROLES, hashPin, verifyPin, saveRole } from '../lib/roles';

// Which roles each PIN unlocks.
const PIN_ROLES = {
  pinHashAdmin: ['admin'],
  pinHashDriver: ['driver'],
  pinHashCrew: ['crew'],
  pinHashViewer: ['viewer', 'temp'],
};

const PIN_LABELS = {
  pinHashAdmin: 'Admin PIN (Fletch)',
  pinHashDriver: 'Driver PIN (Dean)',
  pinHashCrew: 'Crew PIN (Ethan)',
  pinHashViewer: 'Viewer PIN (Hughie, Temp)',
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
 * Shown on app start when any team PIN is set.
 */
export function LockScreen({ settings, onUnlock }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [stage, setStage] = useState('pin'); // pin | role
  const [allowedRoles, setAllowedRoles] = useState([]);

  const submitPin = () => {
    const roles = rolesForPin(pin, settings);
    if (roles.length > 0) {
      setError('');
      setAllowedRoles(roles);
      setStage('role');
    } else {
      setError('Wrong PIN. Try again.');
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
        <Btn kind="primary" onClick={submitPin} className="w-full" disabled={!pin}>
          Unlock
        </Btn>
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
    update((s) => { s.settings[pinKey] = hashPin(val); });
    setVal('');
    setConfirm('');
    toast(`${label} set.`);
  };

  const clear = () => {
    if (!confirm(`Remove the ${label}?`)) return;
    update((s) => { s.settings[pinKey] = null; });
    toast(`${label} removed.`);
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
  return (
    <Modal title="Crew Management" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <div className="mb-2 text-sm font-semibold text-white/80">Team PINs</div>
          <div className="mb-3 text-xs text-white/50">
            Each PIN unlocks only its roles. The app locks on launch and asks for a PIN, then shows just the names that PIN allows.
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
