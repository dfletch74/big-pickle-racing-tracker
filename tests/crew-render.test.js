/**
 * Crew screen render smoke tests.
 *
 * The lib suites test logic; they never render a component, so a screen can
 * be dead on arrival (v4.35's roles.js move dropped PIN_KEYS from Crew.jsx —
 * Crew Management crashed to a black screen the first time it was opened,
 * weeks later). These tests render the crew screens to HTML with rolldown
 * bundling the real component code, so an undefined name or a broken render
 * path fails HERE instead of on Dwayne's phone.
 *
 * Run from the original location (needs the project's node_modules).
 */
import { rolldown } from 'rolldown';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { rmSync } from 'fs';
import { defaultUsers, hashPin, getPinHashes } from '../src/lib/roles.js';

// Browser storage stubs (components read the saved token while rendering).
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundlePath = join(root, '.crew-bundle.mjs');

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log(`  ok - ${name}`); }
  else { failed++; console.log(`  FAIL - ${name}`); }
}

try {
  const bundle = await rolldown({
    input: join(root, 'src', 'components', 'Crew.jsx'),
    // Bare imports (react, xlsx, ...) resolve from node_modules at run time;
    // only the project's own files are bundled.
    external: (id) => !id.startsWith('.') && !id.startsWith('/'),
    transform: { jsx: { runtime: 'automatic' } },
    logLevel: 'silent',
  });
  await bundle.write({ file: bundlePath, format: 'esm' });
  const { CrewModal, LockScreen } = await import(bundlePath);

  const users = defaultUsers();
  const state = { settings: { users, pinHashAdmin: hashPin('1111') }, cars: [], runs: [], racers: [] };
  const noop = () => {};

  // The screen Dwayne opens to change PINs must actually render.
  const modalHtml = renderToString(createElement(CrewModal, {
    state, update: noop, toast: noop, onClose: noop, users, currentUserId: users[0].id,
  }));
  check('CrewModal renders the Team PINs section', modalHtml.includes('Team PINs'));
  check('CrewModal renders all four PIN fields', ['Admin PIN', 'Driver PIN', 'Crew PIN', 'Viewer PIN'].every((l) => modalHtml.includes(l)));
  check('CrewModal renders the Team users section', modalHtml.includes('Team users'));

  // Lock screen, both states: first-time setup and normal PIN entry.
  const setupHtml = renderToString(createElement(LockScreen, {
    pinHashes: {}, users, onUnlock: noop, onSetupPin: noop,
  }));
  check('LockScreen with no PINs shows first-time setup', setupHtml.includes('First-time setup'));

  const lockHtml = renderToString(createElement(LockScreen, {
    pinHashes: getPinHashes({ pinHashAdmin: hashPin('1111') }), users, onUnlock: noop, onSetupPin: noop,
  }));
  check('LockScreen with PINs shows PIN entry', lockHtml.includes('Enter team PIN'));
} finally {
  rmSync(bundlePath, { force: true });
}

console.log(`crew-render: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
