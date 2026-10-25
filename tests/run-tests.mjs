/**
 * Test runner: copies src/lib to a temp dir, patches extensionless imports
 * for Node ESM, and runs the race tests.
 * Usage: npm test  (or: node tests/run-tests.mjs)
 */
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const tmp = join(root, '.test-tmp');

rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
mkdirSync(join(tmp, 'tests'), { recursive: true });

// Copy lib, stub out store.js (imports react)
cpSync(join(root, 'src', 'lib'), tmp, { recursive: true });
writeFileSync(
  join(tmp, 'store.js'),
  "export const uid = () => 'id-'+Math.random().toString(36).slice(2,8);\nexport function useStore(){}\n"
);
// Patch extensionless relative imports for Node ESM
for (const f of ['teamSync.js', 'roles.js', 'io.js', 'physics.js', 'format.js', 'stats.js', 'weather.js', 'maintenance.js', 'setupLink.js', 'snapshots.js']) {
  const p = join(tmp, f);
  if (!existsSync(p)) continue;
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[A-Za-z_]+)'/g, "from '$1.js'"));
}
// Copy and repoint the test file
let test = readFileSync(join(here, 'sync-races.test.js'), 'utf8');
test = test.replace("'../src/lib/teamSync.js'", `'${join(tmp, 'teamSync.js')}'`);
test = test.replace("'../src/lib/roles.js'", `'${join(tmp, 'roles.js')}'`);
writeFileSync(join(tmp, 'tests', 'sync-races.test.js'), test);

let snapTest = readFileSync(join(here, 'snapshots.test.js'), 'utf8');
snapTest = snapTest.replace("'../src/lib/snapshots.js'", `'${join(tmp, 'snapshots.js')}'`);
writeFileSync(join(tmp, 'tests', 'snapshots.test.js'), snapTest);

let pushedTest = readFileSync(join(here, 'pushed-local.test.js'), 'utf8');
pushedTest = pushedTest.replace("'../src/lib/teamSync.js'", `'${join(tmp, 'teamSync.js')}'`);
writeFileSync(join(tmp, 'tests', 'pushed-local.test.js'), pushedTest);

let fgTest = readFileSync(join(here, 'foreground-sync.test.js'), 'utf8');
fgTest = fgTest.replace("'../src/lib/teamSync.js'", `'${join(tmp, 'teamSync.js')}'`);
writeFileSync(join(tmp, 'tests', 'foreground-sync.test.js'), fgTest);

let pinTest = readFileSync(join(here, 'pin-setup.test.js'), 'utf8');
pinTest = pinTest.replace("'../src/lib/roles.js'", `'${join(tmp, 'roles.js')}'`);
writeFileSync(join(tmp, 'tests', 'pin-setup.test.js'), pinTest);

try {
  execSync(`node --input-type=module -e "import('${join(tmp, 'tests', 'sync-races.test.js')}')"`, {
    stdio: 'inherit',
    cwd: root,
  });
  execSync(`node --input-type=module -e "import('${join(tmp, 'tests', 'snapshots.test.js')}')"`, {
    stdio: 'inherit',
    cwd: root,
  });
  execSync(`node --input-type=module -e "import('${join(tmp, 'tests', 'pushed-local.test.js')}')"`, {
    stdio: 'inherit',
    cwd: root,
  });
  execSync(`node --input-type=module -e "import('${join(tmp, 'tests', 'foreground-sync.test.js')}')"`, {
    stdio: 'inherit',
    cwd: root,
  });
  execSync(`node --input-type=module -e "import('${join(tmp, 'tests', 'pin-setup.test.js')}')"`, {
    stdio: 'inherit',
    cwd: root,
  });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
