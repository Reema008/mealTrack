import { useState } from 'react';
import { DailyChart, SplitBar, StatCard } from '../components/Charts';
import { Card, ErrorNote, Spinner, TextField } from '../components/ui';
import { addDays, addMonths, endOfMonth, endOfWeek, formatMonth, formatShort, isISODate, startOfMonth, startOfWeek } from '../domain/dates';
import { computeStats, formatPercent } from '../domain/stats';
import { useHousehold } from '../data/household';
import { useOverrides } from '../data/meals';

type Mode = 'week' | 'month' | 'custom';
const MAX_CUSTOM_DAYS = 366;

export function ReportsPage() {
  const { today } = useHousehold();
  const [mode, setMode] = useState<Mode>('week');
  const [anchor, setAnchor] = useState(today);
  const [customStart, setCustomStart] = useState(startOfMonth(today));
  const [customEnd, setCustomEnd] = useState(today);

  let start: string;
  let end: string;
  let title: string;
  let rangeError: string | null = null;
  if (mode === 'week') {
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

  const { map, isLoading, error, refetch } = useOverrides(start, end);
  const s = computeStats(start, end, map, today);
  const a = s.actual;

  const shift = (delta: number) => setAnchor(mode === 'week' ? addDays(anchor, 7 * delta) : addMonths(anchor, delta));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Reports</h1>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200 p-1 dark:bg-slate-800" role="tablist" aria-label="Report period">
        {(['week', 'month', 'custom'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setAnchor(today);
            }}
            className={`min-h-10 rounded-lg text-sm font-semibold capitalize ${mode === m ? 'bg-white shadow-sm dark:bg-slate-900' : 'text-slate-600 dark:text-slate-400'}`}
          >
            {m === 'week' ? 'Weekly' : m === 'month' ? 'Monthly' : 'Custom'}
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
          <button onClick={() => shift(-1)} className="min-h-11 min-w-11 rounded-xl text-lg hover:bg-slate-200 dark:hover:bg-slate-800" aria-label={`Previous ${mode}`}>←</button>
          <p className="font-semibold" aria-live="polite">{title}</p>
          <button onClick={() => shift(1)} className="min-h-11 min-w-11 rounded-xl text-lg hover:bg-slate-200 dark:hover:bg-slate-800" aria-label={`Next ${mode}`}>→</button>
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
            <StatCard label="Delivery success" value={formatPercent(a.successRate)} hint={`${a.delivered} of ${a.meals} meals to date`} tone={a.successRate !== null && a.successRate < 100 ? 'bad' : 'good'} />
            <StatCard label="Delivered" value={a.delivered} hint={a.deliveredAssumed ? `${a.deliveredAssumed} assumed, ${a.deliveredExplicit} confirmed` : 'all confirmed'} tone="good" />
            <StatCard label="Not received" value={a.notReceived} tone={a.notReceived ? 'bad' : undefined} />
            <StatCard label="Scheduled meals" value={s.scheduledTotal} hint={`${s.scheduledLunch} lunch · ${s.scheduledDinner} dinner`} />
            <StatCard label="Scheduled days" value={s.scheduledDays} hint="Sundays excluded" />
            <StatCard label="Planned (future)" value={s.planned.meals} hint="not counted as delivered" />
            <StatCard label="Chicken meals" value={a.chicken} hint="delivered" />
            <StatCard label="Egg meals" value={a.egg} hint="delivered" />
            <StatCard label="Extra curries" value={a.extraCurryReceived} hint={`${a.extraCurryMissing} missing of ${a.nonVegMeals}`} tone={a.extraCurryMissing ? 'bad' : undefined} />
          </div>

          <Card className="space-y-5">
            <SplitBar
              title="Meal outcomes"
              parts={[
                { label: 'Delivered (confirmed)', value: a.deliveredExplicit, className: 'bg-emerald-600' },
                { label: 'Delivered (assumed)', value: a.deliveredAssumed, className: 'bg-emerald-300' },
                { label: 'Not received', value: a.notReceived, className: 'bg-rose-500' },
                { label: 'Planned', value: s.planned.meals, className: 'bg-sky-300' },
              ]}
            />
            <SplitBar
              title="Main dish (delivered non-veg meals)"
              parts={[
                { label: 'Chicken', value: a.chicken, className: 'bg-orange-500' },
                { label: 'Egg', value: a.egg, className: 'bg-yellow-400' },
              ]}
            />
            <DailyChart daily={s.daily} />
          </Card>

          <details className="rounded-2xl bg-white p-4 text-sm text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
            <summary className="cursor-pointer font-semibold">How these numbers are calculated</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Monday–Saturday have lunch and dinner; Sundays are never counted.</li>
              <li>Meals nobody changed are <strong>assumed delivered</strong> (with chicken and extra curries on Tue/Wed/Fri). {a.assumedMeals} of {a.meals} meals here are assumed.</li>
              <li>Future meals are <strong>planned</strong>. They are left out of delivered totals and the success rate.</li>
              <li>Egg and chicken totals count only delivered meals.</li>
              <li>Extra curries are counted for each non-veg meal; a meal that was not delivered had no extra curries.</li>
              <li>Success rate = delivered ÷ scheduled meals up to and including today.</li>
            </ul>
            {s.planned.meals > 0 && (
              <p className="mt-2">Planned in this range: {s.planned.chicken} chicken, {s.planned.egg} egg, {s.planned.extraCurry} extra curries{s.planned.notExpected ? `, ${s.planned.notExpected} marked not expected` : ''}.</p>
            )}
          </details>
        </>
      )}
    </div>
  );
}
