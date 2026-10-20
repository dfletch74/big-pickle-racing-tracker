import { useState, useRef, useEffect } from 'react';
import { Card, SectionTitle, Btn, inputCls, Badge, Segmented } from '../components/ui';
import { predictET } from '../lib/stats';

/**
 * GARAGE (temporary, admin-only) — new features from the app review.
 * Sections: Maintenance, Checklists, Segments, Report Card, Video
 */
export default function Garage({ state, update, toast, role }) {
  const [tab, setTab] = useState('maint');
  const canEdit = role?.canLog ?? true;

  const tabs = [
    ['maint', 'Maintenance'],
    ['check', 'Checklists'],
    ['report', 'Report Card'],
    ['video', 'Video'],
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`shrink-0 rounded-xl px-4 py-2 font-display text-sm font-semibold uppercase tracking-wider transition ${
              tab === id ? 'bg-pickle-400 text-black' : 'bg-white/5 text-white/60 hover:bg-white/10'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'maint' && <Maintenance state={state} update={update} toast={toast} canEdit={canEdit} />}
      {tab === 'check' && <Checklists state={state} update={update} toast={toast} canEdit={canEdit} />}
      {tab === 'report' && <ReportCard state={state} />}
      {tab === 'video' && <VideoOverlay state={state} toast={toast} />}
    </div>
  );
}

function Maintenance({ state, update, toast, canEdit }) {
  const [name, setName] = useState('');
  const [runsPer, setRunsPer] = useState('');
  const [notes, setNotes] = useState('');
  const parts = state.maintenance || [];
  const totalRuns = (state.runs || []).filter((r) => r.source !== 'demo').length;

  const addPart = () => {
    if (!name.trim()) { toast('Enter a part name.', 'error'); return; }
    const runs = parseInt(runsPer, 10);
    if (!runs || runs < 1) { toast('Enter runs between service.', 'error'); return; }
    update((s) => {
      s.maintenance = s.maintenance || [];
      s.maintenance.push({
        id: Math.random().toString(36).slice(2),
        name: name.trim(),
        runsPerService: runs,
        lastServiceAt: totalRuns,
        notes: notes.trim(),
      });
    });
    setName(''); setRunsPer(''); setNotes('');
    toast('Part added.');
  };

  const markServiced = (id) => {
    update((s) => {
      const p = (s.maintenance || []).find((x) => x.id === id);
      if (p) p.lastServiceAt = totalRuns;
    });
    toast('Marked as serviced.');
  };

  const removePart = (id) => {
    if (!window.confirm('Remove this part?')) return;
    update((s) => { s.maintenance = (s.maintenance || []).filter((x) => x.id !== id); });
  };

  // Standard bracket-racing service intervals, compiled from:
  // - Greeley Automotive Machine (race engine maintenance sheet)
  // - Speedway Motors race-expert Q&A (oil/filter/plugs/wires)
  // - Powerglide builder guidance (25–50 passes fluid changes)
  const STANDARD_SCHEDULE = [
    { name: 'Engine oil & filter', runsPerService: 20, notes: 'Gas: every 4–5 race nights (Speedway Motors); every night (GAM). ~5 passes/night.' },
    { name: 'Cut open oil filter / inspect', runsPerService: 5, notes: 'Every race night — check for metal (Speedway Motors).' },
    { name: 'Valve lash check', runsPerService: 20, notes: 'Adjust weekly (GAM).' },
    { name: 'Valve spring pressure check', runsPerService: 5, notes: 'Check after each night; watch consistency, not just pressure (GAM).' },
    { name: 'Spark plugs', runsPerService: 30, notes: 'Replace when they stop reading cleanly; inspect regularly.' },
    { name: 'Plug wires', runsPerService: 200, notes: 'Yearly (Speedway Motors) ≈ one season.' },
    { name: 'Transmission fluid & filter', runsPerService: 40, notes: 'Powerglide: every 25–50 passes depending on power.' },
    { name: 'Rear end gear oil', runsPerService: 50, notes: 'Seasonal.' },
    { name: 'Torque converter bolts', runsPerService: 10, notes: 'Check tightness every couple of race days.' },
    { name: 'Lug nuts / wheel studs', runsPerService: 5, notes: 'Torque check every race day.' },
    { name: 'Fuel filter', runsPerService: 40, notes: '' },
    { name: 'Air filter clean / inspect', runsPerService: 5, notes: 'Every race day.' },
    { name: 'Drive belts', runsPerService: 200, notes: 'Inspect every race day; replace yearly.' },
    { name: 'Chassis nut-and-bolt check', runsPerService: 5, notes: 'Every race day.' },
    { name: 'Slicks', runsPerService: 120, notes: 'Bracket slicks ~100–150 passes; watch 60-ft falloff.' },
    { name: 'Shock rebuild', runsPerService: 200, notes: 'Yearly ≈ one season.' },
    { name: 'Harness / belts (SFI tag)', runsPerService: 400, notes: 'SFI expires 2 years from manufacture — check the tag date.' },
    { name: 'Fire extinguisher charge', runsPerService: 200, notes: 'Check yearly.' },
  ];

  const loadStandard = () => {
    update((s) => {
      s.maintenance = s.maintenance || [];
      const existing = new Set(s.maintenance.map((p) => p.name.toLowerCase()));
      for (const item of STANDARD_SCHEDULE) {
        if (existing.has(item.name.toLowerCase())) continue;
        s.maintenance.push({
          id: Math.random().toString(36).slice(2),
          name: item.name,
          runsPerService: item.runsPerService,
          lastServiceAt: totalRuns,
          notes: item.notes,
        });
      }
    });
    toast('Standard schedule loaded — set each item\'s last-service point with "Mark serviced".');
  };

  return (
    <div className="space-y-3">
      {parts.map((p) => {
        const since = totalRuns - (p.lastServiceAt || 0);
        const remaining = p.runsPerService - since;
        const overdue = remaining <= 0;
        const soon = !overdue && remaining <= Math.ceil(p.runsPerService * 0.2);
        return (
          <Card key={p.id}>
            <div className="flex items-center justify-between">
              <div className="font-semibold text-white/90">{p.name}</div>
              {overdue ? (
                <Badge tone="red">OVERDUE</Badge>
              ) : soon ? (
                <Badge tone="amber">{remaining} left</Badge>
              ) : (
                <Badge tone="green">{remaining} left</Badge>
              )}
            </div>
            <div className="mt-1 text-xs text-white/50">
              Service every {p.runsPerService} runs · {since} since last · {p.notes}
            </div>
            <div className="mt-2 flex gap-2">
              {canEdit && (
                <>
                  <Btn kind="ghost" onClick={() => markServiced(p.id)} className="!py-1.5 text-xs">Mark serviced</Btn>
                  <Btn kind="quiet" onClick={() => removePart(p.id)} className="!py-1.5 text-xs text-red-400/70">Remove</Btn>
                </>
              )}
            </div>
          </Card>
        );
      })}
      {parts.length === 0 && (
        <div className="text-sm text-white/40">No parts tracked yet. Load the standard schedule below or add your own.</div>
      )}
      {canEdit && parts.length === 0 && (
        <Card>
          <SectionTitle>Standard schedule</SectionTitle>
          <div className="mb-3 text-xs text-white/40">
            Bracket-racing service intervals compiled from engine builder and racer guidance. Adjust to your combo.
          </div>
          <Btn kind="primary" onClick={loadStandard} className="w-full">Load standard schedule</Btn>
        </Card>
      )}
      {canEdit && (
        <Card>
          <SectionTitle>Add part</SectionTitle>
          <div className="space-y-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Part name (e.g. Valve springs)" className={inputCls} />
            <input value={runsPer} onChange={(e) => setRunsPer(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Runs between service (e.g. 50)" className={inputCls} />
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" className={inputCls} />
            <Btn kind="primary" onClick={addPart} className="w-full">Add part</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}

const DEFAULT_CHECKLISTS = {
  prerun: {
    title: 'Pre-run checklist',
    items: ['Tire pressure set', 'Fuel level checked', 'Delay box setting verified', 'Dial written on window', 'Transbrake check', 'Helmet & belts on'],
  },
  weekend: {
    title: 'Race weekend prep',
    items: ['Trailer packed', 'Spare tires loaded', 'Fuel jugs full', 'Tools & jack', 'Timeslips & pen', 'Cooler & drinks', 'Phone charger', 'Weather station'],
  },
};

function Checklists({ state, update, toast, canEdit }) {
  const saved = state.checklists || {};
  const [tab, setTab] = useState('prerun');

  const getItems = (key) => {
    if (saved[key]) return saved[key];
    return DEFAULT_CHECKLISTS[key].items.map((label) => ({ label, done: false }));
  };

  const toggle = (key, idx) => {
    update((s) => {
      s.checklists = s.checklists || {};
      if (!s.checklists[key]) {
        s.checklists[key] = DEFAULT_CHECKLISTS[key].items.map((label) => ({ label, done: false }));
      }
      s.checklists[key][idx].done = !s.checklists[key][idx].done;
    });
  };

  const reset = (key) => {
    update((s) => {
      s.checklists = s.checklists || {};
      s.checklists[key] = DEFAULT_CHECKLISTS[key].items.map((label) => ({ label, done: false }));
    });
    toast('Checklist reset.');
  };

  const items = getItems(tab);
  const done = items.filter((i) => i.done).length;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {Object.entries(DEFAULT_CHECKLISTS).map(([key, c]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 rounded-xl px-3 py-2 font-display text-sm font-semibold uppercase tracking-wider transition ${
              tab === key ? 'bg-pickle-400 text-black' : 'bg-white/5 text-white/60'
            }`}
          >
            {c.title}
          </button>
        ))}
      </div>
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle>{DEFAULT_CHECKLISTS[tab].title}</SectionTitle>
          <span className="text-xs text-white/50">{done}/{items.length}</span>
        </div>
        <div className="space-y-1.5">
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => toggle(tab, i)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                item.done ? 'bg-pickle-400/10 text-white/40' : 'bg-white/5 text-white/85 hover:bg-white/10'
              }`}
            >
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                item.done ? 'border-pickle-400 bg-pickle-400 text-black' : 'border-white/30'
              }`}>
                {item.done && '✓'}
              </span>
              <span className={item.done ? 'line-through' : ''}>{item.label}</span>
            </button>
          ))}
        </div>
        {canEdit && (
          <Btn kind="ghost" onClick={() => reset(tab)} className="mt-3 w-full !py-2 text-xs">Reset checklist</Btn>
        )}
      </Card>
    </div>
  );
}

