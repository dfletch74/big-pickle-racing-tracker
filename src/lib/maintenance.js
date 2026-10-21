/**
 * Maintenance migration + helpers. Maintenance is tracked per car
 * (each part carries a carId); runs-since-service counts that car's runs.
 */

/**
 * One-time migration: parts that predate per-car tracking move to the car
 * with the most runs, keeping each part's "runs since last service" intact
 * across the unit change (global run count -> that car's run count).
 * Mutates the passed state draft. Idempotent — safe to run on every mount.
 */
export function migrateMaintenanceCarIds(s) {
  const list = s.maintenance || [];
  if (!list.length || list.every((p) => p.carId)) return;
  const counts = {};
  for (const r of s.runs || []) {
    if (r.source === 'demo') continue;
    counts[r.carId] = (counts[r.carId] || 0) + 1;
  }
  let target = s.activeCarId;
  let best = -1;
  for (const c of s.cars || []) {
    const n = counts[c.id] || 0;
    if (n > best) { best = n; target = c.id; }
  }
  const globalTotal = Object.values(counts).reduce((a, b) => a + b, 0);
  const carTotal = counts[target] || 0;
  const shift = globalTotal - carTotal;
  for (const p of list) {
    if (!p.carId) {
      p.carId = target;
      p.lastServiceAt = Math.max(0, (p.lastServiceAt || 0) - shift);
    }
  }
}

/** Non-demo runs belonging to one car. */
export function carRunCount(s, carId) {
  return (s.runs || []).filter((r) => r.source !== 'demo' && r.carId === carId).length;
}

/** Runs since a part was last serviced, in that part's car's run units. */
export function runsSinceService(s, part) {
  return Math.max(0, carRunCount(s, part.carId) - (part.lastServiceAt || 0));
}
