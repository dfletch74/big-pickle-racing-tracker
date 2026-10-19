import { useState, useCallback } from 'react';

const STORAGE_KEY = 'bpr-state-v1';

export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

/** Seed tracks with approximate coordinates for live weather. */
function seedTracks() {
  return [
    { id: uid(), name: 'RAD Torque Raceway', lat: 53.49, lon: -113.52, elevationFt: 2300 },
    { id: uid(), name: 'Medicine Hat Raceway', lat: 50.02, lon: -110.71, elevationFt: 2350 },
    { id: uid(), name: 'Central Alberta Raceway', lat: 52.4, lon: -113.9, elevationFt: 3000 },
  ];
}

function seedState() {
  const tracks = seedTracks();
  const carId = uid();
  return {
    version: 1,
    cars: [{ id: carId, name: 'Big Pickle', year: '1966', make: 'Chevrolet', model: 'Chevelle' }],
    activeCarId: carId,
    tracks,
    runs: [],
    deletedKeys: [],
    racers: [
      { id: uid(), name: 'Dwayne Fletcher', attempts: [] },
      { id: uid(), name: 'Ethan Fletcher', attempts: [] },
    ],
    trackNotes: [],
    presets: [],
    events: [],
    maintenance: [],
    checklists: {},
    settings: { daBaseline: 2500 },
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const s = JSON.parse(raw);
    if (!s || s.version !== 1) return seedState();
    return { ...seedState(), ...s };
  } catch {
    return seedState();
  }
}

function persist(s) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage full/blocked — app keeps working in memory */
  }
}

/**
 * React hook for the whole app state. `update(fn)` receives a mutable draft
 * (structuredClone) — mutate it freely, it is persisted + committed on return.
 */
export function useStore() {
  const [state, setState] = useState(loadState);
  const update = useCallback((fn) => {
    setState((prev) => {
      const next = structuredClone(prev);
      fn(next);
      persist(next);
      return next;
    });
  }, []);
  const reset = useCallback((next) => {
    persist(next);
    setState(next);
  }, []);
  return [state, update, reset];
}

/** Deterministic-ish demo data: 36 runs, 3 tracks, 2025–2026. Clearly fake. */
export function makeDemoState() {
  const s = seedState();
  const carId = s.activeCarId;
  const rnd = (() => {
    let seed = 42;
    return () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
  })();

  const days = [];
  for (let m = 4; m <= 9; m++) {
    days.push(`2025-0${m}-18`, `2025-0${m}-19`, `2026-0${m}-12`, `2026-0${m}-13`);
  }
  let n = 0;
  for (const day of days) {
    const track = s.tracks[n % s.tracks.length];
    const runsToday = 2 + Math.floor(rnd() * 3);
    const baseTemp = 62 + rnd() * 28;
    const jet = [93, 95, 96][n % 3];
    for (let i = 0; i < runsToday; i++) {
      n++;
      const tempF = Math.round((baseTemp + rnd() * 6 - 3) * 10) / 10;
      const humidity = Math.round(30 + rnd() * 40);
      const daFt = Math.round(2500 + rnd() * 3200);
      // slower when the air is thin — demo data obeys physics
      const daPenalty = (daFt - 2500) * 0.00012;
      const sixty = 1.34 + rnd() * 0.12;
      const et = 9.42 + daPenalty + rnd() * 0.22;
      const mph = 146 - daPenalty * 40 - rnd() * 3;
      const rt = Math.round((rnd() * 0.18 - 0.01) * 1000) / 1000;
      const eighthET = et * 0.642 + rnd() * 0.03;
      s.runs.push({
        id: uid() + n,
        carId,
        source: 'demo',
        date: day,
        time: `${10 + i}:3${i}0`.slice(0, 5),
        track: track.name,
        trackId: track.id,
        distance: '1/4',
        runType: i === 0 ? 'T/T' : 'Qualifying',
        rt,
        sixty: Math.round(sixty * 1000) / 1000,
        threeThirty: Math.round((sixty + 2.55 + rnd() * 0.06) * 1000) / 1000,
        eighthET: Math.round(eighthET * 1000) / 1000,
        eighthMPH: Math.round((mph * 0.79 + rnd() * 1.5) * 10) / 10,
        thousand: Math.round((eighthET + 1.83 + rnd() * 0.04) * 1000) / 1000,
        et: Math.round(et * 1000) / 1000,
        mph: Math.round(mph * 10) / 10,
        tempF,
        humidity,
        altitudeFt: track.elevationFt,
        daFt,
        jet,
        lPsi: 8.5,
        rPsi: 9,
        lBar: 0,
        rBar: 0,
        comp: 6,
        rebound: 9,
        revLim: 4400,
        wl: null,
        notes: n === 3 ? 'Demo run — delete me' : '',
        createdAt: Date.now() - n * 1000,
      });
    }
  }
  s.runs.sort((a, b) => a.createdAt - b.createdAt);
  return s;
}
