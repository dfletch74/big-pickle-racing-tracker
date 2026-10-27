/**
 * Consistency scope tests — pins the exact behavior Dwayne checked
 * 2026-10-26 against his real data: Big Pickle has three 1/8-mile runs in
 * 2026, one of them a backup run. Backup runs never feed the grade, and the
 * grade needs at least 3 runs, so the 1/8 consistency must come back null
 * ("Need at least 3 runs") — and the fixture proves the same three runs
 * WOULD grade if the backup leaked in.
 */
import { raceRuns, filterDistance, consistency } from '../src/lib/stats.js';

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log(`  ok - ${name}`); }
  else { failed++; console.log(`  FAIL - ${name}`); }
}

const mk = (date, et, backup) => ({
  date, et, distance: '1/8', track: 'Medicine Hat Raceway', ...(backup ? { backup: true } : {}),
});
// Mirrors his sheet: two race runs + one backup run, all 2026, all 1/8.
const hisRuns = [mk('2026-06-21', 6.051, false), mk('2026-07-04', 6.085, false), mk('2026-08-22', 6.09, true)];

const raceOnly = filterDistance(raceRuns(hisRuns), '1/8').filter((r) => r.date.startsWith('2026'));
check('backup run is excluded, leaving 2 race runs', raceOnly.length === 2);
check('no grade with only 2 eligible runs', consistency(raceOnly, null) === null);

const leaked = filterDistance(hisRuns, '1/8').filter((r) => r.date.startsWith('2026'));
const leakedGrade = consistency(leaked, null);
check('fixture would grade if the backup leaked (sanity)', leakedGrade !== null && leakedGrade.n === 3);

// The minimum is 3 regardless of distance or backups.
check('two 1/4 race runs also give no grade', consistency([mk('2026-06-21', 9.4, false), mk('2026-07-04', 9.42, false)].map((r) => ({ ...r, distance: '1/4' })), null) === null);
check('three race runs do grade', consistency([mk('2026-06-21', 6.051, false), mk('2026-07-04', 6.085, false), mk('2026-08-22', 6.09, false)], null) !== null);

console.log(`consistency-scope: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
