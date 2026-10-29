import { useState } from 'react';
import { DailyChart, SplitBar, StatCard } from '../components/Charts';
import { Card, ErrorNote, Spinner, TextField } from '../components/ui';
import { addDays, addMonths, endOfMonth, endOfWeek, formatMonth, formatShort, isISODate, startOfMonth, startOfWeek } from '../domain/dates';
import { computeStats, formatPercent, listMeals, type ReportMetric } from '../domain/stats';
import { periodAt, periodFor } from '../domain/subscription';
import { ReportDetailSheet } from '../components/ReportDetail';
import { useHousehold } from '../data/household';
import { useOverrides } from '../data/meals';

type Mode = 'subscription' | 'week' | 'month' | 'custom';
const MAX_CUSTOM_DAYS = 366;

export function ReportsPage() {
  const { today, nowMinutes, household } = useHousehold();
  const renewal = household.subscription_start;
  const [detail, setDetail] = useState<ReportMetric | null>(null);
  const [mode, setMode] = useState<Mode>(renewal ? 'subscription' : 'week');
  const currentPeriod = renewal ? periodFor(renewal, today).index : 0;
  const [periodIndex, setPeriodIndex] = useState(currentPeriod);
  const [anchor, setAnchor] = useState(today);
  const [customStart, setCustomStart] = useState(startOfMonth(today));
  const [customEnd, setCustomEnd] = useState(today);

  let start: string;
  let end: string;
  let title: string;
  let rangeError: string | null = null;
  if (mode === 'subscription' && renewal) {
    const p = periodAt(renewal, periodIndex);
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
    if (mode === 'subscription') setPeriodIndex((i) => i + delta);
    else setAnchor(mode === 'week' ? addDays(anchor, 7 * delta) : addMonths(anchor, delta));
  };
  const modes: Mode[] = renewal ? ['subscription', 'week', 'month', 'custom'] : ['week', 'month', 'custom'];
  const MODE_LABEL: Record<Mode, string> = { subscription: '4 weeks', week: 'Weekly', month: 'Monthly', custom: 'Custom' };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl">Reports</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">Tap any box to see the dates behind it.</p>
      </div>
      <div className={`grid ${modes.length === 4 ? 'grid-cols-4' : 'grid-cols-3'} gap-1 rounded-full bg-white/70 p-1 shadow-soft ring-1 ring-slate-200/70 dark:bg-slate-800`} role="tablist" aria-label="Report period">
        {modes.map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setAnchor(today);
              setPeriodIndex(currentPeriod);
            }}
            className={`min-h-10 rounded-full text-sm font-semibold capitalize ${mode === m ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
          >
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      {mode === 'custom' ? (
        <div className="grid grid-cols-2 gap-3">
          <TextField id="from" label="From" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
          <TextField id="to" label="To" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <button onClick={() => shift(-1)} className="min-h-11 min-w-11 rounded-xl text-lg hover:bg-slate-200 dark:hover:bg-slate-800" aria-label={mode === 'subscription' ? 'Previous period' : `Previous ${mode}`}>←</button>
          <div className="text-center" aria-live="polite">
            <p className="font-display text-lg">{title}</p>
            {mode === 'subscription' && (
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {periodIndex === currentPeriod ? 'Current subscription period' : periodIndex < currentPeriod ? 'Earlier period' : 'Upcoming period'}
              </p>
            )}
          </div>
          <button onClick={() => shift(1)} className="min-h-11 min-w-11 rounded-xl text-lg hover:bg-slate-200 dark:hover:bg-slate-800" aria-label={mode === 'subscription' ? 'Next period' : `Next ${mode}`}>→</button>
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Delivery success" emoji="✨" tint="sage" value={formatPercent(a.successRate)} hint={`${a.delivered} of ${a.meals} meals so far`} onClick={open('success')} />
            <StatCard label="Delivered" emoji="🥡" tint="cream" value={a.delivered} hint={a.deliveredAssumed ? `${a.deliveredAssumed} assumed, ${a.deliveredExplicit} confirmed` : 'all confirmed'} onClick={open('delivered')} />
            <StatCard label="Not received" emoji="🚫" tint="blush" value={a.notReceived} hint="tap for the dates" onClick={open('notReceived')} />
            <StatCard label="Scheduled meals" emoji="🗓️" tint="lavender" value={s.scheduledTotal} hint={`${s.scheduledLunch} lunch · ${s.scheduledDinner} dinner`} onClick={open('scheduled')} />
            <StatCard label="Scheduled days" emoji="📅" tint="cream" value={s.scheduledDays} hint="Sundays excluded" onClick={open('scheduledDays')} />
            {s.pending > 0 && <StatCard label="Pending today" emoji="⏳" tint="butter" value={s.pending} hint="lunch 2 PM · dinner 10 PM" onClick={open('pending')} />}
            <StatCard label="Planned" emoji="🔮" tint="lavender" value={s.planned.meals} hint="future, not counted yet" onClick={open('planned')} />
            <StatCard label="Chicken meals" emoji="🍗" tint="peach" value={a.chicken} hint="delivered" onClick={open('chicken')} />
            <StatCard label="Egg meals" emoji="🍳" tint="butter" value={a.egg} hint="delivered" onClick={open('egg')} />
            <StatCard label="Extra curries" emoji="🍛" tint="peach" value={a.extraCurryReceived} hint={`${a.extraCurryMissing} missing of ${a.nonVegMeals}`} onClick={open('extraCurry')} />
          </div>

          <Card className="space-y-5">
            <SplitBar
              title="Meal outcomes"
              parts={[
                { label: 'Delivered (confirmed)', value: a.deliveredExplicit, className: 'bg-emerald-500' },
                { label: 'Delivered (assumed)', value: a.deliveredAssumed, className: 'bg-emerald-300' },
                { label: 'Not received', value: a.notReceived, className: 'bg-rose-400' },
                { label: 'Pending', value: s.pending, className: 'bg-amber-300' },
                { label: 'Planned', value: s.planned.meals, className: 'bg-sky-300' },
              ]}
            />
            <SplitBar
              title="Main dish (delivered non-veg meals)"
              parts={[
                { label: 'Chicken', value: a.chicken, className: 'bg-orange-300' },
                { label: 'Egg', value: a.egg, className: 'bg-amber-300' },
              ]}
            />
            <DailyChart daily={s.daily} />
          </Card>

          <details className="rounded-3xl bg-white/85 p-5 shadow-soft text-sm text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
            <summary className="cursor-pointer font-semibold">How these numbers are calculated</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Monday–Saturday have lunch and dinner; Sundays are never counted.</li>
              <li>Meals nobody changed are <strong>assumed delivered</strong> (with chicken and extra curries on Tue/Wed/Fri). {a.assumedMeals} of {a.meals} meals here are assumed.</li>
              <li>Today’s meals stay <strong>pending</strong> until 2 PM (lunch) and 10 PM (dinner) unless someone marks them.</li>
              <li>Future meals are <strong>planned</strong>. They are left out of delivered totals and the success rate.</li>
              <li>Egg and chicken totals count only delivered meals.</li>
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
