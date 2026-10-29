import { describe, expect, it } from 'vitest';
import { computeStats } from '../../src/domain/stats';
import {
  daysBetween,
  formatAmount,
  subscriptionPeriods,
  subscriptionStatus,
  suggestedRenewalDate,
  type SubscriptionRecord,
} from '../../src/domain/subscription';

const rec = (start_date: string, amount: number | null = 4200, id = start_date): SubscriptionRecord => ({ id, start_date, amount });

describe('subscription periods (4 weeks from each renewal)', () => {
  it('a subscription covers its start date plus 27 days', () => {
    expect(subscriptionPeriods([rec('2026-11-02')])[0]).toMatchObject({ start: '2026-11-02', end: '2026-11-29', renewsOn: '2026-11-30', days: 28 });
  });

  it('periods are sorted oldest first, whatever order they were saved in', () => {
    const p = subscriptionPeriods([rec('2026-12-01'), rec('2026-11-02')]);
    expect(p.map((x) => x.start)).toEqual(['2026-11-02', '2026-12-01']);
  });

  it('an early renewal cuts the previous subscription short (no overlap)', () => {
    const p = subscriptionPeriods([rec('2026-11-02'), rec('2026-11-25')]);
    expect(p[0]).toMatchObject({ end: '2026-11-24', days: 23 });
    expect(p[1]).toMatchObject({ start: '2026-11-25', end: '2026-12-22', days: 28 });
  });

  it('a late renewal leaves a gap', () => {
    const p = subscriptionPeriods([rec('2026-11-02'), rec('2026-12-05')]);
    expect(p[0].end).toBe('2026-11-29');
    expect(p[1].start).toBe('2026-12-05');
  });

  it('handles month/year ends and leap years', () => {
    expect(subscriptionPeriods([rec('2027-12-20')])[0].end).toBe('2028-01-16');
    expect(subscriptionPeriods([rec('2028-02-10')])[0].end).toBe('2028-03-08');
    expect(daysBetween('2026-10-25', '2026-11-08')).toBe(14);
  });

  it('a full subscription has 24 delivery days and 48 meals (Sundays excluded)', () => {
    const p = subscriptionPeriods([rec('2026-11-02')])[0];
    const s = computeStats(p.start, p.end, new Map(), '2027-01-01');
    expect(s.scheduledDays).toBe(24);
    expect(s.scheduledTotal).toBe(48);
  });
});

describe('subscription status', () => {
  const records = [rec('2026-11-02')];

  it('none when nothing is recorded', () => {
    expect(subscriptionStatus([], '2026-11-10')).toEqual({ kind: 'none' });
  });

  it('active: day number and days left', () => {
    expect(subscriptionStatus(records, '2026-11-02')).toMatchObject({ kind: 'active', day: 1, daysLeft: 27 });
    expect(subscriptionStatus(records, '2026-11-29')).toMatchObject({ kind: 'active', day: 28, daysLeft: 0 });
  });

  it('ended: renewal is due', () => {
    expect(subscriptionStatus(records, '2026-12-01')).toMatchObject({ kind: 'ended', daysSince: 2 });
    expect(suggestedRenewalDate(records, '2026-12-01')).toBe('2026-11-30');
  });

  it('upcoming: the first subscription starts later', () => {
    expect(subscriptionStatus(records, '2026-10-30')).toMatchObject({ kind: 'upcoming', daysUntil: 3 });
  });

  it('in a gap between two subscriptions, the next one is upcoming', () => {
    const gap = [rec('2026-11-02'), rec('2026-12-05')];
    expect(subscriptionStatus(gap, '2026-12-02')).toMatchObject({ kind: 'upcoming', daysUntil: 3 });
  });

  it('with no records the suggested start is today', () => {
    expect(suggestedRenewalDate([], '2026-11-10')).toBe('2026-11-10');
  });
});

describe('amounts', () => {
  it('formats rupees, and a dash when no amount was entered', () => {
    expect(formatAmount(4200)).toMatch(/4,200/);
    expect(formatAmount(4200)).toMatch(/₹/);
    expect(formatAmount(99.5)).toMatch(/99\.50/);
    expect(formatAmount(null)).toBe('—');
  });
});
