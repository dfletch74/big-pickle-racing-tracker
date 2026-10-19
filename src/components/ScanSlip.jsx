import { useRef, useState } from 'react';
import { Modal, SectionTitle, Btn, Field, inputCls, Segmented } from './ui';
import { ocrTimeslip, parseSlipText, pickLane, laneCount } from '../lib/scanSlip';

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
  const [stage, setStage] = useState('idle'); // idle | scanning | review | error
  const [progress, setProgress] = useState('');
  const [parsed, setParsed] = useState(null);
  const [lane, setLane] = useState(0);
  const [values, setValues] = useState({});
  const [error, setError] = useState('');

  const startScan = async (file) => {
    if (!file) return;
    setStage('scanning');
    setProgress('Reading image…');
    try {
      const text = await ocrTimeslip(file, setProgress);
      const p = parseSlipText(text);
      const lanes = laneCount(p);
      setParsed(p);
      setLane(0);
      setValues(pickLane(p, 0));
      setStage(lanes > 0 && Object.keys(p.fields).some((k) => p.fields[k].length) ? 'review' : 'error');
      if (!(lanes > 0 && Object.keys(p.fields).some((k) => p.fields[k].length))) {
        setError('Could not read any numbers from this image. Try a clearer photo in good light.');
      }
    } catch (e) {
      setError(e.message || 'Scan failed');
      setStage('error');
    }
  };

  const changeLane = (i) => {
    setLane(i);
    setValues(pickLane(parsed, i));
  };

  const setVal = (k, v) => setValues((prev) => ({ ...prev, [k]: v }));

  const lanes = parsed ? laneCount(parsed) : 1;
  const foundCount = parsed ? SCAN_FIELDS.filter(([k]) => values[k]).length : 0;

  return (
    <>
      <Btn kind="ghost" onClick={() => fileRef.current?.click()} className="w-full">
        <span className="mr-1">📷</span> Scan timeslip
      </Btn>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { startScan(e.target.files?.[0]); e.target.value = ''; }}
      />

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
          <div className="mt-4"><Btn kind="ghost" onClick={() => { setStage('idle'); fileRef.current?.click(); }} className="w-full">Try another photo</Btn></div>
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
    </>
  );
}
