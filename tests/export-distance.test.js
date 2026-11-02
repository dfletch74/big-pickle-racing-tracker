/**
 * Export distance format tests (lib/io runsToCSV + parseImportFile).
 *
 * Dwayne (2026-11-02): opening the exported runs CSV showed every Distance
 * entry as "04-Jan" — Excel auto-converts a bare '1/4' cell into the date
 * Jan 4 (and '1/8' into Jan 8). The exporter now writes '1/4 mile' /
 * '1/8 mile', which spreadsheets leave alone and parseDistance still reads
 * back to the internal '1/4' / '1/8'. Run pre-fix, the word-format checks
 * fail with the bare fractions he saw converted.
 */
import { runsToCSV, parseImportFile } from '../src/lib/io.js';

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  if (actual === expected) { passed++; console.log(`  ok - ${name}`); }
  else { failed++; console.log(`  FAIL - ${name}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
}

const runs = [
  { carName: 'Big Pickle', date: '2026-07-03', time: '13:22', track: 'Medicine Hat Raceway', distance: '1/4', et: 9.516, mph: 141.2 },
  { carName: 'Big Pickle', date: '2026-06-21', time: '11:56', track: 'Medicine Hat Raceway', distance: '1/8', et: 6.051, mph: 112.4 },
];

const csv = runsToCSV(runs);
const lines = csv.trim().split('\n');
const di = lines[0].split(',').indexOf('Distance');
const cells = lines.slice(1).map((l) => l.split(',')[di]);

check('1/4 run exports as words', cells[0], '1/4 mile');
check('1/8 run exports as words', cells[1], '1/8 mile');
check('no bare 1/4 cell', cells.includes('1/4'), false);
check('no bare 1/8 cell', cells.includes('1/8'), false);

// Round-trip: the exported file must import back to the same distances.
const file = new File([csv], 'export.csv', { type: 'text/csv' });
const back = await parseImportFile(file, 'car-1', 'Medicine Hat Raceway');
check('round-trip run count', back.runs.length, 2);
check('round-trip 1/4 distance', back.runs.find((r) => r.et === 9.516)?.distance, '1/4');
check('round-trip 1/8 distance', back.runs.find((r) => r.et === 6.051)?.distance, '1/8');

// Back-compat: files exported by older versions (bare fractions) still parse.
const legacy = 'Car,Date,Time,Track,Distance,E.T.,MPH\nBig Pickle,2026-07-03,13:22,Medicine Hat Raceway,1/4,9.516,141.2\nBig Pickle,2026-06-21,11:56,Medicine Hat Raceway,1/8,6.051,112.4\n';
const legacyFile = new File([legacy], 'legacy.csv', { type: 'text/csv' });
const legacyBack = await parseImportFile(legacyFile, 'car-1', 'Medicine Hat Raceway');
check('legacy 1/4 still parses', legacyBack.runs.find((r) => r.et === 9.516)?.distance, '1/4');
check('legacy 1/8 still parses', legacyBack.runs.find((r) => r.et === 6.051)?.distance, '1/8');

console.log(`\nexport-distance: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
