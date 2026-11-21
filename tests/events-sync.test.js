/**
 * Elimination events sync tests — mergeTeamEvents is the whole contract:
 * union by event id, per-event last-writer-wins on updatedAt (ties keep
 * local), and tombstones that remove an event everywhere unless it was
 * re-edited after the delete.
 */
import { mergeTeamEvents } from '../src/lib/teamSync.js';

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log(`  ok - ${name}`); }
  else { failed++; console.log(`  FAIL - ${name}`); }
}

const ev = (id, updatedAt, name = id) => ({
  id, name, trackId: 't1', track: 'RAD Torque Raceway', date: '2026-07-03', distance: '1/4',
  rounds: [{ n: 1, dial: '9.50', rt: '', et: '', mph: '', oppDial: '', result: 'W' }],
  updatedAt,
});

// Union: disjoint events from both sides all survive.
{
  const m = mergeTeamEvents([ev('a', 100)], [ev('b', 100)], []);
  check('union keeps both events', m.events.length === 2 && m.deleted.length === 0);
}

// Last-writer-wins per event.
{
  const newer = mergeTeamEvents([ev('a', 100, 'old')], [ev('a', 200, 'new')], []);
  check('newer remote copy wins', newer.events[0].name === 'new');
  const localNewer = mergeTeamEvents([ev('a', 300, 'local-new')], [ev('a', 200, 'remote')], []);
  check('newer local copy wins', localNewer.events[0].name === 'local-new');
  const tie = mergeTeamEvents([ev('a', 200, 'local')], [ev('a', 200, 'remote')], []);
  check('tie keeps local', tie.events[0].name === 'local');
}

// Tombstones.
{
  const gone = mergeTeamEvents([ev('a', 100)], [], [{ id: 'a', at: 150 }]);
  check('tombstone newer than the event removes it', gone.events.length === 0 && gone.deleted.length === 1);
  const back = mergeTeamEvents([ev('a', 200)], [], [{ id: 'a', at: 150 }]);
  check('re-edit after delete resurrects the event', back.events.length === 1 && back.deleted.length === 0);
  const remoteGone = mergeTeamEvents([ev('a', 100)], [ev('a', 100)], [{ id: 'a', at: 100 }]);
  check('tombstone at the same instant as the last edit still removes it', remoteGone.events.length === 0);
}

// Legacy events without updatedAt merge as 0 and survive without tombstones.
{
  const legacy = { id: 'old', name: 'Old', track: 'X', date: '2025-08-09', distance: '1/4', rounds: [] };
  const m = mergeTeamEvents([legacy], [], []);
  check('legacy event (no updatedAt) survives', m.events.length === 1 && m.events[0].updatedAt === 0);
}

// Idempotence: merging a merged result with the same remote changes nothing.
{
  const once = mergeTeamEvents([ev('a', 100), ev('b', 50)], [ev('b', 90), ev('c', 10)], [{ id: 'c', at: 20 }]);
  const twice = mergeTeamEvents(once.events, [ev('b', 90), ev('c', 10)], once.deleted);
  check('merge is idempotent', JSON.stringify(once.events) === JSON.stringify(twice.events)
    && JSON.stringify(once.deleted) === JSON.stringify(twice.deleted));
}

console.log(`events-sync: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
