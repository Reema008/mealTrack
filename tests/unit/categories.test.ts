import { describe, expect, it } from 'vitest';
import { toOverrideMap } from '../../src/domain/meals';
import { computeStats, listMeals, METRIC_FILTERS } from '../../src/domain/stats';
import { override } from '../helpers';

const MON = '2026-10-26';
const SUN = '2026-11-01';
const notDelivered = { delivery_status: 'not_received' as const, main_dish: null, extra_curry_received: null };

describe('report categories: veg / non-veg, lunch / dinner', () => {
  it('a full past week splits 6 veg + 6 non-veg meals and 6 lunches + 6 dinners', () => {
    const s = computeStats(MON, SUN, new Map(), '2026-12-01');
    expect(s.categories.veg).toMatchObject({ scheduled: 6, meals: 6, delivered: 6, notReceived: 0, upcoming: 0, successRate: 100 });
    expect(s.categories.nonveg).toMatchObject({ scheduled: 6, delivered: 6 });
    expect(s.categories.lunch).toMatchObject({ scheduled: 6, delivered: 6 });
    expect(s.categories.dinner).toMatchObject({ scheduled: 6, delivered: 6 });
  });

  it('a missed non-veg dinner counts against non-veg and dinner only', () => {
    const map = toOverrideMap([override({ meal_date: '2026-10-27', meal_period: 'dinner', ...notDelivered })]);
    const s = computeStats(MON, SUN, map, '2026-12-01');
    expect(s.categories.nonveg).toMatchObject({ delivered: 5, notReceived: 1 });
    expect(s.categories.dinner).toMatchObject({ delivered: 5, notReceived: 1 });
    expect(s.categories.veg).toMatchObject({ delivered: 6, notReceived: 0 });
    expect(s.categories.lunch).toMatchObject({ delivered: 6, notReceived: 0 });
    expect(s.categories.nonveg.successRate).toBeCloseTo((5 / 6) * 100);
  });

  it('future and pending meals are upcoming, not counted as delivered', () => {
    // Today Wednesday 3 PM: Mon, Tue, Wed lunch actual; Wed dinner pending; Thu–Sat planned.
    const s = computeStats(MON, SUN, new Map(), '2026-10-28', 15 * 60);
    expect(s.categories.lunch).toMatchObject({ meals: 3, upcoming: 3 });
    expect(s.categories.dinner).toMatchObject({ meals: 2, upcoming: 4 });
    expect(s.categories.veg).toMatchObject({ meals: 2, upcoming: 4 }); // Mon actual; Thu + Sat upcoming
    expect(s.categories.nonveg).toMatchObject({ meals: 3, upcoming: 3 }); // Tue x2 + Wed lunch; Wed dinner + Fri x2
  });

  it('veg + non-veg and lunch + dinner each add up to the total, and drill-down matches', () => {
    const s = computeStats(MON, SUN, new Map(), '2026-10-28', 15 * 60);
    const c = s.categories;
    expect(c.veg.scheduled + c.nonveg.scheduled).toBe(s.scheduledTotal);
    expect(c.lunch.scheduled + c.dinner.scheduled).toBe(s.scheduledTotal);
    expect(c.veg.delivered + c.nonveg.delivered).toBe(s.actual.delivered);
    const meals = listMeals(MON, SUN, new Map(), '2026-10-28', 15 * 60);
    for (const k of ['veg', 'nonveg', 'lunch', 'dinner'] as const) expect(meals.filter(METRIC_FILTERS[k]).length).toBe(c[k].scheduled);
  });
});
