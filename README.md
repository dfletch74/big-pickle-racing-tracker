# Big Pickle Racing Tracker

A drag-racing run logbook for the Big Pickle Racing team (1966 Chevrolet Chevelle).
Log passes with full timeslip splits, track weather, and car setup — then get
density-altitude-aware dial-in predictions, setup rankings, and a rule-based
crew chief analysis.

This is a clean reimplementation (not a copy) of an app originally built on
Base44, rewritten so the team owns the code outright. It is **local-first**:
all data lives in the browser's `localStorage`. No account, no backend, no
tracking.

## Run it

```bash
npm install
npm run dev      # local dev server
npm run build    # production build -> dist/
```

Any static host serves `dist/` (Netlify, Vercel, GitHub Pages, nginx…).

## Features

- **Dashboard** — best ET/MPH/60ft, consistency grade, last run with ranks,
  test-session day cards, ET/MPH-over-time charts (per-track colors),
  personal bests, PB-by-track, recent runs. 1/8-mile view adds win rate.
- **Run log** — search, 9 sort orders, All/1-4/1-8/Today/Issues filters
  (the Issues filter actually filters), auto-detected issue badges
  (red light, slow R/T, MPH low, possible spin) with diagnostic deltas,
  expandable split analysis vs best, weather-corrected ET, setup fields,
  edit/delete.
- **Compare** — A/B run selectors defaulting to same-distance pairings,
  side-by-side timeslip with Δ column, weather + setup comparison.
- **Add run** — all fields start **empty** (no placeholder defaults that
  could save as fake data), ET required, live weather via Open-Meteo,
  setup presets, "same as previous" setup copy.
- **Track day** — live conditions with density altitude + hourly trend,
  Build-the-Pass segment analysis, next-pass predictor (ET-on-DA regression),
  ET cheat sheets by DA and temperature band, track notes, minimal
  eliminations event mode.
- **Insights** — dial-in predictor with stated confidence + sample count,
  ideal setup ranked by weather-corrected ET (sample counts shown,
  n<3 flagged), rule-based crew chief that derives from the **same**
  ranking (so advice can never contradict it), similar past runs.
- **Garage** — multiple cars, everything scoped per car.
- **Tree simulator** — .400/.500, pro/sportsman, per-racer stats + rankings,
  red-light detection.
- **Import / Export** — CSV/XLSX import with documented columns, CSV export
  with confirmation toast, JSON backup, printable run sheet.
- **Demo data** — 36 synthetic runs to try the app, clearly labeled,
  removable from Settings.

## Import file format

Headers are matched case-insensitively (punctuation ignored).

- **Required:** `Date`, `E.T.`
- **Recommended:** `Track`, `60ft`, `330ft`, `1/8 ET`, `1/8 MPH`, `1000ft`,
  `MPH`, `R/T`, `Temp`, `Humidity`, `Altitude`, `Jet`, `Notes`

## Math used

**Density altitude** (see `src/lib/physics.js` for the documented formula):
standard pressure-altitude computation with humidity correction via virtual
temperature (Magnus approximation for vapor pressure).

**Weather correction:** simplified air-density-ratio model —
`ET_corr = ET × (ρ_actual/ρ_ref)^0.5`,
`MPH_corr = MPH × (ρ_ref/ρ_actual)^(1/3)`,
with density from the standard atmosphere at the run's DA vs a configurable
baseline DA (default 2,500 ft). Direction is explicit and correct:
**higher DA = thinner air = slower**; correcting to a lower baseline DA
yields a faster (lower) corrected ET. Sanity check: 9.369s @ 3,300 ft DA →
~9.260s at the 2,500 ft baseline.

Live weather comes from [Open-Meteo](https://open-meteo.com) (free, no key).

## How this differs from the original

Bugs from the original that are fixed here:

1. Export produces a real CSV download plus a confirmation toast
   (the old buttons did nothing visible).
2. Weather-correction direction corrected — higher DA is slower, and the
   app never claims otherwise.
3. All displayed numbers are rounded (no raw floats like `3248.1108…` ft).
4. One definition of "latest run" (most recent date+time, id tie-break)
   used on every screen.
5. The Issues filter actually filters the list.
6. Compare defaults to same-distance pairings.
7. Every recommendation shows its sample count; n<3 is flagged.
8. Rank badges inside a distance-filtered view rank within that view.
9. Add-run fields start empty — no `10.000` placeholder ET that could be
   saved as real data.
10. The crew chief is rule-based and shares the Ideal Setup ranking
    function, so the two can never contradict each other.
