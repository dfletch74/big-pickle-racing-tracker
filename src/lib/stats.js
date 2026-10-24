import { runDateTime, isNum } from './format';
import { correctET } from './physics';

export const runsForCar = (state, carId) => state.runs.filter((r) => r.carId === carId);

/** Full passes only — backup (lifted/braked/aborted) runs are excluded from all predictions and stats. */
export const raceRuns = (runs) => runs.filter((r) => !r.backup);

export const filterDistance = (runs, dist) =>
  dist === 'all' ? runs : runs.filter((r) => r.distance === dist);

/**
 * THE definition of "latest run", used on every screen (bug fix #4):
 * most recent by date+time, tie-broken by highest id.
 */
export function latestRun(runs) {
  if (!runs.length) return null;
  return [...runs].sort((a, b) => {
    const dt = runDateTime(b) - runDateTime(a);
    if (dt !== 0) return dt;
    return String(b.id).localeCompare(String(a.id));
  })[0];
}

export const avg = (xs) => {
  const n = xs.filter(isNum);
  return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null;
};

/**
 * Pearson correlation r for [{x, y}] plus least-squares trend line.
 * Returns null when fewer than 3 points or no variance.
 */
export function pearsonR(pts) {
  const n = pts.length;
  if (n < 3) return null;
  const mx = avg(pts.map((p) => p.x));
  const my = avg(pts.map((p) => p.y));
  let num = 0, dx = 0, dy = 0;
  for (const p of pts) {
    num += (p.x - mx) * (p.y - my);
    dx += (p.x - mx) ** 2;
    dy += (p.y - my) ** 2;
  }
  if (!dx || !dy) return null;
  const r = num / Math.sqrt(dx * dy);
  const slope = num / dx;
  return { r, slope, intercept: my - slope * mx, n };
}

function minRun(runs, key) {
  const c = runs.filter((r) => isNum(r[key]));
  if (!c.length) return null;
  return c.reduce((a, b) => (b[key] < a[key] ? b : a));
}
function maxRun(runs, key) {
  const c = runs.filter((r) => isNum(r[key]));
  if (!c.length) return null;
  return c.reduce((a, b) => (b[key] > a[key] ? b : a));
}

/** Personal bests for a run list, each with the run that set it. */
export function personalBests(runs) {
  const bestRT = (() => {
    const clean = runs.filter((r) => isNum(r.rt) && r.rt >= 0);
    const pool = clean.length ? clean : runs.filter((r) => isNum(r.rt));
    if (!pool.length) return null;
    return pool.reduce((a, b) => (Math.abs(b.rt) < Math.abs(a.rt) ? b : a));
  })();
  return {
    et: minRun(runs, 'et'),
    mph: maxRun(runs, 'mph'),
    sixty: minRun(runs, 'sixty'),
    threeThirty: minRun(runs, 'threeThirty'),
    eighthET: minRun(runs, 'eighthET'),
    thousand: minRun(runs, 'thousand'),
    rt: bestRT,
  };
}

/** Consistency panel: grade, streak, % within ±0.05s of avg ET, spread.
 *  Uses weather-corrected ET when DA data is available (so air variation
 *  doesn't tank the grade — measures driver consistency, not weather luck).
 */
export function consistency(runs, baseline) {
  // Prefer corrected ETs when we have DA data; fall back to raw.
  const useCorrected = baseline != null && runs.some((r) => isNum(r.daFt));
  const ets = runs
    .map((r) => (useCorrected && isNum(r.daFt) ? correctET(r.et, r.daFt, baseline) : r.et))
    .filter(isNum);
  if (ets.length < 3) return null;
  const a = avg(ets);
  const within = ets.filter((e) => Math.abs(e - a) <= 0.05).length;
  const score = (within / ets.length) * 100;
  const spread = Math.max(...ets) - Math.min(...ets);
  const ordered = [...runs]
    .filter((r) => isNum(r.et))
    .sort((x, y) => runDateTime(x) - runDateTime(y));
  const corrOf = (r) => (useCorrected && isNum(r.daFt) ? correctET(r.et, r.daFt, baseline) : r.et);
  let streak = 0;
  for (let i = ordered.length - 1; i >= 0; i--) {
    const c = corrOf(ordered[i]);
    if (isNum(c) && Math.abs(c - a) <= 0.05) streak++;
    else break;
  }
  const grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F';
  return { avgET: a, score, spread, streak, grade, n: ets.length, corrected: useCorrected };
}

