import { formatDate } from '../domain/dates';
import type { MealStats } from '../domain/stats';

export function StatCard({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: 'good' | 'bad' }) {
  const color = tone === 'bad' ? 'text-rose-700 dark:text-rose-300' : tone === 'good' ? 'text-emerald-700 dark:text-emerald-300' : '';
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <p className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

/** Horizontal proportion bar with a legend; accessible as a text list. */
export function SplitBar({ title, parts }: { title: string; parts: Array<{ label: string; value: number; className: string }> }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <figure>
      <figcaption className="mb-2 text-sm font-medium">{title}</figcaption>
      <div className="flex h-4 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>
        {total > 0 &&
          parts.map((p) => p.value > 0 && <div key={p.label} className={p.className} style={{ width: `${(p.value / total) * 100}%` }} />)}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${p.className}`} aria-hidden />
            {p.label}: <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{p.value}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Per-day stacked bars: delivered / not received / planned. */
export function DailyChart({ daily }: { daily: MealStats['daily'] }) {
  if (daily.length === 0) return null;
  const barW = 100 / daily.length;
  const showLabels = daily.length <= 14;
  return (
    <figure>
      <figcaption className="mb-2 text-sm font-medium">Meals per day</figcaption>
      <svg viewBox="0 0 100 44" preserveAspectRatio="none" className="h-36 w-full" role="img" aria-label="Meals per scheduled day: delivered, not received and planned">
        {daily.map((d, i) => {
          const x = i * barW + barW * 0.15;
          const w = barW * 0.7;
          const unit = 20; // 2 meals per day = 40 units tall
          const delivered = d.delivered * unit;
          const missed = d.notReceived * unit;
          const planned = d.planned * unit;
          return (
            <g key={d.date}>
              <title>{`${d.date}: ${d.delivered} delivered, ${d.notReceived} not received, ${d.planned} planned`}</title>
              <rect x={x} y={42 - delivered} width={w} height={delivered} className="fill-emerald-500" />
              <rect x={x} y={42 - delivered - missed} width={w} height={missed} className="fill-rose-500" />
              <rect x={x} y={42 - delivered - missed - planned} width={w} height={planned} className="fill-sky-300 dark:fill-sky-700" />
            </g>
          );
        })}
      </svg>
      {showLabels && (
        <div className="grid text-center text-[10px] text-slate-500 dark:text-slate-400" style={{ gridTemplateColumns: `repeat(${daily.length}, 1fr)` }} aria-hidden>
          {daily.map((d) => (
            <span key={d.date}>{formatDate(d.date, { day: 'numeric' })}</span>
          ))}
        </div>
      )}
      <ul className="mt-2 flex flex-wrap gap-x-4 text-xs text-slate-600 dark:text-slate-400">
        <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Delivered</li>
        <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" />Not received</li>
        <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-300" />Planned</li>
      </ul>
    </figure>
  );
}
