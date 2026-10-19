import { useEffect } from 'react';

/* ---------------- Icons (inline SVG, no emoji) ---------------- */

const PATHS = {
  gauge: (
    <>
      <path d="M4 15a8 8 0 1 1 16 0" />
      <path d="M12 15l3.6-3.6" />
      <circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h12M9 12h12M9 18h12" />
      <circle cx="4.5" cy="6" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4.5h11.5l-2.5 3.8 2.5 3.7H5" />
    </>
  ),
  chart: (
    <>
      <path d="M3 20h18" />
      <path d="M6.5 20v-5M12 20V7M17.5 20v-8" />
    </>
  ),
  wrench: <path d="M14.5 6.5a4.2 4.2 0 0 0-5.6 5.6L4 17l3 3 4.9-4.9a4.2 4.2 0 0 0 5.6-5.6L14 13l-2.5-2.5 3-4z" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5" />
      <circle cx="16.5" cy="9" r="2.4" />
      <path d="M16 14.6c2.2.2 3.9 1.5 4.4 3.9" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
      <circle cx="12" cy="15.2" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87 1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
    </>
  ),
  x: <path d="M18 6L6 18M6 6l12 12" />,
  chevR: <path d="M9 18l6-6-6-6" />,
  chevD: <path d="M6 9l6 6 6-6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </>
  ),
  upload: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </>
  ),
  printer: (
    <>
      <path d="M6 9V3h12v6" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="7" rx="1" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </>
  ),
  pencil: <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />,
  check: <path d="M20 6L9 17l-5-5" />,
  alert: (
    <>
      <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  thermo: <path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z" />,
  wind: (
    <>
      <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
      <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
      <path d="M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v6a5 5 0 0 1-10 0V4z" />
      <path d="M7 6H4a1 1 0 0 0-1 1c0 2.6 2 4.2 4 4.2" />
      <path d="M17 6h3a1 1 0 0 1 1 1c0 2.6-2 4.2-4 4.2" />
    </>
  ),
  zap: <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </>
  ),
  crown: (
    <>
      <path d="M2.5 18.5h19l-1.7-9.8L14.5 13l-2.5-8-2.5 8L4.2 8.7 2.5 18.5z" />
      <path d="M4 21.5h16" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13.5" r="7" />
      <path d="M12 10.5v3l2.2 1.6" />
      <path d="M9.5 2.5h5" />
      <path d="M12 2.5V6.5" />
    </>
  ),
  car: (
    <>
      <path d="M5.5 16l1.4-4.7a2 2 0 0 1 1.9-1.4h6.4a2 2 0 0 1 1.9 1.4L18.5 16" />
      <path d="M4 16h16a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z" />
      <circle cx="8" cy="18.2" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="18.2" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  fileText: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6M9 17h6" />
    </>
  ),
};

export function Icon({ name, className = 'h-5 w-5', strokeWidth = 1.8 }) {
  if (name === 'tree') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden>
        <circle cx="12" cy="5.5" r="2.6" fill="#ef4444" />
        <circle cx="12" cy="12" r="2.6" fill="#fbbf24" />
        <circle cx="12" cy="18.5" r="2.6" fill="#22c55e" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PATHS[name] || null}
    </svg>
  );
}

/* ---------------- Primitives ---------------- */

export const Card = ({ className = '', children, onClick }) => (
  <div
    onClick={onClick}
    className={`rounded-2xl border border-white/[0.08] bg-coal-850 p-4 shadow-card ${className}`}
  >
    {children}
  </div>
);

export const SectionTitle = ({ children, right }) => (
  <div className="mb-2.5 flex items-center justify-between">
    <h2 className="font-display text-[17px] font-bold uppercase tracking-[0.14em] text-white/55">
      {children}
    </h2>
    {right}
  </div>
);

export const Btn = ({ children, onClick, kind = 'primary', className = '', disabled, type = 'button' }) => {
  const styles =
    kind === 'primary'
      ? 'bg-pickle-400 text-black font-display font-bold uppercase tracking-[0.12em] hover:bg-pickle-300 hover:shadow-glow disabled:opacity-40 disabled:shadow-none'
      : kind === 'ghost'
        ? 'border border-white/15 text-white/80 hover:bg-white/5 hover:border-white/25'
        : 'text-white/60 hover:text-white hover:bg-white/5';
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] ${styles} ${className}`}
    >
      {children}
    </button>
  );
};

export const IconBtn = ({ icon, label, onClick, className = '' }) => (
  <button
    onClick={onClick}
    title={label}
    aria-label={label}
    className={`flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-white/70 transition hover:bg-white/5 hover:text-white active:scale-95 ${className}`}
  >
    <Icon name={icon} className="h-5 w-5" />
  </button>
);

export const Badge = ({ children, tone = 'neutral' }) => {
  const tones = {
    neutral: 'bg-white/10 text-white/70',
    green: 'bg-pickle-500/15 text-pickle-300 border border-pickle-500/30',
    red: 'bg-red-500/15 text-red-300 border border-red-500/30',
    amber: 'bg-amber-500/15 text-amber-200 border border-amber-500/30',
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
    <span className="mb-1 block font-display text-[13px] font-semibold uppercase tracking-[0.14em] text-white/45">
      {label}
    </span>
    {children}
  </label>
);

export const inputCls =
  'w-full rounded-xl border border-white/10 bg-coal-900 px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none transition focus:border-pickle-500/60 focus:ring-2 focus:ring-pickle-500/20';

export const Segmented = ({ options, value, onChange }) => (
  <div className="inline-flex rounded-xl border border-white/10 bg-coal-900 p-1">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        onClick={() => onChange(o.value)}
        className={`rounded-lg px-3 py-1.5 font-display text-[15px] font-semibold uppercase tracking-wider transition ${
          value === o.value ? 'bg-pickle-400 text-black shadow-glow' : 'text-white/55 hover:text-white'
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-[2px] sm:items-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-coal-900 p-5 shadow-card sm:rounded-3xl ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold uppercase tracking-[0.1em]">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-white/60 transition hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ title, body, action }) {
  return (
    <Card className="py-12 text-center">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-pickle-500/10 text-pickle-400">
        <Icon name="flag" className="h-7 w-7" />
      </div>
      <div className="mb-1 font-display text-2xl font-bold uppercase tracking-wide">{title}</div>
      <div className="mx-auto mb-5 max-w-xs text-sm text-white/50">{body}</div>
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
          className={`pointer-events-auto flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium shadow-card ${
            t.kind === 'error'
              ? 'border-red-500/40 bg-red-950/95 text-red-200'
              : 'border-pickle-500/40 bg-coal-850/95 text-pickle-200'
          }`}
        >
          <Icon name={t.kind === 'error' ? 'alert' : 'check'} className="h-4 w-4 shrink-0" />
          {t.text}
        </div>
      ))}
    </div>
  );
}
