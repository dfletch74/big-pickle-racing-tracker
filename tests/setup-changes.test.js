/**
 * Setup-change badge tests — a badge appears only when a setup field was
 * recorded on BOTH the run and its predecessor AND the value differs.
 * A field showing up for the first time is new data, not a change.
 */
import { setupChanges } from '../src/lib/stats.js';

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log(`  ok - ${name}`); }
  else { failed++; console.log(`  FAIL - ${name}`); }
}

const prev = { jet: 96, lPsi: 12, rPsi: 12, comp: 5 };
const next = { jet: 98, lPsi: 12, rPsi: 11.5, comp: 5 };

const ch = setupChanges(next, prev);
check('two changed fields found', ch.length === 2);
check('jet change carries from/to', ch.find((c) => c.key === 'jet')?.from === 96 && ch.find((c) => c.key === 'jet')?.to === 98);
check('unchanged fields are not flagged', !ch.some((c) => c.key === 'lPsi' || c.key === 'comp'));
check('identical setups give no changes', setupChanges(prev, prev).length === 0);
check('first run (no predecessor) gives no changes', setupChanges(next, null).length === 0);
check('field new on the later run is not a change', setupChanges({ ...prev, revLim: 7000 }, prev).length === 0);
check('field dropped on the later run is not a change', setupChanges({ lPsi: 12 }, prev).length === 0);
check('labels come from SETUP_LABELS', ch.find((c) => c.key === 'rPsi')?.label === 'R PSI');

console.log(`setup-changes: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
