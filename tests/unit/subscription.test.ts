import { describe, expect, it } from 'vitest';
import { billingPeriodFor } from '../../src/domain/billing';
import { daysBetween, firstSubscriptionStart, formatAmount, paymentFor, periodProgress, subscriptionMonths, type SubscriptionRecord } from '../../src/domain/subscription';

const rec = (start_date: string, amount: number | null = 6600, id = start_date): SubscriptionRecord => ({ id, start_date, amount });

describe('monthly subscription payments', () => {
  const nov = billingPeriodFor('2026-11-07', 1);

  it('finds the payment recorded for a month, even if it was entered on a later day', () => {
    expect(paymentFor([rec('2026-10-01'), rec('2026-11-03', 6260)], nov, 1)?.amount).toBe(6260);
    expect(paymentFor([rec('2026-10-01')], nov, 1)).toBeNull();
  });

  it('progress counts the day of the subscription and the days left', () => {
    expect(periodProgress(nov, '2026-11-07')).toEqual({ day: 7, daysLeft: 23 });
    expect(periodProgress(nov, '2026-11-30')).toEqual({ day: 30, daysLeft: 0 });
  });

  it('history starts from the first recorded payment (October), newest first', () => {
    const months = subscriptionMonths([rec('2026-10-01')], '2026-11-07', 1).map((p) => p.start);
    expect(months).toEqual(['2026-11-01', '2026-10-01']);
    expect(firstSubscriptionStart([rec('2026-11-01'), rec('2026-10-01')], 1)).toBe('2026-10-01');
  });

  it('with no payments yet only this month is listed; a month paid in advance is included', () => {
    expect(subscriptionMonths([], '2026-11-07', 1).map((p) => p.start)).toEqual(['2026-11-01']);
    expect(subscriptionMonths([rec('2026-10-01'), rec('2026-12-01')], '2026-11-07', 1).map((p) => p.start)).toEqual(['2026-12-01', '2026-11-01', '2026-10-01']);
  });

  it('counts days in UTC and formats rupees', () => {
    expect(daysBetween('2026-10-31', '2026-11-01')).toBe(1);
    expect(formatAmount(6600)).toBe('₹6,600');
    expect(formatAmount(null)).toBe('—');
  });
});
