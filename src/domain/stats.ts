import { eachDay } from './dates';
import { mealsForDate } from './meals';
import { getDayType } from './schedule';
import type { EffectiveMeal, ISODate, OverrideMap } from './types';

/**
 * Report metrics. Definitions (used consistently everywhere):
 *  - "Scheduled" counts every lunch/dinner on Mon–Sat in the range; Sundays never count.
 *  - "Actual" covers meals dated on or before the household's today. Meals with no
 *    saved record count with their default (assumed) outcome and are reported in
 *    the assumed breakdown.
 *  - "Planned" covers future meals; they are never counted as delivered.
 *  - Egg/chicken totals count DELIVERED main dishes only (food actually received).
 *  - Extra curries are counted per non-veg meal; a meal that was not
 *    delivered had no extra curries, so they count as missing.
 *  - Success % = actual delivered / actual scheduled × 100 (future meals excluded).
 */
export interface MealStats {
  start: ISODate;
  end: ISODate;
  scheduledDays: number;
  scheduledLunch: number;
  scheduledDinner: number;
  scheduledTotal: number;
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
  daily: Array<{ date: ISODate; delivered: number; notReceived: number; planned: number }>;
}

export function emptyStats(start: ISODate, end: ISODate): MealStats {
  return {
    start,
    end,
    scheduledDays: 0,
    scheduledLunch: 0,
    scheduledDinner: 0,
    scheduledTotal: 0,
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
  };
}

export function computeStats(start: ISODate, end: ISODate, overrides: OverrideMap, today: ISODate): MealStats {
  const s = emptyStats(start, end);
  if (end < start) return s;

  for (const date of eachDay(start, end)) {
    if (getDayType(date) === 'none') continue;
    s.scheduledDays++;
    const day = { date, delivered: 0, notReceived: 0, planned: 0 };
    for (const meal of mealsForDate(date, overrides, today)) {
      s.scheduledTotal++;
      if (meal.period === 'lunch') s.scheduledLunch++;
      else s.scheduledDinner++;
      if (meal.timing === 'future') {
        addPlanned(s, meal);
        day.planned++;
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
