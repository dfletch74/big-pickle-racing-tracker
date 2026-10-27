/**
 * Wind-preserving sync merge tests.
 *
 * The 2026-10-19 ERA5 backfill put wind on all 38 sheet runs; an app sync on
 * 2026-10-21 blanked every wind cell because the publishing phone's local
 * runs predated the backfill and "local wins" wrote its empty wind fields
 * over the sheet's. Wind is capture-only (never typed or edited), so both
 * merge directions now fill it where a copy simply doesn't have it — while
 * every real local value and edit still wins.
 */
import { mergePull, fillMissingWind } from '../src/lib/teamSync.js';

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log(`  ok - ${name}`); }
  else { failed++; console.log(`  FAIL - ${name}`); }
}

// fillMissingWind: fills gaps only, never overwrites.
{
  const target = { windMph: 9 };
  fillMissingWind(target, { windMph: 4, windDir: 193, headwindMph: -3.7 });
  check('existing wind value is kept', target.windMph === 9);
  check('missing wind dir is filled', target.windDir === 193);
  check('missing headwind is filled', target.headwindMph === -3.7);
  const untouched = { date: '2026-08-22' };
  fillMissingWind(untouched, null);
  check('null source is a no-op', untouched.windMph === undefined);
}

// mergePull: a local run wins over its sheet copy, but gains the sheet's wind.
{
  const car = { id: 'car1', name: 'Big Pickle' };
  const localRun = {
    id: 'r1', carId: 'car1', date: '2026-08-22', track: 'Central Alberta Raceway',
    et: 6.17, distance: '1/8', backup: true, notes: 'my edit',
  };
  const teamRun = {
    carName: 'Big Pickle', date: '2026-08-22', track: 'Central Alberta Raceway',
    et: 6.17, distance: '1/8', backup: true, windMph: 4, windDir: 193, headwindMph: -3.7,
  };
  const s = { runs: [localRun], cars: [car], settings: {}, deletedKeys: [], tracks: [], activeCarId: 'car1' };
  mergePull(s, [teamRun]);
  check('no duplicate run is added', s.runs.length === 1);
  check('local edit is preserved', s.runs[0].notes === 'my edit');
  check('local backup flag is preserved', s.runs[0].backup === true);
  check('wind healed onto the local run', s.runs[0].windMph === 4 && s.runs[0].windDir === 193 && s.runs[0].headwindMph === -3.7);
}

console.log(`wind-merge: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