function VideoOverlay({ state, toast }) {
  const [runId, setRunId] = useState('');
  const [videoUrl, setVideoUrl] = useState(null);
  const [launchAt, setLaunchAt] = useState('0');
  const [currentSplit, setCurrentSplit] = useState(null);
  const videoRef = useRef(null);
  const urlRef = useRef(null);

  // Revoke the blob URL when the component unmounts (avoids leaking memory).
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const runs = (state.runs || [])
    .filter((r) => r.source !== 'demo' && r.et != null)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const run = runs.find((r) => r.id === runId);

  const splits = run ? [
    { label: '60 ft', t: run.sixty },
    { label: '330 ft', t: run.threeThirty },
    { label: '1/8', t: run.eighthET, mph: run.eighthMPH },
    { label: '1000 ft', t: run.thousand },
    { label: '1/4', t: run.et, mph: run.mph },
  ].filter((s) => s.t != null) : [];

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (f) {
      if (f.size > 500 * 1024 * 1024) { toast('Video is too large (500 MB max).'); e.target.value = ''; return; }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(f);
      setVideoUrl(urlRef.current);
      setCurrentSplit(null);
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current || !run) return;
    const launch = parseFloat(launchAt) || 0;
    const runTime = videoRef.current.currentTime - launch;
    // Find the latest split we've passed
    let latest = null;
    for (const s of splits) {
      if (runTime >= s.t) latest = s;
      else break;
    }
    setCurrentSplit(latest);
  };

  const markLaunch = () => {
    if (videoRef.current) {
      setLaunchAt(videoRef.current.currentTime.toFixed(2));
      toast('Launch point marked.');
    }
  };

  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);

  // Export: re-plays the video through a canvas, burns the split/ET text
  // into each frame, records with MediaRecorder, and downloads the file.
  // On iPhone the file lands in Downloads — move it to Photos from there.
  const exportVideo = async () => {
    const video = videoRef.current;
    if (!video || !run) return;
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      toast('Video export is not supported in this browser.', 'error');
      return;
    }
    setExporting(true);
    setExportPct(0);
    try {
      const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
      const canvas = document.createElement('canvas');
      canvas.width = vw; canvas.height = vh;
      const ctx = canvas.getContext('2d');
      const stream = canvas.captureStream(30);

      // Capture audio too (engine sound) via WebAudio.
      let audioCtx = null;
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const src = audioCtx.createMediaElementSource(video);
        const dest = audioCtx.createMediaStreamDestination();
        src.connect(dest);
        src.connect(audioCtx.destination);
        dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      } catch (e) { /* audio optional — video still exports */ }

      let mime = '';
      if (MediaRecorder.isTypeSupported('video/mp4')) mime = 'video/mp4';
      else if (MediaRecorder.isTypeSupported('video/webm;codecs=h264')) mime = 'video/webm;codecs=h264';
      else if (MediaRecorder.isTypeSupported('video/webm')) mime = 'video/webm';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined);
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const done = new Promise((res) => { rec.onstop = res; });

      const launch = parseFloat(launchAt) || 0;
      const ext = mime.includes('mp4') ? 'mp4' : 'webm';
      const drawOverlay = () => {
        ctx.drawImage(video, 0, 0, vw, vh);
        const runTime = video.currentTime - launch;
        let latest = null;
        for (const s of splits) {
          if (runTime >= s.t) latest = s;
          else break;
        }
        const fs = Math.round(vh / 22);
        ctx.textBaseline = 'top';
        // Top-left: current split
        if (latest && runTime >= 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.65)';
          const lines = [latest.label.toUpperCase(), `${Number(latest.t).toFixed(3)}s`];
          if (latest.mph != null) lines.push(`${Number(latest.mph).toFixed(1)} mph`);
          const wBox = vw * 0.32, hBox = lines.length * fs * 1.25 + fs * 0.7;
          ctx.fillRect(vw * 0.04, vh * 0.05, wBox, hBox);
          ctx.fillStyle = '#a3e635';
          ctx.font = `600 ${Math.round(fs * 0.7)}px system-ui`;
          ctx.fillText(lines[0], vw * 0.04 + fs * 0.4, vh * 0.05 + fs * 0.25);
          ctx.fillStyle = '#fff';
          ctx.font = `700 ${fs}px system-ui`;
          lines.slice(1).forEach((ln, i) => ctx.fillText(ln, vw * 0.04 + fs * 0.4, vh * 0.05 + fs * (0.95 + i * 1.25)));
        }
        // Top-right: ET
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(vw * 0.78, vh * 0.05, vw * 0.18, fs * 2.1);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = `600 ${Math.round(fs * 0.6)}px system-ui`;
        ctx.fillText('ET', vw * 0.78 + fs * 0.4, vh * 0.05 + fs * 0.2);
        ctx.fillStyle = '#fff';
        ctx.font = `700 ${fs}px system-ui`;
        ctx.fillText(Number(run.et).toFixed(3), vw * 0.78 + fs * 0.4, vh * 0.05 + fs * 0.85);
        // Bottom: run time + date/track
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, vh - fs * 1.6, vw, fs * 1.6);
        ctx.fillStyle = '#fff';
        ctx.font = `600 ${Math.round(fs * 0.75)}px system-ui`;
        const rt = Math.max(0, runTime);
        ctx.fillText(`${run.date} · ${run.track} · ${rt.toFixed(2)}s`, vw * 0.04, vh - fs * 1.25);
      };

      video.muted = false;
      video.currentTime = 0;
      await new Promise((res) => { video.onseeked = res; setTimeout(res, 1500); });
      rec.start(250);
      await video.play();

      await new Promise((res) => {
        const tick = () => {
          if (video.ended || video.paused) { res(); return; }
          drawOverlay();
          setExportPct(Math.min(99, Math.round((video.currentTime / (video.duration || 1)) * 100)));
          requestAnimationFrame(tick);
        };
        video.onended = () => res();
        tick();
      });

      // Hold the final frame ~1.5s so the ET stays readable.
      const holdUntil = performance.now() + 1500;
      await new Promise((res) => {
        const hold = () => {
          drawOverlay();
          if (performance.now() < holdUntil) requestAnimationFrame(hold);
          else res();
        };
        hold();
      });

      rec.stop();
      await done;
      try { audioCtx?.close(); } catch (e) {}
      const blob = new Blob(chunks, { type: mime || 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `big-pickle-${run.date}-${run.track.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setExportPct(100);
      toast('Video exported — find it in Downloads, then save to Photos.');
    } catch (e) {
      toast('Export failed: ' + (e.message || e), 'error');
    }
    setExporting(false);
  };

  return (
    <div className="space-y-3">
      <Card>
        <SectionTitle>Video Telemetry Overlay</SectionTitle>
        <div className="mb-3 text-xs text-white/40">
          Load a run video, mark the launch moment, and split times overlay as the run plays.
        </div>
        <div className="space-y-2">
          <select value={runId} onChange={(e) => setRunId(e.target.value)} className={inputCls}>
            <option value="">Pick a run…</option>
            {runs.slice(0, 30).map((r) => (
              <option key={r.id} value={r.id}>
                {r.date} · {r.track} · {Number(r.et).toFixed(3)}
              </option>
            ))}
          </select>
          <label className={`${inputCls} flex cursor-pointer items-center justify-center gap-2 text-center`}>
            <span>📹 {videoUrl ? 'Change video' : 'Load run video'}</span>
            <input type="file" accept="video/*" className="hidden" onChange={handleFile} />
          </label>
        </div>
      </Card>

      {run && videoUrl && (
        <Card>
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              playsInline
              onTimeUpdate={handleTimeUpdate}
              className="w-full"
            />
            {currentSplit && (
              <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-black/70 px-3 py-2 backdrop-blur">
                <div className="text-[10px] uppercase tracking-wider text-pickle-400">{currentSplit.label}</div>
                <div className="font-mono text-2xl font-bold text-white">{Number(currentSplit.t).toFixed(3)}s</div>
                {currentSplit.mph != null && (
                  <div className="font-mono text-sm text-white/70">{Number(currentSplit.mph).toFixed(2)} mph</div>
                )}
              </div>
            )}
            <div className="pointer-events-none absolute right-3 top-3 rounded-lg bg-black/70 px-3 py-2 backdrop-blur">
              <div className="text-[10px] uppercase tracking-wider text-white/50">ET</div>
              <div className="font-mono text-lg font-bold text-white">{Number(run.et).toFixed(3)}</div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Btn kind="ghost" onClick={markLaunch} className="flex-1">
              📍 Mark launch at current frame
            </Btn>
          </div>
          <div className="mt-2">
            <Btn kind="primary" onClick={exportVideo} disabled={exporting} className="w-full">
              {exporting ? `Exporting… ${exportPct}%` : '🎬 Export video with overlays'}
            </Btn>
          </div>
          {exporting && (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-pickle-400 transition-all" style={{ width: `${exportPct}%` }} />
            </div>
          )}
          <div className="mt-2 text-xs text-white/40">
            Launch marked at <span className="font-mono text-white/70">{launchAt}s</span> in the video.
            Scrub to the moment the car launches, then tap Mark.
          </div>
          {splits.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-white/40">Splits on this run</div>
              <div className="flex flex-wrap gap-1.5">
                {splits.map((s) => (
                  <span key={s.label} className="rounded-full bg-white/5 px-2.5 py-1 font-mono text-xs text-white/60">
                    {s.label}: {Number(s.t).toFixed(3)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function ReportCard({ state }) {
  const [dist, setDist] = useState('1/4');
  // 1/8-mile runs store their ET in eighthET (et is blank) — use the right field.
  const etOf = (r) => (dist === '1/8' ? r.eighthET : r.et);
  const runs = (state.runs || [])
    .filter((r) => r.source !== 'demo' && !r.backup && etOf(r) != null && r.daFt != null && r.distance === dist)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  // Back-test: for each run (after the first 3), predict ET using prior runs
  // of the SAME distance and compare to actual.
  const results = [];
  for (let i = 3; i < runs.length; i++) {
    const prior = runs.slice(0, i).map((r) => ({ ...r, et: etOf(r) }));
    const target = runs[i];
    const pred = predictET(prior, target.daFt);
    if (pred?.et != null) {
      results.push({
        run: target,
        predicted: pred.et,
        actual: etOf(target),
        error: Math.abs(pred.et - etOf(target)),
      });
    }
  }

  const avgError = results.length
    ? results.reduce((a, r) => a + r.error, 0) / results.length
    : null;
  const within005 = results.filter((r) => r.error <= 0.005).length;
  const within01 = results.filter((r) => r.error <= 0.01).length;

  return (
    <div className="space-y-3">
      <Card>
        <SectionTitle>Prediction Report Card</SectionTitle>
        <div className="mb-3 flex items-center gap-2">
          <Segmented value={dist} onChange={setDist} options={[
            { value: '1/4', label: '1/4 mi' }, { value: '1/8', label: '1/8 mi' },
          ]} />
        </div>
        <div className="text-xs text-white/40 mb-3">
          Back-tests the ET predictor on {dist} mile runs only: for each run, predicts using only prior {dist} data and compares to what actually happened.
        </div>
        {results.length === 0 ? (
          <div className="text-sm text-white/40">Need at least 4 runs with DA data to back-test.</div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white/5 p-3">
                <div className="text-[10px] uppercase tracking-wider text-white/40">Avg error</div>
                <div className="font-mono text-xl font-bold text-pickle-400">{avgError.toFixed(4)}</div>
              </div>
              <div className="rounded-xl bg-white/5 p-3">
                <div className="text-[10px] uppercase tracking-wider text-white/40">Within .005</div>
                <div className="font-mono text-xl font-bold text-white/90">{Math.round(within005 / results.length * 100)}%</div>
              </div>
              <div className="rounded-xl bg-white/5 p-3">
                <div className="text-[10px] uppercase tracking-wider text-white/40">Within .010</div>
                <div className="font-mono text-xl font-bold text-white/90">{Math.round(within01 / results.length * 100)}%</div>
              </div>
            </div>
            <div className="mt-2 text-xs text-white/40">
              Tested on {results.length} runs. Lower is better — under 0.010 avg error is solid for bracket racing.
            </div>
          </>
        )}
      </Card>

      {results.length > 0 && (
        <Card>
          <SectionTitle>Recent predictions</SectionTitle>
          <div className="space-y-1.5">
            {results.slice(-10).reverse().map(({ run, predicted, actual, error }, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                <span className="text-white/40">{run.date}</span>
                <span className="font-mono">
                  <span className="text-white/60">pred {predicted.toFixed(3)}</span>{' '}
                  <span className="font-bold text-white/90">act {Number(actual).toFixed(3)}</span>{' '}
                  <span className={error <= 0.01 ? 'text-pickle-400' : 'text-amber-400'}>
                    {error <= 0.01 ? '✓' : 'Δ'} {error.toFixed(3)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}