/** Rank of a run's value within a list (1 = best). `lowerIsBetter` for ET-like. */
export function rankOf(runs, run, key, lowerIsBetter = true) {
  const vals = runs.map((r) => r[key]).filter(isNum).sort((a, b) => (lowerIsBetter ? a - b : b - a));
  if (!isNum(run[key]) || !vals.length) return null;
  const idx = vals.findIndex((v) => (lowerIsBetter ? v >= run[key] : v <= run[key]));
  return { rank: idx + 1, of: vals.length };
}

/**
 * Auto issue detection with diagnostic deltas (bug fix: labels stay honest).
 * ctx: { avgRT, avgMPH, avgSixty } computed from the same car+distance pool.
 */
export function detectIssues(run, ctx) {
  const issues = [];
  if (isNum(run.rt) && run.rt < 0) {
    issues.push({ key: 'red', label: 'Red light', delta: `R/T ${run.rt.toFixed(3)}` });
  } else if (isNum(run.rt) && isNum(ctx.avgRT) && run.rt > ctx.avgRT + 0.04) {
    issues.push({
      key: 'slowrt',
      label: 'Slow R/T',
      delta: `R/T +${(run.rt - ctx.avgRT).toFixed(3)}s vs avg`,
    });
  }
  if (isNum(run.mph) && isNum(ctx.avgMPH) && run.mph < ctx.avgMPH - 2.5) {
    issues.push({
      key: 'mpflow',
      label: 'MPH low',
      delta: `${run.mph.toFixed(1)} vs ${ctx.avgMPH.toFixed(1)} avg (−${(ctx.avgMPH - run.mph).toFixed(1)})`,
    });
  }
  if (isNum(run.sixty) && isNum(ctx.avgSixty) && run.sixty > ctx.avgSixty + 0.06) {
    issues.push({
      key: 'spin',
      label: 'Possible spin',
      delta: `60ft +${(run.sixty - ctx.avgSixty).toFixed(3)}s vs avg`,
    });
  }
  return issues;
}

/** Segment durations for split analysis (null where data missing). */
export function segmentSplits(run) {
  const g = (v) => (isNum(v) ? v : null);
  const s60 = g(run.sixty);
  const s330 = g(run.sixty) && g(run.threeThirty) ? run.threeThirty - run.sixty : null;
  const s660 = g(run.threeThirty) && g(run.eighthET) ? run.eighthET - run.threeThirty : null;
  const s1000 = g(run.eighthET) && g(run.thousand) ? run.thousand - run.eighthET : null;
  const s1320 = g(run.thousand) && g(run.et) ? run.et - run.thousand : null;
  return [
    { name: '0–60 ft', dur: s60 },
    { name: '60–330 ft', dur: s330 },
    { name: '330–660 ft', dur: s660 },
    { name: '660–1000 ft', dur: s1000 },
    { name: '1000–1320 ft', dur: s1320 },
  ];
}

/** Best (min) observed duration per segment across runs. */
export function bestSegments(runs) {
  const segs = ['0–60 ft', '60–330 ft', '330–660 ft', '660–1000 ft', '1000–1320 ft'];
  return segs.map((name, i) => {
    const durs = runs.map((r) => segmentSplits(r)[i].dur).filter(isNum);
    return { name, best: durs.length ? Math.min(...durs) : null };
  });
}

export const correctedETOf = (run, baseline) => correctET(run.et, run.daFt, baseline);

/** Runs similar to target conditions: DA within ±750 ft and temp within ±12°F. */
export function findSimilar(runs, { daFt, tempF, distance }) {
  return runs.filter(
    (r) =>
      r.distance === distance &&
      isNum(r.et) &&
      isNum(r.daFt) &&
      daFt != null &&
      Math.abs(r.daFt - daFt) <= 750 &&
      (tempF == null || !isNum(r.tempF) || Math.abs(r.tempF - tempF) <= 12),
  );
}

/**
 * Dial-in predictor. States its basis + sample count (bug fix #7).
 * Suggested dial = predicted ET + 0.015 safety, rounded up to the hundredth.
 */
