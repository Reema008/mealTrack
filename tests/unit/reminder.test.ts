import { describe, expect, it } from 'vitest';
import {
  localParts,
  REMINDER_BODY,
  REMINDER_TITLE,
  reminderLink,
  reminderPayload,
  reminderPlan,
} from '../../supabase/functions/_shared/reminder';

const IST = 'Asia/Kolkata';

describe('daily 10 PM reminder timing', () => {
  it('is due at 22:00 IST Monday–Saturday', () => {
    // 22:00 IST = 16:30 UTC. 2026-10-26 is a Monday.
    const days = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'];
    for (const d of days) {
      const plan = reminderPlan(new Date(`${d}T16:30:00Z`), IST);
      expect(plan).toEqual({ due: true, reminderDate: d, reason: 'due' });
    }
  });

  it('is not sent on Sunday', () => {
    expect(reminderPlan(new Date('2026-11-01T16:30:00Z'), IST)).toMatchObject({ due: false, reason: 'sunday' });
  });

  it('a Monday reminder references Monday, not Sunday (UTC date still Monday afternoon)', () => {
    const plan = reminderPlan(new Date('2026-10-26T16:45:00Z'), IST);
    expect(plan.reminderDate).toBe('2026-10-26');
    expect(localParts(new Date('2026-10-26T16:45:00Z'), IST)).toMatchObject({ isoWeekday: 1, hour: 22, minute: 15 });
  });

  it('uses the local date even when UTC is already the next day', () => {
    // 2026-10-31 (Sat) 23:59 in Los Angeles = 2026-11-01 06:59 UTC (Sunday in UTC)
    const plan = reminderPlan(new Date('2026-11-01T06:59:00Z'), 'America/Los_Angeles');
    expect(plan).toEqual({ due: true, reminderDate: '2026-10-31', reason: 'due' });
  });

  it('is not due before 22:00 local', () => {
    expect(reminderPlan(new Date('2026-10-26T16:29:00Z'), IST)).toMatchObject({ due: false, reason: 'too-early' });
  });

  it('is not due after local midnight (next day, before 22:00)', () => {
    // 00:05 IST Tuesday
    expect(reminderPlan(new Date('2026-10-26T18:35:00Z'), IST)).toMatchObject({ due: false, reminderDate: '2026-10-27' });
  });

  it('handles daylight-saving changes (New York, before and after DST ends 2026-11-01)', () => {
    // EDT (UTC-4): Sat 2026-10-31 22:00 local = 02:00 UTC Nov 1
    expect(reminderPlan(new Date('2026-11-01T02:00:00Z'), 'America/New_York')).toEqual({
      due: true,
      reminderDate: '2026-10-31',
      reason: 'due',
    });
    // EST (UTC-5): Mon 2026-11-02 22:00 local = 03:00 UTC Nov 3; 02:00 UTC would be 21:00 local
    expect(reminderPlan(new Date('2026-11-03T02:00:00Z'), 'America/New_York').due).toBe(false);
    expect(reminderPlan(new Date('2026-11-03T03:00:00Z'), 'America/New_York')).toEqual({
      due: true,
      reminderDate: '2026-11-02',
      reason: 'due',
    });
  });

  it('builds a short one-line reminder and a deep link to the date', () => {
    expect(REMINDER_TITLE).toBe('MealTrack');
    expect(REMINDER_BODY).toBe("Did today's lunch and dinner arrive? Tap to check.");
    expect(REMINDER_BODY).not.toContain('\n');
    expect(reminderLink('https://me.github.io/mealtrack/', '2026-10-26')).toBe('https://me.github.io/mealtrack/#/day/2026-10-26');
    expect(reminderPayload('https://x.dev', '2026-10-26')).toMatchObject({ url: 'https://x.dev/#/day/2026-10-26', tag: 'mealtrack-reminder-2026-10-26' });
  });
});
