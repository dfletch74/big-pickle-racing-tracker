/**
 * Local on-device snapshots of the whole app state.
 *
 * A snapshot is a frozen copy of the full persisted state (runs, tracks,
 * maintenance, checklists, settings — everything), kept in localStorage
 * under SNAP_KEY. Snapshots are taken automatically before destructive
 * operations (import, demo-data load, clear-all, and restore itself, so a
 * restore is always undoable) and manually from Settings → Team data.
 *
 * Snapshots never leave the device: they are not synced or published.
 * Only the newest MAX_SNAPS are kept.
 */
import { uid } from './store';
import { runKey } from './teamSync';

const SNAP_KEY = 'bpr-snapshots';
export const MAX_SNAPS = 10;

function readAll() {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeAll(arr) {
  try {
    localStorage.setItem(SNAP_KEY, JSON.stringify(arr));
  } catch {
    /* storage full/blocked — snapshots are best-effort, app keeps working */
  }
}

/**
 * Save a snapshot of `state`. Returns the snapshot metadata
 * { id, at, reason, runs }. `state` is deep-cloned so later edits
 * cannot mutate the stored copy.
 */
export function takeSnapshot(state, reason) {
  const snaps = readAll();
  const snap = {
    id: uid(),
    at: Date.now(),
    reason: String(reason || 'Manual'),
    runs: Array.isArray(state?.runs) ? state.runs.length : 0,
    state: structuredClone(state),
  };
  snaps.unshift(snap);
  while (snaps.length > MAX_SNAPS) snaps.pop();
  writeAll(snaps);
  const { state: _dropped, ...meta } = snap;
  return meta;
}

/** Metadata for every stored snapshot, newest first (no state payloads). */
export function listSnapshots() {
  return readAll().map(({ state: _dropped, ...meta }) => meta);
}

/** Full snapshot (including state) by id, or null. */
export function getSnapshot(id) {
  return readAll().find((s) => s.id === id) || null;
}

/** Delete one snapshot. Returns true if something was removed. */
export function deleteSnapshot(id) {
  const snaps = readAll();
  const kept = snaps.filter((s) => s.id !== id);
  if (kept.length === snaps.length) return false;
  writeAll(kept);
  return true;
}

/**
 * After restoring a snapshot, drop any run-delete tombstones whose keys
 * match runs present in the restored state — otherwise a resurrected run
 * would be silently excluded from the next publish.
 * Mutates and returns `s`.
 */
export function dropTombstonesForRuns(s) {
  if (!s || !Array.isArray(s.runs)) return s;
  const keys = new Set(s.runs.map((r) => runKey(r)));
  if (Array.isArray(s.deletedKeys)) {
    s.deletedKeys = s.deletedKeys.filter((k) => !keys.has(k));
  }
  return s;
}
