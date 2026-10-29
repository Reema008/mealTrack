import type { ISODate } from './types';

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(value: string): value is ISODate {
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function toUTC(date: ISODate): Date {
  if (!isISODate(date)) throw new Error(`Invalid date: ${date}`);
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUTC(dt: Date): ISODate {
  return dt.toISOString().slice(0, 10);
}

/**
 * Day of week for a calendar date: 0 = Sunday … 6 = Saturday.
 * Computed in UTC so the device's own timezone can never shift the weekday.
 */
export function weekdayOf(date: ISODate): number {
  return toUTC(date).getUTCDay();
}

export function addDays(date: ISODate, days: number): ISODate {
  const dt = toUTC(date);
  dt.setUTCDate(dt.getUTCDate() + days);
  return fromUTC(dt);
}

/** First day of the month `months` away from the month containing `date`. */
export function addMonths(date: ISODate, months: number): ISODate {
  const [y, m] = date.split('-').map(Number);
  return fromUTC(new Date(Date.UTC(y, m - 1 + months, 1)));
}

/** Inclusive list of dates from start to end. */
export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: ISODate): ISODate {
  const dow = weekdayOf(date);
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

export function endOfWeek(date: ISODate): ISODate {
  return addDays(startOfWeek(date), 6);
}

export function startOfMonth(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: ISODate): ISODate {
  return addDays(addMonths(date, 1), -1);
}

/** Today's calendar date in an IANA timezone (e.g. "Asia/Kolkata"). */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Format a calendar date for display; uses UTC so the date itself never shifts. */
export function formatDate(date: ISODate, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' }).format(toUTC(date));
}

export const formatLong = (date: ISODate) =>
  formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const formatShort = (date: ISODate) => formatDate(date, { weekday: 'short', day: 'numeric', month: 'short' });
export const formatMonth = (date: ISODate) => formatDate(date, { month: 'long', year: 'numeric' });
export const weekdayName = (date: ISODate) => formatDate(date, { weekday: 'long' });
export const weekdayShort = (date: ISODate) => formatDate(date, { weekday: 'short' });
