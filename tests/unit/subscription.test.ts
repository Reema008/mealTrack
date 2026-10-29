import { describe, expect, it } from 'vitest';
import { daysBetween, periodAt, periodFor, periodProgress } from '../../src/domain/subscription';
import { computeStats } from '../../src/domain/stats';

const RENEWAL = '2026-11-02'; // a Monday

describe('subscription periods (4 weeks from the renewal date)', () => {
  it('the first period is the renewal date plus 27 days', () => {
    expect(periodFor(RENEWAL, RENEWAL)).toEqual({ index: 0, start: '2026-11-02', end: '2026-11-29', renewsOn: '2026-11-30' });
    expect(periodFor(RENEWAL, '2026-11-29').index).toBe(0);
  });

  it('the next period starts automatically after 28 days', () => {
    expect(periodFor(RENEWAL, '2026-11-30')).toEqual({ index: 1, start: '2026-11-30', end: '2026-12-27', renewsOn: '2026-12-28' });
    expect(periodAt(RENEWAL, 2).start).toBe('2026-12-28');
  });

  it('dates before the renewal fall in earlier periods', () => {
    expect(periodFor(RENEWAL, '2026-11-01')).toMatchObject({ index: -1, start: '2026-10-05', end: '2026-11-01' });
  });

  it('works across month and year ends and leap days', () => {
    expect(periodFor('2027-12-20', '2028-01-16')).toMatchObject({ index: 0, end: '2028-01-16', renewsOn: '2028-01-17' });
    expect(periodAt('2028-02-10', 0).end).toBe('2028-03-08'); // 2028 is a leap year
    expect(daysBetween('2026-10-25', '2026-11-08')).toBe(14); // across a DST change elsewhere
  });

  it('progress shows the day number and days left', () => {
    expect(periodProgress(RENEWAL, '2026-11-02')).toMatchObject({ day: 1, daysLeft: 27 });
    expect(periodProgress(RENEWAL, '2026-11-15')).toMatchObject({ day: 14, daysLeft: 14 });
    expect(periodProgress(RENEWAL, '2026-11-29')).toMatchObject({ day: 28, daysLeft: 0 });
  });

  it('a full period has 24 delivery days and 48 meals (Sundays excluded)', () => {
    const p = periodAt(RENEWAL, 0);
    const s = computeStats(p.start, p.end, new Map(), '2027-01-01');
    expect(s.scheduledDays).toBe(24);
    expect(s.scheduledTotal).toBe(48);
  });
});
