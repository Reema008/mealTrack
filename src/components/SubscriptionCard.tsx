import { useState } from 'react';
import { Link } from 'react-router-dom';
import { billingPeriodFor, computeBill, shiftPeriod, type BillingPeriod } from '../domain/billing';
import { formatShort } from '../domain/dates';
import { formatAmount, paymentFor, periodProgress } from '../domain/subscription';
import { useHousehold } from '../data/household';
import { useOverrides } from '../data/meals';
import { useSubscriptions } from '../data/subscriptions';
import { BillSheet, periodTitle } from './BillSheet';
import { Button, Card } from './ui';

/** Days at the start of a month during which an unpaid subscription shows "Renewal due". */
const DUE_DAYS = 10;
/** Days before the end of a month when the card reminds about renewal. */
const SOON_DAYS = 4;

/** This month's subscription: progress, deductions so far, and the renewal reminder with a Calculate button. */
export function SubscriptionCard() {
  const { today, nowMinutes, billing } = useHousehold();
  const subs = useSubscriptions();
  const current = billingPeriodFor(today, billing.billingDay);
  const previous = shiftPeriod(current, -1, billing.billingDay);
  const { map, isLoading } = useOverrides(previous.start, current.end);
  const [sheet, setSheet] = useState<BillingPeriod | null>(null);

  if (subs.isLoading) return null;

  const { day, daysLeft } = periodProgress(current, today);
  const paid = paymentFor(subs.data ?? [], current, billing.billingDay);
  const title = periodTitle(current, billing.billingDay);
  const due = !paid && day <= DUE_DAYS;
  const soon = daysLeft < SOON_DAYS;
  const billed = due ? previous : current;
  const bill = computeBill(billed.start, billed.end, map, today, nowMinutes, billing);
  const pct = Math.round((day / current.days) * 100);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl">{due ? 'Renewal due' : soon ? 'Renewing soon' : 'Subscription'}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {due ? (
              <>
                Pay for <strong className="text-slate-900 dark:text-slate-50">{title}</strong>. {periodTitle(previous, billing.billingDay)}'s missed meals and
                curries are taken off {formatAmount(billing.monthlyAmount)}.
              </>
            ) : (
              <>
                {formatShort(current.start)} – {formatShort(current.end)} ·{' '}
                <strong className="text-slate-900 dark:text-slate-50">{formatAmount(paid?.amount ?? billing.monthlyAmount)}</strong>
                {paid ? ' paid' : ''}
              </>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl leading-none">{daysLeft === 0 ? 'Last day' : `${daysLeft} days left`}</p>
          <p className="text-xs text-slate-600 dark:text-slate-300">renews {formatShort(current.renewsOn)}</p>
        </div>
      </div>

      <div
        className="mt-3 h-3 overflow-hidden rounded-full bg-white/80 ring-1 ring-slate-200/70 dark:bg-white/10 dark:ring-white/10"
        role="progressbar"
        aria-label="Subscription progress"
        aria-valuemin={1}
        aria-valuemax={current.days}
        aria-valuenow={day}
      >
        <div className="taro-grow h-full rounded-full bg-gradient-to-r from-emerald-300 to-emerald-500" style={{ width: `${pct}%` }} />
      </div>

      <div className="taro-inset mt-3 rounded-2xl p-3 text-sm">
        {isLoading ? (
          <span className="text-slate-600 dark:text-slate-300">Calculating…</span>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {due ? `Amount for ${title}` : 'Next amount so far'}:{' '}
              <strong className="font-display text-lg">{formatAmount(bill.nextAmount)}</strong>
              <span className="block text-xs text-slate-600 dark:text-slate-300">
                {bill.missedMeals.length} missed meal{bill.missedMeals.length === 1 ? '' : 's'} · {bill.missedCurries.length} missed curr
                {bill.missedCurries.length === 1 ? 'y' : 'ies'} · − {formatAmount(bill.totalDeductions)}
              </span>
            </span>
            <Button className="min-h-10 px-4" onClick={() => setSheet(billed)}>
              Calculate
            </Button>
          </div>
        )}
      </div>

      <div className="mt-2 text-right">
        <Link to="/subscriptions" className="text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
          Subscriptions & prices →
        </Link>
      </div>
      {sheet && <BillSheet initial={sheet} onClose={() => setSheet(null)} />}
    </Card>
  );
}
