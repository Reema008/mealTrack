import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatShort } from '../domain/dates';
import { PERIOD_LABEL } from '../domain/schedule';
import { metricBreakdown, type CurryFilter, type DayTypeFilter, type DeliveryFilter, type ReportMetric } from '../domain/stats';
import type { EffectiveMeal } from '../domain/types';
import { badgeFor, deliveryLabel } from './MealCard';
import { Button, DayTypeChip, FilterChips, StatusBadge } from './ui';

export const METRIC_INFO: Record<ReportMetric, { title: string; help: string }> = {
  success: { title: 'Delivery success', help: 'Every meal with an outcome so far: delivered and not delivered.' },
  delivered: { title: 'Delivered meals', help: 'Meals that arrived, saved by someone or assumed by the schedule.' },
  notReceived: { title: 'Not received', help: 'Meals that did not arrive. Days with no delivery at all are marked.' },
  scheduled: { title: 'Scheduled meals', help: 'Every lunch and dinner Monday–Saturday in this period.' },
  scheduledDays: { title: 'Scheduled days', help: 'Every delivery day in this period (Sundays have no delivery).' },
  pending: { title: 'Pending today', help: 'Today’s meals before their time: lunch counts from 2 PM, dinner from 10 PM.' },
  planned: { title: 'Planned (future)', help: 'Upcoming meals. Not counted as delivered yet.' },
  chicken: { title: 'Chicken meals', help: 'Delivered non-veg meals with chicken.' },
  egg: { title: 'Egg meals', help: 'Delivered non-veg meals with egg.' },
  extraCurry: { title: 'Extra curries', help: 'Delivered non-veg meals, showing whether the extra curries came.' },
  veg: { title: 'Veg meals', help: 'All lunches and dinners on veg days (Mon, Thu, Sat) in this period.' },
  nonveg: { title: 'Non-veg meals', help: 'All lunches and dinners on non-veg days (Tue, Wed, Fri) in this period.' },
  lunch: { title: 'Lunches', help: 'Every scheduled lunch in this period, veg and non-veg.' },
  dinner: { title: 'Dinners', help: 'Every scheduled dinner in this period, veg and non-veg.' },
};

function mealLine(m: EffectiveMeal, metric: ReportMetric): string {
  const parts = [deliveryLabel(m)];
  if (m.dayType === 'nonveg' && m.deliveryStatus === 'delivered') {
    parts.push(m.mainDish === 'egg' ? 'Egg' : 'Chicken');
    if (metric === 'extraCurry' || !m.extraCurryReceived) parts.push(m.extraCurryReceived ? 'curries ✓' : 'curries missing');
  }
  return parts.join(' · ');
}

const isBad = (m: EffectiveMeal, metric: ReportMetric) =>
  m.deliveryStatus === 'not_received' || (metric === 'extraCurry' && !m.extraCurryReceived);

/** Bottom sheet listing the meals behind one report box, grouped by date. */
export function ReportDetailSheet({
  metric,
  meals,
  pendingKeys,
  rangeLabel,
  onClose,
}: {
  metric: ReportMetric;
  meals: readonly EffectiveMeal[];
  pendingKeys: ReadonlySet<string>;
  rangeLabel: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const info = METRIC_INFO[metric];
  // Boxes that list a mix of delivered and not-delivered meals get a filter.
  const filterable = ['veg', 'nonveg', 'lunch', 'dinner', 'scheduled', 'scheduledDays', 'success'].includes(metric);
  const [delivery, setDelivery] = useState<DeliveryFilter>('all');
  const [curry, setCurry] = useState<CurryFilter>('all');
  const curryFilterable = metric === 'extraCurry';
  // Veg / Non-Veg filter for every box except the By category tiles (and extra curries, which are non-veg only).
  const dayTypeFilterable = !['veg', 'nonveg', 'lunch', 'dinner', 'extraCurry'].includes(metric);
  const [dayType, setDayType] = useState<DayTypeFilter>('all');
  const shown = dayTypeFilterable && dayType !== 'all' ? meals.filter((m) => m.dayType === dayType) : meals;
  const groups = metricBreakdown(shown, metric, filterable ? delivery : 'all', curryFilterable ? curry : 'all');
  const total = groups.reduce((n, g) => n + g.meals.length, 0);
  const missedDays = groups.filter((g) => g.wholeDayMissed).length;

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

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="presentation">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        className="relative flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-[2rem] bg-slate-50 shadow-soft dark:bg-slate-900 sm:rounded-[2rem]"
      >
        <div className="border-b border-slate-200/70 p-5 pb-4 dark:border-slate-800">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="detail-title" className="text-2xl">{info.title}</h2>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{rangeLabel}</p>
            </div>
            <Button variant="secondary" className="min-h-9 shrink-0 px-3" onClick={onClose} aria-label="Close details">
              ✕
            </Button>
          </div>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{info.help}</p>
          {dayTypeFilterable && (
            <div className="mt-3">
              <FilterChips
                label="Meal type"
                value={dayType}
                onChange={setDayType}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'veg', label: '🥗 Veg' },
                  { value: 'nonveg', label: '🍗 Non-Veg' },
                ]}
              />
            </div>
          )}
          {curryFilterable && (
            <div className="mt-3">
              <FilterChips
                label="Show"
                value={curry}
                onChange={setCurry}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'received', label: 'Received' },
                  { value: 'missing', label: 'Missing' },
                ]}
              />
            </div>
          )}
          {filterable && (
            <div className="mt-3">
              <FilterChips
                label="Show"
                value={delivery}
                onChange={setDelivery}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'delivered', label: 'Delivered' },
                  { value: 'not_received', label: 'Not delivered' },
                ]}
              />
            </div>
          )}
          <p className="mt-2 text-sm font-semibold">
            {metric === 'scheduledDays' ? `${groups.length} day${groups.length === 1 ? '' : 's'}` : `${total} meal${total === 1 ? '' : 's'}`}
            {groups.length > 0 && metric !== 'scheduledDays' && ` across ${groups.length} day${groups.length === 1 ? '' : 's'}`}
            {missedDays > 0 && ` · ${missedDays} day${missedDays === 1 ? '' : 's'} with no delivery at all`}
          </p>
        </div>

        <div className="overflow-y-auto p-5 pt-3">
          {groups.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-600 dark:text-slate-300">Nothing here for this period. 🌿</p>
          ) : (
            <ol className="space-y-3">
              {groups.map((g) => (
                <li key={g.date} className="rounded-2xl bg-white/90 p-3 shadow-soft ring-1 ring-slate-200/60 dark:bg-white/[0.05] dark:ring-white/[0.06]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link to={`/day/${g.date}`} className="font-display text-lg hover:underline" onClick={onClose}>
                      {formatShort(g.date)}
                    </Link>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {g.wholeDayMissed && (
                        <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-200">
                          No delivery all day
                        </span>
                      )}
                      <DayTypeChip type={g.meals[0].dayType} />
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {g.meals.map((m) => (
                      <li key={m.period} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span>
                          <span aria-hidden>{m.period === 'lunch' ? '☀️' : '🌙'} </span>
                          <span className="font-medium">{PERIOD_LABEL[m.period]}:</span>{' '}
                          <span className={isBad(m, metric) ? 'font-semibold text-rose-700 dark:text-rose-300' : ''}>{mealLine(m, metric)}</span>
                        </span>
                        <StatusBadge kind={badgeFor(m, pendingKeys.has(`${m.date}|${m.period}`))} />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
