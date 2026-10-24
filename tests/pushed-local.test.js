/**
 * clearPushedLocalFlag tests: only runs byte-identical to their pre-publish
 * snapshot stop being local. Mid-sync edits, mid-sync additions, team runs
 * and demo runs are untouched.
 *
 * Run via: npm test
 */
import { clearPushedLocalFlag } from '../src/lib/teamSync.js';

let total = 0, ok = 0;
function T(name, fn) {
  total++;
  try { fn(); ok++; console.log('PASS pushed-local:', name); }
  catch (e) { console.log('FAIL pushed-local:', name, '-', e.message); }
}
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

const mkRun = (id, source, et) => ({
  id, carId: 'c1', date: '2026-10-20', track: 'RAD Torque Raceway',
  et, distance: '1/4', ...(source ? { source } : {}),
});

T('unchanged local run is marked team', () => {
  const run = mkRun('r1', undefined, 9.5);
  const snap = new Map([['r1', JSON.stringify(run)]]);
  clearPushedLocalFlag([run], snap);
  eq(run.source, 'team', 'source');
});

T('edited local run stays local', () => {
  const before = mkRun('r1', undefined, 9.5);
  const snap = new Map([['r1', JSON.stringify(before)]]);
  const after = mkRun('r1', undefined, 9.4); // ET changed mid-sync
  clearPushedLocalFlag([after], snap);
  eq(after.source, undefined, 'source stays unset');
});

T('run added mid-sync stays local', () => {
  const run = mkRun('r9', undefined, 9.5);
  clearPushedLocalFlag([run], new Map()); // not in snapshot
  eq(run.source, undefined, 'source stays unset');
});

T('team and demo runs untouched', () => {
  const team = mkRun('r2', 'team', 9.5);
  const demo = mkRun('r3', 'demo', 9.5);
  const snap = new Map([['r2', JSON.stringify(team)], ['r3', JSON.stringify(demo)]]);
  clearPushedLocalFlag([team, demo], snap);
  eq(team.source, 'team', 'team stays');
  eq(demo.source, 'demo', 'demo stays');
});

T('tolerates empty input', () => {
  clearPushedLocalFlag([], new Map());
  clearPushedLocalFlag(null, new Map());
  clearPushedLocalFlag(undefined, new Map());
});

console.log(`\n${ok}/${total} pushed-local tests passed`);
if (ok !== total) process.exit(1);
