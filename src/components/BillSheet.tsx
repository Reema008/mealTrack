import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { billingPeriodFor, computeBill, CURRY_LABEL, dayRows, shiftPeriod, type BillingPeriod, type BillLine } from '../domain/billing';
import { formatLong, formatMonth, formatShort } from '../domain/dates';
import { PERIOD_LABEL } from '../domain/schedule';
import { formatAmount, paymentFor, type SubscriptionRecord } from '../domain/subscription';
import { addSubscription, updateSubscription } from '../data/api';
import { useHousehold } from '../data/household';
import { useOverrides } from '../data/meals';
import { subscriptionsKey, useSubscriptions } from '../data/subscriptions';
import { buildReportPdf, saveFile } from '../lib/reportPdf';
import { useToast } from './Toast';
import { Button, CurryIcon, Spinner } from './ui';

/** "November 2026" when subscriptions start on the 1st, otherwise "5 Nov – 4 Dec". */
export function periodTitle(p: BillingPeriod, billingDay: number): string {
  return billingDay === 1 ? formatMonth(p.start) : `${formatShort(p.start)} – ${formatShort(p.end)}`;
}

function Line({ line }: { line: BillLine }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="min-w-0">
        <span className="font-semibold">{formatShort(line.date)}</span> · {PERIOD_LABEL[line.period]} ·{' '}
        {line.kind === 'meal' ? `${line.dayType === 'veg' ? 'Veg' : 'Non-veg'} meal not delivered` : `${CURRY_LABEL[line.curryType ?? 'chicken']} missing`}
      </span>
      <span className="shrink-0 font-semibold tabular-nums">− {formatAmount(line.amount)}</span>
    </li>
  );
}

/**
 * The bill for one monthly subscription: every missed meal and missed extra
 * curry with its date and price, and the amount for the next subscription.
 */
