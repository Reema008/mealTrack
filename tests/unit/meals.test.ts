import { describe, expect, it } from 'vitest';
import { addDays, endOfMonth, startOfWeek, todayInTimeZone, weekdayOf } from '../../src/domain/dates';
import {
  defaultValues,
  effectiveMeal,
  isDefault,
  mealsForDate,
  normalizeValues,
  toOverrideMap,
  withChange,
} from '../../src/domain/meals';
import { getDayType } from '../../src/domain/schedule';
import type { MealOverride } from '../../src/domain/types';
import { override } from '../helpers';

// Week of 2026-10-26 (Mon) … 2026-11-01 (Sun)
const MON = '2026-10-26';
const TUE = '2026-10-27';
const WED = '2026-10-28';
const THU = '2026-10-29';
const FRI = '2026-10-30';
const SAT = '2026-10-31';
const SUN = '2026-11-01';
const TODAY = THU;

const none = new Map<string, MealOverride>();

describe('dates', () => {
  it('computes weekdays independent of device timezone', () => {
    expect(weekdayOf(MON)).toBe(1);
    expect(weekdayOf(SUN)).toBe(0);
    expect(startOfWeek(SUN)).toBe(MON);
    expect(startOfWeek(MON)).toBe(MON);
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('computes today in the household timezone, not UTC', () => {
    // 2026-10-29 20:00 UTC = 2026-10-30 01:30 IST
    expect(todayInTimeZone('Asia/Kolkata', new Date('2026-10-29T20:00:00Z'))).toBe('2026-10-30');
    expect(todayInTimeZone('UTC', new Date('2026-10-29T20:00:00Z'))).toBe('2026-10-29');
  });
});

describe('schedule defaults', () => {
  it('1. Tuesday with no overrides defaults to chicken + extra curries for lunch and dinner', () => {
    const meals = mealsForDate(TUE, none, TODAY);
    expect(meals).toHaveLength(2);
    for (const m of meals) {
      expect(m).toMatchObject({
        dayType: 'nonveg',
        deliveryStatus: 'delivered',
        mainDish: 'chicken',
        extraCurryReceived: true,
        source: 'assumed',
      });
    }
    expect(meals.map((m) => m.period)).toEqual(['lunch', 'dinner']);
  });

  it('2. Wednesday and Friday use the same non-veg defaults', () => {
    for (const d of [WED, FRI]) {
      for (const m of mealsForDate(d, none, TODAY)) {
        expect(m).toMatchObject({ dayType: 'nonveg', deliveryStatus: 'delivered', mainDish: 'chicken', extraCurryReceived: true });
      }
    }
  });

  it('3. Monday, Thursday and Saturday default to delivered vegetarian meals', () => {
    for (const d of [MON, THU, SAT]) {
      const meals = mealsForDate(d, none, TODAY);
      expect(meals).toHaveLength(2);
      for (const m of meals) {
        expect(m).toMatchObject({ dayType: 'veg', deliveryStatus: 'delivered', mainDish: null, extraCurryReceived: null, source: 'assumed' });
      }
    }
  });

  it('4. Sunday has no scheduled meals', () => {
    expect(getDayType(SUN)).toBe('none');
    expect(mealsForDate(SUN, none, TODAY)).toEqual([]);
    expect(effectiveMeal(SUN, 'lunch', undefined, TODAY)).toBeNull();
  });

  it('5. past dates use their correct weekday defaults', () => {
    // 2024-02-27 was a Tuesday, 2023-01-05 a Thursday, 2020-03-01 a Sunday
    expect(mealsForDate('2024-02-27', none, TODAY)[0]).toMatchObject({ dayType: 'nonveg', mainDish: 'chicken', timing: 'past' });
    expect(mealsForDate('2023-01-05', none, TODAY)[0]).toMatchObject({ dayType: 'veg', timing: 'past' });
    expect(mealsForDate('2020-03-01', none, TODAY)).toEqual([]);
  });

  it('6. future dates are planned, today is today', () => {
    expect(effectiveMeal(FRI, 'lunch', undefined, TODAY)!.timing).toBe('future');
    expect(effectiveMeal(THU, 'lunch', undefined, TODAY)!.timing).toBe('today');
    expect(effectiveMeal(WED, 'lunch', undefined, TODAY)!.timing).toBe('past');
  });
});

describe('overrides', () => {
  it('7. changing lunch to egg does not change dinner', () => {
    const map = toOverrideMap([override({ meal_date: TUE, meal_period: 'lunch', main_dish: 'egg' })]);
    const [lunch, dinner] = mealsForDate(TUE, map, TODAY);
    expect(lunch).toMatchObject({ mainDish: 'egg', extraCurryReceived: true, source: 'explicit' });
    expect(dinner).toMatchObject({ mainDish: 'chicken', extraCurryReceived: true, source: 'assumed' });
  });

  it('8. a meal marked not received has no main dish or extra curries; dinner is unaffected', () => {
    const current = effectiveMeal(TUE, 'lunch', undefined, TODAY)!;
    const next = normalizeValues('nonveg', withChange(current, { deliveryStatus: 'not_received' }));
    expect(next).toEqual({ deliveryStatus: 'not_received', mainDish: null, extraCurryReceived: null });
    const map = toOverrideMap([override({ meal_date: TUE, meal_period: 'lunch', delivery_status: 'not_received', main_dish: null, extra_curry_received: null })]);
    const [lunch, dinner] = mealsForDate(TUE, map, TODAY);
    expect(lunch).toMatchObject({ deliveryStatus: 'not_received', mainDish: null, extraCurryReceived: null });
    expect(dinner).toMatchObject({ deliveryStatus: 'delivered', mainDish: 'chicken', extraCurryReceived: true, source: 'assumed' });
  });

  it('switching a not-received meal back to delivered brings back the defaults', () => {
    expect(normalizeValues('nonveg', { deliveryStatus: 'delivered', mainDish: null, extraCurryReceived: null })).toEqual(defaultValues('nonveg'));
  });

  it('9. extra curries can be missing while the meal stays delivered', () => {
    const map = toOverrideMap([override({ meal_date: FRI, meal_period: 'dinner', extra_curry_received: false })]);
    const dinner = mealsForDate(FRI, map, TODAY)[1];
    expect(dinner).toMatchObject({ deliveryStatus: 'delivered', mainDish: 'chicken', extraCurryReceived: false });
  });

  it('10. removing an override restores the standard defaults', () => {
    const rows = [override({ meal_date: TUE, meal_period: 'lunch', main_dish: 'egg' })];
    expect(mealsForDate(TUE, toOverrideMap(rows), TODAY)[0].mainDish).toBe('egg');
    expect(mealsForDate(TUE, toOverrideMap([]), TODAY)[0]).toMatchObject({ mainDish: 'chicken', source: 'assumed' });
  });

  it('detects when values equal the defaults (so the override can be deleted)', () => {
    expect(isDefault('nonveg', defaultValues('nonveg'))).toBe(true);
    expect(isDefault('nonveg', { deliveryStatus: 'delivered', mainDish: 'egg', extraCurryReceived: true })).toBe(false);
    expect(isDefault('veg', { deliveryStatus: 'delivered', mainDish: null, extraCurryReceived: null })).toBe(true);
    expect(isDefault('veg', { deliveryStatus: 'not_received', mainDish: null, extraCurryReceived: null })).toBe(false);
  });

  it('normalises values to the day type', () => {
    expect(normalizeValues('veg', { deliveryStatus: 'delivered', mainDish: 'egg', extraCurryReceived: false })).toEqual({
      deliveryStatus: 'delivered',
      mainDish: null,
      extraCurryReceived: null,
    });
    expect(normalizeValues('nonveg', { deliveryStatus: 'not_received', mainDish: 'egg', extraCurryReceived: true })).toEqual({
      deliveryStatus: 'not_received',
      mainDish: null,
      extraCurryReceived: null,
    });
  });
});
