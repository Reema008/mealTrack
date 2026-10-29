import { describe, expect, it } from 'vitest';
import { effectiveMeal, mealsForDate, toOverrideMap } from '../../src/domain/meals';
import { computeStats, listMeals, metricBreakdown, METRIC_FILTERS, type ReportMetric } from '../../src/domain/stats';
import { nowInTimeZone } from '../../src/domain/dates';
import { override } from '../helpers';

const TUE = '2026-10-27';
const at = (h: number, m = 0) => h * 60 + m;

describe("today's meals: pending until the cutoff time", () => {
  it('lunch is pending before 2 PM and assumed delivered from 2 PM', () => {
    expect(effectiveMeal(TUE, 'lunch', null, TUE, at(13, 59))!.timing).toBe('pending');
    expect(effectiveMeal(TUE, 'lunch', null, TUE, at(14))!.timing).toBe('today');
  });

  it('dinner is pending before 10 PM and assumed delivered from 10 PM', () => {
    expect(effectiveMeal(TUE, 'dinner', null, TUE, at(21, 59))!.timing).toBe('pending');
    expect(effectiveMeal(TUE, 'dinner', null, TUE, at(22))!.timing).toBe('today');
  });

  it('at 3 PM: lunch counted as delivered, dinner still pending', () => {
    const [lunch, dinner] = mealsForDate(TUE, new Map(), TUE, at(15));
    expect(lunch.timing).toBe('today');
    expect(dinner.timing).toBe('pending');
    const s = computeStats(TUE, TUE, new Map(), TUE, at(15));
    expect(s).toMatchObject({ scheduledTotal: 2, pending: 1 });
    expect(s.actual).toMatchObject({ meals: 1, delivered: 1, chicken: 1, successRate: 100 });
  });

  it('a meal someone saved counts immediately, even before the cutoff', () => {
    const map = toOverrideMap([override({ meal_date: TUE, meal_period: 'lunch', delivery_status: 'not_received', main_dish: null, extra_curry_received: null })]);
    const s = computeStats(TUE, TUE, map, TUE, at(9));
    expect(s.pending).toBe(1); // dinner only
    expect(s.actual).toMatchObject({ meals: 1, notReceived: 1, successRate: 0 });
  });

  it('only today is affected; past days and future days are unchanged', () => {
    expect(effectiveMeal('2026-10-26', 'lunch', null, TUE, at(8))!.timing).toBe('past');
    expect(effectiveMeal('2026-10-28', 'lunch', null, TUE, at(8))!.timing).toBe('future');
  });

  it('nowInTimeZone gives the household local date and minutes', () => {
    // 2026-10-27 08:45 UTC = 14:15 IST
    expect(nowInTimeZone('Asia/Kolkata', new Date('2026-10-27T08:45:00Z'))).toEqual({ date: '2026-10-27', minutes: 14 * 60 + 15 });
  });
});

describe('report drill-down', () => {
  const MON = '2026-10-26';
  const SUN = '2026-11-01';
  const notDelivered = { delivery_status: 'not_received' as const, main_dish: null, extra_curry_received: null };
  const map = toOverrideMap([
    override({ meal_date: '2026-10-27', meal_period: 'lunch', main_dish: 'egg' }),
    override({ meal_date: '2026-10-28', meal_period: 'lunch', ...notDelivered }),
    override({ meal_date: '2026-10-28', meal_period: 'dinner', ...notDelivered }),
    override({ meal_date: '2026-10-30', meal_period: 'dinner', extra_curry_received: false }),
  ]);
  // Today = Friday 30th at 10 AM: Fri lunch pending (dinner was saved), Saturday planned.
  const today = '2026-10-30';
  const now = at(10);
  const meals = listMeals(MON, SUN, map, today, now);
  const s = computeStats(MON, SUN, map, today, now);

  it('every box lists exactly as many meals as its number', () => {
    const count = (metric: ReportMetric) => meals.filter(METRIC_FILTERS[metric]).length;
    expect(count('success')).toBe(s.actual.meals);
    expect(count('delivered')).toBe(s.actual.delivered);
    expect(count('notReceived')).toBe(s.actual.notReceived);
    expect(count('scheduled')).toBe(s.scheduledTotal);
    expect(count('pending')).toBe(s.pending);
    expect(count('planned')).toBe(s.planned.meals);
    expect(count('chicken')).toBe(s.actual.chicken);
    expect(count('egg')).toBe(s.actual.egg);
    expect(count('extraCurry')).toBe(s.actual.nonVegMeals);
    expect(metricBreakdown(meals, 'scheduledDays')).toHaveLength(s.scheduledDays);
  });

  it('groups by date and flags days with no delivery at all', () => {
    const groups = metricBreakdown(meals, 'notReceived');
    expect(groups.map((g) => g.date)).toEqual(['2026-10-28']);
    expect(groups[0].wholeDayMissed).toBe(true);
    expect(groups[0].meals.map((m) => m.period)).toEqual(['lunch', 'dinner']);
    expect(metricBreakdown(meals, 'egg').map((g) => g.date)).toEqual(['2026-10-27']);
    expect(metricBreakdown(meals, 'pending')[0]).toMatchObject({ date: today, wholeDayMissed: false });
  });
});
