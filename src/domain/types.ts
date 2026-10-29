/** Calendar date in the household's local calendar, formatted YYYY-MM-DD. */
export type ISODate = string;

export type MealPeriod = 'lunch' | 'dinner';
export type DayType = 'veg' | 'nonveg' | 'none';
export type ScheduledDayType = Exclude<DayType, 'none'>;
export type DeliveryStatus = 'delivered' | 'not_received';
export type MainDish = 'egg' | 'chicken';

/** Where a meal's state came from. */
export type MealSource = 'assumed' | 'explicit';
/** A meal's position relative to the household's "today". */
export type MealTiming = 'past' | 'today' | 'future';

/** Row shape of public.meal_overrides. */
export interface MealOverride {
  id: string;
  household_id: string;
  meal_date: ISODate;
  meal_period: MealPeriod;
  delivery_status: DeliveryStatus;
  main_dish: MainDish | null;
  extra_curry_received: boolean | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

/** The editable values of a meal. Non-veg fields are null on veg days. */
export interface MealValues {
  deliveryStatus: DeliveryStatus;
  mainDish: MainDish | null;
  extraCurryReceived: boolean | null;
}

export interface EffectiveMeal extends MealValues {
  date: ISODate;
  period: MealPeriod;
  dayType: ScheduledDayType;
  source: MealSource;
  timing: MealTiming;
  /** The saved override, if any (source === 'explicit'). */
  override: MealOverride | null;
}

/** Overrides indexed by `overrideKey(date, period)`. */
export type OverrideMap = ReadonlyMap<string, MealOverride>;
