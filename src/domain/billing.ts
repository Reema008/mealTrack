import { addDays, addMonths, eachDay } from './dates';
import { mealsForDate } from './meals';
import { getDayType, PERIOD_LABEL } from './schedule';
import type { CancelledBy, CurryType, EffectiveMeal, ISODate, MealPeriod, OverrideMap, ScheduledDayType } from './types';

/** Prices and the monthly subscription, as set by an admin (all in rupees). */
export interface BillingSettings {
  /** Day of the month each subscription starts (1–28). */
  billingDay: number;
  monthlyAmount: number;
  vegMeal: number;
  nonvegMeal: number;
  chickenCurry: number;
  eggCurry: number;
}

export const DEFAULT_BILLING: BillingSettings = {
  billingDay: 1,
  monthlyAmount: 6600,
  vegMeal: 90,
  nonvegMeal: 150,
  chickenCurry: 70,
  eggCurry: 30,
};

export interface BillingPeriod {
  start: ISODate;
  /** Last day covered (inclusive). */
  end: ISODate;
  /** First day of the next subscription. */
  renewsOn: ISODate;
  days: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const onDay = (monthDate: ISODate, day: number): ISODate => `${monthDate.slice(0, 7)}-${pad(day)}`;

/** The monthly subscription that `date` falls in, e.g. 1 Nov – 30 Nov when it starts on the 1st. */
export function billingPeriodFor(date: ISODate, billingDay: number): BillingPeriod {
  const day = Number(date.slice(8, 10));
  const start = onDay(day >= billingDay ? date : addMonths(date, -1), billingDay);
  const renewsOn = onDay(addMonths(start, 1), billingDay);
  const end = addDays(renewsOn, -1);
  return { start, end, renewsOn, days: eachDay(start, end).length };
}

/** The subscription `offset` months before (negative) or after (positive) the one containing `date`. */
export function shiftPeriod(period: BillingPeriod, offset: number, billingDay: number): BillingPeriod {
  return billingPeriodFor(onDay(addMonths(period.start, offset), billingDay), billingDay);
}

export const mealPrice = (dayType: ScheduledDayType, s: BillingSettings) => (dayType === 'veg' ? s.vegMeal : s.nonvegMeal);
export const curryPrice = (type: CurryType | null, s: BillingSettings) => (type === 'egg' ? s.eggCurry : s.chickenCurry);
export const CURRY_LABEL: Record<CurryType, string> = { chicken: 'Chicken curry', egg: 'Egg curry' };

/** One line on a bill: a cancelled meal (taken off) or a delivered extra curry (added). */
export interface BillLine {
  date: ISODate;
  period: MealPeriod;
  kind: 'meal' | 'curry';
  dayType: ScheduledDayType;
  curryType: CurryType | null;
  /** For a cancelled meal: who cancelled it. */
  cancelledBy: CancelledBy | null;
  label: string;
  amount: number;
}

export interface Bill {
  start: ISODate;
  end: ISODate;
  /** The monthly amount the bill starts from. */
  base: number;
  /** Cancelled meals: each takes its meal price off. */
  missedMeals: BillLine[];
  mealDeductions: number;
  /** Delivered extra curries: each adds its curry price. */
  addedCurries: BillLine[];
  curryCharges: number;
  /** Delivered extra curries by type: how many, and what they add. */
  curriesAdded: Record<CurryType, { count: number; amount: number }>;
  /** Extra curries that did not come (nothing is added for them). */
  missingCurries: number;
  /** base − cancelled meals + delivered extra curries (never below zero). */
  nextAmount: number;
  delivered: { veg: number; nonveg: number };
  /** Today's meals still pending and future meals: not counted yet. */
  notYetCounted: number;
}

/** Whether a meal has an outcome that can be billed (not pending, not in the future). */
const hasOutcome = (m: EffectiveMeal) => m.timing === 'past' || m.timing === 'today';

/**
 * The bill for a date range: each cancelled meal takes its meal price off the
 * monthly amount, and each delivered extra curry adds the chicken or egg
 * curry price. A missing extra curry adds nothing.
 */
export function computeBill(
  start: ISODate,
  end: ISODate,
  overrides: OverrideMap,
  today: ISODate,
  nowMinutes: number | undefined,
  settings: BillingSettings,
): Bill {
  const missedMeals: BillLine[] = [];
  const addedCurries: BillLine[] = [];
  const delivered = { veg: 0, nonveg: 0 };
  const curriesAdded: Record<CurryType, { count: number; amount: number }> = { chicken: { count: 0, amount: 0 }, egg: { count: 0, amount: 0 } };
  let missingCurries = 0;
  let notYetCounted = 0;

  for (const date of eachDay(start, end)) {
    for (const m of mealsForDate(date, overrides, today, nowMinutes)) {
      if (!hasOutcome(m)) {
        notYetCounted++;
        continue;
      }
      if (m.deliveryStatus === 'not_received') {
        missedMeals.push({
          date,
          period: m.period,
          kind: 'meal',
          dayType: m.dayType,
          curryType: null,
          cancelledBy: m.cancelledBy ?? 'sender',
          label: `${PERIOD_LABEL[m.period]} cancelled by ${m.cancelledBy === 'you' ? 'you' : 'sender'} (${m.dayType === 'veg' ? 'veg' : 'non-veg'})`,
          amount: mealPrice(m.dayType, settings),
        });
        continue;
      }
      delivered[m.dayType]++;
      if (m.dayType !== 'nonveg') continue;
      if (!m.extraCurryReceived) {
        missingCurries++;
        continue;
      }
      const type = m.extraCurryType ?? 'chicken';
      const amount = curryPrice(type, settings);
      curriesAdded[type].count++;
      curriesAdded[type].amount += amount;
      addedCurries.push({
        date,
        period: m.period,
        kind: 'curry',
        dayType: 'nonveg',
        curryType: type,
        cancelledBy: null,
        label: `${PERIOD_LABEL[m.period]}: ${CURRY_LABEL[type].toLowerCase()}`,
        amount,
      });
    }
  }

  const sum = (lines: BillLine[]) => lines.reduce((t, l) => t + l.amount, 0);
  const mealDeductions = sum(missedMeals);
  const curryCharges = sum(addedCurries);
  return {
    start,
    end,
    base: settings.monthlyAmount,
    missedMeals,
    mealDeductions,
    addedCurries,
    curryCharges,
    curriesAdded,
    missingCurries,
    nextAmount: Math.max(0, settings.monthlyAmount - mealDeductions + curryCharges),
    delivered,
    notYetCounted,
  };
}

/** One row of the day-by-day report. */
export interface DayRow {
  date: ISODate;
  dayType: ReturnType<typeof getDayType>;
  meals: Array<{
    period: MealPeriod;
    status: 'delivered' | 'not_received' | 'pending' | 'planned';
    cancelledBy: CancelledBy | null;
    curry: { type: CurryType; received: boolean } | null;
  }>;
  /** Delivered extra curries added − cancelled meals taken off, for this day. */
  change: number;
}

export function dayRows(start: ISODate, end: ISODate, overrides: OverrideMap, today: ISODate, nowMinutes: number | undefined, settings: BillingSettings): DayRow[] {
  return eachDay(start, end).map((date) => {
    const bill = computeBill(date, date, overrides, today, nowMinutes, settings);
    return {
      date,
      dayType: getDayType(date),
      meals: mealsForDate(date, overrides, today, nowMinutes).map((m) => ({
        period: m.period,
        status: m.timing === 'pending' ? 'pending' : m.timing === 'future' && m.deliveryStatus === 'delivered' ? 'planned' : m.deliveryStatus,
        cancelledBy: m.deliveryStatus === 'not_received' ? m.cancelledBy ?? 'sender' : null,
        curry:
          m.dayType === 'nonveg' && m.deliveryStatus === 'delivered'
            ? { type: m.extraCurryType ?? 'chicken', received: m.extraCurryReceived === true }
            : null,
      })),
      change: bill.curryCharges - bill.mealDeductions,
    };
  });
}
