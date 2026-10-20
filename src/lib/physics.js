/**
 * Density altitude + weather-correction math.
 *
 * DIRECTION (this is the part the original app got backwards, so it is
 * stated explicitly):
 *   Higher density altitude  = thinner air = LESS power = SLOWER ET / LOWER MPH.
 *   Lower density altitude   = denser air  = MORE power = FASTER ET / HIGHER MPH.
 * Correcting a run to a LOWER baseline DA must therefore yield a FASTER
 * (lower) corrected ET. Never print "Higher D/A = faster".
 *
 * Density altitude formula (standard, humidity-corrected):
 *   1. Saturation vapor pressure (Magnus approximation):
 *        es = 6.112 * exp(17.67*T / (T + 243.5))      [T in °C, es in hPa]
 *   2. Actual vapor pressure:  e = es * RH/100
 *   3. Virtual temperature (moist air is less dense than dry air at the
 *      same temperature/pressure):
 *        Tv = T / (1 - 0.378 * e / P)                [T in Kelvin, P in hPa]
 *   4. Pressure altitude from station pressure:
 *        PA = 145366.45 * (1 - (P / 1013.25)^0.190284)   [feet]
 *   5. ISA temperature at that pressure altitude:
 *        T_isa = 15 - 0.0019812 * PA                      [°C]
 *   6. Density altitude:
 *        DA = PA + 120 * (Tv_C - T_isa)                   [feet]
 *
 * Weather correction (simplified air-density-ratio model, documented as
 * approximate — it is directionally correct, which is what matters for
 * comparing runs across different air):
 *   Air density falls with altitude per the standard atmosphere:
 *        rho/rho_ssl = (1 - 6.87535e-6 * h)^4.2561       [h in feet]
 *   Engine power scales ~linearly with air density. ET scales roughly
 *   with the inverse square root of power, MPH roughly with the cube
 *   root of power, giving:
 *        ET_corr  = ET  * (rho_actual / rho_ref)^0.5
 *        MPH_corr = MPH * (rho_ref / rho_actual)^(1/3)
 *   Sanity check: 9.369s @ 3300 ft DA corrected to a 2500 ft baseline
 *   gives ~9.260s — faster, as physics demands.
 */


const fToC = (f) => ((f - 32) * 5) / 9;

/** Magnus approximation: saturation vapor pressure in hPa from °C. */
export function saturationVaporPressureHpa(tempC) {
  return 6.112 * Math.exp((17.67 * tempC) / (tempC + 243.5));
}

/** Station pressure from sea-level pressure + elevation. */
export function stationPressureHpa(mslpHpa, elevationFt) {
  const hM = elevationFt * 0.3048;
  return mslpHpa * Math.pow(1 - 2.25577e-5 * hM, 5.25588);
}

/**
 * Water grains: grains of moisture per pound of dry air.
 * More tuning-relevant than relative humidity alone — quantifies
 * humidity's actual effect on air/fuel mixture.
 * @param {object} p - { tempF, humidityPct (0-100), pressureHpa (station) }
 */
export function waterGrains({ tempF, humidityPct = 0, pressureHpa = 1013.25 }) {
  const tempC = (tempF - 32) * 5 / 9;
  const es = saturationVaporPressureHpa(tempC);
  const e = es * (humidityPct / 100);
  // Mixing ratio -> grains per lb: 7000 grains per lb, ratio = 0.622 * e/(p-e)
  const grains = 7000 * 0.622 * e / Math.max(pressureHpa - e, 1);
  return Math.round(grains);
}

/**
 * Density altitude in feet.
 * @param {object} p - { tempF, humidityPct (0-100), pressureHpa (station pressure) }
 */
export function densityAltitudeFt({ tempF, humidityPct = 0, pressureHpa = 1013.25 }) {
  const tempC = fToC(tempF);
  const tempK = tempC + 273.15;
  const es = saturationVaporPressureHpa(tempC);
  const e = es * (Math.min(Math.max(humidityPct, 0), 100) / 100);
  // Virtual temperature accounts for humidity making air less dense.
  const tvK = tempK / (1 - (0.378 * e) / pressureHpa);
  const tvC = tvK - 273.15;
  const paFt = 145366.45 * (1 - Math.pow(pressureHpa / 1013.25, 0.190284));
  const isaC = 15 - 0.0019812 * paFt;
  return paFt + 120 * (tvC - isaC);
}

/** Convenience: density altitude from sea-level pressure + track elevation. */
export function densityAltitudeFromMslp({ tempF, humidityPct = 0, mslpHpa, elevationFt = 0 }) {
  const p = stationPressureHpa(mslpHpa, elevationFt);
  return densityAltitudeFt({ tempF, humidityPct, pressureHpa: p });
}

/** Air density relative to sea-level standard, from a density altitude. */
export function densityRatio(daFt) {
  return Math.pow(1 - 6.87535e-6 * daFt, 4.2561);
}

/**
 * Correct an ET to a baseline density altitude.
 * Higher actual DA (thinner air) -> corrected ET is LOWER (faster). Always.
 */
export function correctET(et, daFt, baselineDaFt = 2500) {
  if (et == null || daFt == null) return null;
  const ratio = densityRatio(daFt) / densityRatio(baselineDaFt);
  return et * Math.sqrt(ratio);
}

/** Correct a trap speed to a baseline density altitude. */
export function correctMPH(mph, daFt, baselineDaFt = 2500) {
  if (mph == null || daFt == null) return null;
  const ratio = densityRatio(baselineDaFt) / densityRatio(daFt);
  return mph * Math.cbrt(ratio);
}

export const DA_BANDS = [
  { id: 'low', label: 'Low', detail: '< 2,500 ft', test: (da) => da < 2500 },
  { id: 'med', label: 'Medium', detail: '2,500–4,000 ft', test: (da) => da >= 2500 && da < 4000 },
  { id: 'high', label: 'High', detail: '4,000–5,500 ft', test: (da) => da >= 4000 && da < 5500 },
  { id: 'vhigh', label: 'Very high', detail: '> 5,500 ft', test: (da) => da >= 5500 },
];

export const TEMP_BANDS = [
  { id: 'cold', label: 'Cold', detail: '< 60°F', test: (t) => t < 60 },
  { id: 'cool', label: 'Cool', detail: '60–75°F', test: (t) => t >= 60 && t < 75 },
  { id: 'warm', label: 'Warm', detail: '75–90°F', test: (t) => t >= 75 && t < 90 },
  { id: 'hot', label: 'Hot', detail: '> 90°F', test: (t) => t >= 90 },
];

/** Human label for how the air is trending. */
export function airTrendLabel(daNow, daNextHr) {
  if (daNow == null || daNextHr == null) return 'Trend unknown';
  const d = daNextHr - daNow;
  if (d < -100) return 'Air improving (DA falling)';
  if (d > 100) return 'Air worsening (DA rising)';
  return 'Air stable';
}
