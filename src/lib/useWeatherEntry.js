/**
 * Shared weather/DA entry hook (Track tab + Insight tab): live weather for
 * the track when available, manual temp/humidity override, and a
 * live-estimated DA from the track's elevation. Manual entries always win
 * for predictions.
 *
 * Lives in lib (not components/WeatherEntry) so that file only exports
 * components.
 */
import { useEffect, useState } from 'react';
import { densityAltitudeFt, stationPressureHpa } from './physics';
import { fetchTrackWeather } from './weather';

export function useWeatherEntry(track) {
  const [wx, setWx] = useState(null);
  const [wxBusy, setWxBusy] = useState(false);
  const [wxErr, setWxErr] = useState('');
  const [manual, setManual] = useState({ tempF: '', humidity: '' });

  const loadWx = async () => {
    if (!track) return;
    setWxBusy(true);
    setWxErr('');
    try {
      setWx(await fetchTrackWeather(track));
    } catch (e) {
      setWxErr(e.message);
    }
    setWxBusy(false);
  };

  useEffect(() => {
    setWx(null);
    setWxErr('');
    setManual({ tempF: '', humidity: '' });
    loadWx();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id]);

  const live = wx?.current || null;
  const hourly = wx?.hourly || [];
  const manualTemp = manual.tempF === '' ? null : Number(manual.tempF);
  const manualHum = manual.humidity === '' ? null : Number(manual.humidity);
  const manualDA = (() => {
    if (manualTemp == null || track?.elevationFt == null) return null;
    const p = stationPressureHpa(1013.25, track.elevationFt);
    return Math.round(densityAltitudeFt({ tempF: manualTemp, humidityPct: manualHum ?? 0, pressureHpa: p }));
  })();
  const effDA = manualDA ?? live?.daFt ?? null;

  return { wx, wxBusy, wxErr, manual, setManual, live, hourly, manualTemp, manualHum, manualDA, effDA, loadWx };
}