export function dialIn(runs, target) {
  const sim = findSimilar(runs, target);
  const n = sim.length;
  if (!n) return { n: 0, confidence: 'NONE', basis: 'No similar runs found.' };
  const ets = sim.map((r) => r.et).sort((a, b) => a - b);
  const predicted = avg(ets);
  const dial = Math.ceil((predicted + 0.015) * 100) / 100;
  const confidence = n >= 8 ? 'HIGH' : n >= 4 ? 'MEDIUM' : 'LOW';
  return {
    n,
    predicted,
    dial,
    lo: ets[0],
    hi: ets[ets.length - 1],
    confidence,
    basis: `Based on ${n} similar run${n === 1 ? '' : 's'} (DA ±750 ft, temp ±12°F, ${target.distance} mile).`,
  };
}

const SETUP_FIELDS = ['jet', 'lPsi', 'rPsi', 'lBar', 'rBar', 'comp', 'rebound', 'revLim'];
export const hasSetupFields = (r) => SETUP_FIELDS.some((f) => isNum(r[f]));
const setupKey = (r) => SETUP_FIELDS.map((f) => (isNum(r[f]) ? r[f] : '–')).join('|');

/**
 * Rank car setups by mean weather-corrected ET. THE single ranking function —
 * both IDEAL SETUP and the CREW CHIEF recommendation derive from it, so they
 * can never contradict each other (bug fix: original showed Jet 93 vs Jet 95).
 */
export function rankSetups(runs, baseline) {
  const groups = new Map();
  for (const r of runs) {
    if (!isNum(r.et) || !isNum(r.daFt)) continue;
    if (!hasSetupFields(r)) continue;
    const key = setupKey(r);
    if (!groups.has(key)) {
      groups.set(key, {
        fields: Object.fromEntries(SETUP_FIELDS.map((f) => [f, r[f]])),
        ets: [],
        best: Infinity,
        runs: 0,
      });
    }
    const g = groups.get(key);
    const c = correctET(r.et, r.daFt, baseline);
    if (c != null) {
      g.ets.push(c);
      g.runs++;
      if (c < g.best) g.best = c;
    }
  }
  return [...groups.values()]
    .map((g) => ({ ...g, avgCorrET: avg(g.ets), lowSample: g.runs < 3 }))
    .sort((a, b) => a.avgCorrET - b.avgCorrET);
}

/**
 * Rich crew chief's call: data-driven setup recommendations with structured
 * explanations. Compares current conditions to historical baseline, pulls the
 * top-ranked setup, and generates template-based rationale.
 * 
 * Returns {
 *   conditions: { daFt, baselineDA, delta, tempF, airDesc },
 *   opening: string,
 *   setup: [{ field, label, value, from, why }],
 *   rationale: string,
 *   advice: [string],
 * }
 */
