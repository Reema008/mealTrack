import { formatDate } from '../domain/dates';
import type { MealStats } from '../domain/stats';

type Tint = 'sage' | 'peach' | 'butter' | 'blush' | 'lavender' | 'cream';

// All tiles share the flowing taro gradient; alternate ones flow the other way.
const TINTS: Record<Tint, string> = {
  sage: 'taro-card',
  peach: 'taro-card-alt',
  butter: 'taro-card',
  blush: 'taro-card-alt',
  lavender: 'taro-card',
  cream: 'taro-card-alt',
};

/** A pastel report tile. When `onClick` is given it is a button that opens details. */
export function StatCard({
  label,
  value,
  hint,
  tint = 'cream',
  emoji,
  onClick,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tint?: Tint;
  emoji?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{label}</span>
        {emoji && (
          <span className="text-lg leading-none" aria-hidden>
            {emoji}
          </span>
        )}
      </span>
      <span className="mt-2 block break-words font-display text-3xl tabular-nums text-slate-900 dark:text-slate-50">{value}</span>
      {hint && <span className="mt-1 block text-xs text-slate-600 dark:text-slate-300">{hint}</span>}
      {onClick && (
        <span className="mt-2 block text-xs font-semibold text-emerald-700 dark:text-emerald-300" aria-hidden>
          View details →
        </span>
      )}
    </>
  );
  const cls = `block w-full min-w-0 rounded-[1.35rem] p-4 text-left ${TINTS[tint]}`;
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${value}. View details`}
      className={`${cls} transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 active:scale-[0.97]`}
    >
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Horizontal proportion bar with a legend; accessible as a text list. */
export function SplitBar({ title, parts }: { title: string; parts: Array<{ label: string; value: number; className: string }> }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <figure>
      <figcaption className="mb-2 font-display text-lg">{title}</figcaption>
      <div className="flex h-4 gap-0.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900" aria-hidden>
        {total > 0 &&
          parts.map((p) => p.value > 0 && <div key={p.label} className={`${p.className} rounded-full`} style={{ width: `${(p.value / total) * 100}%` }} />)}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${p.className}`} aria-hidden />
            {p.label}: <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-50">{p.value}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Per-day stacked bars: delivered / not received / pending / planned. */
export function DailyChart({ daily }: { daily: MealStats['daily'] }) {
  if (daily.length === 0) return null;
  const barW = 100 / daily.length;
  const showLabels = daily.length <= 14;
  return (
    <figure>
      <figcaption className="mb-2 font-display text-lg">Meals per day</figcaption>
      <svg viewBox="0 0 100 44" preserveAspectRatio="none" className="h-36 w-full" role="img" aria-label="Meals per scheduled day: delivered, not received, pending and planned">
        {daily.map((d, i) => {
          const x = i * barW + barW * 0.18;
          const w = barW * 0.64;
          const unit = 20; // 2 meals per day = 40 units tall
          let y = 42;
          const seg = (n: number, cls: string, key: string) => {
            if (n === 0) return null;
            y -= n * unit;
            return <rect key={key} x={x} y={y} width={w} height={n * unit - 0.6} rx={Math.min(w / 2, 1.6)} className={cls} />;
          };
          return (
            <g key={d.date}>
              <title>{`${d.date}: ${d.delivered} delivered, ${d.notReceived} not received, ${d.pending} pending, ${d.planned} planned`}</title>
              {seg(d.delivered, 'fill-emerald-500', 'd')}
              {seg(d.notReceived, 'fill-rose-400', 'n')}
              {seg(d.pending, 'fill-orange-300', 'p')}
              {seg(d.planned, 'fill-slate-300 dark:fill-slate-600', 'f')}
            </g>
          );
        })}
      </svg>
      {showLabels && (
        <div className="grid text-center text-[10px] text-slate-500 dark:text-slate-300" style={{ gridTemplateColumns: `repeat(${daily.length}, 1fr)` }} aria-hidden>
          {daily.map((d) => (
            <span key={d.date}>{formatDate(d.date, { day: 'numeric' })}</span>
          ))}
        </div>
      )}
      <ul className="mt-2 flex flex-wrap gap-x-4 text-xs text-slate-600 dark:text-slate-300">
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Delivered</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-400" />Not received</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-orange-300" />Pending</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-300" />Planned</li>
      </ul>
    </figure>
  );
}

/** One category tile (Veg / Non-Veg / Lunch / Dinner) with its own split bar; opens details. */
export function CategoryTile({
  label,
  emoji,
  tint,
  stats,
  onClick,
}: {
  label: string;
  emoji: string;
  tint: Tint;
  stats: { scheduled: number; meals: number; delivered: number; notReceived: number; upcoming: number; successRate: number | null };
  onClick: () => void;
}) {
  const total = stats.scheduled || 1;
  const pct = stats.successRate === null ? '—' : `${Math.round(stats.successRate)}%`;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${stats.delivered} delivered, ${stats.notReceived} not received, ${stats.upcoming} upcoming. View details`}
      className={`block w-full min-w-0 rounded-[1.35rem] p-4 text-left transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${TINTS[tint]}`}
    >
      <span className="flex flex-wrap items-center justify-between gap-x-2">
        <span className="font-display text-lg">
          <span aria-hidden>{emoji} </span>
          {label}
        </span>
        <span className="font-display text-2xl tabular-nums">{pct}</span>
      </span>
      <span className="taro-grow mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-white/70 dark:bg-white/10" aria-hidden>
        {stats.delivered > 0 && <span className="rounded-full bg-emerald-500" style={{ width: `${(stats.delivered / total) * 100}%` }} />}
        {stats.notReceived > 0 && <span className="rounded-full bg-rose-400" style={{ width: `${(stats.notReceived / total) * 100}%` }} />}
        {stats.upcoming > 0 && <span className="rounded-full bg-slate-300" style={{ width: `${(stats.upcoming / total) * 100}%` }} />}
      </span>
      <span className="mt-2 block text-xs text-slate-700 dark:text-slate-200">
        <strong>{stats.delivered}</strong> delivered · <strong>{stats.notReceived}</strong> not received
        {stats.upcoming > 0 && <> · {stats.upcoming} upcoming</>}
      </span>
      <span className="mt-1 block text-xs font-semibold text-emerald-700 dark:text-emerald-300" aria-hidden>
        View details →
      </span>
    </button>
  );
}
