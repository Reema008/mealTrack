import { getDayType } from '../src/domain/schedule';
import type { MealOverride } from '../src/domain/types';

let seq = 0;

/** Build a meal_overrides row; unspecified fields take the day's defaults. */
export function override(partial: Partial<MealOverride> & Pick<MealOverride, 'meal_date' | 'meal_period'>): MealOverride {
  seq++;
  const nonveg = getDayType(partial.meal_date) === 'nonveg';
  return {
    id: `id-${seq}`,
    household_id: 'h1',
    delivery_status: 'delivered',
    main_dish: nonveg ? 'chicken' : null,
    extra_curry_received: nonveg ? true : null,
    created_by: 'u1',
    updated_by: 'u1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    version: 1,
    ...partial,
  };
}