export function crewChiefCall(runs, target, baseline, latest) {
  const daFt = target.daFt;
  const tempF = target.tempF;
  
  // Baseline DA: average of runs with DA data.
  const daRuns = runs.filter((r) => isNum(r.daFt));
  const baselineDA = daRuns.length ? avg(daRuns.map((r) => r.daFt)) : baseline || 2500;
  const delta = daFt != null ? daFt - baselineDA : null;
  
  // Air description.
  let airDesc = 'similar to';
  if (delta != null) {
    if (delta < -1000) airDesc = 'significantly better than';
    else if (delta < -300) airDesc = 'better than';
    else if (delta > 1000) airDesc = 'significantly worse than';
    else if (delta > 300) airDesc = 'worse than';
  }
  
  // Top-ranked setup by weather-corrected ET.
  const ranked = rankSetups(runs, baseline);
  const top = ranked[0] || null;
  
  // Build opening.
  let opening = '';
  if (daFt != null && daRuns.length) {
    opening = `Listen up. The air is ${airDesc} our previous logs. We're looking at a Density Altitude of roughly ${Math.round(daFt)} ft, `;
    if (delta < -300) {
      opening += `which is ${Math.abs(Math.round(delta))} ft lower than our baseline (${Math.round(baselineDA)} ft). That air is dense, cold, and packed with oxygen — the engine is going to wake up, so don't choke it out.`;
    } else if (delta > 300) {
      opening += `which is ${Math.round(delta)} ft higher than our baseline (${Math.round(baselineDA)} ft). That air is thin — the engine will be down on power, so don't over-fuel it.`;
    } else {
      opening += `right around our baseline (${Math.round(baselineDA)} ft). Expect the car to run like it has been.`;
    }
  } else {
    opening = 'Log runs with weather data to unlock air analysis.';
  }
  
  // Build setup recommendations with explanations.
  const setup = [];
  if (top && latest) {
    const fields = [
      { k: 'revLim', label: 'Rev Limiter', unit: ' RPM' },
      { k: 'jet', label: 'Jet', unit: '' },
      { k: 'lPsi', label: 'Left Tire PSI', unit: '' },
      { k: 'rPsi', label: 'Right Tire PSI', unit: '' },
      { k: 'lBar', label: 'Left Bar', unit: '' },
      { k: 'rBar', label: 'Right Bar', unit: '' },
      { k: 'comp', label: 'Compression', unit: '' },
      { k: 'rebound', label: 'Rebound', unit: '' },
    ];
    for (const { k, label, unit } of fields) {
      const to = top.fields[k];
      const from = latest[k];
      if (!isNum(to)) continue;
      let why = '';
      if (k === 'jet' && isNum(from) && to !== from) {
        if (to > from && delta < -300) why = ' (We need more fuel to match the increased air density)';
        else if (to < from && delta > 300) why = ' (Less fuel for the thinner air)';
        else if (to > from) why = ' (More fuel based on what worked)';
        else if (to < from) why = ' (Less fuel based on what worked)';
      } else if (k === 'revLim' && isNum(from) && to !== from) {
        if (to > from && delta < -300) why = ' (Bump it up to account for the extra power in the dense air)';
        else if (to > from) why = ' (Take advantage of the power band)';
      } else if ((k === 'lPsi' || k === 'rPsi') && isNum(from) && to !== from) {
        if (tempF != null && tempF < 50 && to > from) why = ' (Cooler track surface — keep sidewalls stable)';
      }
      setup.push({ field: k, label, value: to, from: isNum(from) ? from : null, why, unit });
    }
  }
  
  // Rationale paragraph.
  let rationale = '';
  if (daFt != null && top) {
    const parts = [];
    if (delta < -300) {
      parts.push(`The current Density Altitude (${Math.round(daFt)} ft) is significantly lower than our baseline (${Math.round(baselineDA)} ft), meaning the engine is pulling in much denser air.`);
      const jetRec = setup.find((s) => s.field === 'jet');
      if (jetRec && jetRec.from != null && jetRec.value !== jetRec.from) {
        parts.push(`If we run our old ${jetRec.from} jet, we'll lean out and risk burning a piston. We are bumping the jet to ${jetRec.value} to compensate for the oxygen-rich environment.`);
      }
      const revRec = setup.find((s) => s.field === 'revLim');
      if (revRec && revRec.from != null && revRec.value > revRec.from) {
        parts.push(`Raising the rev limiter to take advantage of the increased power band.`);
      }
      if (tempF != null && tempF < 50) {
        parts.push(`I've bumped the tire pressure to account for the cooler track surface (${tempF.toFixed(1)}°F), which will help keep the sidewalls stable and prevent the tires from dragging too much on the launch.`);
      }
    } else if (delta > 300) {
      parts.push(`The current Density Altitude (${Math.round(daFt)} ft) is higher than our baseline (${Math.round(baselineDA)} ft). Thinner air means less oxygen — the engine will make less power.`);
      const jetRec = setup.find((s) => s.field === 'jet');
      if (jetRec && jetRec.from != null && jetRec.value < jetRec.from) {
        parts.push(`We're leaning the jet to ${jetRec.value} to match the thinner air and avoid running rich.`);
      }
    } else {
      parts.push(`Conditions are close to baseline. The recommended setup is what has worked best in similar air.`);
    }
    rationale = parts.join(' ');
  }
  
  // Key advice based on conditions.
  const advice = [];
  if (delta != null && delta < -500) {
    advice.push(`**Watch your launch.** With the air this dense, you're going to have more torque off the line than you're used to. Don't hammer it and blow the tires off; feed the power in and keep the car straight.`);
  }
  if (tempF != null && tempF < 50) {
    advice.push(`The track is cold (${tempF.toFixed(1)}°F), so make sure you get enough heat into those tires during the burnout, or you'll be spinning instead of winning.`);
  }
  if (delta != null && delta > 500) {
    advice.push(`Thin air means less downforce on the launch. Be smooth — the car won't hook as hard as you're used to.`);
  }
  if (!advice.length && daFt != null) {
    advice.push(`Conditions are near baseline. Run your proven setup and focus on the tree.`);
  }
  
  return { conditions: { daFt, baselineDA, delta, tempF, airDesc }, opening, setup, rationale, advice, top, hasData: daRuns.length > 0 };
}

