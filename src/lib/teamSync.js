import { uid } from './store';
import { parseImportFile, runsToCSV } from './io';
import { densityAltitudeFt, stationPressureHpa } from './physics';

/**
 * Team data sync — two-way with the shared sheet on GitHub.
 *
 * PULL (always): the sheet is fetched and merged into the app. Previously
 * synced team runs are replaced wholesale; runs logged locally are untouched.
 *
 * PUBLISH (when a GitHub token is saved): local runs are merged back into the
 * sheet and pushed. Pull-then-push with the file SHA gives optimistic
 * concurrency — a 409 retries the whole cycle.
 *
 * The sheet's Car column decides which car each run belongs to. Cars named
 * in the sheet are created locally if missing, so car identity survives
 * across devices regardless of local car IDs. Demo runs are never published.
 */

export const TEAM_CSV_DEFAULT_URL =
  'https://raw.githubusercontent.com/dfletch74/big-pickle-racing-tracker/main/data/Big_Pickle_runs_2026.csv';

export const teamCsvUrl = (state) => state.settings?.teamCsvUrl || TEAM_CSV_DEFAULT_URL;
export const teamSyncOnOpen = (state) => state.settings?.teamSyncOnOpen !== false;

const PAT_KEY = 'bpr-github-pat';
export const getPat = () => { try { return localStorage.getItem(PAT_KEY) || ''; } catch { return ''; } };
export const setPat = (t) => {
  try {
    if (t) localStorage.setItem(PAT_KEY, t);
    else localStorage.removeItem(PAT_KEY);
  } catch { /* storage blocked — publishing just stays off */ }
};

// Runs are the same when car, date, track, ET and distance all match. Time is
// deliberately excluded — older imports may record it differently, and the
// same car can't run the same ET twice at one track on one day.
export const runKey = (r) => [(r.carName || '').toLowerCase(), r.date, r.track, r.et, r.distance].join('|');

/** Stable identity for a run across devices — used for dedupe and tombstones. */
export function tombstoneKey(run, cars) {
  const car = cars?.find((c) => c.id === run.carId);
  const carName = (run.carName || car?.name || '').toLowerCase();
  return [carName, run.date, run.track, run.et, run.distance].join('|');
}

const findCar = (cars, name) => cars.find((c) => (c.name || '').toLowerCase() === (name || '').toLowerCase());

const TOMBSTONE_PATH = 'data/team-deleted.json';

function parseRawUrl(url) {
  const m = String(url || '').match(/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)/);
  return m ? { owner: m[1], repo: m[2], branch: m[3], path: m[4] } : null;
}

