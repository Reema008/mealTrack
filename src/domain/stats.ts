import { eachDay } from './dates';
import { END_OF_DAY_MINUTES, mealsForDate } from './meals';
import { getDayType } from './schedule';
import type { EffectiveMeal, ISODate, OverrideMap } from './types';

/**
 * Report metrics. Definitions (used consistently everywhere):
 *  - "Scheduled" counts every lunch/dinner on Mon–Sat in the range; Sundays never count.
 *  - "Actual" covers meals with an outcome: past days, and today's meals once
 *    their cutoff has passed (lunch 2 PM, dinner 10 PM) or someone saved them.
 *    Meals with no saved record count with their default (assumed) outcome.
 *  - "Pending" covers today's meals before their cutoff with nothing saved.
 *  - "Planned" covers future meals. Neither pending nor planned meals count as delivered.
 *  - Egg/chicken totals count DELIVERED main dishes only (food actually received).
 *  - Extra curries are counted per non-veg meal; a meal that was not
 *    delivered had no extra curries, so they count as missing.
 *  - Success % = actual delivered / actual meals × 100.
 */
/** Counts for one category of meals (veg, non-veg, lunch or dinner). */
export interface CategoryStats {
  scheduled: number;
  /** Meals with an outcome so far (past, or today after the cutoff / saved). */
  meals: number;
  delivered: number;
  notReceived: number;
  /** Pending today + planned future meals. */
  upcoming: number;
  successRate: number | null;
}

/** Report filter: every meal, or only veg / only non-veg days. */
export type DayTypeFilter = 'all' | 'veg' | 'nonveg';

const matchesFilter = (m: EffectiveMeal, filter: DayTypeFilter) => filter === 'all' || m.dayType === filter;

export type MealCategory = 'veg' | 'nonveg' | 'lunch' | 'dinner';

export interface MealStats {
  start: ISODate;
  end: ISODate;
  scheduledDays: number;
  scheduledLunch: number;
  scheduledDinner: number;
  scheduledTotal: number;
  /** Today's meals still before their cutoff time. */
  pending: number;
  actual: {
    meals: number;
    delivered: number;
    deliveredAssumed: number;
    deliveredExplicit: number;
    notReceived: number;
    egg: number;
    chicken: number;
    nonVegMeals: number;
    extraCurryReceived: number;
    extraCurryMissing: number;
    assumedMeals: number;
    successRate: number | null;
  };
  planned: {
    meals: number;
    egg: number;
    chicken: number;
    extraCurry: number;
    notExpected: number;
  };
  daily: Array<{ date: ISODate; delivered: number; notReceived: number; pending: number; planned: number }>;
  categories: Record<MealCategory, CategoryStats>;
}

export function emptyStats(start: ISODate, end: ISODate): MealStats {
  return {
    start,
    end,
    scheduledDays: 0,
    scheduledLunch: 0,
    scheduledDinner: 0,
    scheduledTotal: 0,
    pending: 0,
    actual: {
      meals: 0,
      delivered: 0,
      deliveredAssumed: 0,
      deliveredExplicit: 0,
      notReceived: 0,
      egg: 0,
      chicken: 0,
      nonVegMeals: 0,
      extraCurryReceived: 0,
      extraCurryMissing: 0,
      assumedMeals: 0,
      successRate: null,
    },
    planned: { meals: 0, egg: 0, chicken: 0, extraCurry: 0, notExpected: 0 },
    daily: [],
    categories: { veg: emptyCategory(), nonveg: emptyCategory(), lunch: emptyCategory(), dinner: emptyCategory() },
  };
}

const emptyCategory = (): CategoryStats => ({ scheduled: 0, meals: 0, delivered: 0, notReceived: 0, upcoming: 0, successRate: null });

function addToCategory(c: CategoryStats, m: EffectiveMeal) {
  c.scheduled++;
  if (m.timing === 'future' || m.timing === 'pending') {
    c.upcoming++;
    return;
  }
  c.meals++;
  if (m.deliveryStatus === 'delivered') c.delivered++;
  else c.notReceived++;
}

/** True when a meal has an outcome (delivered or not) to count. */
export const isActual = (m: EffectiveMeal) => m.timing === 'past' || m.timing === 'today';

/** Every scheduled meal in the range, in date order (Sundays have none). */
export function listMeals(
  start: ISODate,
  end: ISODate,
  overrides: OverrideMap,
  today: ISODate,
  nowMinutes: number = END_OF_DAY_MINUTES,
  filter: DayTypeFilter = 'all',
): EffectiveMeal[] {
  if (end < start) return [];
  return eachDay(start, end)
    .flatMap((d) => mealsForDate(d, overrides, today, nowMinutes))
    .filter((m) => matchesFilter(m, filter));
}

