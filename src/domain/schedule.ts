import { weekdayOf } from './dates';
import type { DayType, ISODate, MealPeriod } from './types';

/** Fixed weekly subscription schedule, indexed by weekday (0 = Sunday). */
export const WEEKLY_SCHEDULE: Readonly<Record<number, DayType>> = {
  0: 'none', // Sunday
  1: 'veg', // Monday
  2: 'nonveg', // Tuesday
  3: 'nonveg', // Wednesday
  4: 'veg', // Thursday
  5: 'nonveg', // Friday
  6: 'veg', // Saturday
};

export const MEAL_PERIODS: readonly MealPeriod[] = ['lunch', 'dinner'];

export function getDayType(date: ISODate): DayType {
  return WEEKLY_SCHEDULE[weekdayOf(date)];
}

export function isScheduledDay(date: ISODate): boolean {
  return getDayType(date) !== 'none';
}

export const DAY_TYPE_LABEL: Record<DayType, string> = {
  veg: 'Veg',
  nonveg: 'Non-Veg',
  none: 'No Delivery',
};

export const PERIOD_LABEL: Record<MealPeriod, string> = {
  lunch: 'Lunch',
  dinner: 'Dinner',
};
