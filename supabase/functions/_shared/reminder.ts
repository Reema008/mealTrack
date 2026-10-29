// Pure reminder timing logic. Shared by the Edge Function (Deno) and the
// Vitest suite (Node), so it must not import anything.

export const REMINDER_TITLE = 'MealTrack';
export const REMINDER_BODY = "Did today's lunch and dinner arrive? Tap to check.";

/** Local hour (24h) at which the reminder becomes due. */
export const REMINDER_HOUR = 22;

export interface LocalParts {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  isoWeekday: number;
  hour: number;
  minute: number;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Wall-clock parts of `now` in an IANA timezone (DST-aware via Intl). */
export function localParts(now: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    isoWeekday: WEEKDAYS[get('weekday')],
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
  };
}

export interface ReminderPlan {
  due: boolean;
  /** The household-local date the reminder is about (always "today" locally). */
  reminderDate: string;
  reason: 'due' | 'sunday' | 'too-early';
}

/**
 * Whether a household's daily reminder is due at `now`. It is due from
 * 22:00 to 23:59 local time, Monday–Saturday. A window (rather than an exact
 * minute) means a delayed or missed cron tick still sends it; the
 * notification log's unique (subscription, date) key prevents duplicates.
 */
export function reminderPlan(now: Date, timeZone: string): ReminderPlan {
  const p = localParts(now, timeZone);
  if (p.isoWeekday === 7) return { due: false, reminderDate: p.date, reason: 'sunday' };
  if (p.hour < REMINDER_HOUR) return { due: false, reminderDate: p.date, reason: 'too-early' };
  return { due: true, reminderDate: p.date, reason: 'due' };
}

/** Deep link that opens the given date in the app (HashRouter route). */
export function reminderLink(appUrl: string, date: string): string {
  return `${appUrl.replace(/\/+$/, '')}/#/day/${date}`;
}

export function reminderPayload(appUrl: string, date: string) {
  return {
    title: REMINDER_TITLE,
    body: REMINDER_BODY,
    url: reminderLink(appUrl, date),
    date,
    tag: `mealtrack-reminder-${date}`,
  };
}
