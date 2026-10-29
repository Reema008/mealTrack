import { describe, expect, it } from 'vitest';
import { toOverrideMap } from '../../src/domain/meals';
import { computeStats, listMeals, metricBreakdown } from '../../src/domain/stats';
import { override } from '../helpers';

const MON = '2026-10-26';
const SUN = '2026-11-01';
const notDelivered = { delivery_status: 'not_received' as const, main_dish: null, extra_curry_received: null };
const map = toOverrideMap([
  override({ meal_date: '2026-10-26', meal_period: 'lunch', ...notDelivered }), // veg Monday
  override({ meal_date: '2026-10-27', meal_period: 'dinner', ...notDelivered }), // non-veg Tuesday
  override({ meal_date: '2026-10-28', meal_period: 'lunch', ...notDelivered }), // non-veg Wednesday
]);

describe('report filters', () => {
  it('All counts every scheduled meal (default)', () => {
    const s = computeStats(MON, SUN, map, '2026-12-01');
    expect(s).toMatchObject({ scheduledDays: 6, scheduledTotal: 12 });
    expect(s.actual).toMatchObject({ delivered: 9, notReceived: 3 });
  });

  it('Veg counts only veg days (Mon, Thu, Sat)', () => {
    const s = computeStats(MON, SUN, map, '2026-12-01', undefined, 'veg');
    expect(s).toMatchObject({ scheduledDays: 3, scheduledTotal: 6 });
    expect(s.actual).toMatchObject({ delivered: 5, notReceived: 1, nonVegMeals: 0 });
  });

  it('Non-veg counts only non-veg days (Tue, Wed, Fri)', () => {
    const s = computeStats(MON, SUN, map, '2026-12-01', undefined, 'nonveg');
    expect(s).toMatchObject({ scheduledDays: 3, scheduledTotal: 6 });
    expect(s.actual).toMatchObject({ delivered: 4, notReceived: 2 });
    expect(s.categories.veg.scheduled).toBe(0);
  });

  it('listMeals applies the same filter', () => {
    expect(listMeals(MON, SUN, map, '2026-12-01', undefined, 'veg').every((m) => m.dayType === 'veg')).toBe(true);
    expect(listMeals(MON, SUN, map, '2026-12-01', undefined, 'nonveg')).toHaveLength(6);
  });

  it('the detail sheet can show all, only delivered, or only not delivered meals', () => {
    const meals = listMeals(MON, SUN, map, '2026-12-01');
    const count = (f: 'all' | 'delivered' | 'not_received') => metricBreakdown(meals, 'nonveg', f).reduce((n, g) => n + g.meals.length, 0);
    expect(count('all')).toBe(6);
    expect(count('delivered')).toBe(4);
    expect(count('not_received')).toBe(2);
  });

  it('planned meals have no outcome, so they only appear under All', () => {
    const meals = listMeals(MON, SUN, new Map(), '2026-10-28'); // Thu–Sat planned
    const count = (f: 'all' | 'delivered' | 'not_received') => metricBreakdown(meals, 'veg', f).reduce((n, g) => n + g.meals.length, 0);
    expect(count('all')).toBe(6);
    expect(count('delivered')).toBe(2); // Monday only
    expect(count('not_received')).toBe(0);
  });
});
