/**
 * foregroundSyncDue tests: the throttle that decides whether returning to
 * the foreground re-runs the team sync (iOS resumes home-screen apps
 * without reloading, so the on-open sync never fires again on its own).
 *
 * Run via: npm test
 */
import { foregroundSyncDue, FOREGROUND_SYNC_MIN_GAP_MS } from '../src/lib/teamSync.js';

let total = 0, ok = 0;
function T(name, fn) {
  total++;
  try { fn(); ok++; console.log('PASS foreground-sync:', name); }
  catch (e) { console.log('FAIL foreground-sync:', name, '-', e.message); }
}
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

const NOW = 1_000_000_000;

T('never synced (0) is due', () => {
  eq(foregroundSyncDue(0, NOW), true, 'due');
});

T('never synced (undefined) is due', () => {
  eq(foregroundSyncDue(undefined, NOW), true, 'due');
});

T('30s after last sync is not due (default gap 60s)', () => {
  eq(foregroundSyncDue(NOW - 30_000, NOW), false, 'not due');
});

T('exactly at the gap is due', () => {
  eq(foregroundSyncDue(NOW - FOREGROUND_SYNC_MIN_GAP_MS, NOW), true, 'due');
});

T('5 minutes after last sync is due', () => {
  eq(foregroundSyncDue(NOW - 300_000, NOW), true, 'due');
});

T('custom gap is respected', () => {
  eq(foregroundSyncDue(NOW - 15_000, NOW, 10_000), true, 'due past custom gap');
  eq(foregroundSyncDue(NOW - 5_000, NOW, 10_000), false, 'not due inside custom gap');
});

console.log(`foreground-sync: ${ok}/${total} passed`);
if (ok !== total) process.exitCode = 1;
