import { billingPeriodFor, type BillingPeriod } from './billing';
import type { ISODate } from './types';

/** A recorded payment for one monthly subscription (row of public.subscriptions). */
export interface SubscriptionRecord {
  id: string;
  /** First day of the subscription that was paid for. */
  start_date: ISODate;
  /** Amount paid, in rupees. */
  amount: number | null;
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
