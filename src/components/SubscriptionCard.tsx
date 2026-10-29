import { Link } from 'react-router-dom';
import { formatShort } from '../domain/dates';
import { computeStats, formatPercent } from '../domain/stats';
import { formatAmount, subscriptionStatus } from '../domain/subscription';
import { useHousehold } from '../data/household';
import { useOverrides } from '../data/meals';
import { useSubscriptions } from '../data/subscriptions';
import { Card } from './ui';

const linkButton =
  'shrink-0 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-soft hover:bg-emerald-700';

/** Current 4-week subscription: progress, amount, renewal date and deliveries so far. */
export function SubscriptionCard() {
  const { today, nowMinutes } = useHousehold();
  const subs = useSubscriptions();
  const status = subscriptionStatus(subs.data ?? [], today);
  const period = status.kind === 'none' ? null : status.period;
  const { map, isLoading } = useOverrides(period?.start ?? today, period?.end ?? today);

  if (subs.isLoading) return null;

  if (status.kind === 'none') {
    return (
      <Card className="bg-gradient-to-br from-amber-50/90 to-white/80 dark:from-amber-950/40 dark:to-slate-900/80">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl">Subscription</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">Record your renewal date and amount to track each 4-week subscription.</p>
          </div>
          <Link to="/subscriptions" className={linkButton}>Add</Link>
        </div>
      </Card>
    );
  }

  if (status.kind === 'ended') {
    return (
      <Card className="bg-gradient-to-br from-rose-50/90 to-white/80 dark:from-rose-950/40 dark:to-slate-900/80">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl">Renewal due</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              The last subscription ended on {formatShort(status.period.end)} ({formatAmount(status.period.record.amount)}).
            </p>
          </div>
          <Link to="/subscriptions" className={linkButton}>Renew</Link>
        </div>
      </Card>
    );
  }

  if (status.kind === 'upcoming') {
    return (
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl">Subscription</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Next subscription starts {formatShort(status.period.start)} · {formatAmount(status.period.record.amount)}
            </p>
          </div>
          <Link to="/subscriptions" className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">History →</Link>
        </div>
      </Card>
    );
  }

  const { day, daysLeft } = status;
  const p = status.period;
  const s = computeStats(p.start, p.end, map, today, nowMinutes);
  const pct = Math.round((day / p.days) * 100);

  return (
    <Card className="bg-gradient-to-br from-emerald-50/90 via-white/80 to-sky-50/80 dark:from-emerald-950/40 dark:via-slate-900/80 dark:to-sky-950/40">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl">Subscription</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {formatShort(p.start)} – {formatShort(p.end)} · <strong className="text-slate-900 dark:text-slate-100">{formatAmount(p.record.amount)}</strong>
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl leading-none">{daysLeft === 0 ? 'Last day' : `${daysLeft} days left`}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">renews {formatShort(p.renewsOn)}</p>
        </div>
      </div>
      <div
        className="mt-3 h-3 overflow-hidden rounded-full bg-white/80 ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-slate-700"
        role="progressbar"
        aria-label="Subscription progress"
        aria-valuemin={1}
        aria-valuemax={p.days}
        aria-valuenow={day}
      >
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-slate-600 dark:text-slate-400">
          Day <strong className="text-slate-900 dark:text-slate-100">{day}</strong> of {p.days}
          {!isLoading && <> · {s.actual.delivered} of {s.scheduledTotal} meals ({formatPercent(s.actual.successRate)})</>}
        </span>
        <Link to="/subscriptions" className="font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
          History →
        </Link>
      </div>
    </Card>
  );
}