export function computeStats(
  start: ISODate,
  end: ISODate,
  overrides: OverrideMap,
  today: ISODate,
  nowMinutes: number = END_OF_DAY_MINUTES,
  filter: DayTypeFilter = 'all',
): MealStats {
  const s = emptyStats(start, end);
  if (end < start) return s;

  for (const date of eachDay(start, end)) {
    const type = getDayType(date);
    if (type === 'none' || (filter !== 'all' && type !== filter)) continue;
    s.scheduledDays++;
    const day = { date, delivered: 0, notReceived: 0, pending: 0, planned: 0 };
    for (const meal of mealsForDate(date, overrides, today, nowMinutes)) {
      s.scheduledTotal++;
      if (meal.period === 'lunch') s.scheduledLunch++;
      else s.scheduledDinner++;
      addToCategory(s.categories[meal.dayType], meal);
      addToCategory(s.categories[meal.period], meal);
      if (meal.timing === 'future') {
        addPlanned(s, meal);
        day.planned++;
      } else if (meal.timing === 'pending') {
        s.pending++;
        day.pending++;
      } else {
        addActual(s, meal);
        if (meal.deliveryStatus === 'delivered') day.delivered++;
        else day.notReceived++;
      }
    }
    s.daily.push(day);
  }

  const a = s.actual;
  a.successRate = a.meals === 0 ? null : (a.delivered / a.meals) * 100;
  for (const c of Object.values(s.categories)) c.successRate = c.meals === 0 ? null : (c.delivered / c.meals) * 100;
  return s;
}

function addActual(s: MealStats, m: EffectiveMeal) {
  const a = s.actual;
  a.meals++;
  if (m.source === 'assumed') a.assumedMeals++;
  if (m.deliveryStatus === 'delivered') {
    a.delivered++;
    if (m.source === 'assumed') a.deliveredAssumed++;
    else a.deliveredExplicit++;
    if (m.mainDish === 'egg') a.egg++;
    if (m.mainDish === 'chicken') a.chicken++;
  } else {
    a.notReceived++;
  }
  if (m.dayType === 'nonveg') {
    a.nonVegMeals++;
    if (m.extraCurryReceived) a.extraCurryReceived++;
    else a.extraCurryMissing++;
  }
}

function addPlanned(s: MealStats, m: EffectiveMeal) {
  const p = s.planned;
  p.meals++;
  if (m.deliveryStatus !== 'delivered') {
    p.notExpected++;
    return;
  }
  if (m.mainDish === 'egg') p.egg++;
  if (m.mainDish === 'chicken') p.chicken++;
  if (m.extraCurryReceived) p.extraCurry++;
}

export function formatPercent(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 10) / 10}%`;
}

// ---------------------------------------------------------------------------
// Report drill-down: which meals sit behind each report box. Each filter
// selects exactly the meals counted by the matching computeStats number.
// ---------------------------------------------------------------------------
export type ReportMetric =
  | 'success'
  | 'delivered'
  | 'notReceived'
  | 'scheduled'
  | 'scheduledDays'
  | 'pending'
  | 'planned'
  | 'chicken'
  | 'egg'
  | 'extraCurry'
  | 'veg'
  | 'nonveg'
  | 'lunch'
  | 'dinner';

const delivered = (m: EffectiveMeal) => isActual(m) && m.deliveryStatus === 'delivered';

export const METRIC_FILTERS: Record<ReportMetric, (m: EffectiveMeal) => boolean> = {
  success: isActual,
  delivered,
  notReceived: (m) => isActual(m) && m.deliveryStatus === 'not_received',
  scheduled: () => true,
  scheduledDays: () => true,
  pending: (m) => m.timing === 'pending',
  planned: (m) => m.timing === 'future',
  chicken: (m) => delivered(m) && m.mainDish === 'chicken',
  egg: (m) => delivered(m) && m.mainDish === 'egg',
  extraCurry: (m) => isActual(m) && m.dayType === 'nonveg',
  veg: (m) => m.dayType === 'veg',
  nonveg: (m) => m.dayType === 'nonveg',
  lunch: (m) => m.period === 'lunch',
  dinner: (m) => m.period === 'dinner',
};

/** Detail-sheet filter: every meal, only delivered, or only not delivered. */
export type DeliveryFilter = 'all' | 'delivered' | 'not_received';

export function matchesDelivery(m: EffectiveMeal, filter: DeliveryFilter): boolean {
  if (filter === 'all') return true;
  if (!isActual(m)) return false; // pending / planned meals have no outcome yet
  return m.deliveryStatus === filter;
}

export interface DayGroup {
  date: ISODate;
  meals: EffectiveMeal[];
  /** Both scheduled meals of the day were not delivered. */
  wholeDayMissed: boolean;
}

/** The meals behind a report box, grouped by date. */
export function metricBreakdown(
  meals: readonly EffectiveMeal[],
  metric: ReportMetric,
  delivery: DeliveryFilter = 'all',
): DayGroup[] {
  const byDate = new Map<ISODate, EffectiveMeal[]>();
  for (const m of meals) {
    if (!byDate.has(m.date)) byDate.set(m.date, []);
    if (METRIC_FILTERS[metric](m) && matchesDelivery(m, delivery)) byDate.get(m.date)!.push(m);
  }
  const groups: DayGroup[] = [];
  for (const [date, list] of byDate) {
    if (list.length === 0) continue;
    const dayMeals = meals.filter((m) => m.date === date);
    groups.push({
      date,
      meals: list,
      wholeDayMissed: dayMeals.length > 0 && dayMeals.every((m) => isActual(m) && m.deliveryStatus === 'not_received'),
    });
  }
  return groups;
}
