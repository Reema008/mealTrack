import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { DayType } from '../domain/types';
import { DAY_TYPE_LABEL } from '../domain/schedule';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'btn-taro',
  secondary:
    'bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-50 dark:ring-slate-600 dark:hover:bg-slate-700',
  ghost: 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-slate-800',
  danger: 'bg-white text-rose-700 ring-1 ring-inset ring-rose-300 hover:bg-rose-50 dark:bg-slate-900 dark:text-rose-300 dark:ring-rose-700',
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
    <section className={`taro-card rounded-[1.6rem] p-5 ${className}`}>
      {children}
    </section>
  );
}

const DAY_TYPE_STYLE: Record<DayType, string> = {
  veg: 'bg-white/80 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-white/10 dark:text-emerald-100 dark:ring-emerald-800',
  nonveg: 'bg-emerald-100 text-emerald-800 dark:bg-slate-800 dark:text-slate-200',
  none: 'bg-slate-200 text-slate-700 dark:bg-slate-900 dark:text-slate-200',
};

/** Veg mark: a square with a dot, like the label on Indian food packets. */
export function VegIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="8" cy="8" r="3.3" fill="currentColor" />
    </svg>
  );
}

/** Extra curries: a little bowl of curry with steam. */
export function CurryIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M9 7.5c-.9-1 .9-1.7 0-2.9M12.5 7.5c-.9-1 .9-1.7 0-2.9M16 7.5c-.9-1 .9-1.7 0-2.9" fill="none" stroke="#bfaed8" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3.5 11h17a8.5 8.5 0 0 1-17 0Z" fill="#9d88bd" />
      <ellipse cx="12" cy="11" rx="8.5" ry="1.9" fill="#dccdef" />
      <circle cx="9.3" cy="10.8" r="0.9" fill="#f6f2fb" />
      <circle cx="13.6" cy="11.1" r="0.7" fill="#f6f2fb" />
      <path d="M9.5 21h5" stroke="#8670ab" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Non-veg mark: a square with a triangle, like the label on Indian food packets. */
export function NonVegIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 4.3 11.6 11H4.4Z" fill="currentColor" />
    </svg>
  );
}

function DayTypeIcon({ type }: { type: DayType }) {
  if (type === 'veg') return <VegIcon />;
  if (type === 'nonveg') return <NonVegIcon />;
  return <span aria-hidden>☁️</span>;
}

export function DayTypeChip({ type, className = '' }: { type: DayType; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${DAY_TYPE_STYLE[type]} ${className}`}>
      <DayTypeIcon type={type} />
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
    className: 'bg-white text-emerald-700 ring-emerald-200 dark:bg-emerald-900 dark:text-emerald-50 dark:ring-transparent',
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
    <span title={b.title} className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${kind === 'awaiting' ? 'taro-pulse' : ''} ${b.className}`}>
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
                  : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-50 dark:ring-slate-600'
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
          className="block min-h-11 w-full rounded-xl border-0 bg-white py-2 pl-3 pr-12 text-base text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-600 dark:bg-slate-900 dark:text-slate-50 dark:ring-slate-600"
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-controls={id}
          aria-pressed={visible}
          aria-label={visible ? 'Hide password' : 'Show password'}
          title={visible ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-1 my-1 flex w-11 items-center justify-center rounded-xl text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 dark:text-emerald-300 dark:hover:bg-white/10 dark:hover:text-emerald-200"
        >
          {/* key={visible} restarts the pop animation on every tap */}
          <svg key={String(visible)} viewBox="0 0 24 24" className="pw-eye h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {visible ? (
              <>
                {/* wide-open eye with a heart pupil that blinks: password is showing, tap to hide */}
                <g className="pw-lid">
                  <path d="M2.5 12s3.4-6.2 9.5-6.2 9.5 6.2 9.5 6.2-3.4 6.2-9.5 6.2S2.5 12 2.5 12Z" />
                  <path
                    className="pw-heart"
                    d="M12 15.2s-3.1-1.9-3.1-3.9a1.6 1.6 0 0 1 3.1-.7 1.6 1.6 0 0 1 3.1.7c0 2-3.1 3.9-3.1 3.9Z"
                    fill="currentColor"
                    stroke="none"
                  />
                </g>
                <path d="M6 5.8 5 4.3M12 4.6V2.9M18 5.8l1-1.5" strokeWidth={1.5} />
              </>
            ) : (
              <>
                {/* sleepy closed eye with lashes: password is hidden, tap to show */}
                <path d="M3 11.5s3.4 4.6 9 4.6 9-4.6 9-4.6" />
                <path d="M6.2 14.4 5 16.2M9.4 15.8l-.6 2M14.6 15.8l.6 2M17.8 14.4l1.2 1.8" strokeWidth={1.5} />
                <path className="pw-z" d="M17 4.5h2.6L17 7.5h2.6" strokeWidth={1.3} />
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
        className="block min-h-11 w-full rounded-xl border-0 bg-white px-3 text-base text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-600 dark:bg-slate-900 dark:text-slate-50 dark:ring-slate-600"
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
  options: Array<{ value: T; label: ReactNode }>;
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
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-semibold ring-1 ring-inset transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
              selected
                ? 'bg-emerald-600 text-white ring-emerald-600'
                : 'bg-white/80 text-slate-700 ring-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-50 dark:ring-slate-600'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
