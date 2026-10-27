/**
 * Chart axis formatting tests (lib/format fmtAxisTick).
 *
 * Dwayne (2026-10-26): on Insight → Graphs with DA selected, the axis read
 * "2.9e+3, 3.9e+3, 4.9e+3" — the tick formatter switched any value >= 1000 to
 * exponential notation. DA in feet must read as plain numbers ("2,900").
 * Run against the pre-fix formatter this suite fails with his exact strings.
 */
import { fmtAxisTick } from '../src/lib/format.js';

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  if (actual === expected) { passed++; console.log(`  ok - ${name}`); }
  else { failed++; console.log(`  FAIL - ${name}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
}

// DA-scale values (feet) — the reported bug.
check('DA tick 2900', fmtAxisTick(2900), '2,900');
check('DA tick 3900', fmtAxisTick(3900), '3,900');
check('DA tick 4900', fmtAxisTick(4900), '4,900');
check('DA tick 5035 rounds plainly', fmtAxisTick(5035), '5,035');
check('DA tick 3196', fmtAxisTick(3196), '3,196');

// Ordinary values keep their existing shape.
check('ET tick', fmtAxisTick(6.051), '6.051');
check('MPH tick', fmtAxisTick(146.2), '146.2');
check('zero', fmtAxisTick(0), '0');
check('negative headwind', fmtAxisTick(-3.7), '-3.7');
check('sub-1000 integer', fmtAxisTick(850), '850');

console.log(`charts-format: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
