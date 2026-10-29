import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, saveMeal, type TestDb, type TestUser } from './harness';

let t: TestDb;
let phoneA: TestUser;
let phoneB: TestUser;

const enter = (u: TestUser) => t.as(u, (tx) => tx.query('select public.enter_mealtrack()'));
const meals = (u: TestUser) => t.as(u, async (tx) => (await tx.query('select 1 from public.meal_overrides')).rows.length);

beforeAll(async () => {
  t = await createTestDb();
  phoneA = await t.createUser('a@anon');
  phoneB = await t.createUser('b@anon');
});
afterAll(() => t.close());

describe('open access (no sign-in)', () => {
  it('the first phone creates MealTrack automatically and can edit', async () => {
    await enter(phoneA);
    expect((await t.db.query('select 1 from public.households')).rows).toHaveLength(1);
    expect((await t.as(phoneA, (tx) => saveMeal(tx, '2026-10-27', 'lunch', { dish: 'egg', curry: true }, null))).status).toBe('saved');
  });

  it('every other phone gets straight in and sees the same records', async () => {
    await enter(phoneB);
    expect((await t.db.query('select 1 from public.households')).rows).toHaveLength(1);
    expect(await meals(phoneB)).toBe(1);
    expect((await t.as(phoneB, (tx) => saveMeal(tx, '2026-10-27', 'dinner', { status: 'not_received' }, null))).status).toBe('saved');
    expect(await meals(phoneA)).toBe(2);
  });

  it('entering again is harmless, and a previously pending phone is let in', async () => {
    await enter(phoneA);
    const c = await t.createUser('c@anon');
    const hid = (await t.db.query<{ id: string }>('select id from public.households')).rows[0].id;
    await t.db.query(`insert into public.household_members (household_id, user_id, role, display_name, status) values ($1, $2, 'member', 'Waiting', 'pending')`, [hid, c.id]);
    expect(await meals(c)).toBe(0);
    await enter(c);
    expect(await meals(c)).toBe(2);
    expect((await t.db.query('select 1 from public.household_members')).rows).toHaveLength(3);
  });

  it('signed-out visitors (no session at all) still get nothing', async () => {
    await expect(t.as(null, (tx) => tx.query('select public.enter_mealtrack()'))).rejects.toThrow(/permission denied/);
    await expect(t.as(null, (tx) => tx.query('select 1 from public.meal_overrides'))).rejects.toThrow(/permission denied/);
  });
});
