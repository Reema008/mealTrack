import { Link } from 'react-router-dom';
import { formatShort } from '../domain/dates';
import { computeStats, formatPercent } from '../domain/stats';
import { PERIOD_DAYS, periodProgress } from '../domain/subscription';
import { useHousehold } from '../data/household';
import { useOverrides } from '../data/meals';
import { Card } from './ui';

/** Current 4-week subscription period: progress, renewal date and deliveries so far. */
export function SubscriptionCard() {
  const { household, today, nowMinutes } = useHousehold();
  const renewal = household.subscription_start;
  const progress = renewal ? periodProgress(renewal, today) : null;
  const { map, isLoading } = useOverrides(progress?.period.start ?? today, progress?.period.end ?? today);

  if (!progress) {
    return (
      <Card className="bg-gradient-to-br from-amber-50/90 to-white/80 dark:from-amber-950/40 dark:to-slate-900/80">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl">Subscription</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">Add your renewal date to track each 4-week period.</p>
          </div>
          <Link to="/settings" className="shrink-0 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-soft hover:bg-emerald-700">
            Set date
          </Link>
        </div>
      </Card>
    );
  }

  const { period, day, daysLeft } = progress;
  const s = computeStats(period.start, period.end, map, today, nowMinutes);
  const pct = Math.round((day / PERIOD_DAYS) * 100);

  return (
    <Card className="bg-gradient-to-br from-emerald-50/90 via-white/80 to-sky-50/80 dark:from-emerald-950/40 dark:via-slate-900/80 dark:to-sky-950/40">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl">Subscription</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {formatShort(period.start)} – {formatShort(period.end)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl leading-none">{daysLeft === 0 ? 'Last day' : `${daysLeft} days left`}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">renews {formatShort(period.renewsOn)}</p>
        </div>
      </div>
      <div
        className="mt-3 h-3 overflow-hidden rounded-full bg-white/80 ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-slate-700"
        role="progressbar"
        aria-label="Subscription period progress"
        aria-valuemin={1}
        aria-valuemax={PERIOD_DAYS}
        aria-valuenow={day}
      >
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="text-slate-600 dark:text-slate-400">
          Day <strong className="text-slate-900 dark:text-slate-100">{day}</strong> of {PERIOD_DAYS}
        </span>
        {!isLoading && (
          <Link to="/reports" className="font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
            {s.actual.delivered} of {s.scheduledTotal} meals · {formatPercent(s.actual.successRate)} →
          </Link>
        )}
      </div>
    </Card>
  );
}
