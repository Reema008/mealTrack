import { describe, expect, it } from 'vitest';
import { billingPeriodFor, computeBill, DEFAULT_BILLING, shiftPeriod } from '../../src/domain/billing';
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

  it('deducts missed meals at ₹90 (veg) and ₹150 (non-veg), without their curry', () => {
    expect(bill.missedMeals.map((l) => [l.date, l.period, l.amount])).toEqual([
      ['2026-10-26', 'lunch', 90],
      ['2026-10-27', 'dinner', 150],
    ]);
    expect(bill.mealDeductions).toBe(240);
  });

  it('deducts a missing extra curry at the chicken curry price (₹70); there is no curry type to choose', () => {
    expect(bill.missedCurries.map((l) => [l.date, l.period, l.curryType, l.amount])).toEqual([
      ['2026-10-28', 'lunch', 'chicken', 70],
      ['2026-10-28', 'dinner', 'chicken', 70],
    ]);
    expect(bill.curryDeductions).toBe(140);
  });

  it('next amount = 6600 − 240 − 140', () => {
    expect(bill).toMatchObject({ base: 6600, totalDeductions: 380, nextAmount: 6220, notYetCounted: 0 });
    expect(bill.curriesReceived.egg).toBe(1);
  });

  it('uses the edited prices and monthly amount', () => {
    const custom = { ...DEFAULT_BILLING, monthlyAmount: 7000, vegMeal: 100, chickenCurry: 80 };
    const b = computeBill('2026-10-01', '2026-10-31', map, '2026-11-07', undefined, custom);
    expect(b.totalDeductions).toBe(100 + 150 + 80 + 80);
    expect(b.nextAmount).toBe(7000 - 410);
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
    expect(b.totalDeductions).toBe(0);
    expect(b.notYetCounted).toBeGreaterThan(0);
  });
});
