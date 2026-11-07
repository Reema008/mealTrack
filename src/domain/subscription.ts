import { billingPeriodFor, type BillingPeriod } from './billing';
import type { ISODate } from './types';

/** A recorded payment for one monthly subscription (row of public.subscriptions). */
export interface SubscriptionRecord {
  id: string;
  /** First day of the subscription that was paid for. */
  start_date: ISODate;
  /** Amount paid, in rupees. */
  amount: number | null;
  /** The day the payment was made, if recorded. */
  paid_on?: ISODate | null;
}

/** Whole days from a to b (b − a), computed in UTC so device time zones never matter. */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** The payment recorded for a monthly subscription, if any. */
export function paymentFor(records: readonly SubscriptionRecord[], period: BillingPeriod, billingDay: number): SubscriptionRecord | null {
  return records.find((r) => billingPeriodFor(r.start_date, billingDay).start === period.start) ?? null;
}

/** Days into the subscription (1-based) and days left after today. */
export function periodProgress(period: BillingPeriod, today: ISODate): { day: number; daysLeft: number } {
  const day = Math.min(Math.max(daysBetween(period.start, today) + 1, 1), period.days);
  return { day, daysLeft: period.days - day };
}

export function formatAmount(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(amount);
}

/** First day of the earliest subscription with a recorded payment, or null when none is saved yet. */
export function firstSubscriptionStart(records: readonly SubscriptionRecord[], billingDay: number): ISODate | null {
  if (records.length === 0) return null;
  const earliest = records.reduce((min, r) => (r.start_date < min ? r.start_date : min), records[0].start_date);
  return billingPeriodFor(earliest, billingDay).start;
}

/**
 * Every monthly subscription from the first recorded payment up to this month
 * (or a later month already paid for), newest first. With no payments saved
 * yet, just this month.
 */
export function subscriptionMonths(records: readonly SubscriptionRecord[], today: ISODate, billingDay: number): BillingPeriod[] {
  const current = billingPeriodFor(today, billingDay);
  const first = firstSubscriptionStart(records, billingDay) ?? current.start;
  const lastPaid = records.reduce((max, r) => (r.start_date > max ? r.start_date : max), today);
  const last = billingPeriodFor(lastPaid, billingDay);
  const months: BillingPeriod[] = [];
  for (let p = billingPeriodFor(first < current.start ? first : current.start, billingDay); p.start <= last.start; p = billingPeriodFor(p.renewsOn, billingDay)) {
    months.push(p);
  }
  return months.reverse();
}
