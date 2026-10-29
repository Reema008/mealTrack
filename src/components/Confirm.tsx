import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from './ui';

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  /** Large emoji shown in the bubble at the top. */
  emoji?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button for actions that remove or mark things missing. */
  tone?: 'default' | 'danger';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

/** App-styled replacement for window.confirm(): `if (await confirm({...})) …` */
export const useConfirm = () => useContext(ConfirmContext);

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...options, resolve });
      }),
    [],
  );

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && <ConfirmDialog options={pending} onClose={close} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({ options, onClose }: { options: ConfirmOptions; onClose: (ok: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const danger = options.tone === 'danger';

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // Focus the safe choice first.
    ref.current?.querySelector<HTMLElement>('[data-cancel]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(false);
      if (e.key === 'Tab' && ref.current) {
        const els = ref.current.querySelectorAll<HTMLElement>('button');
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-3 sm:items-center" role="presentation">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[3px]" onClick={() => onClose(false)} aria-hidden />
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={options.message ? 'confirm-message' : undefined}
        className="relative w-full max-w-sm overflow-hidden rounded-[2rem] bg-slate-50 text-center shadow-soft ring-1 ring-white/70 dark:bg-slate-900 dark:ring-slate-800"
      >
        <div
          className={`px-6 pb-2 pt-7 ${
            danger
              ? 'bg-gradient-to-b from-rose-100/90 to-transparent dark:from-rose-950/60'
              : 'bg-gradient-to-b from-emerald-100/90 to-transparent dark:from-emerald-950/60'
          }`}
        >
          <div
            className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl shadow-soft ring-4 ${
              danger ? 'bg-white ring-rose-200/80 dark:bg-slate-800 dark:ring-rose-900' : 'bg-white ring-emerald-200/80 dark:bg-slate-800 dark:ring-emerald-900'
            }`}
            aria-hidden
          >
            {options.emoji ?? (danger ? '⚠️' : '💬')}
          </div>
          <h2 id="confirm-title" className="mt-4 text-2xl leading-tight">
            {options.title}
          </h2>
        </div>
        {options.message && (
          <div id="confirm-message" className="px-6 pt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {options.message}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 p-5 pt-6">
          <Button variant="secondary" data-cancel onClick={() => onClose(false)}>
            {options.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            className={danger ? '!bg-rose-600 hover:!bg-rose-700' : ''}
            onClick={() => onClose(true)}
          >
            {options.confirmLabel ?? 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  );
}
