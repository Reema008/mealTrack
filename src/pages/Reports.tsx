import { useState } from 'react';
import { CategoryTile, DailyChart, SplitBar, StatCard } from '../components/Charts';
import { Card, ErrorNote, Spinner, TextField } from '../components/ui';
import { addDays, addMonths, endOfMonth, endOfWeek, formatMonth, formatShort, isISODate, startOfMonth, startOfWeek } from '../domain/dates';
import { computeStats, formatPercent, listMeals, type ReportMetric } from '../domain/stats';
import { subscriptionPeriods } from '../domain/subscription';
import { useSubscriptions } from '../data/subscriptions';
import { useSearchParams } from 'react-router-dom';
import { ReportDetailSheet } from '../components/ReportDetail';
import { useHousehold } from '../data/household';
import { useOverrides } from '../data/meals';

type Mode = 'subscription' | 'week' | 'month' | 'custom';
const MAX_CUSTOM_DAYS = 366;

export function ReportsPage() {
  const { today, nowMinutes } = useHousehold();
  const [params] = useSearchParams();
  const periods = subscriptionPeriods(useSubscriptions().data ?? []);
  const hasPeriods = periods.length > 0;
  const requested = params.get('period');
  const latestStarted = Math.max(0, periods.filter((p) => p.start <= today).length - 1);
  const currentPeriod = requested && periods.some((p) => p.start === requested) ? periods.findIndex((p) => p.start === requested) : latestStarted;
  const [detail, setDetail] = useState<ReportMetric | null>(null);
  const [chosenMode, setMode] = useState<Mode | null>(null);
  const mode: Mode = chosenMode ?? (hasPeriods ? 'subscription' : 'week');
  const [chosenIndex, setPeriodIndex] = useState<number | null>(null);
  const periodIndex = Math.min(Math.max(chosenIndex ?? currentPeriod, 0), Math.max(periods.length - 1, 0));
  const [anchor, setAnchor] = useState(today);
  const [customStart, setCustomStart] = useState(startOfMonth(today));
  const [customEnd, setCustomEnd] = useState(today);

  let start: string;
  let end: string;
  let title: string;
  let rangeError: string | null = null;
  if (mode === 'subscription' && hasPeriods) {
    const p = periods[periodIndex];
    start = p.start;
    end = p.end;
    title = `${formatShort(start)} – ${formatShort(end)}`;
  } else if (mode === 'week') {
    start = startOfWeek(anchor);
    end = endOfWeek(anchor);
    title = `${formatShort(start)} – ${formatShort(end)}`;
  } else if (mode === 'month') {
    start = startOfMonth(anchor);
    end = endOfMonth(anchor);
    title = formatMonth(anchor);
  } else {
    start = customStart;
    end = customEnd;
    title = 'Custom range';
    if (!isISODate(start) || !isISODate(end)) rangeError = 'Choose a start and end date.';
    else if (end < start) rangeError = 'The end date must be on or after the start date.';
    else if (addDays(start, MAX_CUSTOM_DAYS) < end) rangeError = 'Please choose a range of one year or less.';
    if (rangeError) {
      start = today;
      end = today;
    }
  }

  const { map, pendingKeys, isLoading, error, refetch } = useOverrides(start, end);
  const s = computeStats(start, end, map, today, nowMinutes);
  const meals = listMeals(start, end, map, today, nowMinutes);
  const rangeLabel = mode === 'custom' ? `${formatShort(start)} – ${formatShort(end)}` : title;
  const open = (m: ReportMetric) => () => setDetail(m);
  const a = s.actual;

  const shift = (delta: number) => {
    if (mode === 'subscription') setPeriodIndex(Math.min(Math.max(periodIndex + delta, 0), periods.length - 1));
    else setAnchor(mode === 'week' ? addDays(anchor, 7 * delta) : addMonths(anchor, delta));
  };
  const modes: Mode[] = hasPeriods ? ['subscription', 'week', 'month', 'custom'] : ['week', 'month', 'custom'];
  const MODE_LABEL: Record<Mode, string> = { subscription: '4 weeks', week: 'Weekly', month: 'Monthly', custom: 'Custom' };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl">Reports</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">Tap any box to see the dates behind it.</p>
      </div>
      <div className="flex flex-wrap gap-1 rounded-3xl bg-white/70 p-1 shadow-soft ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-slate-700" role="tablist" aria-label="Report period">
        {modes.map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setAnchor(today);
              setPeriodIndex(null);
            }}
            className={`min-h-10 flex-1 whitespace-nowrap rounded-full px-3 text-sm font-semibold capitalize ${mode === m ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
          >
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      {mode === 'custom' ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3">
          <TextField id="from" label="From" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
          <TextField id="to" label="To" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => shift(-1)} className="min-h-11 min-w-11 shrink-0 rounded-xl text-lg hover:bg-slate-200 dark:hover:bg-slate-800" aria-label={mode === 'subscription' ? 'Previous period' : `Previous ${mode}`}>←</button>
          <div className="min-w-0 text-center" aria-live="polite">
            <p className="font-display text-lg">{title}</p>
            {mode === 'subscription' && (
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Subscription {periodIndex + 1} of {periods.length}
                {periods[periodIndex]?.record.amount != null && ` · ₹${periods[periodIndex].record.amount!.toLocaleString('en-IN')}`}
              </p>
            )}
          </div>
          <button onClick={() => shift(1)} className="min-h-11 min-w-11 shrink-0 rounded-xl text-lg hover:bg-slate-200 dark:hover:bg-slate-800" aria-label={mode === 'subscription' ? 'Next period' : `Next ${mode}`}>→</button>
        </div>
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
            <StatCard label="Delivered" emoji="🥡" tint="cream" value={a.delivered} hint={a.deliveredExplicit ? `${a.deliveredExplicit} edited` : 'as scheduled'} onClick={open('delivered')} />
            <StatCard label="Not received" emoji="🚫" tint="blush" value={a.notReceived} hint="tap for the dates" onClick={open('notReceived')} />
            <StatCard label="Scheduled meals" emoji="🗓️" tint="lavender" value={s.scheduledTotal} hint={`${s.scheduledLunch} lunch · ${s.scheduledDinner} dinner`} onClick={open('scheduled')} />
            <StatCard label="Scheduled days" emoji="📅" tint="cream" value={s.scheduledDays} hint="Sundays excluded" onClick={open('scheduledDays')} />
            {s.pending > 0 && <StatCard label="Pending today" emoji="⏳" tint="butter" value={s.pending} hint="lunch 2 PM · dinner 10 PM" onClick={open('pending')} />}
            <StatCard label="Planned" emoji="🔮" tint="lavender" value={s.planned.meals} hint="future, not counted yet" onClick={open('planned')} />
            <StatCard label="Extra curries" emoji="🍛" tint="peach" value={a.extraCurryReceived} hint={`of ${a.nonVegMeals} delivered non-veg · ${a.extraCurryMissing} missing`} onClick={open('extraCurry')} />
          </div>

          <section aria-labelledby="by-category" className="space-y-3">
            <h2 id="by-category" className="text-xl">By category</h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
              <CategoryTile label="Veg" emoji="🥗" tint="sage" stats={s.categories.veg} onClick={open('veg')} />
              <CategoryTile label="Non-Veg" emoji="🍗" tint="peach" stats={s.categories.nonveg} onClick={open('nonveg')} />
              <CategoryTile label="Lunch" emoji="☀️" tint="butter" stats={s.categories.lunch} onClick={open('lunch')} />
              <CategoryTile label="Dinner" emoji="🌙" tint="lavender" stats={s.categories.dinner} onClick={open('dinner')} />
            </div>
          </section>

          <Card className="space-y-5">
            <SplitBar
              title="Meal outcomes"
              parts={[
                { label: 'Delivered (edited)', value: a.deliveredExplicit, className: 'bg-emerald-500' },
                { label: 'Delivered (as scheduled)', value: a.deliveredAssumed, className: 'bg-emerald-300' },
                { label: 'Not received', value: a.notReceived, className: 'bg-rose-400' },
                { label: 'Pending', value: s.pending, className: 'bg-amber-300' },
                { label: 'Planned', value: s.planned.meals, className: 'bg-sky-300' },
              ]}
            />
            <DailyChart daily={s.daily} />
          </Card>

          <details className="rounded-3xl bg-white/85 p-5 shadow-soft text-sm text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
            <summary className="cursor-pointer font-semibold">How these numbers are calculated</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Monday–Saturday have lunch and dinner; Sundays are never counted.</li>
              <li>Meals nobody changed count as <strong>delivered as scheduled</strong> (with extra curries on Tue/Wed/Fri). {a.assumedMeals} of {a.meals} meals here are as scheduled.</li>
              <li>Tap a box to see its meals; use <strong>All / Veg / Non-Veg</strong> there to show only veg days (Mon, Thu, Sat) or non-veg days (Tue, Wed, Fri).</li>
              <li>Extra curries count only non-veg meals that were delivered.</li>
              <li>Today’s meals stay <strong>pending</strong> until 2 PM (lunch) and 10 PM (dinner) unless someone marks them.</li>
              <li>Future meals are <strong>planned</strong>. They are left out of delivered totals and the success rate.</li>
              <li>Extra curries are counted for each non-veg meal; a meal that was not delivered had no extra curries.</li>
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
    </div>
  );
}
