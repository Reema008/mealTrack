import { describe, expect, it } from 'vitest';
import { mealsForDate, toOverrideMap } from '../../src/domain/meals';
import { addHappiness, dayOutcome, fullWeek, happinessNow, menuLine, streakFrom, type PetMemory } from '../../src/lib/petLife';
import { END_OF_DAY_MINUTES } from '../../src/domain/meals';
import type { MealOverride } from '../../src/domain/types';

describe('Mochi delivery streak: Monday to Saturday', () => {
  // Week of Mon 2 – Sat 7 Nov 2026. Meals nobody changed count as delivered.
  const cancel = (date: string, period: 'lunch' | 'dinner'): MealOverride => ({
    id: date + period, household_id: 'h', meal_date: date, meal_period: period, delivery_status: 'not_received',
    main_dish: null, extra_curry_received: null, created_by: null, updated_by: null, created_at: '', updated_at: '', version: 1,
  });
  const outcomes = (rows: MealOverride[], today: string, now = END_OF_DAY_MINUTES) => {
    const map = toOverrideMap(rows);
    return (d: string) => dayOutcome(d, map, today, now);
  };

  it('counts days from Monday when both meals were delivered', () => {
    expect(streakFrom(outcomes([], '2026-11-07'), '2026-11-07')).toBe(6);
    expect(streakFrom(outcomes([], '2026-11-05'), '2026-11-05')).toBe(4);
  });

  it('today counts only once its meals are delivered; until then up to yesterday', () => {
    expect(streakFrom(outcomes([], '2026-11-07', 10 * 60), '2026-11-07')).toBe(5);
  });

  it('a cancelled meal breaks it', () => {
    expect(streakFrom(outcomes([cancel('2026-11-04', 'dinner')], '2026-11-07'), '2026-11-07')).toBe(3);
    expect(streakFrom(outcomes([cancel('2026-11-07', 'lunch')], '2026-11-07', 10 * 60), '2026-11-07')).toBe(0);
  });

  it('Sunday shows the week just ended; Monday starts again', () => {
    expect(streakFrom(outcomes([], '2026-11-08'), '2026-11-08')).toBe(6);
    expect(streakFrom(outcomes([], '2026-11-09', 10 * 60), '2026-11-09')).toBe(0);
  });

  it('knows a fully delivered week', () => {
    expect(fullWeek(outcomes([], '2026-11-07'), '2026-11-02')).toBe(true);
    expect(fullWeek(outcomes([cancel('2026-11-04', 'dinner')], '2026-11-07'), '2026-11-02')).toBe(false);
  });
});

describe('Mochi happiness', () => {
  const m: PetMemory = { happiness: 80, at: 0, lastSeen: 0, celebrated: 0 };
  it('fades slowly over time and never leaves 0–100', () => {
    expect(happinessNow(m, 10 * 3_600_000)).toBe(50);
    expect(happinessNow(m, 100 * 3_600_000)).toBe(0);
    expect(happinessNow(addHappiness(m, 50, 0), 0)).toBe(100);
  });
});

describe("today's menu", () => {
  it('describes non-veg, veg and Sunday days', () => {
    const none = toOverrideMap([]);
    expect(menuLine(mealsForDate('2026-11-06', none, '2026-11-06'))).toBe("Today's menu ✦ Lunch: chicken + chicken curry · Dinner: chicken + chicken curry");
    expect(menuLine(mealsForDate('2026-11-05', none, '2026-11-05'))).toBe("Today's menu ✦ Lunch: veg meal · Dinner: veg meal");
    expect(menuLine(mealsForDate('2026-11-08', none, '2026-11-08'))).toMatch(/Sunday/);
  });
});
