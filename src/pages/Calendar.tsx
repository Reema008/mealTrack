import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MonthCalendar } from '../components/Calendar';
import { DayMeals } from '../components/DayMeals';
import { deliveryLabel } from '../components/MealCard';
import { badgeFor } from '../components/MealCard';
import { Button, Card, DayTypeChip, ErrorNote, Spinner, StatusBadge } from '../components/ui';
import { addMonths, eachDay, endOfMonth, formatLong, formatMonth, formatShort, startOfMonth } from '../domain/dates';
import { mealsForDate, overrideKey } from '../domain/meals';
import { getDayType, PERIOD_LABEL } from '../domain/schedule';
import { useHousehold } from '../data/household';
import { useOverrides } from '../data/meals';

export function CalendarPage() {
  const { today, nowMinutes } = useHousehold();
  const [params, setParams] = useSearchParams();
  const monthParam = params.get('month');
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? `${monthParam}-01` : startOfMonth(today);
  const [selected, setSelected] = useState(() => (month === startOfMonth(today) ? today : month));
  const [view, setView] = useState<'month' | 'list'>('month');
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const { map, pendingKeys, isLoading, error, refetch } = useOverrides(start, end);

  const goMonth = (delta: number) => {
    const next = addMonths(month, delta);
    setParams({ month: next.slice(0, 7) }, { replace: true });
    setSelected(next.slice(0, 7) === today.slice(0, 7) ? today : next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" onClick={() => goMonth(-1)} aria-label="Previous month">←</Button>
        <h1 className="min-w-0 text-center text-lg font-semibold" aria-live="polite">{formatMonth(month)}</h1>
        <Button variant="secondary" onClick={() => goMonth(1)} aria-label="Next month">→</Button>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200 p-1 dark:bg-slate-900" role="tablist" aria-label="Calendar view">
        {(['month', 'list'] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`min-h-10 rounded-lg text-sm font-semibold ${view === v ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-600 dark:text-slate-300'}`}
          >
            {v === 'month' ? 'Month' : 'List'}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorNote error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Spinner />
      ) : view === 'month' ? (
        <>
          <Card>
            <MonthCalendar month={month} selected={selected} today={today} map={map} pendingKeys={pendingKeys} onSelect={setSelected} />
          </Card>
          {selected >= start && selected <= end && (
            <section aria-labelledby="sel-heading" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="sel-heading" className="font-semibold">{formatLong(selected)}</h2>
                <DayTypeChip type={getDayType(selected)} />
              </div>
              <DayMeals date={selected} map={map} pendingKeys={pendingKeys} today={today} />
            </section>
          )}
        </>
      ) : (
        <ol className="space-y-2">
          {eachDay(start, end).map((d) => {
            const meals = mealsForDate(d, map, today, nowMinutes);
            return (
              <li key={d}>
                <Link
                  to={`/day/${d}`}
                  className={`block rounded-2xl bg-white p-3 ring-1 hover:bg-slate-50 dark:bg-black/25 dark:hover:bg-white/10 ${d === today ? 'ring-2 ring-emerald-600' : 'ring-slate-200 dark:ring-white/[0.05]'}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{formatShort(d)}</span>
                    <DayTypeChip type={getDayType(d)} />
                  </div>
                  {meals.length === 0 ? (
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">No delivery scheduled</p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {meals.map((m) => (
                        <li key={m.period} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span>
                            <span className="font-medium">{PERIOD_LABEL[m.period]}:</span>{' '}
                            <span className={m.deliveryStatus === 'not_received' ? 'font-semibold text-rose-700 dark:text-rose-300' : ''}>{deliveryLabel(m)}</span>
                            {m.dayType === 'nonveg' && m.deliveryStatus === 'delivered' && (
                              <> · {m.mainDish === 'egg' ? 'Egg' : 'Chicken'} · curries {m.extraCurryReceived ? '✓' : '✗'}</>
                            )}
                          </span>
                          <StatusBadge kind={badgeFor(m, pendingKeys.has(overrideKey(m.date, m.period)))} />
                        </li>
                      ))}
                    </ul>
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
