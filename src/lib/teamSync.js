import { uid } from './store';
import { parseImportFile } from './io';

/**
 * Team data sync — pulls the shared run sheet from GitHub so every device
 * sees the crew's current data. The spreadsheet is the source of truth:
 * on each sync, previously synced team runs are replaced wholesale, while
 * runs logged locally in the app are left alone.
 */

export const TEAM_CSV_DEFAULT_URL =
  'https://raw.githubusercontent.com/dfletch74/big-pickle-racing-tracker/main/data/Big_Pickle_runs_2026.csv';

export const teamCsvUrl = (state) => state.settings?.teamCsvUrl || TEAM_CSV_DEFAULT_URL;
export const teamSyncOnOpen = (state) => state.settings?.teamSyncOnOpen !== false;

// Runs are the same when date, time, track, ET and distance all match.
const runKey = (r) => [r.date, r.time, r.track, r.et, r.distance].join('|');

export async function syncTeamData(state, update) {
  const url = teamCsvUrl(state);
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Team sheet returned HTTP ${res.status}`);
  const text = await res.text();
  if (!text.trim()) throw new Error('Team sheet is empty');

  // The sheet holds Big Pickle's runs — sync into that car, else the active car.
  const car =
    state.cars.find((c) => /big pickle/i.test(c.name || '')) ||
    state.cars.find((c) => c.id === state.activeCarId) ||
    state.cars[0];
  if (!car) throw new Error('No car to sync into');

  const buf = new TextEncoder().encode(text).buffer;
  const { runs: teamRuns, errors } = await parseImportFile({ arrayBuffer: async () => buf }, car.id, null);
  if (errors.length && teamRuns.length === 0) throw new Error(errors[0]);

  const keys = new Set(teamRuns.map(runKey));
  let added = 0;
  update((s) => {
    // Drop previous team syncs, plus any local run that duplicates a team run
    // (e.g. from a manual import of the same sheet) — everything else stays.
    s.runs = s.runs.filter((r) => {
      if (r.carId !== car.id) return true;
      if (r.source === 'team') return false;
      return !keys.has(runKey(r));
    });
    for (const r of teamRuns) {
      s.runs.push({ ...r, id: uid(), carId: car.id, source: 'team', createdAt: Date.now() });
      added++;
    }
    s.settings = s.settings || {};
    s.settings.lastTeamSync = new Date().toISOString();
    s.settings.lastTeamSyncCount = added;
  });
  return { added, carName: car.name };
}
