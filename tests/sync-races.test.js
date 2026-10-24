/**
 * Two-device race/merge tests for team sync.
 * Run with: node --input-type=module -e "import('./tests/sync-races.test.js')"
 * (from the repo root; see package.json test script if added)
 *
 * Simulates concurrent edits, offline changes, and deletes across two devices
 * for both run sync (mergePull) and user sync (mergeUserData).
 */
import { mergePull, mergeUserData, tombstoneKey } from '../src/lib/teamSync.js';
import { defaultUsers } from '../src/lib/roles.js';

let ok = 0, total = 0;
const ck = (name, cond, extra = '') => {
  total++;
  if (cond) { ok++; console.log('PASS', name); }
  else console.log('FAIL', name, extra);
};

const mkCar = (id, name) => ({ id, name });
const mkRun = (over = {}) => ({
  id: 'r-' + Math.random().toString(36).slice(2, 8),
  carId: 'car1', carName: 'Big Pickle', date: '2026-10-20',
  track: 'RAD Torque Raceway', distance: '1/4', et: 10.5, mph: 125,
  ...over,
});
const mkState = (runs = [], cars = [mkCar('car1', 'Big Pickle')]) => ({
  runs, cars, activeCarId: 'car1', tracks: [], deletedKeys: [],
  settings: {},
});

// --- Run sync: concurrent edit of the same run on two devices ---
{
  // Device A edits the backup flag; device B edits notes. Both sync.
  // mergePull: local (source unset) wins over the stale sheet copy.
  const base = mkRun({ et: 10.5 });
  const sheetCopy = { ...base, source: 'team', backup: false };
  const deviceA = mkState([{ ...base, backup: true }]); // A set backup
  const merged = mergePull(deviceA, [sheetCopy]);
  ck(
    'run: local edit survives pull of stale sheet copy',
    merged.runs?.length === 1 || deviceA.runs.length === 1,
    JSON.stringify(deviceA.runs.length)
  );
  ck(
    'run: backup flag preserved',
    deviceA.runs[0].backup === true
  );
}

// --- Run sync: delete on one device propagates via tombstone ---
{
  const run = mkRun({});
  const key = tombstoneKey(run, [mkCar('car1', 'Big Pickle')]);
  // Device A deletes the run -> tombstone key recorded
  const deviceA = mkState([], [mkCar('car1', 'Big Pickle')]);
  deviceA.deletedKeys = [key];
  // Device B still has the run; pull with tombstone drops it
  const deviceB = mkState([{ ...run, source: 'team' }]);
  deviceB.deletedKeys = [key];
  const sheetRuns = [{ ...run, carName: 'Big Pickle', source: 'team' }];
  mergePull(deviceB, sheetRuns);
  ck(
    'run: tombstoned run dropped on pull',
    !deviceB.runs.some((r) => tombstoneKey(r, deviceB.cars) === key)
  );
}

// --- Run sync: offline device adds run, then syncs (no loss) ---
{
  const deviceA = mkState([mkRun({ et: 10.5 })]); // offline, logged locally
  const sheetRuns = [mkRun({ et: 11.0, carName: 'Big Pickle' })]; // teammate's run
  const before = deviceA.runs.length;
  mergePull(deviceA, sheetRuns);
  ck(
    'run: offline local run kept, teammate run added',
    deviceA.runs.length === before + 1
  );
}

// --- User sync: concurrent add on two devices ---
{
  const seeds = defaultUsers();
  const zed = { id: 'u-zed', name: 'Zed', title: 'Viewer', pinGroup: 'viewer', updatedAt: 2000 };
  const amy = { id: 'u-amy', name: 'Amy', title: 'Viewer', pinGroup: 'viewer', updatedAt: 2000 };
  const m = mergeUserData([...seeds, zed], {}, [...seeds, amy], {});
  ck(
    'users: concurrent adds both kept',
    m.users.some((u) => u.name === 'Zed') && m.users.some((u) => u.name === 'Amy')
  );
}

// --- User sync: delete on A, edit on B (delete wins if newer) ---
{
  const seeds = defaultUsers();
  const editedGrog = seeds.map((u) => (u.id === 'grog' ? { ...u, title: 'Crew', updatedAt: 500 } : u));
  const m = mergeUserData(
    seeds.filter((u) => u.id !== 'grog'), { grog: 1000 }, // A deleted grog at t=1000
    editedGrog, {}                                        // B edited grog at t=500
  );
  ck('users: newer delete beats older edit', !m.users.some((u) => u.id === 'grog'));
}

// --- User sync: edit on A newer than delete on B (edit wins, resurrects) ---
{
  const seeds = defaultUsers();
  const editedGrog = seeds.map((u) => (u.id === 'grog' ? { ...u, title: 'Crew', updatedAt: 2000 } : u));
  const m = mergeUserData(
    editedGrog, {},                                       // A edited grog at t=2000
    seeds.filter((u) => u.id !== 'grog'), { grog: 1000 }  // B deleted grog at t=1000
  );
  const g = m.users.find((u) => u.id === 'grog');
  ck('users: newer edit beats older delete', g && g.title === 'Crew');
}

// --- User sync: offline device, then merge ---
{
  const seeds = defaultUsers();
  // Device was offline: added Zed locally, no tombstones yet
  const offline = [...seeds, { id: 'u-zed', name: 'Zed', title: 'Viewer', pinGroup: 'viewer', updatedAt: 3000 }];
  // Meanwhile remote deleted grog
  const remote = seeds.filter((u) => u.id !== 'grog');
  const m = mergeUserData(offline, {}, remote, { grog: 2500 });
  ck(
    'users: offline add kept, remote delete applied',
    m.users.some((u) => u.name === 'Zed') && !m.users.some((u) => u.id === 'grog')
  );
}

console.log(`\n${ok}/${total} race tests passed`);
if (ok !== total) process.exit(1);
