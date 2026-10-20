import { useEffect, useState } from 'react';
import { Card, SectionTitle, Btn, Field, inputCls } from './ui';
import { fmtTemp, fmtDA } from '../lib/format';
import { densityAltitudeFt, stationPressureHpa } from '../lib/physics';
import { fetchTrackWeather } from '../lib/weather';

/**
 * Shared weather/DA entry (Track tab + Insight tab): live weather for the
 * track when available, manual temp/humidity override, and a live-estimated
 * DA from the track's elevation. Manual entries always win for predictions.
 */
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

export function WeatherEntryCard({ title, weather, children }) {
  const { live, wxBusy, wxErr, manual, setManual, manualTemp, manualDA, loadWx } = weather;
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <SectionTitle>{title}</SectionTitle>
        <Btn kind="ghost" onClick={loadWx} disabled={wxBusy} className="!py-1.5 text-xs">{wxBusy ? '…' : 'Refresh'}</Btn>
      </div>
      {wxErr && <div className="mb-2 text-xs text-amber-300">Live weather unavailable ({wxErr}).</div>}
      {live && (
        <div className="mb-2 grid grid-cols-4 gap-2 text-center">
          <div><div className="font-mono text-xl font-bold">{fmtTemp(live.tempF)}</div><div className="text-[10px] text-white/45">TEMP</div></div>
          <div><div className="font-mono text-xl font-bold">{Math.round(live.humidity)}%</div><div className="text-[10px] text-white/45">HUMIDITY</div></div>
          <div><div className="font-mono text-xl font-bold text-pickle-400">{fmtDA(live.daFt)}</div><div className="text-[10px] text-white/45">DENSITY ALT</div></div>
          <div><div className="font-mono text-xl font-bold">{live.grains ?? '—'}</div><div className="text-[10px] text-white/45">GRAINS</div></div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Field label="Temp °F"><input type="number" value={manual.tempF} onChange={(e) => setManual({ ...manual, tempF: e.target.value })} className={inputCls} /></Field>
        <Field label="Humidity %"><input type="number" value={manual.humidity} onChange={(e) => setManual({ ...manual, humidity: e.target.value })} className={inputCls} /></Field>
        <Field label="Est. DA">
          <div className={`flex h-[42px] items-center rounded-xl border border-white/10 bg-white/[0.03] px-3 font-mono text-sm font-bold ${manualDA != null ? 'text-pickle-400' : 'text-white/25'}`}>
            {manualDA != null ? fmtDA(manualDA) : '—'}
          </div>
        </Field>
      </div>
      <div className="mt-1 text-[11px] text-white/40">
        Manual entries override live weather.
        {manualTemp != null && manualDA == null && ' Add the track\'s elevation (Tracks → Manage → Edit) to enable the DA estimate.'}
      </div>
      {children}
    </Card>
  );
}
