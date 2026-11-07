// Mochi's memory and moods: streaks, happiness, the season, and what to say
// about today's meals. Kept on this phone only (localStorage).
import { addDays, startOfWeek, weekdayOf } from '../domain/dates';
import { mealsForDate } from '../domain/meals';
import type { EffectiveMeal, ISODate, OverrideMap } from '../domain/types';

const MEMORY_KEY = 'mealtrack.pet.memory';
/** A full delivery week: food delivered every day Monday to Saturday. */
export const STREAK_GOAL = 6;
/** Happiness lost per hour without attention. */
const FADE_PER_HOUR = 3;
/** Away this long and Mochi gets sleepy and misses you. */
export const MISSED_YOU_HOURS = 48;

export interface PetMemory {
  happiness: number;
  /** When `happiness` was last set (ms). */
  at: number;
  /** Last time anyone played with or opened Mochi (ms). */
  lastSeen: number;
  /** Monday of the last week whose full streak was celebrated (each week is celebrated once). */
  celebrated: ISODate | number;
}

const fresh = (now: number): PetMemory => ({ happiness: 70, at: now, lastSeen: now, celebrated: 0 });

export function loadMemory(now = Date.now()): PetMemory {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    return raw ? { ...fresh(now), ...(JSON.parse(raw) as Partial<PetMemory>) } : fresh(now);
  } catch {
    return fresh(now);
  }
}

export function saveMemory(m: PetMemory) {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(m));
  } catch {
    /* not remembered */
  }
}

/** Happiness now (0–100): it fades slowly over time. */
export function happinessNow(m: PetMemory, now = Date.now()): number {
  const hours = Math.max(0, (now - m.at) / 3_600_000);
  return Math.max(0, Math.min(100, Math.round(m.happiness - hours * FADE_PER_HOUR)));
}

export function addHappiness(m: PetMemory, delta: number, now = Date.now()): PetMemory {
  return { ...m, happiness: Math.max(0, Math.min(100, happinessNow(m, now) + delta)), at: now, lastSeen: now };
}

const isSunday = (d: ISODate) => weekdayOf(d) === 0; // JS numbering: Sunday = 0

/** Monday of the delivery week (Mon–Sat) that `date` belongs to; Sunday belongs to the week just ended. */
export function deliveryWeekStart(date: ISODate): ISODate {
  return startOfWeek(isSunday(date) ? addDays(date, -1) : date);
}

/** How a delivery day went: both meals delivered, a meal cancelled, or not finished yet. */
export type DayOutcome = 'delivered' | 'cancelled' | 'pending';

export function dayOutcome(date: ISODate, overrides: OverrideMap, today: ISODate, nowMinutes?: number): DayOutcome | null {
  const meals = mealsForDate(date, overrides, today, nowMinutes);
  if (meals.length === 0) return null; // Sunday
  if (meals.some((m) => m.deliveryStatus === 'not_received')) return 'cancelled';
  if (meals.some((m) => m.timing === 'pending' || m.timing === 'future')) return 'pending';
  return 'delivered';
}

/**
 * This week's delivery streak: days in a row, from Monday, when both lunch and
 * dinner were delivered. Today counts once its meals are delivered; until
 * then the streak runs up to yesterday. A cancelled meal breaks it. It starts
 * again every Monday; on Sunday it shows the week just ended.
 */
export function streakFrom(outcome: (d: ISODate) => DayOutcome | null, today: ISODate): number {
  const monday = deliveryWeekStart(today);
  let d = isSunday(today) ? addDays(today, -1) : today;
  if (outcome(d) === 'pending') d = addDays(d, -1);
  let n = 0;
  while (d >= monday && outcome(d) === 'delivered') {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** True when food was delivered every day Monday to Saturday of the week starting `monday`. */
export function fullWeek(outcome: (d: ISODate) => DayOutcome | null, monday: ISODate): boolean {
  return Array.from({ length: STREAK_GOAL }, (_, i) => addDays(monday, i)).every((d) => outcome(d) === 'delivered');
}

/** Mochi wears the crown for a fully delivered week, and all through the next week. */
export function hasCrown(outcome: (d: ISODate) => DayOutcome | null, today: ISODate): boolean {
  const monday = deliveryWeekStart(today);
  return fullWeek(outcome, monday) || fullWeek(outcome, addDays(monday, -7));
}

export type Season = 'diwali' | 'newyear' | 'winter' | 'monsoon' | null;

/** Diwali (Lakshmi Puja) dates. */
const DIWALI: ISODate[] = ['2026-11-08', '2027-10-29', '2028-10-17', '2029-11-05', '2030-10-26'];

/** Seasonal look for a date: Diwali, New Year, winter (Dec–Feb) or monsoon (Jun–Sep). */
export function seasonFor(date: ISODate): Season {
  if (DIWALI.some((d) => Math.abs(Date.parse(d) - Date.parse(date)) <= 2 * 86_400_000)) return 'diwali';
  const md = date.slice(5);
  if (md >= '12-31' || md <= '01-02') return 'newyear';
  const month = Number(date.slice(5, 7));
  if (month === 12 || month <= 2) return 'winter';
  if (month >= 6 && month <= 9) return 'monsoon';
  return null;
}

export const SEASON_LINES: Record<Exclude<Season, null>, string[]> = {
  diwali: ['Happy Diwali! ✦ Look at my diya!', 'Shubh Deepavali ♡', 'So many lights ✦'],
  newyear: ['Happy New Year! ✦', 'New year, new meals ♡'],
  winter: ['Brrr, so cosy in my scarf ♡', 'Snowflakes! ✦'],
  monsoon: ['Pitter patter… good thing I have my umbrella ☂', 'Rainy day = hot curry day ♡'],
};

/** "Today: non-veg — chicken with chicken curry" style summary of today's meals. */
export function menuLine(meals: EffectiveMeal[]): string {
  if (meals.length === 0) return 'Sunday! No meals today, picnic time ♡';
  const nonveg = meals[0].dayType === 'nonveg';
  const coming = meals.filter((m) => m.deliveryStatus === 'delivered');
  if (coming.length === 0) return 'Both meals are cancelled today… ♡ hug?';
  const parts = coming.map((m) => {
    const what = nonveg ? `${m.mainDish === 'egg' ? 'egg' : 'chicken'}${m.extraCurryReceived ? ` + ${m.extraCurryType === 'egg' ? 'egg' : 'chicken'} curry` : ''}` : 'veg meal';
    return `${m.period === 'lunch' ? 'Lunch' : 'Dinner'}: ${what}`;
  });
  return `Today's menu ✦ ${parts.join(' · ')}`;
}
