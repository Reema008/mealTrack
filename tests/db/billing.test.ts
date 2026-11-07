import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, joinFamily, setupFamily, type TestDb, type TestUser } from './harness';

const FRI = '2026-10-30';
let t: TestDb;
let admin: TestUser;
let member: TestUser;
let homeId: string;

const save = (u: TestUser, period: string, received: boolean | null, type: string | null, version: number | null, status = 'delivered') =>
  t.as(u, async (tx) => {
    const r = await tx.query<{ r: { status: string; row: { extra_curry_type: string | null; version: number } | null } }>(
      'select public.save_meal_v2($1, $2, $3, $4, $5, $6, $7) as r',
      [FRI, period, status, status === 'delivered' ? 'chicken' : null, received, type, version],
    );
    return r.rows[0].r;
  });

beforeAll(async () => {
  t = await createTestDb();
  admin = await t.createUser('admin@example.com');
  member = await t.createUser('member@example.com');
  homeId = await setupFamily(t, admin, 'Home');
  await joinFamily(t, member, 'member');
});
afterAll(() => t.close());

describe('extra curry type', () => {
  it('saves an egg curry, and going back to chicken (the default) removes the record', async () => {
    const saved = await save(member, 'lunch', true, 'egg', null);
    expect(saved).toMatchObject({ status: 'saved', row: { extra_curry_type: 'egg' } });
    const back = await save(member, 'lunch', true, 'chicken', saved.row!.version);
    expect(back.status).toBe('deleted');
  });

  it('a missing egg curry is remembered as egg', async () => {
    const r = await save(member, 'dinner', false, 'egg', null);
    expect(r.row).toMatchObject({ extra_curry_type: 'egg' });
  });

  it('a meal that was not delivered keeps no curry type', async () => {
    const r = await save(member, 'lunch', null, 'egg', null, 'not_received');
    expect(r.row).toMatchObject({ extra_curry_type: null });
  });

  it('older app versions (save_meal) keep the curry type already saved', async () => {
    const current = await t.as(member, (tx) => tx.query<{ version: number }>(`select version from public.meal_overrides where meal_date = $1 and meal_period = 'dinner'`, [FRI]));
    await t.as(member, (tx) => tx.query(`select public.save_meal($1, 'dinner', 'delivered', 'egg', false, $2)`, [FRI, current.rows[0].version]));
    const row = await t.db.query<{ main_dish: string; extra_curry_type: string }>(`select main_dish, extra_curry_type from public.meal_overrides where meal_date = $1 and meal_period = 'dinner'`, [FRI]);
    expect(row.rows[0]).toEqual({ main_dish: 'egg', extra_curry_type: 'egg' });
  });

  it('the database rejects a curry type on a veg day', async () => {
    await expect(
      t.db.query(`insert into public.meal_overrides (household_id, meal_date, meal_period, delivery_status, extra_curry_type) values ($1, '2026-10-29', 'lunch', 'delivered', 'egg')`, [homeId]),
    ).rejects.toThrow(/meal_overrides_curry_type/);
  });
});

describe('prices and start day', () => {
  it('default to ₹6600 a month from the 1st, ₹90 / ₹150 meals, ₹70 / ₹30 curries', async () => {
    const r = await t.as(member, (tx) =>
      tx.query('select billing_day, monthly_amount::float, veg_meal_price::float, nonveg_meal_price::float, chicken_curry_price::float, egg_curry_price::float from public.households'),
    );
    expect(r.rows[0]).toEqual({ billing_day: 1, monthly_amount: 6600, veg_meal_price: 90, nonveg_meal_price: 150, chicken_curry_price: 70, egg_curry_price: 30 });
  });

  it('an admin can change them; a member cannot', async () => {
    await t.as(admin, (tx) => tx.query('update public.households set monthly_amount = 7000, billing_day = 5 where id = $1', [homeId]));
    const changed = await t.as(member, (tx) => tx.query('update public.households set monthly_amount = 1 where id = $1 returning id', [homeId]));
    expect(changed.rows).toHaveLength(0);
    const r = await t.db.query<{ monthly_amount: string; billing_day: number }>('select monthly_amount, billing_day from public.households where id = $1', [homeId]);
    expect(Number(r.rows[0].monthly_amount)).toBe(7000);
    expect(r.rows[0].billing_day).toBe(5);
  });

  it('the start day must be 1–28', async () => {
    await expect(t.as(admin, (tx) => tx.query('update public.households set billing_day = 31 where id = $1', [homeId]))).rejects.toThrow(/households_billing_check/);
  });
});
