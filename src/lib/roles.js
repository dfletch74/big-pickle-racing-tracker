/**
 * Team roles & PIN lock.
 * Simple honor-system access control for a trusted crew:
 * - A team PIN keeps random people out (set by Fletch in Settings).
 * - After PIN, pick who you are; the role gates UI (no delete for non-admins, etc.).
 * This is NOT server-side security — it's accident prevention for a local-first app.
 */

export const ROLES = {
  admin: { label: 'Dwayne', title: 'Admin', canDelete: true, canLog: true, canSettings: true, canSync: true },
  driver: { label: 'Dean', title: 'Driver', canDelete: false, canLog: true, canSettings: false, canSync: true },
  crew: { label: 'Ethan', title: 'Crew', canDelete: false, canLog: true, canSettings: false, canSync: true },
  temp: { label: 'Temp Worker', title: 'Viewer', canDelete: false, canLog: false, canSettings: false, canSync: true },
  viewer: { label: 'Hughie', title: 'Viewer', canDelete: false, canLog: false, canSettings: false, canSync: true },
  grog: { label: 'Grog', title: 'Viewer', canDelete: false, canLog: false, canSettings: false, canSync: true },
};

// Permission flags every user carries. canGarage controls the Garage tab
// (previously hardcoded to Dwayne + Dean).
export const PERM_FLAGS = ['canLog', 'canDelete', 'canSettings', 'canSync', 'canGarage'];
export const PERM_LABELS = {
  canLog: 'Log runs',
  canDelete: 'Delete',
  canSettings: 'Settings',
  canSync: 'Team sync',
  canGarage: 'Garage',
};

// Which PIN group unlocks the user: 'admin' | 'driver' | 'crew' | 'viewer'
// (maps to pinHashAdmin / pinHashDriver / pinHashCrew / pinHashViewer).
const SEED_PIN_GROUPS = { admin: 'admin', driver: 'driver', crew: 'crew', temp: 'viewer', viewer: 'viewer', grog: 'viewer' };
const SEED_GARAGE = { admin: true, driver: true };

/** Seed user list, from the original hardcoded roles (one-time migration). */
export function defaultUsers() {
  return Object.entries(ROLES).map(([id, r]) => ({
    id,
    name: r.label,
    title: r.title,
    pinGroup: SEED_PIN_GROUPS[id] || 'viewer',
    canLog: !!r.canLog,
    canDelete: !!r.canDelete,
    canSettings: !!r.canSettings,
    canSync: !!r.canSync,
    canGarage: !!SEED_GARAGE[id],
  }));
}

/** Find a user by id in a (possibly dynamic) users list. */
export function getUser(users, id) {
  if (!Array.isArray(users) || !id) return null;
  return users.find((u) => u.id === id) || null;
}

/** Effective users: stored list, or the seed when nothing stored yet. */
export function effectiveUsers(stored) {
  return Array.isArray(stored) && stored.length ? stored : defaultUsers();
}


// Simple (non-crypto) hash for the PIN — keeps it out of plaintext in storage.
// This is a deterrent, not real security.
export function hashPin(pin) {
  let h = 0x811c9dc5;
  const s = String(pin);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 'p' + h.toString(36);
}

export function verifyPin(pin, hash) {
  if (!hash) return false;
  return hashPin(pin) === hash;
}

const ROLE_KEY = 'bpr-crew-role';

export function saveRole(roleId) {
  try {
    if (roleId) localStorage.setItem(ROLE_KEY, roleId);
    else localStorage.removeItem(ROLE_KEY);
  } catch {}
}

export function clearRole() {
  try { localStorage.removeItem(ROLE_KEY); } catch {}
}
