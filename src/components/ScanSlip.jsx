import { useRef, useState } from 'react';
import { Modal, SectionTitle, Btn, Field, inputCls, Segmented } from './ui';
import { ocrTimeslip, ocrCloud, getOcrKey, setOcrKey, geminiVision, geminiLaneToValues, getGeminiKey, setGeminiKey, parseSlipText, pickLane, laneCount } from '../lib/scanSlip';

const SCAN_FIELDS = [
  ['rt', 'R/T'],
  ['sixty', "60'"],
  ['threeThirty', '330'],
  ['eighthET', '1/8 ET'],
  ['eighthMPH', '1/8 MPH'],
  ['thousand', "1000'"],
  ['et', '1/4 ET'],
  ['mph', '1/4 MPH'],
];

/**
 * Scan-a-timeslip flow: pick/take a photo → OCR → review → fill the run form.
 * The file input has no `capture` attr so iOS offers Take Photo / Photo Library.
 */
export function ScanSlipButton({ onFill }) {
  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const [stage, setStage] = useState('idle'); // idle | choose | camera | scanning | review | error | paste
  const [progress, setProgress] = useState('');
  const [parsed, setParsed] = useState(null);
  const [lane, setLane] = useState(0);
  const [values, setValues] = useState({});
  const [error, setError] = useState('');
  const [cloudKey, setCloudKey] = useState('');
  const [showCloudSetup, setShowCloudSetup] = useState(false);
  const [geminiKey, setGeminiKeyInput] = useState('');
  const [showGeminiSetup, setShowGeminiSetup] = useState(false);
  const [geminiLanes, setGeminiLanes] = useState(null);
  const [lastFile, setLastFile] = useState(null);
  const [pasteText, setPasteText] = useState('');
  const [aiDirect, setAiDirect] = useState(false);
  const [stream, setStream] = useState(null);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const openCamera = async () => {
    setStage('camera');
    setError('');
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      setStream(s);
      // Wait for video element to be ready.
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
      }, 100);
    } catch (e) {
      setError(e.name === 'NotAllowedError' ? 'Camera blocked — allow it in Settings.' : 'Could not open camera.');
      setStage('error');
    }
  };

  const captureFromCamera = () => {
    if (!videoRef.current || !stream) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    stopCamera();
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], 'slip.jpg', { type: 'image/jpeg' });
        // Use AI read directly (fast + accurate, no photo saved).
        tryGeminiWithFile(file);
      } else {
        setError('Capture failed.');
        setStage('error');
      }
    }, 'image/jpeg', 0.9);
  };

  const doPasteParse = () => {
    const p = parseSlipText(pasteText);
    setPasteText('');
    setGeminiLanes(null);
    finishParse(p);
  };

  const fieldCount = (p) => p ? SCAN_FIELDS.filter(([k]) => pickLane(p, 0)[k]).length : 0;

  const tryGeminiWithFile = async (file) => {
    const key = getGeminiKey();
    if (!key) { setLastFile(file); setShowGeminiSetup(true); setStage('idle'); return; }
    setLastFile(file);
    setGeminiLanes(null);
    setStage('scanning');
    setProgress('AI reading the slip…');
    setShowGeminiSetup(false);
    try {
      const result = await geminiVision(file, key);
      setGeminiLanes(result.lanes);
      setLane(0);
      setValues(geminiLaneToValues(result.lanes[0], result.date, result.time));
      setParsed(null);
      setStage('review');
    } catch (e) {
      setError(e.message || 'AI read failed');
      setStage('error');
    }
  };

  const startScan = async (file) => {
    if (!file) return;
    if (aiDirect) {
      setAiDirect(false);
      tryGeminiWithFile(file);
      return;
    }
    setLastFile(file);
    setGeminiLanes(null);
    setStage('scanning');
    setProgress('Reading image…');
    setShowCloudSetup(false);
    setShowGeminiSetup(false);
    try {
      const text = await ocrTimeslip(file, setProgress);
      const p = parseSlipText(text);
      finishParse(p);
    } catch (e) {
      setError(e.message || 'Scan failed');
      setStage('error');
    }
  };

  const finishParse = (p) => {
    const lanes = laneCount(p);
    setParsed(p);
    setLane(0);
    setValues(pickLane(p, 0));
    const found = fieldCount(p);
    if (found === 0) {
      setError('Could not read any numbers from this image. Try a clearer photo in good light.');
      setStage('error');
    } else {
      setStage('review');
    }
  };

  const tryCloud = async () => {
    const key = getOcrKey();
    if (!key) { setShowCloudSetup(true); return; }
    if (!lastFile) return;
    setStage('scanning');
    setProgress('Cloud reading (better for faded slips)…');
    try {
      const text = await ocrCloud(lastFile, key);
      finishParse(parseSlipText(text));
    } catch (e) {
      setError(e.message || 'Cloud scan failed');
      setStage('error');
    }
  };

  const tryGemini = async () => {
    const key = getGeminiKey();
    if (!key) { setShowGeminiSetup(true); return; }
    if (!lastFile) return;
    setStage('scanning');
    setProgress('AI reading the slip…');
    setShowGeminiSetup(false);
    try {
      const result = await geminiVision(lastFile, key);
      setGeminiLanes(result.lanes);
      setLane(0);
      setValues(geminiLaneToValues(result.lanes[0], result.date, result.time));
      setParsed(null); // using Gemini lanes, not parser
      setStage('review');
    } catch (e) {
      setError(e.message || 'AI read failed');
      setStage('error');
    }
  };

  const changeLane = (i) => {
    setLane(i);
    if (geminiLanes) {
      const g = geminiLanes[i] || geminiLanes[0];
      setValues(geminiLaneToValues(g, undefined, undefined));
    } else if (parsed) {
      setValues(pickLane(parsed, i));
    }
  };

  const setVal = (k, v) => setValues((prev) => ({ ...prev, [k]: v }));

  const lanes = geminiLanes ? geminiLanes.length : parsed ? laneCount(parsed) : 1;
  const foundCount = SCAN_FIELDS.filter(([k]) => values[k]).length;

  return (
    <>
      <Btn kind="ghost" onClick={() => setStage('choose')} className="w-full">
        <span className="mr-1">📷</span> Scan timeslip
      </Btn>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { startScan(e.target.files?.[0]); e.target.value = ''; }}
      />

      {stage === 'choose' && (
        <Modal title="Get the numbers" onClose={() => setStage('idle')}>
          <div className="space-y-2">
            <Btn kind="primary" onClick={() => { setStage('idle'); openCamera(); }} className="w-full">
              <span className="mr-1">📷</span> Scan with camera
            </Btn>
            <Btn kind="ghost" onClick={() => { setAiDirect(true); setStage('idle'); fileRef.current?.click(); }} className="w-full">
              <span className="mr-1">🤖</span> AI read photo
            </Btn>
            <Btn kind="ghost" onClick={() => { setStage('idle'); fileRef.current?.click(); }} className="w-full">
              <span className="mr-1">📷</span> Quick scan (on-device)
            </Btn>
            <Btn kind="ghost" onClick={() => setStage('paste')} className="w-full">
              <span className="mr-1">📋</span> Paste copied text
            </Btn>
            <div className="pt-1 text-[11px] text-white/40">
              Camera scan uses AI — no photo saved to your library.
            </div>
          </div>
        </Modal>
      )}

      {stage === 'camera' && (
        <Modal title="Point at the slip" onClose={() => { stopCamera(); setStage('idle'); }}>
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} playsInline muted className="h-64 w-full object-cover" />
          </div>
          <div className="mt-3 flex gap-2">
            <Btn kind="quiet" onClick={() => { stopCamera(); setStage('choose'); }} className="flex-1">Back</Btn>
            <Btn kind="primary" onClick={captureFromCamera} className="flex-1">Capture</Btn>
          </div>
          <div className="mt-2 text-center text-[11px] text-white/40">
            Fill the frame with the slip, hold steady, tap Capture.
          </div>
        </Modal>
      )}

      {stage === 'paste' && (
        <Modal title="Paste slip text" onClose={() => setStage('idle')}>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Long-press → Paste the text you copied from Photos…"
            rows={8}
            className={`${inputCls} w-full font-mono !text-xs`}
          />
          <div className="mt-3 flex gap-2">
            <Btn kind="quiet" onClick={() => setStage('choose')} className="flex-1">Back</Btn>
            <Btn kind="primary" onClick={doPasteParse} disabled={!pasteText.trim()} className="flex-1">Parse</Btn>
          </div>
        </Modal>
      )}

      {stage === 'scanning' && (
        <Modal title="Scanning timeslip" onClose={() => setStage('idle')}>
          <div className="py-8 text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-pickle-400" />
            <div className="text-sm text-white/60">{progress || 'Working…'}</div>
            <div className="mt-1 text-[11px] text-white/35">First scan downloads the reader (~15 MB) — afterwards it's instant.</div>
          </div>
        </Modal>
      )}

      {stage === 'error' && (
        <Modal title="Couldn't read it" onClose={() => setStage('idle')}>
          <div className="text-sm text-white/70">{error}</div>
          <div className="mt-4 space-y-2">
            <Btn kind="primary" onClick={tryGemini} className="w-full">🤖 Try AI read (best for faded slips)</Btn>
            <Btn kind="ghost" onClick={tryCloud} className="w-full">Try cloud reader</Btn>
            <Btn kind="quiet" onClick={() => { setStage('idle'); fileRef.current?.click(); }} className="w-full">Try another photo</Btn>
          </div>
        </Modal>
      )}

      {showGeminiSetup && (
        <Modal title="AI reader setup" onClose={() => { setShowGeminiSetup(false); setStage('idle'); }}>
          <div className="mb-2 text-xs text-white/60">
            The AI reader (Google Gemini) reads faded slips like a person — far better than any OCR.
            It's free: get a key at <b>aistudio.google.com</b> → Get API Key, paste it below. Stays on this device.
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={geminiKey}
              onChange={(e) => setGeminiKeyInput(e.target.value)}
              placeholder="Gemini API key"
              className={`${inputCls} min-w-0 flex-1 font-mono !text-xs`}
            />
            <Btn kind="ghost" onClick={() => {
              const k = geminiKey.trim();
              if (!k) return;
              setGeminiKey(k);
              setGeminiKeyInput('');
              setShowGeminiSetup(false);
              if (lastFile) tryGeminiWithFile(lastFile);
              else setStage('idle');
            }} className="shrink-0">Save & retry</Btn>
          </div>
        </Modal>
      )}

      {stage === 'review' && (
        <Modal title="Check the numbers" onClose={() => setStage('idle')}>
          {lanes > 1 && (
            <div className="mb-3">
              <div className="mb-1 text-[11px] text-white/50">Two lanes detected — which is yours?</div>
              <Segmented
                value={String(lane)}
                onChange={(v) => changeLane(Number(v))}
                options={[{ value: '0', label: 'Left lane' }, { value: '1', label: 'Right lane' }]}
              />
            </div>
          )}
          <div className="mb-1 text-[11px] text-white/50">
            Found {foundCount} values — fix anything the camera misread, then fill the form.
          </div>
          {foundCount < 5 && !geminiLanes && (
            <button onClick={tryGemini} className="mb-2 w-full rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-200">
              🤖 Only {foundCount} read — try AI read (best for faded slips)
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            {SCAN_FIELDS.map(([k, label]) => (
              <Field key={k} label={label}>
                <input
                  value={values[k] || ''}
                  onChange={(e) => setVal(k, e.target.value)}
                  inputMode="decimal"
                  placeholder="—"
                  className={`${inputCls} font-mono ${values[k] ? '' : 'opacity-40'}`}
                />
              </Field>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Btn kind="ghost" onClick={() => { setStage('idle'); fileRef.current?.click(); }} className="flex-1">Rescan</Btn>
            <Btn kind="primary" onClick={() => { onFill(values); setStage('idle'); }} className="flex-1">Fill form</Btn>
          </div>
        </Modal>
      )}

      {showCloudSetup && (
        <Modal title="Cloud reader setup" onClose={() => { setShowCloudSetup(false); setStage('idle'); }}>
          <div className="mb-2 text-xs text-white/60">
            The cloud reader handles faded slips far better. It's free — grab a key at <b>ocr.space</b> (free tier,
            no credit card), paste it below. It stays on this device.
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={cloudKey}
              onChange={(e) => setCloudKey(e.target.value)}
              placeholder="OCR.space API key"
              className={`${inputCls} min-w-0 flex-1 font-mono !text-xs`}
            />
            <Btn kind="ghost" onClick={() => {
              const k = cloudKey.trim();
              if (!k) return;
              setOcrKey(k);
              setCloudKey('');
              setShowCloudSetup(false);
              tryCloud();
            }} className="shrink-0">Save & retry</Btn>
          </div>
        </Modal>
      )}
    </>
  );
}
