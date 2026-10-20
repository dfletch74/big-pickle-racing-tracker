import { useMemo, useState, useEffect, useRef } from 'react';
import { Card, SectionTitle, Btn, inputCls, Segmented, Badge, EmptyState } from '../components/ui';
import { fmtET, fmtMPH, fmtTemp, fmtDA, fmtDate, isNum } from '../lib/format';
import { runsForCar, raceRuns, filterDistance, latestRun, segmentSplits, bestSegments, predictET, cheatSheet } from '../lib/stats';
import { DA_BANDS, TEMP_BANDS, airTrendLabel } from '../lib/physics';
import { useWeatherEntry, WeatherEntryCard } from '../components/WeatherEntry';
import { uid } from '../lib/store';
import { publishTracks } from '../lib/teamSync';

export default function TrackDay({ state, update, toast, dist, setDist, onAddRun, role }) {
  const canEdit = role?.canLog ?? true;
  const canDelete = role?.canDelete ?? true;
  const [trackId, setTrackId] = useState(state.tracks[0]?.id || '');
  const [noteText, setNoteText] = useState('');
  const [showElims, setShowElims] = useState(false);
  const [showTracks, setShowTracks] = useState(false);

  const track = state.tracks.find((t) => t.id === trackId) || state.tracks[0];
  const carRuns = useMemo(() => raceRuns(runsForCar(state, state.activeCarId)), [state]);
  const runs = useMemo(() => filterDistance(carRuns, dist), [carRuns, dist]);
  const last = useMemo(() => latestRun(runs), [runs]);

  const weather = useWeatherEntry(track);
  const { live, effDA } = weather;
  const trend = weather.wx && weather.hourly.length
    ? airTrendLabel(live.daFt, weather.hourly[weather.hourly.length - 1].daFt)
    : null;
  const nextHr = weather.wx && weather.hourly.length ? weather.hourly[weather.hourly.length - 1] : null;

  const buildPass = useMemo(() => {
    if (!last) return null;
    const segs = segmentSplits(last);
    const bests = bestSegments(runs);
    return segs.map((s, i) => ({ ...s, best: bests[i]?.best, delta: isNum(s.dur) && isNum(bests[i]?.best) ? s.dur - bests[i].best : null }));
  }, [last, runs]);

  const prediction = useMemo(() => predictET(runs, effDA), [runs, effDA]);

  const sheets = useMemo(() => ({
    da: cheatSheet(runs, DA_BANDS, 'daFt'),
    temp: cheatSheet(runs, TEMP_BANDS, 'tempF'),
  }), [runs]);

  const notes = state.trackNotes.filter((n) => !track || n.trackId === track.id).sort((a, b) => b.date.localeCompare(a.date));

  const addNote = () => {
    const t = noteText.trim();
    if (!t || !track) return;
    update((s) => { s.trackNotes.push({ id: uid(), trackId: track.id, date: new Date().toISOString().slice(0, 10), text: t }); });
    setNoteText('');
    toast('Note saved.');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={track?.id || ''} onChange={(e) => setTrackId(e.target.value)} className={`${inputCls} flex-1`}>
          {state.tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <Segmented value={dist} onChange={setDist} options={[{ value: '1/4', label: '1/4 mi' }, { value: '1/8', label: '1/8 mi' }]} />
        <Btn onClick={onAddRun}>Log a run</Btn>
      </div>

      {/* live conditions */}
      <WeatherEntryCard title="Live conditions" weather={weather}>
        {trend && <div className="mt-2 text-center text-xs text-white/60">{trend}{nextHr && <> · next hr ≈ {fmtDA(nextHr.daFt)} ({fmtTemp(nextHr.tempF)})</>}</div>}
        <div className="mt-1 text-center text-[10px] text-white/35">Higher DA = thinner air = slower. Correcting to a lower DA gives a faster ET.</div>
      </WeatherEntryCard>

      {/* build the pass */}
      {last ? (
        <Card>
          <SectionTitle>Build the pass <span className="normal-case tracking-normal">— {fmtDate(last.date)}</span></SectionTitle>
          <div className="mb-2 text-xs text-white/50">Last run vs your best per segment:</div>
          <table className="w-full font-mono text-xs">
            <tbody>
              {buildPass.map((s) => (
                <tr key={s.name} className="border-t border-white/5">
                  <td className="py-1.5 text-white/60">{s.name}</td>
                  <td className="text-right">{isNum(s.dur) ? s.dur.toFixed(3) : '—'}</td>
                  <td className="text-right text-white/40">best {isNum(s.best) ? s.best.toFixed(3) : '—'}</td>
                  <td className={`text-right ${s.delta > 0.001 ? 'text-amber-300' : 'text-pickle-400'}`}>
                    {s.delta == null ? '' : s.delta <= 0.0005 ? '✓' : `+${s.delta.toFixed(3)}`}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-white/10 font-bold">
                <td className="py-1.5">Full pass</td>
                <td className="text-right text-pickle-400">{fmtET(last.et)}</td>
                <td className="text-right text-white/40">@ {fmtMPH(last.mph)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </Card>
      ) : (
        <EmptyState title="No runs yet" body="Log a run to build your first pass analysis." action={<Btn onClick={onAddRun}>Log a run</Btn>} />
      )}

      {/* next pass predictor */}
      <Card>
        <SectionTitle>Next pass predictor</SectionTitle>
        {prediction != null ? (
          <div>
            <div className="font-mono text-2xl font-black text-pickle-400">{prediction.et.toFixed(3)}s <span className="text-sm font-normal text-white/50">predicted ET</span></div>
            <div className="mt-1.5 flex items-center gap-2">
              <Badge tone={prediction.confidence === 'high' ? 'green' : prediction.confidence === 'medium' ? 'neutral' : 'amber'}>
                {prediction.confidence === 'high' ? 'Solid' : prediction.confidence === 'medium' ? 'Fair' : 'Thin data'}
              </Badge>
              <div className="text-xs text-white/45">{prediction.basis}</div>
            </div>
            <div className="mt-1 text-xs text-white/40">{prediction.detail}</div>
          </div>
        ) : (
          <div className="text-sm text-white/50">Log a run to get a prediction.</div>
        )}
      </Card>

      {/* cheat sheets */}
      <Card>
        <SectionTitle>ET cheat sheet</SectionTitle>
        <div className="mb-1 text-[11px] font-semibold text-white/50">By density altitude</div>
        <SheetTable rows={sheets.da} />
        <div className="mb-1 mt-3 text-[11px] font-semibold text-white/50">By temperature</div>
        <SheetTable rows={sheets.temp} />
      </Card>

      {/* eliminations */}
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <SectionTitle>Eliminations</SectionTitle>
          {canEdit && (
            <Btn kind="ghost" onClick={() => setShowElims((s) => !s)} className="!py-1.5 text-xs">{showElims ? 'Hide' : 'Manage'}</Btn>
          )}
        </div>
        {showElims && <Elims state={state} update={update} toast={toast} track={track} dist={dist} />}
        {!showElims && <div className="text-xs text-white/45">{state.events.length} event{state.events.length === 1 ? '' : 's'} on record.</div>}
      </Card>

      {/* track notes */}
      <Card>
        <SectionTitle>Track notes</SectionTitle>
        {canEdit && (
          <div className="mb-2 flex gap-2">
            <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Lane 2 hooking better after 6pm…" className={`${inputCls} flex-1`} />
            <Btn kind="ghost" onClick={addNote}>Add</Btn>
          </div>
        )}
        {notes.length === 0 && <div className="text-xs text-white/40">No notes for this track yet.</div>}
        {notes.map((n) => (
          <div key={n.id} className="flex items-start justify-between gap-2 border-t border-white/5 py-2 text-sm">
            <div><span className="mr-2 text-xs text-white/40">{fmtDate(n.date)}</span>{n.text}</div>
            {canDelete && (
              <button onClick={() => update((s) => { s.trackNotes = s.trackNotes.filter((x) => x.id !== n.id); })} className="text-xs text-red-400/70">✕</button>
            )}
          </div>
        ))}
      </Card>

      {/* manage tracks */}
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <SectionTitle>Tracks</SectionTitle>
          {canEdit && (
            <Btn kind="ghost" onClick={() => setShowTracks((s) => !s)} className="!py-1.5 text-xs">{showTracks ? 'Hide' : 'Manage'}</Btn>
          )}
        </div>
        {showTracks ? (
          <ManageTracks state={state} update={update} toast={toast} selectedId={trackId} onSelectTrack={setTrackId} />
        ) : (
          <div className="text-xs text-white/45">{state.tracks.length} track{state.tracks.length === 1 ? '' : 's'} in the list.</div>
        )}
      </Card>
    </div>
  );
}

function ManageTracks({ state, update, toast, selectedId, onSelectTrack }) {
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [newName, setNewName] = useState('');
  const [newLoc, setNewLoc] = useState('');
  const [newElev, setNewElev] = useState('');
  const [newHeading, setNewHeading] = useState('');
  const [editLoc, setEditLoc] = useState('');
  const [editHeading, setEditHeading] = useState('');
  const [locBusy, setLocBusy] = useState(false);
  // Set after any local track change; the effect below publishes the fresh
  // state to the shared team file once React has re-rendered with it.
  const publishDirty = useRef(false);
  useEffect(() => {
    if (!publishDirty.current) return;
    publishDirty.current = false;
    publishTracks(state).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.tracks]);

  const runCount = (t) => state.runs.filter((r) => r.trackId === t.id || (r.trackId == null && r.track === t.name)).length;

  // Free, keyless geocoding (same provider as the track weather).
  const geocode = async (q) => {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`);
    if (!res.ok) throw new Error('lookup failed');
    const j = await res.json();
    const r = j.results?.[0];
    if (!r) return null;
    return {
      lat: r.latitude,
      lon: r.longitude,
      elevationFt: r.elevation != null ? Math.round(r.elevation * 3.28084) : null,
      label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
    };
  };

  const addTrack = async () => {
    const n = newName.trim();
    if (!n) { toast('Give the track a name.', 'error'); return; }
    if (state.tracks.some((t) => t.name.toLowerCase() === n.toLowerCase())) { toast('That track is already in the list.', 'error'); return; }
    setLocBusy(true);
    let coords = null;
    const q = newLoc.trim();
    if (q) {
      try { coords = await geocode(q); } catch { /* no coords — manual weather still works */ }
    }
    // Manual entries win: typed elevation beats the geocoded one, typed heading is used as-is.
    const elevIn = newElev.trim() === '' ? null : Math.round(Number(newElev));
    const hdIn = newHeading.trim() === '' ? null : Math.round(Number(newHeading));
    const headingVal = hdIn != null && !Number.isNaN(hdIn) ? ((hdIn % 360) + 360) % 360 : null;
    update((s) => {
      s.tracks.push({
        id: uid(), name: n,
        lat: coords?.lat ?? null, lon: coords?.lon ?? null,
        elevationFt: elevIn != null && !Number.isNaN(elevIn) ? elevIn : (coords?.elevationFt ?? null),
        locationLabel: coords?.label ?? (q || null),
        heading: headingVal,
        updatedAt: Date.now(),
      });
    });
    setNewName('');
    setNewLoc('');
    setNewElev('');
    setNewHeading('');
    setLocBusy(false);
    publishDirty.current = true;
    toast(coords
      ? `Track "${n}" added — near ${coords.label}.`
      : q ? `Track "${n}" added — couldn't locate "${q}", weather can be entered manually.`
      : `Track "${n}" added.`);
  };

  const saveEdit = async (t) => {
    const n = name.trim();
    if (!n) { toast('Give the track a name.', 'error'); return; }
    const oldName = t.name;
    // If another track already has this name, merge this one into it
    // (runs, events, notes follow; missing settings are filled in).
    const existing = state.tracks.find((x) => x.id !== t.id && x.name.toLowerCase() === n.toLowerCase());
    setLocBusy(true);
    let coords = null;
    const q = editLoc.trim();
    if (q) {
      try { coords = await geocode(q); } catch { /* keep existing coords */ }
    }
    let moved = 0;
    update((s) => {
      if (existing) {
        const tr = s.tracks.find((x) => x.id === existing.id);
        if (tr) {
          if (tr.heading == null && t.heading != null) tr.heading = t.heading;
          if (tr.lat == null && t.lat != null) {
            tr.lat = t.lat; tr.lon = t.lon;
            tr.elevationFt = t.elevationFt; tr.locationLabel = t.locationLabel ?? null;
          }
          tr.updatedAt = Date.now();
        }
        s.runs.forEach((r) => {
          if (r.trackId === t.id || (r.trackId == null && r.track === oldName)) { r.track = existing.name; r.trackId = existing.id; moved++; }
        });
        s.events.forEach((e) => {
          if (e.trackId === t.id || (e.trackId == null && e.track === oldName)) { e.track = existing.name; e.trackId = existing.id; }
        });
        s.trackNotes.forEach((x) => { if (x.trackId === t.id) x.trackId = existing.id; });
        s.tracks = s.tracks.filter((x) => x.id !== t.id);
      } else {
        const tr = s.tracks.find((x) => x.id === t.id);
        if (tr) {
          tr.name = n;
          const hd = editHeading.trim() === '' ? null : Math.round(Number(editHeading));
          tr.heading = hd != null && !Number.isNaN(hd) ? ((hd % 360) + 360) % 360 : null;
          if (coords) { tr.lat = coords.lat; tr.lon = coords.lon; tr.elevationFt = coords.elevationFt; tr.locationLabel = coords.label; }
          tr.updatedAt = Date.now();
        }
        // Keep history together: runs/events logged at this track follow the rename.
        s.runs.forEach((r) => { if (r.trackId === t.id || (r.trackId == null && r.track === oldName)) r.track = n; });
        s.events.forEach((e) => { if (e.trackId === t.id || (e.trackId == null && e.track === oldName)) e.track = n; });
      }
    });
    if (existing && selectedId === t.id) onSelectTrack(existing.id);
    setEditingId(null);
    setName('');
    setEditLoc('');
    setEditHeading('');
    setLocBusy(false);
    publishDirty.current = true;
    toast(existing
      ? `Merged into "${existing.name}" — ${moved} run${moved === 1 ? '' : 's'} moved.`
      : coords ? `Track renamed to "${n}" — near ${coords.label}.` : `Track renamed to "${n}".`);
  };

  const delTrack = (t) => {
    if (state.tracks.length === 1) { toast('You need at least one track.', 'error'); return; }
    const n = runCount(t);
    if (!window.confirm(`Delete "${t.name}"?${n > 0 ? ` Its ${n} run${n === 1 ? '' : 's'} keep the track name on their timeslips.` : ''} Its track notes will be removed.`)) return;
    let nextId = '';
    update((s) => {
      s.tracks = s.tracks.filter((x) => x.id !== t.id);
      s.trackNotes = s.trackNotes.filter((x) => x.trackId !== t.id);
      s.deletedTracks = Array.isArray(s.deletedTracks) ? s.deletedTracks : [];
      s.deletedTracks.push({ name: t.name, at: Date.now() });
      if (s.deletedTracks.length > 200) s.deletedTracks = s.deletedTracks.slice(-200);
      nextId = s.tracks[0]?.id || '';
    });
    if (t.id === selectedId) onSelectTrack(nextId);
    publishDirty.current = true;
    toast(`Track "${t.name}" deleted.`);
  };

  return (
    <div className="space-y-2">
      {state.tracks.map((t) => (
        <div key={t.id} className="rounded-xl border border-white/10 p-3">
          {editingId === t.id ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} min-w-0 flex-1`} autoFocus />
                <Btn kind="ghost" onClick={() => saveEdit(t)} disabled={locBusy} className="!py-1.5 text-xs">{locBusy ? '…' : 'Save'}</Btn>
                <Btn kind="quiet" onClick={() => { setEditingId(null); setName(''); setEditLoc(''); setEditHeading(''); }} className="!py-1.5 text-xs">Cancel</Btn>
              </div>
              <input value={editLoc} onChange={(e) => setEditLoc(e.target.value)} placeholder="New location — city or address (leave blank to keep current)…" className={inputCls} />
              <input
                value={editHeading} onChange={(e) => setEditHeading(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
                placeholder="Strip heading ° — compass direction cars travel (for head-wind)…" inputMode="numeric" className={inputCls}
              />
              <div className="rounded-lg bg-white/[0.04] px-2.5 py-2 text-[11px] leading-relaxed text-white/50">
                <span className="font-semibold text-white/70">Currently saved:</span>{' '}
                {t.locationLabel || (t.lat != null ? `${t.lat.toFixed(2)}, ${t.lon.toFixed(2)}` : 'no location')}
                {t.elevationFt != null ? ` · ${t.elevationFt} ft` : ''}
                {t.lat != null ? ' · live weather on' : ' · live weather off'}
                {t.heading != null ? ` · heading ${t.heading}°` : ' · no heading saved'}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{t.name}</div>
                <div className="text-xs text-white/40">{runCount(t)} runs{t.lat != null ? ' · live weather' : ''}</div>
              </div>
              <Btn kind="quiet" onClick={() => { setEditingId(t.id); setName(t.name); setEditLoc(''); setEditHeading(t.heading != null ? String(t.heading) : ''); }} className="!py-1.5 text-xs">Edit</Btn>
              <button onClick={() => delTrack(t)} className="shrink-0 px-1 text-xs text-red-400/70">Delete</button>
            </div>
          )}
        </div>
      ))}
      <div className="space-y-2 rounded-xl border border-white/10 p-3">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New track name…" className={inputCls} />
        <div className="flex gap-2">
          <input value={newLoc} onChange={(e) => setNewLoc(e.target.value)} placeholder="Location — city or address (for live weather)…" className={`${inputCls} min-w-0 flex-1`} />
          <Btn kind="ghost" onClick={addTrack} disabled={locBusy} className="shrink-0">{locBusy ? '…' : 'Add track'}</Btn>
        </div>
        <div className="flex gap-2">
          <input value={newElev} onChange={(e) => setNewElev(e.target.value.replace(/[^\d]/g, '').slice(0, 5))} placeholder="Elevation ft (optional — beats lookup)…" inputMode="numeric" className={`${inputCls} min-w-0 flex-1`} />
          <input value={newHeading} onChange={(e) => setNewHeading(e.target.value.replace(/[^\d]/g, '').slice(0, 3))} placeholder="Heading ° (optional — for head-wind)…" inputMode="numeric" className={`${inputCls} min-w-0 flex-1`} />
        </div>
      </div>
    </div>
  );
}

function SheetTable({ rows }) {
  return (
    <table className="w-full font-mono text-xs">
      <thead><tr className="text-left text-white/40">
        <th className="py-1 font-medium">Air</th><th className="font-medium">Runs</th><th className="font-medium">Best</th><th className="text-right font-medium">Avg</th>
      </tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-white/5">
            <td className="py-1.5"><b>{r.label}</b> <span className="text-white/40">{r.detail}</span></td>
            <td className="text-white/60">{r.n}</td>
            <td className="font-bold text-pickle-400">{r.best != null ? r.best.toFixed(3) : '—'}</td>
            <td className="text-right">{r.avgET != null ? r.avgET.toFixed(3) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Elims({ state, update, toast, track, dist }) {
  const [name, setName] = useState('');
  const events = state.events;

  const createEvent = () => {
    update((s) => {
      s.events.push({ id: uid(), name: name.trim() || `Event ${s.events.length + 1}`, trackId: track?.id, track: track?.name, date: new Date().toISOString().slice(0, 10), distance: dist, rounds: [] });
    });
    setName('');
    toast('Event started.');
  };

  const addRound = (ev) => {
    update((s) => {
      const e = s.events.find((x) => x.id === ev.id);
      e.rounds.push({ n: e.rounds.length + 1, dial: '', rt: '', et: '', mph: '', oppDial: '', result: '' });
    });
  };

  const setRound = (evId, idx, k, v) => {
    update((s) => {
      const r = s.events.find((x) => x.id === evId).rounds[idx];
      r[k] = v;
    });
  };

  const delEvent = (id) => {
    if (!window.confirm('Delete this event and its rounds?')) return;
    update((s) => { s.events = s.events.filter((e) => e.id !== id); });
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Event name (e.g. Friday Night Lights)…" className={`${inputCls} flex-1`} />
        <Btn onClick={createEvent}>Start event</Btn>
      </div>
      {events.length === 0 && <div className="text-xs text-white/40">No events yet.</div>}
      {events.map((ev) => (
        <div key={ev.id} className="rounded-xl border border-white/10 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-bold">{ev.name} <span className="font-normal text-white/40">· {ev.track} · {fmtDate(ev.date)} · {ev.distance}</span></div>
            <button onClick={() => delEvent(ev.id)} className="text-xs text-red-400/70">Delete</button>
          </div>
          {ev.rounds.map((r, i) => (
            <div key={i} className="mb-2 grid grid-cols-7 items-end gap-1.5 font-mono text-xs">
              <div className="font-sans font-bold text-white/60">R{r.n}</div>
              <label>Dial<input value={r.dial} onChange={(e) => setRound(ev.id, i, 'dial', e.target.value)} className={inputCls} placeholder="9.65" /></label>
              <label>R/T<input value={r.rt} onChange={(e) => setRound(ev.id, i, 'rt', e.target.value)} className={inputCls} /></label>
              <label>ET<input value={r.et} onChange={(e) => setRound(ev.id, i, 'et', e.target.value)} className={inputCls} /></label>
              <label>MPH<input value={r.mph} onChange={(e) => setRound(ev.id, i, 'mph', e.target.value)} className={inputCls} /></label>
              <label>Opp<input value={r.oppDial} onChange={(e) => setRound(ev.id, i, 'oppDial', e.target.value)} className={inputCls} placeholder="dial" /></label>
              <select value={r.result} onChange={(e) => setRound(ev.id, i, 'result', e.target.value)} className={inputCls}>
                <option value="">—</option><option value="W">W</option><option value="L">L</option>
              </select>
            </div>
          ))}
          <Btn kind="ghost" onClick={() => addRound(ev)} className="!py-1.5 text-xs">+ Add round</Btn>
        </div>
      ))}
    </div>
  );
}
