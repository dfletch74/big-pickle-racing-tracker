import { useMemo, useState } from 'react';
import { Card, SectionTitle, Btn, Field, inputCls, Segmented } from '../components/ui';
import { uid } from '../lib/store';
import { runsForCar, latestRun } from '../lib/stats';
import { densityAltitudeFt, stationPressureHpa } from '../lib/physics';
import { fetchTrackWeather } from '../lib/weather';
import { fmtDA } from '../lib/format';
import { isNum } from '../lib/format';
import { ScanSlipButton } from '../components/ScanSlip';
import { parseSlipText, pickLane, laneCount } from '../lib/scanSlip';

const SETUP_FIELDS = [
  ['jet', 'Jet'], ['lPsi', 'L Tire PSI'], ['rPsi', 'R Tire PSI'],
  ['lBar', 'L Bar'], ['rBar', 'R Bar'], ['comp', 'Comp'], ['rebound', 'Rebound'], ['revLim', 'Rev Limiter'],
];

const EMPTY = {
  distance: '1/4', date: '', time: '', trackId: '', runType: 'T/T',
  rt: '', sixty: '', threeThirty: '', eighthET: '', eighthMPH: '', thousand: '',
  et: '', mph: '', tempF: '', humidity: '', altitudeFt: '',
  notes: '', wl: '',
  setupMode: 'previous', presetId: '',
  jet: '', lPsi: '', rPsi: '', lBar: '', rBar: '', comp: '', rebound: '', revLim: '',
};

const numOrNull = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

