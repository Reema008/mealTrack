import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BillSheet, periodTitle } from '../components/BillSheet';
import { CategoryTile, DailyChart, SplitBar, StatCard } from '../components/Charts';
import { ReportDetailSheet } from '../components/ReportDetail';
import { useToast } from '../components/Toast';
import { Button, Card, CurryIcon, ErrorNote, NonVegIcon, Spinner, TextField, VegIcon } from '../components/ui';
import { billingPeriodFor, computeBill, dayRows, shiftPeriod, type BillingPeriod } from '../domain/billing';
import { addDays, endOfWeek, formatLong, formatShort, isISODate, startOfMonth, startOfWeek } from '../domain/dates';
import { computeStats, formatPercent, listMeals, type ReportMetric } from '../domain/stats';
import { formatAmount, subscriptionMonths } from '../domain/subscription';
import { useHousehold } from '../data/household';
import { useOverrides } from '../data/meals';
import { useSubscriptions } from '../data/subscriptions';
import { buildReportPdf, saveFile } from '../lib/reportPdf';

type Mode = 'month' | 'week' | 'custom';
const MAX_CUSTOM_DAYS = 366;
const MODE_LABEL: Record<Mode, string> = { month: 'Monthly', week: 'Weekly', custom: 'Custom' };

export function ReportsPage() {
  const { today, nowMinutes, billing } = useHousehold();
  const toast = useToast();
  const [params] = useSearchParams();
  const requested = params.get('period');
  const [detail, setDetail] = useState<ReportMetric | null>(null);
  const [mode, setMode] = useState<Mode>('month');
  const [anchor, setAnchor] = useState(requested && isISODate(requested) ? requested : today);
  const [customStart, setCustomStart] = useState(startOfMonth(today));
  const [customEnd, setCustomEnd] = useState(today);
  const [bill, setBill] = useState<BillingPeriod | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Only the subscribed months: from the first payment (October) to this month, or a later paid month.
  const subs = useSubscriptions();
  const months = subscriptionMonths(subs.data ?? [], today, billing.billingDay).reverse(); // oldest first
  const firstDay = months[0].start;
  const lastDay = months[months.length - 1].end;
  const day = subs.isLoading ? anchor : anchor < firstDay ? firstDay : anchor > lastDay ? lastDay : anchor;

  let start: string;
  let end: string;
  let title: string;
  let rangeError: string | null = null;
  const month = billingPeriodFor(day, billing.billingDay);
  if (mode === 'month') {
    start = month.start;
    end = month.end;
    title = periodTitle(month, billing.billingDay);
  } else if (mode === 'week') {
    start = startOfWeek(day);
    end = endOfWeek(day);
    title = `${formatShort(start)} – ${formatShort(end)}`;
  } else {
    start = customStart;
    end = customEnd;
    title = 'Custom range';
    if (!isISODate(start) || !isISODate(end)) rangeError = 'Choose a start and end date.';
    else if (end < start) rangeError = 'The end date must be on or after the start date.';
    else if (addDays(start, MAX_CUSTOM_DAYS) < end) rangeError = 'Please choose a range of one year or less.';
    else if (start < firstDay || end > lastDay) rangeError = `Choose dates within the subscription: ${formatShort(firstDay)} to ${formatShort(lastDay)}.`;
    if (rangeError) {
      start = today;
      end = today;
    }
  }

  const { map, pendingKeys, isLoading, error, refetch } = useOverrides(start, end);
  const s = computeStats(start, end, map, today, nowMinutes);
  const meals = listMeals(start, end, map, today, nowMinutes);
  const money = computeBill(start, end, map, today, nowMinutes, billing);
  const rangeLabel = mode === 'custom' ? `${formatShort(start)} – ${formatShort(end)}` : title;
  const open = (m: ReportMetric) => () => setDetail(m);
  const a = s.actual;

  const shift = (delta: number) => {
    if (mode === 'month') setAnchor(shiftPeriod(month, delta, billing.billingDay).start);
    else setAnchor(addDays(start, 7 * delta));
  };
  const canPrev = start > firstDay;
  const canNext = end < lastDay;

  async function download() {
    setDownloading(true);
    try {
      const file = await buildReportPdf({
        title: mode === 'custom' ? `${formatShort(start)} – ${formatShort(end)}` : title,
        start,
        end,
        bill: money,
        rows: dayRows(start, end, map, today, nowMinutes, billing),
        settings: billing,
        isSubscriptionPeriod: mode === 'month',
        generatedOn: formatLong(today),
      });
      await saveFile(file);
    } catch (e) {
      toast(`Could not create the PDF: ${(e as Error).message}`, 'error');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl">Reports</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">Tap any box to see the dates behind it.</p>
      </div>
      <div className="taro-card flex flex-wrap gap-1 rounded-3xl p-1" role="tablist" aria-label="Report period">
        {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setAnchor(today);
            }}
            className={`min-h-10 flex-1 whitespace-nowrap rounded-full px-3 text-sm font-semibold ${mode === m ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}
          >
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      {mode === 'custom' ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3">
          <TextField id="from" label="From" type="date" min={firstDay} max={lastDay} value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
          <TextField id="to" label="To" type="date" min={firstDay} max={lastDay} value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => shift(-1)}
            disabled={!canPrev}
            className="min-h-11 min-w-11 shrink-0 rounded-xl text-lg hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-white/10"
            aria-label={`Previous ${mode}`}
          >
            ←
          </button>
          <div className="min-w-0 text-center" aria-live="polite">
            <p className="font-display text-lg">{title}</p>
            {mode === 'month' && billing.billingDay !== 1 && (
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {formatShort(start)} – {formatShort(end)}
              </p>
            )}
          </div>
          <button
            onClick={() => shift(1)}
            disabled={!canNext}
            className="min-h-11 min-w-11 shrink-0 rounded-xl text-lg hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-white/10"
            aria-label={`Next ${mode}`}
          >
            →
          </button>
        </div>
      )}

      {mode === 'month' && months.length > 1 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Subscribed months">
          {months.map((p) => {
            const on = p.start === month.start;
            return (
              <button
                key={p.start}
                type="button"
                aria-pressed={on}
                onClick={() => setAnchor(p.start)}
                className={`min-h-9 shrink-0 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold ${
                  on ? 'bg-emerald-600 text-white shadow-sm' : 'taro-inset text-slate-700 dark:text-slate-200'
                }`}
              >
                {periodTitle(p, billing.billingDay)}
              </button>
            );
          })}
        </div>
      )}

      {!rangeError && !error && !isLoading && (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl">{mode === 'month' ? 'Amount' : 'Amount change'}</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {money.missedMeals.length} cancelled meal{money.missedMeals.length === 1 ? '' : 's'} (− {formatAmount(money.mealDeductions)}) ·{' '}
                {money.addedCurries.length} extra curr{money.addedCurries.length === 1 ? 'y' : 'ies'} (+ {formatAmount(money.curryCharges)})
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-2xl leading-none">{mode === 'month' ? formatAmount(money.nextAmount) : `${money.curryCharges >= money.mealDeductions ? '+' : '−'} ${formatAmount(Math.abs(money.curryCharges - money.mealDeductions))}`}</p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {mode === 'month' ? `${formatAmount(money.base)} − ${formatAmount(money.mealDeductions)} + ${formatAmount(money.curryCharges)}, for next month` : 'curries added − cancelled meals'}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            {mode === 'month' && (
              <Button variant="secondary" onClick={() => setBill(month)}>
                Missed dates
              </Button>
            )}
            <Button disabled={downloading} onClick={() => void download()}>
              {downloading ? 'Preparing PDF…' : 'Download report (PDF)'}
            </Button>
          </div>
        </Card>
      )}

      {rangeError ? (
        <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{rangeError}</p>
      ) : error ? (
        <ErrorNote error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Spinner label="Calculating" />
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
            <StatCard label="Delivery success" emoji="✨" tint="sage" value={formatPercent(a.successRate)} hint={`${a.delivered} of ${a.meals} meals so far`} onClick={open('success')} />
            <StatCard label="Delivered" emoji="💜" tint="cream" value={a.delivered} hint={a.deliveredExplicit ? `${a.deliveredExplicit} edited` : 'as scheduled'} onClick={open('delivered')} />
            <StatCard label="Cancelled" emoji="🚫" tint="blush" value={a.notReceived} hint={`${money.missedMeals.filter((l) => l.cancelledBy !== 'you').length} by sender · ${money.missedMeals.filter((l) => l.cancelledBy === 'you').length} by you`} onClick={open('notReceived')} />
            <StatCard label="Scheduled meals" emoji="🗓️" tint="lavender" value={s.scheduledTotal} hint={`${s.scheduledLunch} lunch · ${s.scheduledDinner} dinner`} onClick={open('scheduled')} />
            <StatCard label="Scheduled days" emoji="📅" tint="cream" value={s.scheduledDays} hint="Sundays excluded" onClick={open('scheduledDays')} />
            {s.pending > 0 && <StatCard label="Pending today" emoji="💫" tint="butter" value={s.pending} hint="lunch 2 PM · dinner 10 PM" onClick={open('pending')} />}
            <StatCard label="Planned" emoji="🔮" tint="lavender" value={s.planned.meals} hint="future, not counted yet" onClick={open('planned')} />
            <StatCard label="Extra curries" emoji={<CurryIcon className="h-6 w-6" />} tint="peach" value={a.extraCurryReceived} hint={`${money.curriesAdded.chicken.count} chicken · ${money.curriesAdded.egg.count} egg · ${a.extraCurryMissing} missing`} onClick={open('extraCurry')} />
          </div>

          <section aria-labelledby="by-category" className="space-y-3">
            <h2 id="by-category" className="text-xl">By category</h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
              <CategoryTile label="Veg" emoji={<VegIcon className="inline h-[1em] w-[1em] align-[-0.1em] text-emerald-600 dark:text-emerald-300" />} tint="sage" stats={s.categories.veg} onClick={open('veg')} />
              <CategoryTile label="Non-Veg" emoji={<NonVegIcon className="inline h-[1em] w-[1em] align-[-0.1em] text-emerald-800 dark:text-emerald-100" />} tint="peach" stats={s.categories.nonveg} onClick={open('nonveg')} />
              <CategoryTile label="Lunch" emoji="☀️" tint="butter" stats={s.categories.lunch} onClick={open('lunch')} />
              <CategoryTile label="Dinner" emoji="🌙" tint="lavender" stats={s.categories.dinner} onClick={open('dinner')} />
            </div>
          </section>

          <Card className="space-y-5">
            <SplitBar
              title="Meal outcomes"
              parts={[
                { label: 'Delivered (edited)', value: a.deliveredExplicit, className: 'st-delivered' },
                { label: 'Delivered (as scheduled)', value: a.deliveredAssumed, className: 'st-delivered-soft' },
                { label: 'Cancelled', value: a.notReceived, className: 'st-missed' },
                { label: 'Pending', value: s.pending, className: 'st-pending' },
                { label: 'Planned', value: s.planned.meals, className: 'st-planned' },
              ]}
            />
            <DailyChart daily={s.daily} />
          </Card>

          <details className="taro-card-alt rounded-[1.6rem] p-5 text-sm text-slate-700 dark:text-slate-200">
            <summary className="cursor-pointer font-semibold">How these numbers are calculated</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Monday–Saturday have lunch and dinner; Sundays are never counted.</li>
              <li>Meals nobody changed count as <strong>delivered as scheduled</strong> (with extra curries on Tue/Wed/Fri). {a.assumedMeals} of {a.meals} meals here are as scheduled.</li>
              <li>Tap a box to see its meals; use <strong>All / Veg / Non-Veg</strong> there to show only veg days (Mon, Thu, Sat) or non-veg days (Tue, Wed, Fri).</li>
              <li>Extra curries count only non-veg meals that were delivered.</li>
              <li>Today’s meals stay <strong>pending</strong> until 2 PM (lunch) and 10 PM (dinner) unless someone marks them.</li>
              <li>Future meals are <strong>planned</strong>. They are left out of delivered totals and the success rate.</li>
              <li>Extra curries are counted for each non-veg meal; a cancelled meal had no extra curries.</li>
              <li>Success rate = delivered ÷ meals with an outcome so far (pending and planned meals are left out).</li>
            </ul>
            {s.planned.meals > 0 && (
              <p className="mt-2">Planned in this range: {s.planned.chicken} chicken, {s.planned.egg} egg, {s.planned.extraCurry} extra curries{s.planned.notExpected ? `, ${s.planned.notExpected} marked not expected` : ''}.</p>
            )}
          </details>
        </>
      )}
      {detail && (
        <ReportDetailSheet metric={detail} meals={meals} pendingKeys={pendingKeys} rangeLabel={rangeLabel} onClose={() => setDetail(null)} />
      )}
      {bill && <BillSheet initial={bill} onClose={() => setBill(null)} />}
    </div>
  );
}
