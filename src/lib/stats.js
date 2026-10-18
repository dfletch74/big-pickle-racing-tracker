import { runDateTime, isNum } from './format';
import { correctET, correctMPH } from './physics';

export const runsForCar = (state, carId) => state.runs.filter((r) => r.carId === carId);

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

/** Consistency panel: grade, streak, % within ±0.05s of avg ET, spread. */
export function consistency(runs) {
  const ets = runs.map((r) => r.et).filter(isNum);
  if (ets.length < 3) return null;
  const a = avg(ets);
  const within = ets.filter((e) => Math.abs(e - a) <= 0.05).length;
  const score = (within / ets.length) * 100;
  const spread = Math.max(...ets) - Math.min(...ets);
  const ordered = [...runs].filter((r) => isNum(r.et)).sort((x, y) => runDateTime(x) - runDateTime(y));
  let streak = 0;
  for (let i = ordered.length - 1; i >= 0; i--) {
    if (Math.abs(ordered[i].et - a) <= 0.05) streak++;
    else break;
  }
  const grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F';
  return { avgET: a, score, spread, streak, grade, n: ets.length };
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
export const correctedMPHOf = (run, baseline) => correctMPH(run.mph, run.daFt, baseline);

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
 * Rule-based crew chief narrative (no LLM). References: DA trend, weakest
 * segment vs best, and the top-ranked setup from rankSetups() — the same
 * ranking the IDEAL SETUP card shows.
 */
export function crewChief(runs, baseline, daTrend) {
  const ranked = rankSetups(runs, baseline);
  const top = ranked[0] || null;
  const segs = bestSegments(runs);
  // Weakest segment: where the fleet's average lags its best by the most.
  let weakest = null;
  let weakestGap = 0;
  segs.forEach((s, i) => {
    if (s.best == null) return;
    const durs = runs.map((r) => segmentSplits(r)[i].dur).filter(isNum);
    if (!durs.length) return;
    const gap = avg(durs) - s.best;
    if (gap > weakestGap) {
      weakestGap = gap;
      weakest = s.name;
    }
  });
  const bullets = [];
  if (daTrend) bullets.push(`Air is ${daTrend} — ${daTrend === 'improving' ? 'denser air should pick the car up' : daTrend === 'worsening' ? 'thinner air will cost power; consider leaning on the setup that ran best in thin air' : 'expect runs to repeat'}.`);
  if (weakest) bullets.push(`Weakest segment vs your best: ${weakest} (avg trails best by ${weakestGap.toFixed(3)}s). Look at tire pressure, track prep, and shift points there.`);
  if (top) {
    const f = top.fields;
    const parts = [];
    if (isNum(f.jet)) parts.push(`Jet ${f.jet}`);
    if (isNum(f.revLim)) parts.push(`Rev limiter ${f.revLim}`);
    if (isNum(f.lPsi)) parts.push(`tire PSI ${f.lPsi}/${f.rPsi}`);
    bullets.push(`Top-ranked setup by weather-corrected ET: ${parts.join(' · ')} — ${top.runs} run${top.runs === 1 ? '' : 's'}, best corrected ${top.best.toFixed(3)}s.${top.lowSample ? ' Small sample — treat as a lead, not a rule.' : ''}`);
  } else {
    bullets.push('Log a few runs with setup + weather data to unlock setup recommendations.');
  }
  return { top, weakest, bullets };
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
export function winLoss(runs) {
  const w = runs.filter((r) => r.wl === 'W').length;
  const l = runs.filter((r) => r.wl === 'L').length;
  return { w, l, rate: w + l ? (w / (w + l)) * 100 : null };
}

/** Similarity % of a run to target conditions (for SIMILAR PAST RUNS). */
export function similarityPct(run, target) {
  let score = 100;
  if (isNum(run.daFt) && target.daFt != null) score -= Math.min(60, Math.abs(run.daFt - target.daFt) / 50);
  if (isNum(run.tempF) && target.tempF != null) score -= Math.min(25, Math.abs(run.tempF - target.tempF) * 2);
  if (isNum(run.humidity) && target.humidity != null) score -= Math.min(15, Math.abs(run.humidity - target.humidity) / 4);
  return Math.max(1, Math.round(score));
}
