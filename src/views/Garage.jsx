import { useState, useRef } from 'react';
import { Card, SectionTitle, Btn, inputCls, Badge } from '../components/ui';
import { predictET } from '../lib/stats';
import { densityAltitudeFt, stationPressureHpa, waterGrains } from '../lib/physics';
import { jsPDF } from 'jspdf';

/**
 * GARAGE (temporary) — new features from the app review.
 * Sections: Maintenance, Checklists, Staging Mode, PDF Export, AI Tuner
 */
export default function Garage({ state, update, toast, role }) {
  const [tab, setTab] = useState('maint');
  const canEdit = role?.canLog ?? true;

  const tabs = [
    ['maint', 'Maintenance'],
    ['check', 'Checklists'],
    ['stage', 'Staging'],
    ['similar', 'Similar Air'],
    ['segments', 'Segments'],
    ['report', 'Report Card'],
    ['video', 'Video'],
    ['export', 'PDF Export'],
    ['ai', 'AI Tuner'],
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
      {tab === 'stage' && <StagingMode state={state} />}
      {tab === 'similar' && <SimilarAir state={state} />}
      {tab === 'segments' && <SegmentAnalysis state={state} />}
      {tab === 'report' && <ReportCard state={state} />}
      {tab === 'video' && <VideoOverlay state={state} toast={toast} />}
      {tab === 'export' && <PdfExport state={state} toast={toast} />}
      {tab === 'ai' && <AiTuner state={state} />}
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
        <div className="text-sm text-white/40">No parts tracked yet. Add valve springs, oil, tires, belts…</div>
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

function StagingMode({ state }) {
  const [temp, setTemp] = useState('');
  const [humidity, setHumidity] = useState('');
  const car = state.cars.find((c) => c.id === state.activeCarId);
  const runs = (state.runs || []).filter((r) => r.carId === state.activeCarId && r.source !== 'demo');

  // Estimate DA from temp + track elevation (first track as default)
  const track = (state.tracks || [])[0];
  const tempF = parseFloat(temp);
  const hum = parseFloat(humidity);
  let daFt = null;
  let grains = null;
  if (!isNaN(tempF) && track?.elevationFt != null) {
    const p = stationPressureHpa(1013.25, track.elevationFt);
    daFt = Math.round(densityAltitudeFt({ tempF, humidityPct: isNaN(hum) ? 50 : hum, pressureHpa: p }));
    grains = waterGrains({ tempF, humidityPct: isNaN(hum) ? 50 : hum, pressureHpa: p });
  }

  const pred = daFt != null ? predictET(runs, daFt) : null;
  const dial = pred?.et != null ? (Math.floor(pred.et * 100) / 100).toFixed(2) : null;

  return (
    <div className="space-y-3">
      <Card>
        <SectionTitle>Current conditions</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <input value={temp} onChange={(e) => setTemp(e.target.value)} inputMode="decimal" placeholder="Temp °F" className={inputCls} />
          <input value={humidity} onChange={(e) => setHumidity(e.target.value)} inputMode="decimal" placeholder="Humidity %" className={inputCls} />
        </div>
        {daFt != null && (
          <div className="mt-2 space-y-1 text-sm text-white/60">
            <div>Est. DA: <span className="font-mono font-bold text-white/90">{daFt.toLocaleString()} ft</span></div>
            {grains != null && (
              <div>Water grains: <span className="font-mono font-bold text-white/90">{grains} gr/lb</span></div>
            )}
          </div>
        )}
      </Card>

      <div className="rounded-3xl border border-pickle-500/30 bg-coal-900 p-8 text-center">
        <div className="text-xs uppercase tracking-[0.2em] text-white/40">Dial-in</div>
        <div className="font-display text-7xl font-bold text-pickle-400">{dial || '—'}</div>
        {pred && (
          <div className="mt-2 text-sm text-white/50">
            Predicted ET: {pred.et.toFixed(3)} · {pred.basis || ''}
          </div>
        )}
        {!dial && (
          <div className="mt-2 text-sm text-white/40">Enter temp above to calculate</div>
        )}
      </div>

      <div className="text-center text-xs text-white/35">
        Big-text view for the staging lanes — no radio call needed.
      </div>
    </div>
  );
}

function SimilarAir({ state }) {
  const [targetDA, setTargetDA] = useState('');
  const [band, setBand] = useState('500');
  const runs = (state.runs || []).filter((r) => r.source !== 'demo' && r.daFt != null);

  const tda = parseFloat(targetDA);
  const b = parseFloat(band) || 500;
  const matches = !isNaN(tda)
    ? runs
        .filter((r) => Math.abs(r.daFt - tda) <= b)
        .sort((a, b2) => Math.abs(a.daFt - tda) - Math.abs(b2.daFt - tda))
    : [];

  const ets = matches.map((r) => r.et).filter((v) => v != null);
  const avgET = ets.length ? ets.reduce((a, c) => a + c, 0) / ets.length : null;

  return (
    <div className="space-y-3">
      <Card>
        <SectionTitle>Similar Air Search</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <input value={targetDA} onChange={(e) => setTargetDA(e.target.value.replace(/[^0-9.-]/g, ''))} inputMode="numeric" placeholder="Target DA (ft)" className={inputCls} />
          <select value={band} onChange={(e) => setBand(e.target.value)} className={inputCls}>
            <option value="250">±250 ft</option>
            <option value="500">±500 ft</option>
            <option value="1000">±1000 ft</option>
          </select>
        </div>
        <div className="mt-2 text-xs text-white/40">
          What did we run last time conditions were like this?
        </div>
      </Card>

      {!isNaN(tda) && (
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <SectionTitle>Matches</SectionTitle>
            {avgET != null && <Badge tone="green">Avg ET {avgET.toFixed(3)}</Badge>}
          </div>
          {matches.length === 0 ? (
            <div className="text-sm text-white/40">No runs within ±{b} ft of {tda} ft DA.</div>
          ) : (
            <div className="space-y-1.5">
              {matches.slice(0, 20).map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                  <div>
                    <span className="text-white/40">{r.date}</span>{' '}
                    <span className="font-semibold">{r.et != null ? Number(r.et).toFixed(3) : '—'}</span>
                    <span className="text-white/40"> · {r.track}</span>
                  </div>
                  <div className="font-mono text-xs text-white/50">
                    DA {Math.round(r.daFt)} ({r.daFt >= tda ? '+' : ''}{Math.round(r.daFt - tda)})
                  </div>
                </div>
              ))}
              {matches.length > 20 && (
                <div className="text-center text-xs text-white/40">+{matches.length - 20} more</div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function VideoOverlay({ state, toast }) {
  const [runId, setRunId] = useState('');
  const [videoUrl, setVideoUrl] = useState(null);
  const [launchAt, setLaunchAt] = useState('0');
  const [currentSplit, setCurrentSplit] = useState(null);
  const videoRef = useRef(null);

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
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoUrl(URL.createObjectURL(f));
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
  const runs = (state.runs || [])
    .filter((r) => r.source !== 'demo' && r.et != null && r.daFt != null)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  // Back-test: for each run (after the first 3), predict ET using prior runs
  // and compare to actual. Shows how accurate the predictor is.
  const results = [];
  for (let i = 3; i < runs.length; i++) {
    const prior = runs.slice(0, i);
    const target = runs[i];
    const pred = predictET(prior, target.daFt);
    if (pred?.et != null) {
      results.push({
        run: target,
        predicted: pred.et,
        actual: target.et,
        error: Math.abs(pred.et - target.et),
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
        <div className="text-xs text-white/40 mb-3">
          Back-tests the ET predictor: for each run, predicts using only prior data and compares to what actually happened.
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

function SegmentAnalysis({ state }) {
  const runs = (state.runs || [])
    .filter((r) => r.source !== 'demo' && r.distance === '1/4')
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 10);

  const segments = runs.map((r) => {
    const s60 = r.sixty, s330 = r.threeThirty, e8 = r.eighthET, t1000 = r.thousand, et = r.et;
    return {
      run: r,
      to330: s60 != null && s330 != null ? s330 - s60 : null,
      toEighth: s330 != null && e8 != null ? e8 - s330 : null,
      to1000: e8 != null && t1000 != null ? t1000 - e8 : null,
      toQuarter: t1000 != null && et != null ? et - t1000 : null,
    };
  }).filter((s) => s.to330 != null || s.toEighth != null);

  const avg = (arr) => arr.length ? arr.reduce((a, c) => a + c, 0) / arr.length : null;
  const avg330 = avg(segments.map((s) => s.to330).filter((v) => v != null));
  const avgEighth = avg(segments.map((s) => s.toEighth).filter((v) => v != null));

  return (
    <div className="space-y-3">
      <Card>
        <SectionTitle>Interval Averages (1/4 mi)</SectionTitle>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-white/5 p-3">
            <div className="text-[10px] uppercase tracking-wider text-white/40">60–330 ft</div>
            <div className="font-mono text-xl font-bold text-white/90">{avg330 != null ? avg330.toFixed(3) : '—'}</div>
          </div>
          <div className="rounded-xl bg-white/5 p-3">
            <div className="text-[10px] uppercase tracking-wider text-white/40">330–1/8</div>
            <div className="font-mono text-xl font-bold text-white/90">{avgEighth != null ? avgEighth.toFixed(3) : '—'}</div>
          </div>
        </div>
        <div className="mt-2 text-xs text-white/40">
          Isolates launch vs. back-half performance across your last {segments.length} full-split passes.
        </div>
      </Card>

      {segments.length > 0 && (
        <Card>
          <SectionTitle>Recent intervals</SectionTitle>
          <div className="space-y-1.5">
            {segments.map(({ run: r, to330, toEighth, to1000, toQuarter }) => (
              <div key={r.id} className="rounded-lg bg-white/5 px-3 py-2">
                <div className="mb-1 text-xs text-white/40">{r.date} · {r.track} · ET {r.et != null ? Number(r.et).toFixed(3) : '—'}</div>
                <div className="grid grid-cols-4 gap-1 font-mono text-xs">
                  <div><span className="text-white/35">60-330:</span> {to330 != null ? to330.toFixed(3) : '—'}</div>
                  <div><span className="text-white/35">330-⅛:</span> {toEighth != null ? toEighth.toFixed(3) : '—'}</div>
                  <div><span className="text-white/35">⅛-1000:</span> {to1000 != null ? to1000.toFixed(3) : '—'}</div>
                  <div><span className="text-white/35">1000-¼:</span> {toQuarter != null ? toQuarter.toFixed(3) : '—'}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function PdfExport({ state, toast }) {
  const [busy, setBusy] = useState(false);
  const year = new Date().getFullYear();
  const runs = (state.runs || [])
    .filter((r) => r.source !== 'demo' && String(r.date || '').startsWith(String(year)))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const exportPdf = () => {
    setBusy(true);
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'letter' });
      const W = doc.internal.pageSize.getWidth();
      let y = 50;

      doc.setFontSize(18);
      doc.text(`Big Pickle Racing — ${year} Run Log`, 40, y);
      y += 20;
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`${runs.length} runs · exported ${new Date().toLocaleDateString()}`, 40, y);
      doc.setTextColor(0);
      y += 25;

      const headers = ['Date', 'Track', 'Dist', 'R/T', '60ft', '1/8 ET', '1/8 MPH', 'ET', 'MPH', 'DA'];
      const colW = [60, 90, 40, 45, 45, 55, 60, 55, 55, 55];
      const startX = 40;

      const drawHeaders = () => {
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        let x = startX;
        headers.forEach((h, i) => { doc.text(h, x, y); x += colW[i]; });
        doc.setFont(undefined, 'normal');
        y += 14;
      };
      drawHeaders();

      doc.setFontSize(8);
      for (const r of runs) {
        if (y > 720) { doc.addPage(); y = 50; drawHeaders(); }
        let x = startX;
        const cells = [
          r.date || '',
          (r.track || '').slice(0, 14),
          r.distance || '',
          r.rt != null ? Number(r.rt).toFixed(3) : '',
          r.sixty != null ? Number(r.sixty).toFixed(3) : '',
          r.eighthET != null ? Number(r.eighthET).toFixed(3) : '',
          r.eighthMPH != null ? Number(r.eighthMPH).toFixed(2) : '',
          r.et != null ? Number(r.et).toFixed(3) : '',
          r.mph != null ? Number(r.mph).toFixed(2) : '',
          r.daFt != null ? String(Math.round(r.daFt)) : '',
        ];
        cells.forEach((c, i) => { doc.text(String(c), x, y); x += colW[i]; });
        y += 12;
      }

      doc.save(`big-pickle-${year}-runs.pdf`);
      toast(`Exported ${runs.length} runs to PDF.`);
    } catch (e) {
      toast('PDF export failed: ' + e.message, 'error');
    }
    setBusy(false);
  };

  return (
    <Card>
      <SectionTitle>PDF Export</SectionTitle>
      <div className="mb-3 text-sm text-white/60">
        Year-to-date ({year}): {runs.length} runs. Includes date, track, distance, all splits, and DA.
      </div>
      <Btn kind="primary" onClick={exportPdf} disabled={busy || runs.length === 0} className="w-full">
        {busy ? 'Generating…' : `Export ${year} to PDF`}
      </Btn>
    </Card>
  );
}

function AiTuner({ state }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const runs = (state.runs || []).filter((r) => r.source !== 'demo').sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const ask = (q) => {
    const ql = q.toLowerCase();
    let ans = null;

    if (ql.includes('60') && (ql.includes('fall') || ql.includes('drop') || ql.includes('worse') || ql.includes('slow'))) {
      // Analyze 60-ft trend
      const with60 = runs.filter((r) => r.sixty != null).slice(-10);
      if (with60.length >= 3) {
        const first3 = with60.slice(0, 3).reduce((a, r) => a + r.sixty, 0) / 3;
        const last3 = with60.slice(-3).reduce((a, r) => a + r.sixty, 0) / 3;
        const diff = last3 - first3;
        if (diff > 0.02) {
          ans = `Your 60-ft has fallen off by ${diff.toFixed(3)}s (from ${first3.toFixed(3)} to ${last3.toFixed(3)} over the last ${with60.length} passes). Common causes: track temp dropping, tire pressure too high, or worn tires. Check your tire pressure logs and compare to when the 60-ft was good.`;
        } else if (diff < -0.02) {
          ans = `Actually your 60-ft has IMPROVED by ${Math.abs(diff).toFixed(3)}s recently. Whatever changed is working — check what setup was different.`;
        } else {
          ans = `Your 60-ft is stable (within 0.02s). If it felt off in a specific round, check that run's tire pressure and track temp vs. your baseline.`;
        }
      } else {
        ans = 'Need at least 3 runs with 60-ft data to analyze the trend.';
      }
    } else if (ql.includes('consistent') || ql.includes('consistency')) {
      const ets = runs.filter((r) => r.et != null).slice(-10).map((r) => r.et);
      if (ets.length >= 5) {
        const avg = ets.reduce((a, c) => a + c, 0) / ets.length;
        const variance = ets.reduce((a, c) => a + Math.pow(c - avg, 2), 0) / ets.length;
        const std = Math.sqrt(variance);
        ans = `Over your last ${ets.length} passes, ET standard deviation is ${std.toFixed(4)}s. ${std < 0.02 ? 'That\'s excellent bracket-racing consistency.' : std < 0.05 ? 'That\'s decent — focus on launch repeatability.' : 'That\'s high variance — check for setup changes, weather swings, or driving inconsistencies.'} Average ET: ${avg.toFixed(3)}.`;
      } else {
        ans = 'Need at least 5 runs to assess consistency.';
      }
    } else if (ql.includes('weather') || ql.includes('da ') || ql.includes('density')) {
      const withDA = runs.filter((r) => r.daFt != null && r.et != null);
      if (withDA.length >= 5) {
        const sorted = [...withDA].sort((a, b) => a.daFt - b.daFt);
        const lowDA = sorted.slice(0, 3);
        const highDA = sorted.slice(-3);
        const lowAvg = lowDA.reduce((a, r) => a + r.et, 0) / lowDA.length;
        const highAvg = highDA.reduce((a, r) => a + r.et, 0) / highDA.length;
        const daDiff = highDA[0].daFt - lowDA[0].daFt;
        const etDiff = highAvg - lowAvg;
        ans = `Weather impact: your ET slows by ~${(etDiff / daDiff * 1000).toFixed(4)}s per 1000 ft DA. In dense air (${Math.round(lowDA[0].daFt)} ft) you average ${lowAvg.toFixed(3)}; in thin air (${Math.round(highDA[0].daFt)} ft) it's ${highAvg.toFixed(3)}. Use this to adjust your dial when conditions change.`;
      } else {
        ans = 'Need at least 5 runs with DA data to analyze weather impact.';
      }
    } else if (ql.includes('reaction') || ql.includes('rt ') || ql.includes('tree') || ql.includes('light')) {
      const rts = runs.filter((r) => r.rt != null).map((r) => r.rt);
      if (rts.length >= 5) {
        const avg = rts.reduce((a, c) => a + c, 0) / rts.length;
        const reds = rts.filter((rt) => rt < 0).length;
        ans = `Your average reaction time is ${avg.toFixed(3)}s over ${rts.length} runs with ${reds} red-lights (${Math.round(reds / rts.length * 100)}%). ${avg < 0.05 ? 'You\'re cutting it close — great for bracket racing but risky.' : avg < 0.1 ? 'Solid, competitive RTs.' : 'There\'s room to improve — practice on the Tree simulator.'}`;
      } else {
        ans = 'Need at least 5 runs with reaction times to analyze.';
      }
    } else {
      ans = 'Try asking about: "why did my 60-ft fall off?", "how consistent am I?", "how does weather affect my ET?", or "how are my reaction times?"';
    }

    setAnswer({ q, a: ans });
  };

  const suggestions = [
    'Why did my 60-ft fall off?',
    'How consistent am I?',
    'How does weather affect my ET?',
    'How are my reaction times?',
  ];

  return (
    <div className="space-y-3">
      <Card>
        <SectionTitle>AI Tuner</SectionTitle>
        <div className="mb-3 text-xs text-white/40">
          Ask about your passes — answers are generated from your actual run data.
        </div>
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && question.trim()) ask(question.trim()); }}
            placeholder="Ask about your runs…"
            className={`${inputCls} flex-1`}
          />
          <Btn kind="primary" onClick={() => question.trim() && ask(question.trim())} className="shrink-0">Ask</Btn>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => { setQuestion(s); ask(s); }}
              className="rounded-full bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10"
            >
              {s}
            </button>
          ))}
        </div>
      </Card>

      {answer && (
        <Card>
          <div className="mb-2 text-sm font-semibold text-white/80">Q: {answer.q}</div>
          <div className="text-sm leading-relaxed text-white/70">{answer.a}</div>
        </Card>
      )}

      <SetupRecommendations state={state} />
    </div>
  );
}

function SetupRecommendations({ state }) {
  const runs = (state.runs || []).filter((r) => r.source !== 'demo').sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const [recs, setRecs] = useState(null);

  const generate = () => {
    const out = [];
    const withJet = runs.filter((r) => r.jet != null && r.et != null);
    const withPsi = runs.filter((r) => (r.lPsi != null || r.rPsi != null) && r.sixty != null);

    // Jet analysis: compare ET at different jet settings in similar DA
    if (withJet.length >= 6) {
      const byJet = {};
      for (const r of withJet) {
        const j = r.jet;
        if (!byJet[j]) byJet[j] = [];
        byJet[j].push(r);
      }
      const jets = Object.keys(byJet).map(Number).sort((a, b) => a - b);
      if (jets.length >= 2) {
        // Find best jet by weather-corrected ET (simple: compare avg ET within DA bands)
        let bestJet = null, bestAvg = Infinity;
        for (const j of jets) {
          const rs = byJet[j];
          const avgET = rs.reduce((a, r) => a + r.et, 0) / rs.length;
          if (avgET < bestAvg) { bestAvg = avgET; bestJet = j; }
        }
        const latestJet = withJet[withJet.length - 1].jet;
        if (bestJet !== latestJet) {
          out.push(`Jet: your best average ET (${bestAvg.toFixed(3)}) came with jet ${bestJet}, but you're currently on ${latestJet}. Consider testing ${bestJet} again.`);
        } else {
          out.push(`Jet: ${bestJet} looks optimal based on your history (avg ET ${bestAvg.toFixed(3)}).`);
        }
      }
    }

    // Tire pressure analysis: compare 60-ft at different pressures
    if (withPsi.length >= 6) {
      const pressures = withPsi.map((r) => ({ psi: (r.lPsi + r.rPsi) / 2, sixty: r.sixty }));
      pressures.sort((a, b) => a.psi - b.psi);
      const low = pressures.slice(0, Math.ceil(pressures.length / 2));
      const high = pressures.slice(Math.floor(pressures.length / 2));
      const lowAvg = low.reduce((a, p) => a + p.sixty, 0) / low.length;
      const highAvg = high.reduce((a, p) => a + p.sixty, 0) / high.length;
      if (Math.abs(lowAvg - highAvg) > 0.01) {
        const better = lowAvg < highAvg ? 'lower' : 'higher';
        out.push(`Tire pressure: ${better} pressures average ${Math.min(lowAvg, highAvg).toFixed(3)} 60-ft vs ${Math.max(lowAvg, highAvg).toFixed(3)}. Consider ${better === 'lower' ? 'dropping' : 'raising'} PSI by 0.5 and testing.`);
      }
    }

    if (out.length === 0) {
      out.push('Not enough setup data yet. Log runs with jet and tire pressure to get recommendations.');
    }
    setRecs(out);
  };

  return (
    <Card>
      <SectionTitle>Setup Recommendations</SectionTitle>
      <div className="mb-3 text-xs text-white/40">
        Analyzes your jet and tire pressure history to suggest changes. Advisory only — trust your crew chief.
      </div>
      <Btn kind="primary" onClick={generate} className="w-full mb-3">Generate recommendations</Btn>
      {recs && (
        <div className="space-y-2">
          {recs.map((r, i) => (
            <div key={i} className="rounded-xl bg-white/5 p-3 text-sm text-white/70">{r}</div>
          ))}
        </div>
      )}
    </Card>
  );
}
