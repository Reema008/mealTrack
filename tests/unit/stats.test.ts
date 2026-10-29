import { describe, expect, it } from 'vitest';
import { toOverrideMap } from '../../src/domain/meals';
import { computeStats, formatPercent } from '../../src/domain/stats';
import { override } from '../helpers';

const MON = '2026-10-26';
const SUN = '2026-11-01';

describe('statistics', () => {
  it('14. a full past week: 12 meals, Sunday excluded, no double counting', () => {
    const s = computeStats(MON, SUN, new Map(), '2026-12-01');
    expect(s.scheduledDays).toBe(6);
    expect(s.scheduledLunch).toBe(6);
    expect(s.scheduledDinner).toBe(6);
    expect(s.scheduledTotal).toBe(12);
    expect(s.actual.meals).toBe(12);
    expect(s.actual.delivered).toBe(12);
    expect(s.actual.deliveredAssumed).toBe(12);
    expect(s.actual.notReceived).toBe(0);
    // Tue, Wed, Fri × 2 = 6 non-veg meals, default chicken + curry
    expect(s.actual.chicken).toBe(6);
    expect(s.actual.egg).toBe(0);
    expect(s.actual.extraCurryReceived).toBe(6);
    expect(s.actual.successRate).toBe(100);
    expect(s.daily).toHaveLength(6);
    expect(s.daily.some((d) => d.date === SUN)).toBe(false);
  });

  it('a Sunday-only range has nothing scheduled', () => {
    const s = computeStats(SUN, SUN, new Map(), '2026-12-01');
    expect(s.scheduledTotal).toBe(0);
    expect(s.actual.successRate).toBeNull();
    expect(formatPercent(s.actual.successRate)).toBe('—');
  });

  it('6. future meals are planned and excluded from the success denominator', () => {
    // today = Wednesday: Mon, Tue, Wed actual (6); Thu, Fri, Sat planned (6)
    const map = toOverrideMap([override({ meal_date: '2026-10-27', meal_period: 'lunch', delivery_status: 'not_received' })]);
    const s = computeStats(MON, SUN, map, '2026-10-28');
    expect(s.scheduledTotal).toBe(12);
    expect(s.actual.meals).toBe(6);
    expect(s.planned.meals).toBe(6);
    expect(s.actual.delivered).toBe(5);
    expect(s.actual.notReceived).toBe(1);
    expect(s.actual.successRate).toBeCloseTo((5 / 6) * 100);
    // Fri lunch + dinner planned chicken
    expect(s.planned.chicken).toBe(2);
  });

  it('egg/chicken count delivered main dishes only; an undelivered meal has no curries', () => {
    const map = toOverrideMap([
      override({ meal_date: '2026-10-27', meal_period: 'lunch', main_dish: 'egg' }),
      override({ meal_date: '2026-10-27', meal_period: 'dinner', delivery_status: 'not_received', main_dish: null, extra_curry_received: null }),
      override({ meal_date: '2026-10-28', meal_period: 'lunch', extra_curry_received: false }),
    ]);
    const s = computeStats(MON, SUN, map, '2026-12-01');
    expect(s.actual.egg).toBe(1);
    expect(s.actual.chicken).toBe(4); // 6 non-veg − 1 egg − 1 not received
    expect(s.actual.notReceived).toBe(1);
    expect(s.actual.extraCurryReceived).toBe(4); // 6 − not-delivered meal − missing curry
    expect(s.actual.extraCurryMissing).toBe(2);
    expect(s.actual.deliveredExplicit).toBe(2);
    expect(s.actual.deliveredAssumed).toBe(9);
    expect(s.actual.assumedMeals).toBe(9);
  });

  it('veg not-received counts once and does not affect non-veg totals', () => {
    const map = toOverrideMap([override({ meal_date: MON, meal_period: 'dinner', delivery_status: 'not_received' })]);
    const s = computeStats(MON, MON, map, '2026-12-01');
    expect(s.scheduledTotal).toBe(2);
    expect(s.actual).toMatchObject({ meals: 2, delivered: 1, notReceived: 1, egg: 0, chicken: 0, nonVegMeals: 0 });
    expect(s.actual.successRate).toBe(50);
  });

  it('a whole day with no delivery counts both meals as not received', () => {
    const notDelivered = { delivery_status: 'not_received' as const, main_dish: null, extra_curry_received: null };
    const map = toOverrideMap([
      override({ meal_date: '2026-10-30', meal_period: 'lunch', ...notDelivered }),
      override({ meal_date: '2026-10-30', meal_period: 'dinner', ...notDelivered }),
    ]);
    const s = computeStats('2026-10-30', '2026-10-30', map, '2026-12-01');
    expect(s.actual).toMatchObject({ meals: 2, delivered: 0, notReceived: 2, chicken: 0, egg: 0, extraCurryReceived: 0, successRate: 0 });
  });

  it('ignores overrides outside the range', () => {
    const map = toOverrideMap([override({ meal_date: '2026-11-03', meal_period: 'lunch', delivery_status: 'not_received' })]);
    const s = computeStats(MON, SUN, map, '2026-12-01');
    expect(s.actual.notReceived).toBe(0);
  });
});
