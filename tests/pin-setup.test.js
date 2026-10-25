/**
 * PIN setup tests: with the hard-coded default PINs removed from the code,
 * the roles logic must treat "no PINs saved" as unconfigured (the lock
 * screen then runs first-time setup), and a PIN the admin creates must
 * verify and unlock exactly its own group.
 *
 * Run via: npm test
 */
import { hashPin, verifyPin, hasAnyPin, getPinHashes, usersForPin, defaultUsers } from '../src/lib/roles.js';

let total = 0, ok = 0;
function T(name, fn) {
  total++;
  try { fn(); ok++; console.log('PASS pin-setup:', name); }
  catch (e) { console.log('FAIL pin-setup:', name, '-', e.message); }
}
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

T('empty settings have no PINs configured', () => {
  eq(hasAnyPin({}), false, 'hasAnyPin empty');
  eq(hasAnyPin(getPinHashes({})), false, 'hasAnyPin of empty hashes');
});

T('no PIN unlocks anyone when nothing is configured', () => {
  const users = defaultUsers();
  eq(usersForPin('1966', {}, users).length, 0, 'old default unlocks nobody');
  eq(usersForPin('0000', {}, users).length, 0, 'old viewer default unlocks nobody');
  eq(usersForPin('7391', {}, users).length, 0, 'any PIN unlocks nobody');
});

T('verifyPin rejects a missing hash', () => {
  eq(verifyPin('7391', null), false, 'null hash');
  eq(verifyPin('7391', undefined), false, 'undefined hash');
});

T('an admin-created PIN verifies and unlocks only the admin group', () => {
  const settings = { pinHashAdmin: hashPin('7391') };
  eq(hasAnyPin(settings), true, 'configured once admin PIN exists');
  eq(verifyPin('7391', settings.pinHashAdmin), true, 'correct PIN verifies');
  eq(verifyPin('7392', settings.pinHashAdmin), false, 'wrong PIN rejected');
  const unlocked = usersForPin('7391', settings, defaultUsers());
  eq(unlocked.length, 1, 'exactly one user unlocked');
  eq(unlocked[0].pinGroup, 'admin', 'unlocked user is the admin group');
});

T('each group PIN unlocks only its own group', () => {
  const settings = {
    pinHashAdmin: hashPin('1111'),
    pinHashDriver: hashPin('2222'),
    pinHashCrew: hashPin('3333'),
    pinHashViewer: hashPin('4444'),
  };
  const users = defaultUsers();
  eq(usersForPin('2222', settings, users).every((u) => u.pinGroup === 'driver'), true, 'driver PIN -> driver group only');
  eq(usersForPin('4444', settings, users).every((u) => u.pinGroup === 'viewer'), true, 'viewer PIN -> viewer group only');
  eq(usersForPin('9999', settings, users).length, 0, 'unknown PIN unlocks nobody');
});

console.log(`pin-setup: ${ok}/${total} passed`);
if (ok !== total) process.exitCode = 1;
