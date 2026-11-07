/** Calendar date in the household's local calendar, formatted YYYY-MM-DD. */
export type ISODate = string;

export type MealPeriod = 'lunch' | 'dinner';
export type DayType = 'veg' | 'nonveg' | 'none';
export type ScheduledDayType = Exclude<DayType, 'none'>;
export type DeliveryStatus = 'delivered' | 'not_received';
export type MainDish = 'egg' | 'chicken';
/** Which extra curry came with (or was missing from) a delivered non-veg meal. */
export type CurryType = 'chicken' | 'egg';
/** Who cancelled a meal that did not come. */
export type CancelledBy = 'sender' | 'you';

/** Where a meal's state came from. */
export type MealSource = 'assumed' | 'explicit';
/**
 * A meal's position relative to the household's current local time.
 * 'pending' = today's meal before its cutoff (lunch 2 PM, dinner 10 PM)
 * with nothing saved yet: not yet assumed delivered.
 */
export type MealTiming = 'past' | 'today' | 'pending' | 'future';

/** Row shape of public.meal_overrides. */
export interface MealOverride {
  id: string;
  household_id: string;
  meal_date: ISODate;
  meal_period: MealPeriod;
  delivery_status: DeliveryStatus;
  main_dish: MainDish | null;
  extra_curry_received: boolean | null;
  /** Null on older rows: treated as chicken. */
  extra_curry_type?: CurryType | null;
  /** Null on older rows: treated as the sender. */
  cancelled_by?: CancelledBy | null;
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
  /** Chicken or egg; null on veg days and on meals that were not delivered. */
  extraCurryType: CurryType | null;
  /** Sender or you; only on meals that were cancelled (not delivered). */
  cancelledBy: CancelledBy | null;
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
