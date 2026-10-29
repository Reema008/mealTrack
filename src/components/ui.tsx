import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { DayType } from '../domain/types';
import { DAY_TYPE_LABEL } from '../domain/schedule';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-emerald-600 text-white shadow-soft hover:bg-emerald-700 disabled:bg-emerald-600/50 disabled:shadow-none',
  secondary:
    'bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-50 dark:ring-slate-600 dark:hover:bg-slate-700',
  ghost: 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-slate-800',
  danger: 'bg-white text-rose-700 ring-1 ring-inset ring-rose-300 hover:bg-rose-50 dark:bg-slate-800 dark:text-rose-300 dark:ring-rose-700',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-1.5 text-center text-sm font-semibold leading-tight transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl bg-white/85 p-5 shadow-soft ring-1 ring-slate-200/70 backdrop-blur-sm dark:bg-white/[0.04] dark:ring-white/[0.06] ${className}`}>
      {children}
    </section>
  );
}

const DAY_TYPE_STYLE: Record<DayType, string> = {
  veg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200',
  nonveg: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200',
  none: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
};

export const DAY_TYPE_EMOJI: Record<DayType, string> = { veg: '🥗', nonveg: '🍗', none: '🌤️' };

export function DayTypeChip({ type, className = '' }: { type: DayType; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${DAY_TYPE_STYLE[type]} ${className}`}>
      <span aria-hidden>{DAY_TYPE_EMOJI[type]}</span>
      {DAY_TYPE_LABEL[type]}
    </span>
  );
}

/** Tag shown on a meal. Meals following the normal schedule get no tag. */
export type BadgeKind = 'saved' | 'planned' | 'awaiting' | 'unsynced';

const BADGE: Record<BadgeKind, { label: string; className: string; title: string }> = {
  saved: {
    label: 'Edited',
    className: 'bg-emerald-50 text-emerald-800 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-700',
    title: 'Someone changed this meal from the standard schedule, or confirmed it.',
  },
  planned: {
    label: 'Planned',
    className: 'bg-sky-50 text-sky-800 ring-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-700',
    title: 'A future meal. Shown as scheduled, not as a confirmed delivery.',
  },
  awaiting: {
    label: 'Pending',
    className: 'bg-amber-50 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-700',
    title: 'Not yet assumed delivered. Lunch counts as delivered from 2 PM, dinner from 10 PM, unless someone marks it.',
  },
  unsynced: {
    label: 'Not synced',
    className: 'bg-rose-50 text-rose-800 ring-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-700',
    title: 'Saved on this device only. It will sync when you are back online.',
  },
};

export function StatusBadge({ kind }: { kind: BadgeKind | null }) {
  if (!kind) return null;
  const b = BADGE[kind];
  return (
    <span title={b.title} className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${b.className}`}>
      {b.label}
    </span>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-slate-600 dark:text-slate-300">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" aria-hidden />
      {label}…
    </div>
  );
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800">
      <p>{(error as Error)?.message ?? 'Something went wrong.'}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Segmented<T extends string | boolean>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; tone?: 'good' | 'bad' }>;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">{label}</legend>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-2" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const selected = o.value === value;
          const tone =
            o.tone === 'bad'
              ? 'bg-rose-600 text-white ring-rose-600'
              : 'bg-emerald-600 text-white ring-emerald-600';
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(o.value)}
              className={`min-h-12 rounded-xl px-3 py-1.5 text-sm leading-tight font-semibold ring-1 ring-inset transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
                selected
                  ? tone
                  : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-50 dark:ring-slate-600'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Password input with an eye icon to show/hide the text. */
export function PasswordField({
  label,
  id,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string; id: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="block min-h-11 w-full rounded-xl border-0 bg-white py-2 pl-3 pr-12 text-base text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-600 dark:bg-slate-800 dark:text-slate-50 dark:ring-slate-600"
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-controls={id}
          aria-pressed={visible}
          aria-label={visible ? 'Hide password' : 'Show password'}
          title={visible ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-1 my-1 flex w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {visible ? (
              <>
                {/* eye with slash: password is visible, tap to hide */}
                <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
                <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                <path d="M3 3l18 18" />
              </>
            ) : (
              <>
                {/* open eye: password is hidden, tap to show */}
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
              </>
            )}
          </svg>
        </button>
      </div>
    </div>
  );
}

export function TextField({
  label,
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </label>
      <input
        id={id}
        className="block min-h-11 w-full rounded-xl border-0 bg-white px-3 text-base text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-600 dark:bg-slate-800 dark:text-slate-50 dark:ring-slate-600"
        {...props}
      />
    </div>
  );
}

/** Row of pill-shaped filter chips (single choice). */
export function FilterChips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={`min-h-9 rounded-full px-3.5 py-1 text-xs font-semibold ring-1 ring-inset transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
              selected
                ? 'bg-emerald-600 text-white ring-emerald-600'
                : 'bg-white/80 text-slate-700 ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-50 dark:ring-slate-600'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
