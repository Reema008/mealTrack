import { describe, expect, it } from 'vitest';
import { billingPeriodFor, calculatedPayment, computeBill, DEFAULT_BILLING, shiftPeriod } from '../../src/domain/billing';
import { toOverrideMap } from '../../src/domain/meals';
import type { MealOverride } from '../../src/domain/types';

const row = (o: Partial<MealOverride> & Pick<MealOverride, 'meal_date' | 'meal_period'>): MealOverride => ({
  id: `${o.meal_date}-${o.meal_period}`,
  household_id: 'h',
  delivery_status: 'delivered',
  main_dish: 'chicken',
  extra_curry_received: true,
  extra_curry_type: null,
  created_by: null,
  updated_by: null,
  created_at: '',
  updated_at: '',
  version: 1,
  ...o,
});

describe('monthly subscription periods', () => {
  it('runs from the 1st to the last day of the month by default', () => {
    expect(billingPeriodFor('2026-11-07', 1)).toEqual({ start: '2026-11-01', end: '2026-11-30', renewsOn: '2026-12-01', days: 30 });
    expect(billingPeriodFor('2027-02-28', 1)).toMatchObject({ start: '2027-02-01', end: '2027-02-28', days: 28 });
  });

  it('follows a different start day: 5 Nov – 4 Dec', () => {
    expect(billingPeriodFor('2026-11-04', 5)).toMatchObject({ start: '2026-10-05', end: '2026-11-04' });
    expect(billingPeriodFor('2026-11-05', 5)).toMatchObject({ start: '2026-11-05', end: '2026-12-04', renewsOn: '2026-12-05' });
  });

  it('steps to the previous and next month, across the new year', () => {
    const nov = billingPeriodFor('2026-11-07', 1);
    expect(shiftPeriod(nov, -1, 1).start).toBe('2026-10-01');
    expect(shiftPeriod(nov, 2, 1)).toMatchObject({ start: '2027-01-01', end: '2027-01-31' });
  });
});

describe('next subscription amount', () => {
  // October 2026: Mon 26 veg, Tue 27 non-veg, Wed 28 non-veg.
  const map = toOverrideMap([
    row({ meal_date: '2026-10-26', meal_period: 'lunch', delivery_status: 'not_received', main_dish: null, extra_curry_received: null }),
    row({ meal_date: '2026-10-27', meal_period: 'dinner', delivery_status: 'not_received', main_dish: null, extra_curry_received: null }),
    row({ meal_date: '2026-10-28', meal_period: 'lunch', extra_curry_received: false, extra_curry_type: 'egg' }),
    row({ meal_date: '2026-10-28', meal_period: 'dinner', extra_curry_received: false }),
    row({ meal_date: '2026-10-30', meal_period: 'lunch', extra_curry_type: 'egg' }),
  ]);
  const bill = computeBill('2026-10-01', '2026-10-31', map, '2026-11-07', undefined, DEFAULT_BILLING);

  it('takes cancelled meals off at ₹90 (veg) and ₹150 (non-veg)', () => {
    expect(bill.missedMeals.map((l) => [l.date, l.period, l.amount])).toEqual([
      ['2026-10-26', 'lunch', 90],
      ['2026-10-27', 'dinner', 150],
    ]);
    expect(bill.mealDeductions).toBe(240);
  });

  // October 2026 has 13 non-veg days = 26 non-veg meals: 1 cancelled, 2 with the curry missing,
  // so 23 extra curries came: 1 egg (30 Oct lunch) and 22 chicken.
  it('adds each delivered extra curry: chicken ₹70, egg ₹30; a missing curry adds nothing', () => {
    expect(bill.curriesAdded).toEqual({ chicken: { count: 22, amount: 22 * 70 }, egg: { count: 1, amount: 30 } });
    expect(bill.curryCharges).toBe(22 * 70 + 30);
    expect(bill.missingCurries).toBe(2);
    expect(bill.addedCurries.find((l) => l.date === '2026-10-30' && l.period === 'lunch')).toMatchObject({ curryType: 'egg', amount: 30 });
  });

  it('next amount = 6600 − cancelled meals (240) + delivered curries (1570)', () => {
    expect(bill).toMatchObject({ base: 6600, mealDeductions: 240, curryCharges: 1570, nextAmount: 7930, notYetCounted: 0 });
  });

  it('uses the edited prices and monthly amount', () => {
    const custom = { ...DEFAULT_BILLING, monthlyAmount: 7000, vegMeal: 100, chickenCurry: 80 };
    const b = computeBill('2026-10-01', '2026-10-31', map, '2026-11-07', undefined, custom);
    expect(b.mealDeductions).toBe(100 + 150);
    expect(b.nextAmount).toBe(7000 - 250 + 22 * 80 + 30);
  });

  it('records who cancelled each meal (sender unless marked as you)', () => {
    const m = toOverrideMap([row({ meal_date: '2026-10-26', meal_period: 'dinner', delivery_status: 'not_received', main_dish: null, extra_curry_received: null, cancelled_by: 'you' })]);
    const b = computeBill('2026-10-26', '2026-10-26', m, '2026-11-07', undefined, DEFAULT_BILLING);
    expect(b.missedMeals[0]).toMatchObject({ cancelledBy: 'you', amount: 90 });
    expect(bill.missedMeals[0].cancelledBy).toBe('sender');
  });

  it('pending and future meals are not deducted yet', () => {
    const future = toOverrideMap([
      row({ meal_date: '2026-11-10', meal_period: 'lunch', delivery_status: 'not_received', main_dish: null, extra_curry_received: null }),
    ]);
    const b = computeBill('2026-11-01', '2026-11-30', future, '2026-11-07', 10 * 60, DEFAULT_BILLING);
    expect(b.mealDeductions).toBe(0);
    expect(b.notYetCounted).toBeGreaterThan(0);
  });
});

describe('calculated payment for a month', () => {
  const map = toOverrideMap([
    row({ meal_date: '2026-10-26', meal_period: 'lunch', delivery_status: 'not_received', main_dish: null, extra_curry_received: null }),
  ]);
  const nov = billingPeriodFor('2026-11-07', 1);
  const oct = billingPeriodFor('2026-10-07', 1);
  const noCurries = { ...DEFAULT_BILLING, chickenCurry: 0, eggCurry: 0 };

  it('is the previous month’s bill', () => {
    expect(calculatedPayment(nov, '2026-10-01', map, '2026-11-07', undefined, noCurries)).toBe(6600 - 90);
  });

  it('is the monthly amount for the first month of the subscription', () => {
    expect(calculatedPayment(oct, '2026-10-01', map, '2026-11-07', undefined, noCurries)).toBe(6600);
  });
});
