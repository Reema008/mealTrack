import { addDays } from './dates';
import type { ISODate } from './types';

/** Length of one subscription period: 4 weeks. */
export const PERIOD_DAYS = 28;

export interface SubscriptionPeriod {
  /** 0 = the period that starts on the renewal date; negative = before it. */
  index: number;
  start: ISODate;
  /** Last day of the period (inclusive). */
  end: ISODate;
  /** The next renewal date (the day after `end`). */
  renewsOn: ISODate;
}

/** Whole days from a to b (b − a), computed in UTC so device time zones never matter. */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function periodAt(renewal: ISODate, index: number): SubscriptionPeriod {
  const start = addDays(renewal, index * PERIOD_DAYS);
  return { index, start, end: addDays(start, PERIOD_DAYS - 1), renewsOn: addDays(start, PERIOD_DAYS) };
}

/** The 4-week period that contains `date`, counting from the renewal date. */
export function periodFor(renewal: ISODate, date: ISODate): SubscriptionPeriod {
  return periodAt(renewal, Math.floor(daysBetween(renewal, date) / PERIOD_DAYS));
}

export interface PeriodProgress {
  period: SubscriptionPeriod;
  /** 1-based day within the period. */
  day: number;
  daysLeft: number;
}

export function periodProgress(renewal: ISODate, today: ISODate): PeriodProgress {
  const period = periodFor(renewal, today);
  const day = daysBetween(period.start, today) + 1;
  return { period, day, daysLeft: PERIOD_DAYS - day };
}
