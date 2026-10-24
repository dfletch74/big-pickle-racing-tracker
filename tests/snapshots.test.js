/**
 * Snapshot tests: take/list/get/delete, 10-snapshot cap,
 * deep-clone isolation, and tombstone cleanup on restore.
 *
 * Run via: npm test   (tests/run-tests.mjs copies src/lib to a temp dir,
 * stubs localStorage-free store.js, and patches extensionless imports)
 */
import { takeSnapshot, listSnapshots, getSnapshot, deleteSnapshot, dropTombstonesForRuns, MAX_SNAPS } from '../src/lib/snapshots.js';

// In-memory localStorage stub (snapshots.js only touches it inside functions,
// so assigning here runs before any snapshot call).
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

let total = 0, ok = 0;
function T(name, fn) {
  total++;
  mem.clear();
  try { fn(); ok++; console.log('PASS snapshots:', name); }
  catch (e) { console.log('FAIL snapshots:', name, '-', e.message); }
}
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

const mkState = (n) => ({
  runs: Array.from({ length: n }, (_, i) => ({
    id: `r${i}`, carName: 'Breakaway', date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    track: 'RAD Torque Raceway', et: 10 + i * 0.1, distance: '1/4',
  })),
  tracks: [{ id: 't1', name: 'RAD Torque Raceway' }],
  deletedKeys: [],
  settings: {},
});

T('take + list returns metadata newest-first', () => {
  const s = mkState(3);
  takeSnapshot(s, 'first');
  takeSnapshot(s, 'second');
  const list = listSnapshots();
  eq(list.length, 2, 'count');
  eq(list[0].reason, 'second', 'newest first');
  eq(list[1].reason, 'first', 'older second');
  eq(list[0].runs, 3, 'run count in meta');
  if ('state' in list[0]) throw new Error('list should not include state payload');
});

T('getSnapshot returns full frozen state', () => {
  const s = mkState(2);
  const meta = takeSnapshot(s, 'x');
  const full = getSnapshot(meta.id);
  eq(full.state.runs.length, 2, 'state runs');
  eq(getSnapshot('nope'), null, 'missing id -> null');
});

T('stored snapshot is isolated from later edits', () => {
  const s = mkState(2);
  const meta = takeSnapshot(s, 'x');
  s.runs.push({ id: 'rx', carName: 'Breakaway', date: '2026-07-09', track: 'RAD', et: 9.9, distance: '1/4' });
  s.runs[0].et = 1.1;
  const full = getSnapshot(meta.id);
  eq(full.state.runs.length, 2, 'push did not leak into snapshot');
  eq(full.state.runs[0].et, 10, 'mutation did not leak into snapshot');
});

T('keeps only the newest MAX_SNAPS', () => {
  const s = mkState(1);
  for (let i = 0; i < MAX_SNAPS + 4; i++) takeSnapshot(s, `s${i}`);
  const list = listSnapshots();
  eq(list.length, MAX_SNAPS, 'cap');
  eq(list[0].reason, `s${MAX_SNAPS + 3}`, 'newest kept');
  eq(list[list.length - 1].reason, 's4', 'oldest kept');
});

T('deleteSnapshot removes one entry', () => {
  const s = mkState(1);
  const a = takeSnapshot(s, 'a');
  takeSnapshot(s, 'b');
  eq(deleteSnapshot(a.id), true, 'deleted');
  eq(deleteSnapshot('missing'), false, 'missing -> false');
  const list = listSnapshots();
  eq(list.length, 1, 'one left');
  eq(list[0].reason, 'b', 'right one left');
});

T('dropTombstonesForRuns clears tombstones for restored runs', () => {
  const s = mkState(2);
  // tombstone for run r0 (as publishDraft would record it) + one unrelated key
  s.deletedKeys = ['breakaway|2026-07-01|RAD Torque Raceway|10|1/4', 'other|2020-01-01|X|9|1/4'];
  dropTombstonesForRuns(s);
  eq(s.deletedKeys.length, 1, 'one tombstone dropped');
  eq(s.deletedKeys[0], 'other|2020-01-01|X|9|1/4', 'unrelated tombstone kept');
});

T('dropTombstonesForRuns tolerates missing deletedKeys', () => {
  const s = mkState(1);
  delete s.deletedKeys;
  dropTombstonesForRuns(s); // must not throw
  eq(s.runs.length, 1, 'runs untouched');
});

T('takeSnapshot handles empty state', () => {
  const meta = takeSnapshot(null, 'empty');
  eq(meta.runs, 0, 'null state -> 0 runs');
  eq(listSnapshots().length, 1, 'stored');
});

console.log(`\n${ok}/${total} snapshot tests passed`);
if (ok !== total) process.exit(1);