async function ghApi(path, pat, opts = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${pat}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `GitHub API ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const b64encode = (s) => btoa(unescape(encodeURIComponent(s)));
const b64decode = (s) => decodeURIComponent(escape(atob(s.replace(/\n/g, ''))));

/* ---------------- Team PINs (shared lock) ---------------- */
// The app locks on EVERY launch on EVERY device. The PIN hashes live in this
// shared file (public read — hashes can't be reversed into PINs). Only a
// device with the GitHub token can publish, so a stranger can never set
// their own PINs and walk in.
const PINS_PATH = 'data/team-pins.json';
const TEAM_PINS_CACHE_KEY = 'bpr-team-pins-cache';

export async function fetchTeamPins() {
  const url = TEAM_CSV_DEFAULT_URL.replace('Big_Pickle_runs_2026.csv', 'team-pins.json');
  const busted = url + '?t=' + Date.now();
  const res = await fetch(busted, { cache: 'no-store' });
  if (!res.ok) return null; // 404 = not set up yet
  const data = await res.json().catch(() => null);
  if (!data || typeof data !== 'object') return null;
  return data;
}

export function getCachedTeamPins() {
  try { return JSON.parse(localStorage.getItem(TEAM_PINS_CACHE_KEY) || 'null'); } catch { return null; }
}

export function setCachedTeamPins(data) {
  try {
    if (data) localStorage.setItem(TEAM_PINS_CACHE_KEY, JSON.stringify(data));
    else localStorage.removeItem(TEAM_PINS_CACHE_KEY);
  } catch { /* ignore */ }
}

// Publish PIN hashes to the shared file, merging over what's already there.
// Requires the GitHub token — without it, nothing is pushed.
export async function publishTeamPins(partialHashes) {
  const pat = getPat();
  if (!pat) return { pushed: false, error: 'No GitHub token saved' };
  const loc = parseRawUrl(TEAM_CSV_DEFAULT_URL);
  if (!loc) throw new Error('Team CSV URL is not a GitHub raw URL');

  for (let attempt = 0; attempt < 3; attempt++) {
    let file = null;
    let remote = {};
    try {
      file = await ghApi(`/repos/${loc.owner}/${loc.repo}/contents/${PINS_PATH}?ref=${loc.branch}`, pat);
      remote = JSON.parse(b64decode(file.content || '')) || {};
    } catch (e) {
      if (e.status !== 404) throw e;
    }
    const merged = { ...(remote.pins || {}), ...partialHashes };
    const payload = JSON.stringify({ updatedAt: new Date().toISOString(), pins: merged }, null, 2);
    try {
      const remoteText = file ? b64decode(file.content || '') : '';
      if (payload.replace(/\s+$/, '') === remoteText.replace(/\s+$/, '')) {
        return { pushed: false };
      }
      await ghApi(`/repos/${loc.owner}/${loc.repo}/contents/${PINS_PATH}`, pat, {
        method: 'PUT',
        body: JSON.stringify({
          message: `Team PINs sync via app (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`,
          content: b64encode(payload),
          ...(file ? { sha: file.sha } : {}),
          branch: loc.branch,
        }),
      });
      return { pushed: true };
    } catch (e) {
      if (e.status === 409 && attempt < 2) continue; // someone else pushed — retry
      throw e;
    }
  }
  throw new Error('Publish conflicted — try again');
}

/* ---------------- Team users (shared crew list) ---------------- */
// The crew list (names, access flags, PIN groups) is shared so every device
// agrees on who exists and what they can do. Same shape/pattern as team PINs.
const USERS_PATH = 'data/team-users.json';
const TEAM_USERS_CACHE_KEY = 'bpr-team-users-cache';

export async function fetchTeamUsers() {
  const url = TEAM_CSV_DEFAULT_URL.replace('Big_Pickle_runs_2026.csv', 'team-users.json');
  const busted = url + '?t=' + Date.now();
  const res = await fetch(busted, { cache: 'no-store' });
  if (!res.ok) return null; // 404 = not set up yet
  const data = await res.json().catch(() => null);
  if (!data || typeof data !== 'object') return null;
  return data;
}

export function getCachedTeamUsers() {
  try { return JSON.parse(localStorage.getItem(TEAM_USERS_CACHE_KEY) || 'null'); } catch { return null; }
}

export function setCachedTeamUsers(data) {
  try {
    if (data) localStorage.setItem(TEAM_USERS_CACHE_KEY, JSON.stringify(data));
    else localStorage.removeItem(TEAM_USERS_CACHE_KEY);
  } catch { /* ignore */ }
}

// Merge two user lists (local + remote) with tombstones for deletes.
// Per-user last-writer-wins on updatedAt; a tombstone newer than the user's
// updatedAt drops the user. Returns { users, deletedUserIds }.
const SEED_USER_ORDER = ['admin', 'driver', 'crew', 'temp', 'viewer', 'grog'];
export function mergeUserData(localUsers, localDeleted, remoteUsers, remoteDeleted) {
  const deleted = {};
  for (const [id, ts] of Object.entries(remoteDeleted || {})) deleted[id] = ts || 0;
  for (const [id, ts] of Object.entries(localDeleted || {})) {
    if (!deleted[id] || (ts || 0) > deleted[id]) deleted[id] = ts || 0;
  }
  const byId = new Map();
  const consider = (u) => {
    if (!u || !u.id) return;
    const cur = byId.get(u.id);
    if (!cur || (u.updatedAt || 0) > (cur.updatedAt || 0)) byId.set(u.id, u);
  };
  (localUsers || []).forEach(consider);
  (remoteUsers || []).forEach(consider);
  const users = [];
  for (const [id, u] of byId) {
    if ((deleted[id] || 0) > (u.updatedAt || 0)) continue; // deleted after last edit
    users.push(u);
  }
  users.sort((a, b) => {
    const ai = SEED_USER_ORDER.indexOf(a.id), bi = SEED_USER_ORDER.indexOf(b.id);
    const ao = ai < 0 ? 99 : ai, bo = bi < 0 ? 99 : bi;
    if (ao !== bo) return ao - bo;
    return (a.name || '').localeCompare(b.name || '');
  });
  return { users, deletedUserIds: deleted };
}

// Publish the users list to the shared file (merge-safe; needs token).
// Fetches remote, merges with local, and PUTs the merged result so concurrent
// edits on two devices don't wipe each other out.
export async function publishTeamUsers(users, deletedUserIds) {
  const pat = getPat();
  if (!pat) return { pushed: false, error: 'No GitHub token saved' };
  const loc = parseRawUrl(TEAM_CSV_DEFAULT_URL);
  if (!loc) throw new Error('Team CSV URL is not a GitHub raw URL');

  for (let attempt = 0; attempt < 3; attempt++) {
    let file = null;
    try {
      file = await ghApi(`/repos/${loc.owner}/${loc.repo}/contents/${USERS_PATH}?ref=${loc.branch}`, pat);
    } catch (e) {
      if (e.status !== 404) throw e;
    }
    let remoteUsers = [], remoteDeleted = {};
    try {
      const remote = file ? JSON.parse(b64decode(file.content || '')) : null;
      if (remote && Array.isArray(remote.users)) remoteUsers = remote.users;
      if (remote && remote.deletedUserIds) remoteDeleted = remote.deletedUserIds;
    } catch { /* treat as empty */ }
    const merged = mergeUserData(users, deletedUserIds, remoteUsers, remoteDeleted);
    const payload = JSON.stringify({ updatedAt: new Date().toISOString(), users: merged.users, deletedUserIds: merged.deletedUserIds }, null, 2);
    try {
      const remoteText = file ? b64decode(file.content || '') : '';
      if (payload.replace(/\s+$/, '') === remoteText.replace(/\s+$/, '')) {
        return { pushed: false, merged };
      }
      await ghApi(`/repos/${loc.owner}/${loc.repo}/contents/${USERS_PATH}`, pat, {
        method: 'PUT',
        body: JSON.stringify({
          message: `Team users sync via app (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`,
          content: b64encode(payload),
          ...(file ? { sha: file.sha } : {}),
          branch: loc.branch,
        }),
      });
      return { pushed: true, merged };
    } catch (e) {
      if (e.status === 409 && attempt < 2) continue; // someone else pushed — retry
      throw e;
    }
  }
  throw new Error('Publish conflicted — try again');
}

function backfillAir(r, tracks) {
  if (r.altitudeFt == null && r.track) {
    const t = tracks.find((x) => (x.name || '').toLowerCase() === r.track.toLowerCase());
    if (t?.elevationFt != null) r.altitudeFt = t.elevationFt;
  }
  if (r.daFt == null && r.tempF != null && r.altitudeFt != null) {
    const p = stationPressureHpa(1013.25, r.altitudeFt);
    r.daFt = Math.round(densityAltitudeFt({ tempF: r.tempF, humidityPct: r.humidity ?? 0, pressureHpa: p }));
    r.daEstimated = true;
  }
}

async function fetchTeamRuns(url) {
  // Cache-buster: the raw CDN can serve a stale copy for minutes after a push.
  const busted = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
  const res = await fetch(busted, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Team sheet returned HTTP ${res.status}`);
  const text = await res.text();
  if (!text.trim()) throw new Error('Team sheet is empty');
  const buf = new TextEncoder().encode(text).buffer;
  const { runs, errors } = await parseImportFile({ arrayBuffer: async () => buf }, null, null);
  if (errors.length && runs.length === 0) throw new Error(errors[0]);
  return runs;
}

// Pure merge of pulled runs into a state draft. Mutates the draft.
// Tombstoned runs (deleted by the user on any device) are never re-added.
export function mergePull(s, teamRuns) {
  const tombstoned = new Set(s.deletedKeys || []);
  const fallbackCar =
    s.cars.find((c) => /big pickle/i.test(c.name || '')) ||
    s.cars.find((c) => c.id === s.activeCarId) ||
    s.cars[0];
  const fallbackName = fallbackCar?.name || 'Big Pickle';

  const byCar = new Map();
  for (const r of teamRuns) {
    const name = (r.carName || '').trim() || fallbackName;
    if (!byCar.has(name)) byCar.set(name, []);
    backfillAir(r, s.tracks);
    byCar.get(name).push(r);
  }

  let added = 0;
  const carNames = [];
  for (const [name, runs] of byCar) {
    let car = findCar(s.cars, name);
    if (!car) {
      car = { id: uid(), name };
      s.cars.push(car);
    }
    carNames.push(car.name);
    // Team-sourced copies refresh from the sheet so every phone converges to
    // the latest published row. But local runs (logged or edited on this phone,
    // source unset) must NOT be replaced — the sheet copy is older than this
    // phone's edits, and deleting them here is what was wiping out edits
    // (e.g. the backup flag) on every app reopen. The push side already says
    // "local wins on conflict"; the pull has to let it.
    s.runs = s.runs.filter((r) => {
      if (r.carId !== car.id) return true;
      if (r.source === 'team') return false;
      return true;
    });
    const localKeys = new Set(
      s.runs.filter((r) => r.carId === car.id).map((r) => runKey({ ...r, carName: car.name })),
    );
    for (const r of runs) {
      const k = runKey({ ...r, carName: name });
      if (localKeys.has(k)) continue; // a local version exists — don't add the stale sheet copy
      if (tombstoned.has(k)) continue;
      s.runs.push({ ...r, id: uid(), carId: car.id, carName: car.name, source: 'team', createdAt: Date.now() });
      added++;
    }
  }
  s.settings = s.settings || {};
  s.settings.lastTeamSync = new Date().toISOString();
  s.settings.lastTeamSyncCount = added;

  // Drop local runs that were deleted on another device (tombstoned).
  if (tombstoned.size) {
    const before = s.runs.length;
    s.runs = s.runs.filter((r) => r.source === 'demo' || !tombstoned.has(tombstoneKey(r, s.cars)));
    if (s.runs.length !== before) added = Math.max(0, added - (before - s.runs.length));
  }
  return { added, carNames };
}

/** Fetch the shared tombstone list (runs deleted on any device). 404 → empty. */
async function fetchTombstones(loc, pat) {
  try {
    if (pat) {
      const file = await ghApi(`/repos/${loc.owner}/${loc.repo}/contents/${TOMBSTONE_PATH}?ref=${loc.branch}`, pat);
      const arr = JSON.parse(b64decode(file.content || '[]'));
      return { keys: Array.isArray(arr) ? arr : [], sha: file.sha };
    }
    const res = await fetch(`https://raw.githubusercontent.com/${loc.owner}/${loc.repo}/${loc.branch}/${TOMBSTONE_PATH}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return { keys: [], sha: null };
    const arr = await res.json();
    return { keys: Array.isArray(arr) ? arr : [], sha: null };
  } catch {
    return { keys: [], sha: null };
  }
}

async function publishDraft(draft, pat) {
  const loc = parseRawUrl(teamCsvUrl(draft));
  if (!loc) throw new Error('Team CSV URL is not a GitHub raw URL');
  const tombstoned = new Set(draft.deletedKeys || []);

  for (let attempt = 0; attempt < 3; attempt++) {
    const file = await ghApi(`/repos/${loc.owner}/${loc.repo}/contents/${loc.path}?ref=${loc.branch}`, pat);
    const remoteText = b64decode(file.content || '');
    const buf = new TextEncoder().encode(remoteText).buffer;
    const { runs: remoteRuns } = await parseImportFile({ arrayBuffer: async () => buf }, null, null);

    // Merge: remote runs + local runs (no demo, no team), local wins on conflict.
    // Tombstoned runs are dropped from both sides.
    const merged = new Map();
    for (const r of remoteRuns) {
      if (!tombstoned.has(runKey(r))) merged.set(runKey(r), { ...r });
    }
    let localCount = 0;
    for (const r of draft.runs) {
      if (r.source === 'demo' || r.source === 'team') continue;
      const car = draft.cars.find((c) => c.id === r.carId);
      const carName = car?.name || r.carName || 'Big Pickle';
      const withCar = { ...r, carName };
      backfillAir(withCar, draft.tracks);
      const k = runKey(withCar);
      if (tombstoned.has(k)) { merged.delete(k); continue; }
      merged.set(k, withCar);
      localCount++;
    }
    const all = [...merged.values()].sort(
      (a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.time || '').localeCompare(String(b.time || '')),
    );
    const csv = runsToCSV(all);

    let pushed = false;
    try {
      if (csv.replace(/\n$/, '') !== remoteText.replace(/\n$/, '')) {
        await ghApi(`/repos/${loc.owner}/${loc.repo}/contents/${loc.path}`, pat, {
          method: 'PUT',
          body: JSON.stringify({
            message: `Team data sync via app (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`,
            content: b64encode(csv),
            sha: file.sha,
            branch: loc.branch,
          }),
        });
        pushed = true;
      }
      // Share tombstones so deletes propagate to other devices.
      const remoteTomb = await fetchTombstones(loc, pat);
      const mergedTomb = [...new Set([...remoteTomb.keys, ...tombstoned])].sort();
      if (JSON.stringify(mergedTomb) !== JSON.stringify([...remoteTomb.keys].sort())) {
        const putBody = { message: 'Team deleted-run list via app', content: b64encode(JSON.stringify(mergedTomb, null, 1)), branch: loc.branch };
        if (remoteTomb.sha) putBody.sha = remoteTomb.sha;
        await ghApi(`/repos/${loc.owner}/${loc.repo}/contents/${TOMBSTONE_PATH}`, pat, { method: 'PUT', body: JSON.stringify(putBody) });
        pushed = true;
      }
      return { published: localCount, pushed };
    } catch (e) {
      if (e.status === 409 && attempt < 2) continue; // someone else pushed — re-pull and retry
      throw e;
    }
  }
  throw new Error('Publish conflicted — try again');
}

/**
 * Full sync: pull, then publish when a token is saved. Works from a single
 * fresh draft so the publish merge sees the pulled state. Silent when offline.
 */
export async function syncTeamData(state, update) {
  let teamRuns;
  try {
    teamRuns = await fetchTeamRuns(teamCsvUrl(state));
  } catch (e) {
    update((s) => {
      s.settings = s.settings || {};
      s.settings.lastTeamSyncError = { message: e.message || 'fetch failed', at: new Date().toISOString() };
    });
    throw e;
  }
  const draft = JSON.parse(JSON.stringify(state));
  draft.deletedKeys = draft.deletedKeys || [];

  // Merge in tombstones from other devices so their deletes apply here too.
  const pat = getPat();
  const loc = parseRawUrl(teamCsvUrl(draft));
  if (loc) {
    const remoteTomb = await fetchTombstones(loc, pat);
    const before = draft.deletedKeys.length;
    draft.deletedKeys = [...new Set([...draft.deletedKeys, ...remoteTomb.keys])];
    if (draft.deletedKeys.length > 500) draft.deletedKeys = draft.deletedKeys.slice(-500);
    if (draft.deletedKeys.length !== before) {
      update((s) => { s.deletedKeys = draft.deletedKeys; });
    }
  }

  const pulled = mergePull(draft, teamRuns);
  update((s) => {
    s.runs = draft.runs;
    s.cars = draft.cars;
    s.deletedKeys = draft.deletedKeys;
    s.settings = { ...s.settings, lastTeamSync: draft.settings.lastTeamSync, lastTeamSyncCount: draft.settings.lastTeamSyncCount, lastTeamSyncError: null };
  });

  let published = null;
  if (pat) {
    try {
      published = await publishDraft(draft, pat);
      if (published.pushed) {
        update((s) => { s.settings = s.settings || {}; s.settings.lastTeamPublish = new Date().toISOString(); s.settings.lastTeamPublishError = null; });
      }
    } catch (e) {
      published = { error: e.message };
      update((s) => {
        s.settings = s.settings || {};
        s.settings.lastTeamPublishError = { message: e.message || 'publish failed', at: new Date().toISOString() };
      });
    }
  }
  return { ...pulled, published };
}

/* ---------------- Racer (Tree) sync ---------------- */

const RACERS_PATH = 'data/team-racers.json';

// First-name-only rule for the racer standings (Dwayne's rule, 2026-10-20):
// known crew full names canonicalize to their first name so an old profile
// on someone's phone merges into the first-name profile instead of
// resurrecting a full-name duplicate in the standings.
const RACER_NAME_ALIASES = {
  'dwayne fletcher': 'Dwayne',
  'ethan fletcher': 'Ethan',
  'dean moffatt': 'Dean',
};
export function canonRacerName(name) {
  if (!name) return name;
  return RACER_NAME_ALIASES[String(name).trim().toLowerCase()] || name;
}

/**
 * Prune local tree racers to live crew members only.
 * Drops racers who aren't on the crew; ensures every crew member has a racer.
 * Crew identity is the user list (first names).
 */
export function pruneRacersToCrew(update, users) {
  const crew = [];
  for (const u of users || []) {
    const n = canonRacerName(u && u.name ? String(u.name).trim() : '');
    if (n && !crew.includes(n)) crew.push(n);
  }
  if (!crew.length) return;
  const crewLower = crew.map((c) => c.toLowerCase());
  update((s) => {
    s.racers = s.racers || [];
    // Drop racers who aren't live crew; rename the rest to the crew's canonical name.
    const renamed = s.racers
      .map((r) => {
        const canonLower = canonRacerName(r.name || '').toLowerCase();
        const idx = crewLower.indexOf(canonLower);
        const crewName = idx >= 0 ? crew[idx] : null;
        return crewName ? (r.name === crewName ? r : { ...r, name: crewName }) : null;
      })
      .filter(Boolean);
    // Dedupe by canonical name, merging attempts (same key as pullRacers).
    const byName = new Map();
    for (const r of renamed) {
      const key = canonRacerName(r.name || '').toLowerCase();
      const existing = byName.get(key);
      if (!existing) { byName.set(key, r); continue; }
      const have = new Set((existing.attempts || []).map(attemptKey));
      for (const a of r.attempts || []) {
        const ak = attemptKey(a);
        if (!have.has(ak)) { have.add(ak); existing.attempts.push({ ...a, id: a.id || uid() }); }
      }
    }
    s.racers = [...byName.values()];
    for (const name of crew) {
      if (!s.racers.some((r) => canonRacerName(r.name || '') === name)) {
        s.racers.push({ id: uid(), name, attempts: [] });
      }
    }
  });
}

// Attempt identity: new attempts have ids; old ones fall back to a content key.
const attemptKey = (a) => a.id || [a.rt, a.date, a.tree, a.mode].join('|');

/**
 * Pull shared racer stats and merge into local state.
 * Racers match by name (case-insensitive); attempts merge by id.
 * If the shared file has a newer resetAt, local racers are cleared first.
 */
export async function pullRacers(state, update) {
  const url = TEAM_CSV_DEFAULT_URL.replace('Big_Pickle_runs_2026.csv', 'team-racers.json');
  const busted = url + '?t=' + Date.now();
  const res = await fetch(busted, { cache: 'no-store' });
  if (!res.ok) return { pulled: 0 };
  const data = await res.json().catch(() => null);
  if (!data || !Array.isArray(data.racers)) return { pulled: 0 };

  let pulled = 0;
  let wasReset = false;
  update((s) => {
    s.racers = s.racers || [];
    // Admin reset: if the shared resetAt is newer, wipe local racers.
    const lastReset = s.settings?.lastRacerReset || 0;
    if (data.resetAt && data.resetAt > lastReset) {
      s.racers = [];
      s.settings = s.settings || {};
      s.settings.lastRacerReset = data.resetAt;
      wasReset = true;
    }
    for (const rr of data.racers) {
      if (!rr.name) continue;
      const canon = canonRacerName(rr.name);
      let local = s.racers.find((x) => canonRacerName(x.name || '').toLowerCase() === canon.toLowerCase());
      if (!local) {
        local = { id: uid(), name: canon, attempts: [] };
        s.racers.push(local);
      } else if (local.name !== canon) {
        local.name = canon; // first-name-only rule: rename old full-name profile in place
      }
      const seen = new Set(local.attempts.map(attemptKey));
      for (const a of rr.attempts || []) {
        const k = attemptKey(a);
        if (!seen.has(k)) {
          seen.add(k);
          local.attempts.push({ ...a, id: a.id || uid() });
          pulled++;
        }
      }
    }
  });
  return { pulled, wasReset };
}

/**
 * Publish merged racer stats to the shared file. Requires a PAT.
 * Pull-then-push with SHA for optimistic concurrency (retries on 409).
 * Pass reset=true to wipe all racers (sets resetAt so devices clear local data).
 */
export async function publishRacers(state, reset = false) {
  const pat = getPat();
  if (!pat) return { pushed: false, error: 'No GitHub token saved' };
  const loc = parseRawUrl(TEAM_CSV_DEFAULT_URL);
  if (!loc) throw new Error('Team CSV URL is not a GitHub raw URL');

  const resetAt = reset ? Date.now() : null;

  for (let attempt = 0; attempt < 3; attempt++) {
    let file = null;
    let remote = { racers: [] };
    try {
      file = await ghApi(`/repos/${loc.owner}/${loc.repo}/contents/${RACERS_PATH}?ref=${loc.branch}`, pat);
      remote = JSON.parse(b64decode(file.content || '')) || { racers: [] };
    } catch (e) {
      if (e.status !== 404) throw e;
    }

    // Merge: remote + local, dedupe attempts by id.
    // On reset, start from empty.
    const merged = new Map();
    if (!reset) {
      for (const rr of remote.racers || []) {
        if (!rr.name) continue;
        const canon = canonRacerName(rr.name);
        const key = canon.toLowerCase();
        const existing = merged.get(key);
        if (existing) {
          const seen = new Set(existing.attempts.map(attemptKey));
          for (const a of rr.attempts || []) {
            const k = attemptKey(a);
            if (!seen.has(k)) { seen.add(k); existing.attempts.push(a); }
          }
        } else {
          merged.set(key, { name: canon, attempts: [...(rr.attempts || [])] });
        }
      }
      for (const lr of state.racers || []) {
        if (!lr.name) continue;
        const canon = canonRacerName(lr.name);
        const key = canon.toLowerCase();
        const entry = merged.get(key) || { name: canon, attempts: [] };
        const seen = new Set(entry.attempts.map(attemptKey));
        for (const a of lr.attempts || []) {
          const k = attemptKey(a);
          if (!seen.has(k)) {
            seen.add(k);
            entry.attempts.push({ ...a, id: a.id || uid() });
          }
        }
        merged.set(key, entry);
      }
    }
    const payload = JSON.stringify(
      { updatedAt: new Date().toISOString(), ...(resetAt ? { resetAt } : {}), racers: [...merged.values()] },
      null, 2,
    );

    try {
      const remoteText = file ? b64decode(file.content || '') : '';
      if (payload.replace(/\s+$/, '') === remoteText.replace(/\s+$/, '')) {
        return { pushed: false };
      }
      await ghApi(`/repos/${loc.owner}/${loc.repo}/contents/${RACERS_PATH}`, pat, {
        method: 'PUT',
        body: JSON.stringify({
          message: `Tree racer sync via app (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`,
          content: b64encode(payload),
          ...(file ? { sha: file.sha } : {}),
          branch: loc.branch,
        }),
      });
      return { pushed: true };
    } catch (e) {
      if (e.status === 409 && attempt < 2) continue;
      throw e;
    }
  }
  return { pushed: false, error: 'Conflict retries exhausted' };
}

// ---------------------------------------------------------------------------
// Team tracks — shared track info (location, elevation, heading), so a
// heading or location entered on one phone is available on every crew phone.
// Tracks match by name (case-insensitive). Fields shared per track:
// name, lat, lon, elevationFt, locationLabel, heading, updatedAt.
// Deletions propagate as tombstones {name, at}, same pattern as run deletes.
// ---------------------------------------------------------------------------
const TRACKS_PATH = 'data/team-tracks.json';
const TRACK_TOMBSTONE_CAP = 200;

const trackKey = (t) => (t.name || '').toLowerCase();

const trackShared = (t) => ({
  name: t.name,
  lat: t.lat ?? null,
  lon: t.lon ?? null,
  elevationFt: t.elevationFt ?? null,
  locationLabel: t.locationLabel ?? null,
  heading: t.heading ?? null,
  updatedAt: t.updatedAt ?? 0,
});

/**
 * Merge local tracks with a remote list plus tombstones.
 * Per name: the record with the later updatedAt wins wholesale (ties keep local).
 * A tombstone newer than both copies removes the track entirely.
 * Returns { tracks, deleted } — local ids are preserved for matched names.
 */
export function mergeTeamTracks(localTracks, remoteTracks, deleted) {
  const tomb = new Map();
  for (const d of deleted || []) {
    if (!d?.name) continue;
    const k = d.name.toLowerCase();
    const cur = tomb.get(k);
    if (!cur || (d.at || 0) > cur.at) tomb.set(k, { name: d.name, at: d.at || 0 });
  }
  const remote = new Map();
  for (const rt of remoteTracks || []) {
    if (!rt?.name) continue;
    const k = rt.name.toLowerCase();
    const cur = remote.get(k);
    if (!cur || (rt.updatedAt || 0) > (cur.updatedAt || 0)) remote.set(k, rt);
  }
  const tracks = [];
  const seen = new Set();
  for (const lt of localTracks || []) {
    if (!lt?.name) continue;
    const k = trackKey(lt);
    if (seen.has(k)) continue;
    seen.add(k);
    const r = remote.get(k);
    const lu = lt.updatedAt || 0, ru = r ? r.updatedAt || 0 : 0;
    const t = tomb.get(k);
    if (t && t.at >= lu && t.at >= ru) continue; // deleted everywhere
    const src = r && ru > lu ? r : lt;
    tracks.push({ ...trackShared(src), id: lt.id || uid() });
  }
  for (const [k, r] of remote) {
    if (seen.has(k)) continue;
    const t = tomb.get(k);
    if (t && t.at >= (r.updatedAt || 0)) continue;
    tracks.push({ ...trackShared(r), id: uid() });
  }
  const outTomb = [];
  for (const [k, t] of tomb) {
    const live = tracks.find((x) => trackKey(x) === k);
    if (!live || t.at > (live.updatedAt || 0)) outTomb.push(t);
  }
  return { tracks, deleted: outTomb.slice(0, TRACK_TOMBSTONE_CAP) };
}

/** Pull the shared track file and merge into local state. */
export async function pullTracks(state, update) {
  const url = TEAM_CSV_DEFAULT_URL.replace('Big_Pickle_runs_2026.csv', 'team-tracks.json');
  const busted = url + '?t=' + Date.now();
  const res = await fetch(busted, { cache: 'no-store' });
  if (!res.ok) return { pulled: 0 };
  const data = await res.json().catch(() => null);
  if (!data || !Array.isArray(data.tracks)) return { pulled: 0 };

  let pulled = 0;
  update((s) => {
    s.tracks = s.tracks || [];
    s.deletedTracks = Array.isArray(s.deletedTracks) ? s.deletedTracks : [];
    const before = new Map(s.tracks.map((t) => [trackKey(t), trackShared(t)]));
    const merged = mergeTeamTracks(s.tracks, data.tracks, [...(s.deletedTracks || []), ...(data.deleted || [])]);
    s.tracks = merged.tracks;
    s.deletedTracks = merged.deleted;
    for (const t of merged.tracks) {
      const b = before.get(trackKey(t));
      const changed = !b || ['lat', 'lon', 'elevationFt', 'locationLabel', 'heading', 'updatedAt']
        .some((f) => b[f] !== t[f]);
      if (changed) pulled++;
    }
  });
  return { pulled };
}

/**
 * Publish merged tracks to the shared file. Requires a PAT.
 * Pull-then-push with SHA for optimistic concurrency (retries on 409).
 */
export async function publishTracks(state) {
  const pat = getPat();
  if (!pat) return { pushed: false, error: 'No GitHub token saved' };
  const loc = parseRawUrl(TEAM_CSV_DEFAULT_URL);
  if (!loc) throw new Error('Team CSV URL is not a GitHub raw URL');

  for (let attempt = 0; attempt < 3; attempt++) {
    let file = null;
    let remote = { tracks: [], deleted: [] };
    try {
      file = await ghApi(`/repos/${loc.owner}/${loc.repo}/contents/${TRACKS_PATH}?ref=${loc.branch}`, pat);
      remote = JSON.parse(b64decode(file.content || '')) || { tracks: [], deleted: [] };
    } catch (e) {
      if (e.status !== 404) throw e;
    }

    const merged = mergeTeamTracks(state.tracks, remote.tracks, [...(state.deletedTracks || []), ...(remote.deleted || [])]);
    const payload = JSON.stringify(
      { updatedAt: new Date().toISOString(), tracks: merged.tracks.map(trackShared), deleted: merged.deleted },
      null, 2,
    );

    try {
      const remoteText = file ? b64decode(file.content || '') : '';
      if (payload.replace(/\s+$/, '') === remoteText.replace(/\s+$/, '')) {
        return { pushed: false };
      }
      await ghApi(`/repos/${loc.owner}/${loc.repo}/contents/${TRACKS_PATH}`, pat, {
        method: 'PUT',
        body: JSON.stringify({
          message: `Team track sync via app (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`,
          content: b64encode(payload),
          ...(file ? { sha: file.sha } : {}),
          branch: loc.branch,
        }),
      });
      return { pushed: true };
    } catch (e) {
      if (e.status === 409 && attempt < 2) continue;
      throw e;
    }
  }
  return { pushed: false, error: 'Conflict retries exhausted' };
}
