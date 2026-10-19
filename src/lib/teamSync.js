import { uid } from './store';
import { parseImportFile } from './io';
import { densityAltitudeFt, stationPressureHpa } from './physics';

/**
 * Team data sync — pulls the shared run sheet from GitHub so every device
 * sees the crew's current data. The spreadsheet is the source of truth:
 * on each sync, previously synced team runs are replaced wholesale, while
 * runs logged locally in the app are left alone.
 *
 * The sheet's Car column decides which car each run belongs to. Cars named
 * in the sheet are created locally if missing, so car identity survives
 * across devices regardless of local car IDs.
 */

export const TEAM_CSV_DEFAULT_URL =
  'https://raw.githubusercontent.com/dfletch74/big-pickle-racing-tracker/main/data/Big_Pickle_runs_2026.csv';

export const teamCsvUrl = (state) => state.settings?.teamCsvUrl || TEAM_CSV_DEFAULT_URL;
export const teamSyncOnOpen = (state) => state.settings?.teamSyncOnOpen !== false;

// Runs are the same when date, track, ET and distance all match. Time is
// deliberately excluded — older imports may record it differently, and the
// same car can't run the same ET twice at one track on one day.
const runKey = (r) => [r.date, r.track, r.et, r.distance].join('|');

const findCar = (cars, name) => cars.find((c) => (c.name || '').toLowerCase() === (name || '').toLowerCase());

export async function syncTeamData(state, update) {
  const url = teamCsvUrl(state);
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Team sheet returned HTTP ${res.status}`);
  const text = await res.text();
  if (!text.trim()) throw new Error('Team sheet is empty');

  const buf = new TextEncoder().encode(text).buffer;
  const { runs: teamRuns, errors } = await parseImportFile({ arrayBuffer: async () => buf }, null, null);
  if (errors.length && teamRuns.length === 0) throw new Error(errors[0]);

  // Fallback car for rows with no Car value: Big Pickle, else the active car.
  const fallbackCar =
    state.cars.find((c) => /big pickle/i.test(c.name || '')) ||
    state.cars.find((c) => c.id === state.activeCarId) ||
    state.cars[0];
  const fallbackName = fallbackCar?.name || 'Big Pickle';

  const byCar = new Map();
  for (const r of teamRuns) {
    const name = (r.carName || '').trim() || fallbackName;
    if (!byCar.has(name)) byCar.set(name, []);
    // Backfill the track's raw elevation when the sheet doesn't carry one —
    // Altitude ft is the track elevation; DA ft is the (separate) density altitude.
    if (r.altitudeFt == null && r.track) {
      const t = state.tracks.find((x) => (x.name || '').toLowerCase() === r.track.toLowerCase());
      if (t?.elevationFt != null) r.altitudeFt = t.elevationFt;
    }
    // Estimate DA from temp + track elevation when the sheet has air temp but
    // no DA value (same standard-pressure method the run logger uses).
    if (r.daFt == null && r.tempF != null && r.altitudeFt != null) {
      const p = stationPressureHpa(1013.25, r.altitudeFt);
      r.daFt = Math.round(densityAltitudeFt({ tempF: r.tempF, humidityPct: r.humidity ?? 0, pressureHpa: p }));
      r.daEstimated = true;
    }
    byCar.get(name).push(r);
  }

  let added = 0;
  const carNames = [];
  update((s) => {
    s.settings = s.settings || {};
    for (const [name, runs] of byCar) {
      let car = findCar(s.cars, name);
      if (!car) {
        car = { id: uid(), name };
        s.cars.push(car);
      }
      carNames.push(car.name);
      const keys = new Set(runs.map(runKey));
      // Drop previous team syncs + local dupes of team runs in this car only.
      s.runs = s.runs.filter((r) => {
        if (r.carId !== car.id) return true;
        if (r.source === 'team') return false;
        return !keys.has(runKey(r));
      });
      for (const r of runs) {
        s.runs.push({ ...r, id: uid(), carId: car.id, carName: car.name, source: 'team', createdAt: Date.now() });
        added++;
      }
    }
    s.settings.lastTeamSync = new Date().toISOString();
    s.settings.lastTeamSyncCount = added;
  });
  return { added, carNames };
}
