import { useState } from 'react';
import { Modal, Btn, inputCls } from './ui';
import { ROLES, ROLE_IDS, hashPin, verifyPin, saveRole } from '../lib/roles';

/**
 * Lock screen: PIN entry, then role picker.
 * Shown on app start when a team PIN is set.
 */
export function LockScreen({ pinHash, onUnlock }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [stage, setStage] = useState('pin'); // pin | role

  const submitPin = () => {
    if (verifyPin(pin, pinHash)) {
      setError('');
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
          {ROLE_IDS.map((id) => (
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

/**
 * Crew management modal: set/change team PIN, view roles.
 * Only accessible to admin (Fletch).
 */
export function CrewModal({ state, update, toast, onClose }) {
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const hasPin = !!state.settings.teamPinHash;

  const setPin = () => {
    if (newPin.length < 4) {
      toast('PIN must be at least 4 digits.');
      return;
    }
    if (newPin !== confirmPin) {
      toast('PINs do not match.');
      return;
    }
    update((s) => { s.settings.teamPinHash = hashPin(newPin); });
    setNewPin('');
    setConfirmPin('');
    toast('Team PIN set. The app will lock on next launch.');
  };

  const clearPin = () => {
    if (!confirm('Remove the team PIN? The app will no longer lock on launch.')) return;
    update((s) => { s.settings.teamPinHash = null; });
    toast('Team PIN removed.');
  };

  return (
    <Modal title="Crew Management" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <div className="mb-2 text-sm font-semibold text-white/80">Team PIN</div>
          <div className="text-xs text-white/50 mb-3">
            {hasPin
              ? 'A PIN is set. The app locks on launch and asks who you are.'
              : 'No PIN set. Anyone who opens the app gets full access.'}
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              inputMode="numeric"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder={hasPin ? 'New PIN' : 'Set PIN'}
              className={`${inputCls} min-w-0 flex-1 font-mono`}
            />
            <input
              type="password"
              inputMode="numeric"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="Confirm"
              className={`${inputCls} min-w-0 flex-1 font-mono`}
            />
          </div>
          <div className="mt-2 flex gap-2">
            <Btn kind="primary" onClick={setPin} disabled={!newPin || !confirmPin} className="flex-1">
              {hasPin ? 'Change PIN' : 'Set PIN'}
            </Btn>
            {hasPin && (
              <Btn kind="ghost" onClick={clearPin} className="flex-1">Remove</Btn>
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold text-white/80">Roles</div>
          <div className="space-y-1.5">
            {ROLE_IDS.map((id) => {
              const r = ROLES[id];
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
          <div className="mt-2 text-[11px] text-white/35">
            After entering the PIN, each person picks their name. Only Fletch (Admin) can delete runs or change settings.
          </div>
        </div>
      </div>
    </Modal>
  );
}
