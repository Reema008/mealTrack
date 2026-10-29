import { getDayType, MEAL_PERIODS } from './schedule';
import type {
  EffectiveMeal,
  ISODate,
  MealOverride,
  MealPeriod,
  MealTiming,
  MealValues,
  OverrideMap,
  ScheduledDayType,
} from './types';

export function overrideKey(date: ISODate, period: MealPeriod): string {
  return `${date}|${period}`;
}

export function toOverrideMap(rows: readonly MealOverride[]): Map<string, MealOverride> {
  return new Map(rows.map((r) => [overrideKey(r.meal_date, r.meal_period), r]));
}

/** The standard assumption for a scheduled meal with no saved record. */
export function defaultValues(dayType: ScheduledDayType): MealValues {
  return dayType === 'veg'
    ? { deliveryStatus: 'delivered', mainDish: null, extraCurryReceived: null }
    : { deliveryStatus: 'delivered', mainDish: 'chicken', extraCurryReceived: true };
}

/** Minutes after local midnight from which today's meal is assumed delivered. */
export const MEAL_CUTOFF_MINUTES: Record<MealPeriod, number> = {
  lunch: 14 * 60, // 2:00 PM
  dinner: 22 * 60, // 10:00 PM
};

/** "End of day": every cutoff has passed. Default when the time of day is not known. */
export const END_OF_DAY_MINUTES = 24 * 60;

export function timingOf(date: ISODate, today: ISODate): MealTiming {
  if (date < today) return 'past';
  if (date > today) return 'future';
  return 'today';
}

/** True for today's meal before its cutoff time (lunch 2 PM, dinner 10 PM). */
export function isBeforeCutoff(date: ISODate, period: MealPeriod, today: ISODate, nowMinutes: number): boolean {
  return date === today && nowMinutes < MEAL_CUTOFF_MINUTES[period];
}

/**
 * Coerce values to the shape allowed on a day type: veg days, and meals that
 * were not delivered, carry no dish/curry details. On a delivered non-veg
 * meal any missing field falls back to its default.
 */
export function normalizeValues(dayType: ScheduledDayType, values: MealValues): MealValues {
  if (dayType === 'veg' || values.deliveryStatus === 'not_received') {
    return { deliveryStatus: values.deliveryStatus, mainDish: null, extraCurryReceived: null };
  }
  const d = defaultValues('nonveg');
  return {
    deliveryStatus: values.deliveryStatus,
    mainDish: values.mainDish ?? d.mainDish,
    extraCurryReceived: values.extraCurryReceived ?? d.extraCurryReceived,
  };
}

export function valuesEqual(a: MealValues, b: MealValues): boolean {
  return (
    a.deliveryStatus === b.deliveryStatus &&
    a.mainDish === b.mainDish &&
    a.extraCurryReceived === b.extraCurryReceived
  );
}

/** True when the values match the standard default, so no override is needed. */
export function isDefault(dayType: ScheduledDayType, values: MealValues): boolean {
  return valuesEqual(normalizeValues(dayType, values), defaultValues(dayType));
}

export function overrideValues(o: Pick<MealOverride, 'delivery_status' | 'main_dish' | 'extra_curry_received'>): MealValues {
  return {
    deliveryStatus: o.delivery_status,
    mainDish: o.main_dish,
    extraCurryReceived: o.extra_curry_received,
  };
}

/**
 * Effective state of one meal: the saved override when present, otherwise
 * the schedule default. Returns null on Sundays (nothing scheduled).
 *
 * `nowMinutes` is the household's local time of day. Today's meals with no
 * saved record stay 'pending' until their cutoff (lunch 2 PM, dinner 10 PM);
 * a saved record always counts immediately.
 */
export function effectiveMeal(
  date: ISODate,
  period: MealPeriod,
  override: MealOverride | null | undefined,
  today: ISODate,
  nowMinutes: number = END_OF_DAY_MINUTES,
): EffectiveMeal | null {
  const dayType = getDayType(date);
  if (dayType === 'none') return null;
  const values = override ? normalizeValues(dayType, overrideValues(override)) : defaultValues(dayType);
  const timing = !override && isBeforeCutoff(date, period, today, nowMinutes) ? 'pending' : timingOf(date, today);
  return {
    date,
    period,
    dayType,
    ...values,
    source: override ? 'explicit' : 'assumed',
    timing,
    override: override ?? null,
  };
}

/** Both meals for a date (empty array on Sundays). */
export function mealsForDate(
  date: ISODate,
  overrides: OverrideMap,
  today: ISODate,
  nowMinutes: number = END_OF_DAY_MINUTES,
): EffectiveMeal[] {
  return MEAL_PERIODS.map((p) => effectiveMeal(date, p, overrides.get(overrideKey(date, p)), today, nowMinutes)).filter(
    (m): m is EffectiveMeal => m !== null,
  );
}

/** Apply a change to some fields while keeping every other current value. */
export function withChange(current: MealValues, change: Partial<MealValues>): MealValues {
  return { ...current, ...change };
}
