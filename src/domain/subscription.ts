import { addDays } from './dates';
import type { ISODate } from './types';

/** Length of one subscription: 4 weeks. */
export const PERIOD_DAYS = 28;

/** A recorded renewal (row of public.subscriptions). */
export interface SubscriptionRecord {
  id: string;
  start_date: ISODate;
  /** Amount paid, in rupees. */
  amount: number | null;
}

export interface SubscriptionPeriod {
  record: SubscriptionRecord;
  start: ISODate;
  /** Last day covered (inclusive): 28 days, or the day before an earlier renewal. */
  end: ISODate;
  /** When this subscription is due for renewal (the day after a full 28 days). */
  renewsOn: ISODate;
  /** Number of days covered. */
  days: number;
}

/** Whole days from a to b (b − a), computed in UTC so device time zones never matter. */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * Periods for all recorded renewals, oldest first. A subscription covers 28
 * days from its start, cut short if the next renewal starts sooner.
 */
export function subscriptionPeriods(records: readonly SubscriptionRecord[]): SubscriptionPeriod[] {
  const sorted = [...records].sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0));
  return sorted.map((record, i) => {
    const start = record.start_date;
    const fullEnd = addDays(start, PERIOD_DAYS - 1);
    const next = sorted[i + 1];
    const end = next && next.start_date <= fullEnd ? addDays(next.start_date, -1) : fullEnd;
    return { record, start, end, renewsOn: addDays(start, PERIOD_DAYS), days: daysBetween(start, end) + 1 };
  });
}

export type SubscriptionStatus =
  | { kind: 'none' }
  | { kind: 'active'; period: SubscriptionPeriod; day: number; daysLeft: number }
  | { kind: 'ended'; period: SubscriptionPeriod; daysSince: number }
  | { kind: 'upcoming'; period: SubscriptionPeriod; daysUntil: number };

/** Where `today` falls: inside a subscription, after the last one, or before the first. */
export function subscriptionStatus(records: readonly SubscriptionRecord[], today: ISODate): SubscriptionStatus {
  const periods = subscriptionPeriods(records);
  if (periods.length === 0) return { kind: 'none' };
  const active = periods.find((p) => p.start <= today && today <= p.end);
  if (active) {
    const day = daysBetween(active.start, today) + 1;
    return { kind: 'active', period: active, day, daysLeft: active.days - day };
  }
  const past = periods.filter((p) => p.end < today);
  if (past.length > 0) {
    const last = past[past.length - 1];
    if (!periods.some((p) => p.start > today)) return { kind: 'ended', period: last, daysSince: daysBetween(last.end, today) };
  }
  const next = periods.find((p) => p.start > today)!;
  return { kind: 'upcoming', period: next, daysUntil: daysBetween(today, next.start) };
}

/** Suggested start for the next renewal: right after the latest subscription ends. */
export function suggestedRenewalDate(records: readonly SubscriptionRecord[], today: ISODate): ISODate {
  const periods = subscriptionPeriods(records);
  return periods.length ? periods[periods.length - 1].renewsOn : today;
}

export function formatAmount(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(amount);
}
