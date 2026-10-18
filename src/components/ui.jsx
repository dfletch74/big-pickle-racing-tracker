import { useEffect } from 'react';

export const Card = ({ className = '', children, onClick }) => (
  <div
    onClick={onClick}
    className={`rounded-2xl border border-white/10 bg-coal-850 p-4 ${className}`}
  >
    {children}
  </div>
);

export const SectionTitle = ({ children, right }) => (
  <div className="mb-2 flex items-center justify-between">
    <h2 className="text-xs font-bold uppercase tracking-widest text-white/50">{children}</h2>
    {right}
  </div>
);

export const Btn = ({ children, onClick, kind = 'primary', className = '', disabled, type = 'button' }) => {
  const styles =
    kind === 'primary'
      ? 'bg-pickle-500 text-black font-bold hover:bg-pickle-400 disabled:opacity-40'
      : kind === 'ghost'
        ? 'border border-white/15 text-white/80 hover:bg-white/5'
        : 'text-white/60 hover:text-white hover:bg-white/5';
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl px-4 py-2.5 text-sm transition ${styles} ${className}`}
    >
      {children}
    </button>
  );
};

export const Badge = ({ children, tone = 'neutral' }) => {
  const tones = {
    neutral: 'bg-white/10 text-white/70',
    green: 'bg-pickle-500/15 text-pickle-400 border border-pickle-500/30',
    red: 'bg-red-500/15 text-red-400 border border-red-500/30',
    amber: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
    blue: 'bg-sky-500/15 text-sky-300 border border-sky-500/30',
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
};

export const Field = ({ label, children, className = '' }) => (
  <label className={`block ${className}`}>
    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-white/45">{label}</span>
    {children}
  </label>
);

export const inputCls =
  'w-full rounded-xl border border-white/10 bg-coal-900 px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-pickle-500/60';

export const Segmented = ({ options, value, onChange }) => (
  <div className="inline-flex rounded-xl border border-white/10 bg-coal-900 p-1">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        onClick={() => onChange(o.value)}
        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
          value === o.value ? 'bg-pickle-500 text-black' : 'text-white/60 hover:text-white'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

/** Full-screen modal sheet. */
export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-coal-900 p-5 sm:rounded-3xl ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ title, body, action }) {
  return (
    <Card className="py-10 text-center">
      <div className="mb-2 text-3xl">🏁</div>
      <div className="mb-1 font-bold">{title}</div>
      <div className="mb-4 text-sm text-white/50">{body}</div>
      {action}
    </Card>
  );
}

/** Toast stack rendered by App. */
export function Toasts({ toasts }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-xl border px-4 py-2.5 text-sm font-medium shadow-lg ${
            t.kind === 'error'
              ? 'border-red-500/40 bg-red-950/90 text-red-200'
              : 'border-pickle-500/40 bg-coal-850/95 text-pickle-300'
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