export default function AddRun({ state, update, toast, editId, onDone }) {
  const editing = state.runs.find((r) => r.id === editId) || null;
  const carRuns = runsForCar(state, state.activeCarId);
  const prev = latestRun(carRuns.filter((r) => !editing || r.id !== editing.id));

  const initial = useMemo(() => {
    if (editing) {
      const f = { ...EMPTY };
      for (const k of Object.keys(EMPTY)) {
        if (k === 'setupMode') { f.setupMode = 'updated'; continue; }
        if (k === 'presetId') continue;
        const v = editing[k];
        f[k] = v == null ? '' : String(v);
      }
      return f;
    }
    const now = new Date();
    const f = { ...EMPTY };
    // Local date, not UTC — toISOString would date an evening run as tomorrow.
    f.date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    f.time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    f.trackId = state.tracks[0]?.id || '';
    return f;
  }, [editing, state.tracks]);

  const [f, setF] = useState(initial);
  const [newTrack, setNewTrack] = useState('');
  const [presetName, setPresetName] = useState('');
  const [wxBusy, setWxBusy] = useState(false);

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  // Fill the form from scanned timeslip values.
  const fillFromScan = (vals) => {
    setF((p) => {
      const next = { ...p };
      for (const k of ['rt', 'sixty', 'threeThirty', 'eighthET', 'eighthMPH', 'thousand', 'et', 'mph', 'date', 'time']) {
        if (vals[k] != null && vals[k] !== '') next[k] = String(vals[k]);
      }
      return next;
    });
    toast('Timeslip values filled — check them before saving.');
  };

  const [clipMsg, setClipMsg] = useState('');
  const [listening, setListening] = useState(false);
  const [quickMode, setQuickMode] = useState(true);
  const [quickNums, setQuickNums] = useState('');

  const fillFromQuickNums = () => {
    const nums = quickNums.trim().split(/[\s,]+/).filter((n) => /^-?\d*\.?\d+$/.test(n));
    if (nums.length === 0) {
      setClipMsg('No numbers found — type or paste 8 numbers separated by spaces.');
      return;
    }
    const keys = ['rt', 'sixty', 'threeThirty', 'eighthET', 'eighthMPH', 'thousand', 'et', 'mph'];
    const vals = {};
    nums.slice(0, 8).forEach((n, i) => { vals[keys[i]] = n; });
    fillFromScan(vals);
    setQuickNums('');
    if (nums.length < 8) setClipMsg(`Got ${nums.length} of 8 — fill the rest manually.`);
    else setClipMsg('');
  };
  const fillFromClipboard = async () => {
    setClipMsg('');
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      setClipMsg('Clipboard blocked — copy the slip text first, then try again.');
      return;
    }
    if (!text || !text.trim()) {
      setClipMsg('Clipboard is empty — copy the slip text in Photos first.');
      return;
    }
    const p = parseSlipText(text);
    const vals = pickLane(p, 0);
    const n = Object.keys(vals).filter((k) => k !== 'date' && k !== 'time' && vals[k]).length;
    if (n === 0) {
      setClipMsg('No slip numbers found in clipboard.');
      return;
    }
    fillFromScan(vals);
  };

  const dictateNumbers = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setClipMsg('Voice input not supported in this browser.');
      return;
    }
    // Stop any existing recognition first.
    if (window._bprRec) {
      try { window._bprRec.stop(); } catch {}
      window._bprRec = null;
    }
    const rec = new SR();
    window._bprRec = rec;
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    setListening(true);
    setClipMsg('Listening… say the 8 numbers in order. Tap Stop when done.');
    const timeout = setTimeout(() => {
      try { rec.stop(); } catch {}
    }, 30000); // auto-stop after 30s
    const cleanup = () => {
      clearTimeout(timeout);
      setListening(false);
      if (window._bprRec === rec) window._bprRec = null;
    };
    rec.onresult = (e) => {
      cleanup();
      const transcript = e.results[0][0].transcript;
      // Extract numbers: handles "0.366", "point three six six", "13.49", etc.
      const nums = parseSpokenNumbers(transcript);
      if (nums.length === 0) {
        setClipMsg(`Heard: "${transcript}" — no numbers found. Try again.`);
        return;
      }
      const keys = ['rt', 'sixty', 'threeThirty', 'eighthET', 'eighthMPH', 'thousand', 'et', 'mph'];
      const vals = {};
      nums.slice(0, 8).forEach((n, i) => { vals[keys[i]] = n; });
      fillFromScan(vals);
      if (nums.length < 8) setClipMsg(`Got ${nums.length} of 8 numbers — check and fill the rest manually.`);
      else setClipMsg('');
    };
    rec.onerror = (e) => {
      cleanup();
      setClipMsg(e.error === 'not-allowed' ? 'Microphone blocked — allow it in Settings.' : 'Voice input failed. Try again.');
    };
    rec.onend = () => cleanup();
    try { rec.start(); } catch { cleanup(); }
  };

  const stopDictation = () => {
    if (window._bprRec) {
      try { window._bprRec.stop(); } catch {}
      window._bprRec = null;
    }
    setListening(false);
    setClipMsg('');
  };

  // Parse spoken numbers: converts words to digits, then extracts numbers.
  const parseSpokenNumbers = (text) => {
    const wordNum = {
      zero: '0', oh: '0', o: '0', one: '1', two: '2', three: '3', four: '4',
      five: '5', six: '6', seven: '7', eight: '8', nine: '9',
    };
    // Replace number words with digits, "point" with ".".
    let t = ' ' + text.toLowerCase() + ' ';
    t = t.replace(/\bpoint\b/g, '.');
    t = t.replace(/\bdot\b/g, '.');
    for (const [w, d] of Object.entries(wordNum)) {
      t = t.replace(new RegExp(`\\b${w}\\b`, 'g'), d);
    }
    // Now extract numbers like "0.366" or "0 . 3 6 6" (spaced digits).
    // First, collapse spaced digits: "0 . 3 6 6" -> "0.366".
    t = t.replace(/(\d)\s*\.\s*(\d)/g, '$1.$2'); // "0 . 3" -> "0.3"
    t = t.replace(/(\.\d)\s+(\d)/g, '$1$2'); // ".3 6" -> ".36" (repeat to collapse all)
    t = t.replace(/(\.\d+)\s+(\d)/g, '$1$2');
    t = t.replace(/(\.\d+)\s+(\d)/g, '$1$2');
    const nums = t.match(/\d+\.\d+/g) || [];
    return nums.slice(0, 8);
  };
  const track = state.tracks.find((t) => t.id === f.trackId);

  const etNum = numOrNull(f.et);
  const canSave = isNum(etNum) && etNum > 0 && f.date && f.trackId;

  const applyPreset = (id) => {
    set('presetId', id);
    const p = state.presets.find((x) => x.id === id);
    if (p) for (const [k] of SETUP_FIELDS) set(k, p[k] == null ? '' : String(p[k]));
  };

  const usePreviousSetup = () => {
    set('setupMode', 'previous');
    if (prev) for (const [k] of SETUP_FIELDS) set(k, prev[k] == null ? '' : String(prev[k]));
    else for (const [k] of SETUP_FIELDS) set(k, '');
  };

  const doFetchWeather = async () => {
    setWxBusy(true);
    try {
      let lat = track?.lat, lon = track?.lon;
      const elev = track?.elevationFt || 0;
      if (lat == null || lon == null) {
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 9000 }));
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
        toast('No coordinates saved for this track — used your location.');
      }
      const w = await fetchTrackWeather({ lat, lon, elevationFt: elev });
      set('tempF', w.current.tempF.toFixed(1));
      set('humidity', String(Math.round(w.current.humidity)));
      if (elev) set('altitudeFt', String(elev));
      toast(`Live: ${w.current.tempF.toFixed(1)}°F, DA ${fmtDA(w.current.daFt)}.`);
    } catch (e) {
      toast(`Weather fetch failed: ${e.message}`);
    }
    setWxBusy(false);
  };

  const addTrack = () => {
    const name = newTrack.trim();
    if (!name) return;
    const t = { id: uid(), name, lat: null, lon: null, elevationFt: null };
    update((s) => { s.tracks.push(t); });
    set('trackId', t.id);
    setNewTrack('');
    toast(`Track "${name}" added.`);
  };

  const savePreset = () => {
    const name = presetName.trim() || `Preset ${state.presets.length + 1}`;
    const fields = Object.fromEntries(SETUP_FIELDS.map(([k]) => [k, numOrNull(f[k])]));
    update((s) => { s.presets.push({ id: uid(), name, ...fields }); });
    setPresetName('');
    toast(`Preset "${name}" saved.`);
  };

  const onSave = () => {
    if (!canSave) return;
    const tempF = numOrNull(f.tempF), humidity = numOrNull(f.humidity), altitudeFt = numOrNull(f.altitudeFt);
    let daFt = null;
    if (isNum(tempF) && isNum(altitudeFt)) {
      const p = stationPressureHpa(1013.25, altitudeFt);
      daFt = Math.round(densityAltitudeFt({ tempF, humidityPct: humidity ?? 0, pressureHpa: p }));
    }
    const run = {
      id: editing ? editing.id : uid(),
      carId: state.activeCarId,
      date: f.date, time: f.time || '12:00',
      track: track?.name || 'Unknown track', trackId: f.trackId || null,
      distance: f.distance, runType: f.runType,
      rt: numOrNull(f.rt), sixty: numOrNull(f.sixty), threeThirty: numOrNull(f.threeThirty),
      eighthET: numOrNull(f.eighthET), eighthMPH: numOrNull(f.eighthMPH),
      thousand: numOrNull(f.thousand), et: etNum, mph: numOrNull(f.mph),
      tempF, humidity: isNum(humidity) ? Math.round(humidity) : null, altitudeFt, daFt,
      jet: numOrNull(f.jet), lPsi: numOrNull(f.lPsi), rPsi: numOrNull(f.rPsi),
      lBar: numOrNull(f.lBar), rBar: numOrNull(f.rBar),
      comp: numOrNull(f.comp), rebound: numOrNull(f.rebound), revLim: numOrNull(f.revLim),
      wl: f.wl || null, notes: f.notes.trim(),
      createdAt: editing ? editing.createdAt : Date.now(),
    };
    update((s) => {
      if (editing) s.runs = s.runs.map((r) => (r.id === editing.id ? run : r));
      else s.runs.push(run);
    });
    toast(editing ? 'Run updated.' : `Run saved: ${etNum.toFixed(3)}s.`);
    onDone();
  };

  return (
    <div className="space-y-4">
      <SectionTitle>{editing ? 'Edit run' : 'Log a run'}</SectionTitle>

      {!editing && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={quickNums}
              onChange={(e) => setQuickNums(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') fillFromQuickNums(); }}
              placeholder="0.366 1.903 5.443 8.5 79.39 11.195 13.49 97.96"
              className={`${inputCls} min-w-0 flex-1 font-mono !text-xs`}
            />
            <Btn kind="primary" onClick={fillFromQuickNums} className="shrink-0">Fill</Btn>
          </div>
          <div className="text-center text-[11px] text-white/40">Type or paste the 8 slip numbers separated by spaces — fills the form in order.</div>
          <div className="flex gap-2">
            <Btn kind="ghost" onClick={fillFromClipboard} className="flex-1">
              <span className="mr-1">📋</span> Clipboard
            </Btn>
            {listening ? (
              <Btn kind="primary" onClick={stopDictation} className="flex-1">
                <span className="mr-1">⏹</span> Stop
              </Btn>
            ) : (
              <Btn kind="ghost" onClick={dictateNumbers} className="flex-1">
                <span className="mr-1">🎤</span> Dictate
              </Btn>
            )}
          </div>
          {clipMsg && <div className="text-center text-xs text-amber-300/80">{clipMsg}</div>}
          <ScanSlipButton onFill={fillFromScan} />
        </div>
      )}

      <Card className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <Field label="Distance"><Segmented value={f.distance} onChange={(v) => set('distance', v)}
            options={[{ value: '1/4', label: '1/4 mi' }, { value: '1/8', label: '1/8 mi' }]} /></Field>
          <Field label="Run type">
            <select value={f.runType} onChange={(e) => set('runType', e.target.value)} className={inputCls}>
              <option>T/T</option><option>Qualifying</option><option>Eliminations</option>
            </select>
          </Field>
          {f.runType === 'Eliminations' && (
            <Field label="Result">
              <select value={f.wl} onChange={(e) => set('wl', e.target.value)} className={inputCls}>
                <option value="">—</option><option value="W">Win</option><option value="L">Loss</option>
              </select>
            </Field>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Date"><input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} className={inputCls} /></Field>
          <Field label="Time"><input type="time" value={f.time} onChange={(e) => set('time', e.target.value)} className={inputCls} /></Field>
          <Field label="Track">
            <select value={f.trackId} onChange={(e) => set('trackId', e.target.value)} className={inputCls}>
              {state.tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="flex gap-2">
          <input value={newTrack} onChange={(e) => setNewTrack(e.target.value)} placeholder="New track name…" className={`${inputCls} flex-1`} />
          <Btn kind="ghost" onClick={addTrack}>Add track</Btn>
        </div>
      </Card>

      <Card>
        <SectionTitle>Timeslip data</SectionTitle>
        {/* NOTE: every field starts EMPTY — no placeholder defaults that could
            be saved as real data (bug fix from the original). */}
        <div className="grid grid-cols-3 gap-3">
          <Num label="R/T" value={f.rt} onChange={(v) => set('rt', v)} step="0.001" />
          <Num label="60FT" value={f.sixty} onChange={(v) => set('sixty', v)} step="0.001" />
          <Num label="330FT" value={f.threeThirty} onChange={(v) => set('threeThirty', v)} step="0.001" />
          <Num label="1/8 ET" value={f.eighthET} onChange={(v) => set('eighthET', v)} step="0.001" />
          <Num label="1/8 MPH" value={f.eighthMPH} onChange={(v) => set('eighthMPH', v)} step="0.1" />
          <Num label="1000FT" value={f.thousand} onChange={(v) => set('thousand', v)} step="0.001" />
          <Num label="ET *" value={f.et} onChange={(v) => set('et', v)} step="0.001" required />
          <Num label="MPH" value={f.mph} onChange={(v) => set('mph', v)} step="0.1" />
        </div>
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <SectionTitle>Weather</SectionTitle>
          <Btn kind="ghost" onClick={doFetchWeather} disabled={wxBusy} className="!py-1.5 text-xs">
            {wxBusy ? 'Fetching…' : 'Fetch live weather'}
          </Btn>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Num label="Temp °F" value={f.tempF} onChange={(v) => set('tempF', v)} step="0.1" />
          <Num label="Humidity %" value={f.humidity} onChange={(v) => set('humidity', v)} step="1" />
          <Num label="Altitude ft" value={f.altitudeFt} onChange={(v) => set('altitudeFt', v)} step="10" />
        </div>
        <div className="mt-1 text-[11px] text-white/40">DA is computed from temp / humidity / altitude (pressure estimated from altitude).</div>
      </Card>

      <Card>
        <SectionTitle>Car configuration</SectionTitle>
        <div className="mb-3 flex flex-wrap gap-2">
          <Btn kind={f.setupMode === 'previous' ? 'primary' : 'ghost'} onClick={usePreviousSetup} className="!py-1.5 text-xs">Same as previous</Btn>
          <Btn kind={f.setupMode === 'updated' ? 'primary' : 'ghost'} onClick={() => set('setupMode', 'updated')} className="!py-1.5 text-xs">Updated setup</Btn>
        </div>
        {state.presets.length > 0 && (
          <Field label="Quick preset" className="mb-3">
            <select value={f.presetId} onChange={(e) => applyPreset(e.target.value)} className={inputCls}>
              <option value="">— pick a preset —</option>
              {state.presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SETUP_FIELDS.map(([k, label]) => (
            <Num key={k} label={label} value={f[k]} onChange={(v) => set(k, v)} step="0.5" />
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Preset name…" className={`${inputCls} flex-1`} />
          <Btn kind="ghost" onClick={savePreset}>Save current</Btn>
        </div>
      </Card>

      <Card>
        <Field label="Notes"><textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className={inputCls} placeholder="Track prep, lane, anything notable…" /></Field>
      </Card>

      <div className="flex gap-2 pb-2">
        <Btn onClick={onSave} disabled={!canSave} className="flex-1 !py-3 text-base">
          {editing ? 'Save changes' : 'Save run'}
        </Btn>
        <Btn kind="ghost" onClick={onDone}>Cancel</Btn>
      </div>
      {!canSave && <div className="pb-4 text-center text-xs text-white/40">Enter an E.T. (plus date and track) to save.</div>}
    </div>
  );
}

function Num({ label, value, onChange, step = '0.01', required }) {
  return (
    <Field label={label + (required ? ' *' : '')}>
      <input
        type="number" inputMode="decimal" step={step}
        value={value} placeholder=""
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls} font-mono`}
      />
    </Field>
  );
}