/** Least-squares regression of ET on DA. Returns slope (s per ft) + predictor. */
export function regressETonDA(runs) {
  const pts = runs.filter((r) => isNum(r.et) && isNum(r.daFt));
  const n = pts.length;
  if (n < 3) return { n, slope: null };
  const xs = pts.map((r) => r.daFt);
  const ys = pts.map((r) => r.et);
  const mx = avg(xs);
  const my = avg(ys);
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  if (!sxx) return { n, slope: null };
  const sxy = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0);
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  return { n, slope, intercept, predict: (da) => intercept + slope * da };
}

/**
 * Next-pass ET prediction with honest basis reporting.
 * Tier 1: linear ET-on-DA regression (3+ runs with DA and DA spread).
 * Tier 2: average of the runs closest to current DA (some DA data, but thin).
 * Tier 3: plain average ET (runs exist, but no air data at all).
 * Returns { et, basis, detail, confidence } or null when there are no runs with ET.
 */
export function predictET(runs, daFt) {
  const withET = runs.filter((r) => isNum(r.et));
  if (!withET.length) return null;
  const withDA = withET.filter((r) => isNum(r.daFt));

  if (daFt != null && withDA.length >= 3) {
    const reg = regressETonDA(withDA);
    if (reg.slope != null) {
      const das = withDA.map((r) => r.daFt);
      const lo = Math.min(...das), hi = Math.max(...das);
      const inRange = daFt >= lo && daFt <= hi;
      return {
        et: reg.predict(daFt),
        basis: `Linear ET/DA fit across ${withDA.length} runs`,
        detail: `${(reg.slope * 1000).toFixed(3)}s per 1,000 ft DA at ${Math.round(daFt).toLocaleString()} ft` +
          (inRange ? '' : ` — current DA is outside your ${Math.round(lo).toLocaleString()}–${Math.round(hi).toLocaleString()} ft data range`),
        confidence: inRange ? 'high' : 'medium',
      };
    }
  }

  if (daFt != null && withDA.length > 0) {
    const sorted = [...withDA].sort((a, b) => Math.abs(a.daFt - daFt) - Math.abs(b.daFt - daFt));
    const k = sorted.slice(0, Math.min(3, sorted.length));
    const closestGap = Math.abs(k[0].daFt - daFt);
    return {
      et: avg(k.map((r) => r.et)),
      basis: `Average of ${k.length} nearest-air run${k.length > 1 ? 's' : ''} — limited air data`,
      detail: `Closest logged DA ${Math.round(k[0].daFt).toLocaleString()} ft vs current ${Math.round(daFt).toLocaleString()} ft`,
      confidence: closestGap <= 500 && k.length >= 2 ? 'medium' : 'low',
    };
  }

  return {
    et: avg(withET.map((r) => r.et)),
    basis: `Average of ${withET.length} run${withET.length > 1 ? 's' : ''} — no air data`,
    detail: 'Enter temp above (or get live weather) for a DA-corrected prediction',
    confidence: withET.length >= 5 ? 'medium' : 'low',
  };
}
/** ET cheat sheet grouped by band list (DA_BANDS or TEMP_BANDS). */
export function cheatSheet(runs, bands, key) {
  return bands.map((b) => {
    const inBand = runs.filter((r) => isNum(r.et) && isNum(r[key]) && b.test(r[key]));
    const ets = inBand.map((r) => r.et);
    return {
      ...b,
      n: ets.length,
      best: ets.length ? Math.min(...ets) : null,
      avgET: avg(ets),
    };
  });
}

/** Win/loss for the 1/8-mile view. */

/** Similarity % of a run to target conditions (for SIMILAR PAST RUNS). */
export function similarityPct(run, target) {
  let score = 100;
  if (isNum(run.daFt) && target.daFt != null) score -= Math.min(60, Math.abs(run.daFt - target.daFt) / 50);
  if (isNum(run.tempF) && target.tempF != null) score -= Math.min(25, Math.abs(run.tempF - target.tempF) * 2);
  if (isNum(run.humidity) && target.humidity != null) score -= Math.min(15, Math.abs(run.humidity - target.humidity) / 4);
  return Math.max(1, Math.round(score));
}
