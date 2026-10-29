import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type Tone = 'success' | 'error' | 'info';
interface Alert {
  id: number;
  tone: Tone;
  message: string;
}

const AlertContext = createContext<(message: string, tone?: Tone) => void>(() => {});

const TONE: Record<Tone, { emoji: string; title: string; header: string; ring: string; button: string }> = {
  success: {
    emoji: '💜',
    title: 'Done',
    header: 'from-emerald-100/90 dark:from-emerald-950/20',
    ring: 'ring-emerald-200/80 dark:ring-emerald-900',
    button: 'btn-taro',
  },
  info: {
    emoji: '💬',
    title: 'Good to know',
    header: 'from-sky-100/90 dark:from-sky-950/20',
    ring: 'ring-sky-200/80 dark:ring-sky-900',
    button: 'bg-sky-600 hover:bg-sky-700',
  },
  error: {
    emoji: '⚠️',
    title: 'Something went wrong',
    header: 'from-rose-100/90 dark:from-rose-950/20',
    ring: 'ring-rose-200/80 dark:ring-rose-900',
    button: 'bg-rose-600 hover:bg-rose-700',
  },
};

/** Success and info pop-ups close by themselves; errors wait for OK. */
const AUTO_CLOSE_MS = 2600;

/**
 * App-wide alerts shown as modal pop-ups (one at a time, queued).
 * Keeps the old toast API: `const toast = useToast(); toast('Saved', 'success')`.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Alert[]>([]);
  const nextId = useRef(1);

  const show = useCallback((message: string, tone: Tone = 'success') => {
    const id = nextId.current++;
    // Keep the queue short; the newest message matters most.
    setQueue((all) => [...all.slice(-2), { id, tone, message }]);
  }, []);

  const current = queue[0];
  const close = useCallback(() => setQueue((all) => all.slice(1)), []);

  return (
    <AlertContext.Provider value={show}>
      {children}
      {current && <AlertModal key={current.id} alert={current} onClose={close} />}
    </AlertContext.Provider>
  );
}

function AlertModal({ alert, onClose }: { alert: Alert; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const t = TONE[alert.tone];

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    const timer = alert.tone === 'error' ? undefined : window.setTimeout(onClose, AUTO_CLOSE_MS);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (timer) window.clearTimeout(timer);
      previous?.focus?.();
    };
  }, [alert.tone, onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="presentation">
      <div className="absolute inset-0 bg-slate-900/35 backdrop-blur-[3px]" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role={alert.tone === 'error' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="alert-title"
        aria-describedby="alert-message"
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-xs overflow-y-auto rounded-[2rem] bg-slate-50 text-center shadow-soft ring-1 ring-white/70 dark:bg-slate-900 dark:ring-white/[0.05]"
      >
        <div className={`bg-gradient-to-b ${t.header} to-transparent px-6 pb-1 pt-6`}>
          <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-2xl shadow-soft ring-4 dark:bg-slate-900 ${t.ring}`} aria-hidden>
            {t.emoji}
          </div>
          <h2 id="alert-title" className="mt-3 text-xl">
            {t.title}
          </h2>
        </div>
        <p id="alert-message" className="px-6 pt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
          {alert.message}
        </p>
        <div className="p-5 pt-5">
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex min-h-11 w-full items-center justify-center rounded-full px-5 text-sm font-semibold text-white shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${t.button}`}
          >
            OK
          </button>
        </div>
        {alert.tone !== 'error' && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-slate-200/60 dark:bg-slate-900" aria-hidden>
            <div className={`h-full ${t.button} origin-left animate-[shrink_2.6s_linear_forwards]`} />
          </div>
        )}
      </div>
    </div>
  );
}

export const useToast = () => useContext(AlertContext);