export function BillSheet({ initial, onClose }: { initial: BillingPeriod; onClose: () => void }) {
  const { household, billing, today, nowMinutes } = useHousehold();
  const qc = useQueryClient();
  const toast = useToast();
  const subs = useSubscriptions();
  const [period, setPeriod] = useState(initial);
  const [busy, setBusy] = useState<'pdf' | 'pay' | null>(null);
  const { map, isLoading } = useOverrides(period.start, period.end);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  const bill = computeBill(period.start, period.end, map, today, nowMinutes, billing);
  const next = billingPeriodFor(period.renewsOn, billing.billingDay);
  const finished = period.end < today;
  const nextPayment = paymentFor(subs.data ?? [], next, billing.billingDay);
  const title = periodTitle(period, billing.billingDay);
  const nextTitle = periodTitle(next, billing.billingDay);

  async function download() {
    setBusy('pdf');
    try {
      const file = await buildReportPdf({
        title,
        start: period.start,
        end: period.end,
        bill,
        rows: dayRows(period.start, period.end, map, today, nowMinutes, billing),
        settings: billing,
        isSubscriptionPeriod: true,
        generatedOn: formatLong(today),
      });
      await saveFile(file);
    } catch (e) {
      toast(`Could not create the PDF: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function recordPayment() {
    setBusy('pay');
    try {
      const saved = nextPayment
        ? await updateSubscription(nextPayment.id, next.start, bill.nextAmount)
        : await addSubscription(household.id, next.start, bill.nextAmount);
      qc.setQueryData<SubscriptionRecord[]>(subscriptionsKey(household.id), (old) => [...(old ?? []).filter((r) => r.id !== saved.id), saved]);
      void qc.invalidateQueries({ queryKey: subscriptionsKey(household.id) });
      toast(`Saved ${formatAmount(bill.nextAmount)} as the ${nextTitle} payment.`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="presentation">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bill-title"
        className="relative flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-[2rem] bg-slate-50 shadow-soft dark:bg-slate-900 sm:rounded-[2rem]"
      >
        <div className="border-b border-slate-200/70 p-5 pb-3 dark:border-white/10">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="bill-title" className="text-2xl">Next subscription amount</h2>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                Based on {title} ({formatShort(period.start)} – {formatShort(period.end)})
              </p>
            </div>
            <Button variant="secondary" className="min-h-9 shrink-0 px-3" onClick={onClose} aria-label="Close">
              ✕
            </Button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <Button variant="ghost" className="min-h-9 px-3 text-xs" onClick={() => setPeriod(shiftPeriod(period, -1, billing.billingDay))}>
              ← Earlier
            </Button>
            <span className="text-sm font-semibold">{title}</span>
            <Button variant="ghost" className="min-h-9 px-3 text-xs" onClick={() => setPeriod(shiftPeriod(period, 1, billing.billingDay))}>
              Later →
            </Button>
          </div>
        </div>

        <div className="space-y-4 overflow-y-auto p-5 pt-4">
          {isLoading ? (
            <Spinner label="Calculating" />
          ) : (
            <>
              <section className="taro-card rounded-[1.4rem] p-4" aria-label="Calculation">
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt>Monthly subscription</dt>
                    <dd className="font-semibold tabular-nums">{formatAmount(bill.base)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>
                      Missed meals <span className="text-slate-500 dark:text-slate-300">({bill.missedMeals.length})</span>
                    </dt>
                    <dd className="font-semibold tabular-nums">− {formatAmount(bill.mealDeductions)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>
                      Missed extra curries <span className="text-slate-500 dark:text-slate-300">({bill.missedCurries.length})</span>
                    </dt>
                    <dd className="font-semibold tabular-nums">− {formatAmount(bill.curryDeductions)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-slate-900/10 pt-2 dark:border-white/10">
                    <dt className="font-display text-lg">For {nextTitle}</dt>
                    <dd className="font-display text-2xl tabular-nums">{formatAmount(bill.nextAmount)}</dd>
                  </div>
                </dl>
                {!finished && (
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                    {title} is not over yet: this is the amount so far. {bill.notYetCounted} meal{bill.notYetCounted === 1 ? '' : 's'} still to come will be
                    counted as they happen.
                  </p>
                )}
              </section>

              <section aria-labelledby="missed-meals">
                <h3 id="missed-meals" className="font-display text-lg">
                  Missed meals · − {formatAmount(bill.mealDeductions)}
                </h3>
                {bill.missedMeals.length === 0 ? (
                  <p className="text-sm text-slate-600 dark:text-slate-300">No meals were missed. ✿</p>
                ) : (
                  <ul className="divide-y divide-slate-900/5 dark:divide-white/10">
                    {bill.missedMeals.map((l) => (
                      <Line key={`${l.date}-${l.period}`} line={l} />
                    ))}
                  </ul>
                )}
              </section>

              <section aria-labelledby="missed-curries">
                <h3 id="missed-curries" className="flex items-center gap-1.5 font-display text-lg">
                  <CurryIcon className="h-5 w-5" /> Missed extra curries · − {formatAmount(bill.curryDeductions)}
                </h3>
                {bill.missedCurries.length === 0 ? (
                  <p className="text-sm text-slate-600 dark:text-slate-300">Every extra curry came. ✿</p>
                ) : (
                  <ul className="divide-y divide-slate-900/5 dark:divide-white/10">
                    {bill.missedCurries.map((l) => (
                      <Line key={`${l.date}-${l.period}`} line={l} />
                    ))}
                  </ul>
                )}
              </section>

              <p className="text-xs text-slate-600 dark:text-slate-300">
                Prices: veg meal {formatAmount(billing.vegMeal)}, non-veg meal {formatAmount(billing.nonvegMeal)}, chicken curry{' '}
                {formatAmount(billing.chickenCurry)}, egg curry {formatAmount(billing.eggCurry)}. Received: {bill.delivered.veg + bill.delivered.nonveg} meals,{' '}
                {bill.curriesReceived.chicken} chicken and {bill.curriesReceived.egg} egg curries.
              </p>
              {nextPayment && (
                <p className="text-sm font-semibold">
                  {nextTitle} payment saved: {formatAmount(nextPayment.amount)}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200/70 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] dark:border-white/10">
          <Button variant="secondary" disabled={busy !== null || isLoading} onClick={() => void download()}>
            {busy === 'pdf' ? 'Preparing PDF…' : 'Download PDF'}
          </Button>
          <Button disabled={busy !== null || isLoading} onClick={() => void recordPayment()}>
            {busy === 'pay' ? 'Saving…' : nextPayment ? `Update ${nextTitle} payment` : `Save as ${nextTitle} payment`}
          </Button>
        </div>
      </div>
    </div>
  );
}
