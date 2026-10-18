import { densityAltitudeFromMslp } from './physics';

/**
 * Live weather via Open-Meteo (https://open-meteo.com) — free, no API key.
 * Returns current temp/humidity/sea-level pressure + hourly forecast so we
 * can compute density altitude now and its near-term trend.
 */
export async function fetchTrackWeather(track) {
  if (!track || track.lat == null || track.lon == null) {
    throw new Error('Track has no coordinates saved.');
  }
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${track.lat}&longitude=${track.lon}` +
    `&current=temperature_2m,relative_humidity_2m,pressure_msl` +
    `&hourly=temperature_2m,relative_humidity_2m,pressure_msl` +
    `&temperature_unit=fahrenheit&timezone=auto&forecast_days=2`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather service returned ${res.status}`);
  const j = await res.json();
  const c = j.current || {};
  const elevationFt = track.elevationFt || 0;

  const current = {
    tempF: c.temperature_2m,
    humidity: c.relative_humidity_2m,
    mslpHpa: c.pressure_msl,
    daFt: densityAltitudeFromMslp({
      tempF: c.temperature_2m,
      humidityPct: c.relative_humidity_2m,
      mslpHpa: c.pressure_msl,
      elevationFt,
    }),
  };

  // Hourly DA for the next 3 hours (find "now" in the hourly arrays).
  const hourly = [];
  if (j.hourly && j.hourly.time) {
    const nowMin = Date.now() / 60000;
    let start = 0;
    let best = Infinity;
    j.hourly.time.forEach((t, i) => {
      const d = Math.abs(new Date(t).getTime() / 60000 - nowMin);
      if (d < best) {
        best = d;
        start = i;
      }
    });
    for (let i = start + 1; i < Math.min(start + 4, j.hourly.time.length); i++) {
      const tempF = j.hourly.temperature_2m[i];
      const humidity = j.hourly.relative_humidity_2m[i];
      const mslpHpa = j.hourly.pressure_msl[i];
      if (tempF == null || mslpHpa == null) continue;
      hourly.push({
        time: j.hourly.time[i],
        tempF,
        daFt: densityAltitudeFromMslp({ tempF, humidityPct: humidity ?? 50, mslpHpa, elevationFt }),
      });
    }
  }
  return { current, hourly };
}
