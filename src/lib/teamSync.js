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
export const setPat = (t) => { try { t ? localStorage.setItem(PAT_KEY, t) : localStorage.removeItem(PAT_KEY); } catch {} };

// Runs are the same when car, date, track, ET and distance all match. Time is
// deliberately excluded — older imports may record it differently, and the
// same car can't run the same ET twice at one track on one day.
const runKey = (r) => [(r.carName || '').toLowerCase(), r.date, r.track, r.et, r.distance].join('|');

const findCar = (cars, name) => cars.find((c) => (c.name || '').toLowerCase() === (name || '').toLowerCase());

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
function mergePull(s, teamRuns) {
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
    const keys = new Set(runs.map(runKey));
    s.runs = s.runs.filter((r) => {
      if (r.carId !== car.id) return true;
      if (r.source === 'team') return false;
      return !keys.has(runKey({ ...r, carName: car.name }));
    });
    for (const r of runs) {
      s.runs.push({ ...r, id: uid(), carId: car.id, carName: car.name, source: 'team', createdAt: Date.now() });
      added++;
    }
  }
  s.settings = s.settings || {};
  s.settings.lastTeamSync = new Date().toISOString();
  s.settings.lastTeamSyncCount = added;
  return { added, carNames };
}

/** Pull the sheet into the app. Returns { added, carNames }. */
export async function pullTeamData(state, update) {
  const teamRuns = await fetchTeamRuns(teamCsvUrl(state));
  let result;
  update((s) => { result = mergePull(s, teamRuns); });
  return result;
}

/**
 * Publish a state draft's local runs to the sheet. Pulls the remote first so
 * the merge starts current; pushes only when the CSV actually changed.
 */
async function publishDraft(draft, pat) {
  const loc = parseRawUrl(teamCsvUrl(draft));
  if (!loc) throw new Error('Team CSV URL is not a GitHub raw URL');

  for (let attempt = 0; attempt < 3; attempt++) {
    const file = await ghApi(`/repos/${loc.owner}/${loc.repo}/contents/${loc.path}?ref=${loc.branch}`, pat);
    const remoteText = b64decode(file.content || '');
    const buf = new TextEncoder().encode(remoteText).buffer;
    const { runs: remoteRuns } = await parseImportFile({ arrayBuffer: async () => buf }, null, null);

    // Merge: remote runs + local runs (no demo, no team), local wins on conflict.
    const merged = new Map();
    for (const r of remoteRuns) merged.set(runKey(r), { ...r });
    let localCount = 0;
    for (const r of draft.runs) {
      if (r.source === 'demo' || r.source === 'team') continue;
      const car = draft.cars.find((c) => c.id === r.carId);
      const carName = car?.name || r.carName || 'Big Pickle';
      const withCar = { ...r, carName };
      backfillAir(withCar, draft.tracks);
      merged.set(runKey(withCar), withCar);
      localCount++;
    }
    const all = [...merged.values()].sort(
      (a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.time || '').localeCompare(String(b.time || '')),
    );
    const csv = runsToCSV(all);

    if (csv.replace(/\n$/, '') === remoteText.replace(/\n$/, '')) {
      return { published: localCount, pushed: false };
    }
    try {
      await ghApi(`/repos/${loc.owner}/${loc.repo}/contents/${loc.path}`, pat, {
        method: 'PUT',
        body: JSON.stringify({
          message: `Team data sync via app (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`,
          content: b64encode(csv),
          sha: file.sha,
          branch: loc.branch,
        }),
      });
      return { published: localCount, pushed: true };
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
  const teamRuns = await fetchTeamRuns(teamCsvUrl(state));
  const draft = JSON.parse(JSON.stringify(state));
  const pulled = mergePull(draft, teamRuns);
  update((s) => {
    s.runs = draft.runs;
    s.cars = draft.cars;
    s.settings = { ...s.settings, lastTeamSync: draft.settings.lastTeamSync, lastTeamSyncCount: draft.settings.lastTeamSyncCount };
  });

  let published = null;
  const pat = getPat();
  if (pat) {
    try {
      published = await publishDraft(draft, pat);
      if (published.pushed) {
        update((s) => { s.settings = s.settings || {}; s.settings.lastTeamPublish = new Date().toISOString(); });
      }
    } catch (e) {
      published = { error: e.message };
    }
  }
  return { ...pulled, published };
}
