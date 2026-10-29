import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toOverrideMap, mealsForDate } from '../../src/domain/meals';
import type { MealOverride } from '../../src/domain/types';
import { createTestDb, joinAndApprove, saveMeal, setupFamily, type TestDb, type TestUser } from './harness';

// 2026-10-27 Tue (non-veg), 2026-10-29 Thu (veg), 2026-11-01 Sun
const TUE = '2026-10-27';
const THU = '2026-10-29';
const SUN = '2026-11-01';

let t: TestDb;
let alice: TestUser; // admin
let bob: TestUser; // member
let householdId: string;

async function overridesFor(user: TestUser): Promise<MealOverride[]> {
  return t.as(user, async (tx) => {
    const r = await tx.query<MealOverride>(
      `select id, household_id, to_char(meal_date, 'YYYY-MM-DD') as meal_date, meal_period, delivery_status,
              main_dish, extra_curry_received, created_by, updated_by, created_at::text, updated_at::text, version
         from public.meal_overrides order by meal_date, meal_period`,
    );
    return r.rows;
  });
}

beforeAll(async () => {
  t = await createTestDb();
  alice = await t.createUser('alice@example.com');
  bob = await t.createUser('bob@example.com');

  householdId = await setupFamily(t, alice, 'Sharma Family');
  await joinAndApprove(t, alice, bob);
});

afterAll(() => t.close());

describe('meal overrides (database)', () => {
  it('stores nothing when no one has made a change', async () => {
    expect(await overridesFor(alice)).toEqual([]);
  });

  it('7. changing Tuesday lunch to egg leaves dinner at its default', async () => {
    const r = await t.as(alice, (tx) => saveMeal(tx, TUE, 'lunch', { dish: 'egg', curry: true }, null));
    expect(r.status).toBe('saved');
    expect(r.row).toMatchObject({ main_dish: 'egg', extra_curry_received: true, version: 1 });

    const rows = await overridesFor(alice);
    expect(rows).toHaveLength(1);
    const [lunch, dinner] = mealsForDate(TUE, toOverrideMap(rows), '2026-12-01');
    expect(lunch).toMatchObject({ mainDish: 'egg', source: 'explicit' });
    expect(dinner).toMatchObject({ mainDish: 'chicken', extraCurryReceived: true, source: 'assumed' });
  });

  it('11/12. an override saved by one member is visible to another member', async () => {
    const rows = await overridesFor(bob);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ meal_date: TUE, meal_period: 'lunch', main_dish: 'egg', created_by: alice.id });
  });

  it('8. marking a meal not received clears its main dish and extra curries', async () => {
    const current = (await overridesFor(bob))[0];
    const r = await t.as(bob, (tx) => saveMeal(tx, TUE, 'lunch', { status: 'not_received', dish: 'egg', curry: true }, current.version));
    expect(r.status).toBe('saved');
    expect(r.row).toMatchObject({ delivery_status: 'not_received', main_dish: null, extra_curry_received: null, version: 2 });
    expect((await overridesFor(alice))[0]).toMatchObject({ updated_by: bob.id, created_by: alice.id });
  });

  it('9. extra curries can be not received while the meal stays delivered', async () => {
    const r = await t.as(alice, (tx) => saveMeal(tx, TUE, 'dinner', { dish: 'chicken', curry: false }, null));
    expect(r.row).toMatchObject({ delivery_status: 'delivered', main_dish: 'chicken', extra_curry_received: false });
  });

  it('10. restoring the defaults deletes the override', async () => {
    const dinner = (await overridesFor(alice)).find((r) => r.meal_period === 'dinner')!;
    const r = await t.as(alice, (tx) => saveMeal(tx, TUE, 'dinner', { dish: 'chicken', curry: true }, dinner.version));
    expect(r).toEqual({ status: 'deleted', row: null });
    const rows = await overridesFor(alice);
    expect(rows.find((x) => x.meal_period === 'dinner')).toBeUndefined();
  });

  it('saving the default when no override exists writes nothing', async () => {
    const r = await t.as(alice, (tx) => saveMeal(tx, THU, 'lunch', {}, null));
    expect(r.status).toBe('unchanged');
    expect((await overridesFor(alice)).some((x) => x.meal_date === THU)).toBe(false);
  });

  it('veg day stores no non-veg fields even if the client sends them', async () => {
    const r = await t.as(alice, (tx) => saveMeal(tx, THU, 'dinner', { status: 'not_received', dish: 'egg', curry: false }, null));
    expect(r.row).toMatchObject({ delivery_status: 'not_received', main_dish: null, extra_curry_received: null });
  });

  it('rejects Sunday overrides and incomplete non-veg rows', async () => {
    await expect(t.as(alice, (tx) => saveMeal(tx, SUN, 'lunch', { status: 'not_received' }, null))).rejects.toThrow(/Sunday/);
    await expect(t.as(alice, (tx) => saveMeal(tx, TUE, 'dinner', { status: 'delivered' }, null))).rejects.toThrow(/required/);
    // A not-delivered non-veg row with dish details is rejected by the table itself.
    await expect(
      t.as(alice, (tx) =>
        tx.query(
          `insert into public.meal_overrides (household_id, meal_date, meal_period, delivery_status, main_dish, extra_curry_received)
           values ($1, '2026-10-30', 'lunch', 'not_received', 'egg', true)`,
          [householdId],
        ),
      ),
    ).rejects.toThrow(/meal_overrides_shape/);
    // Direct table writes are also guarded by CHECK constraints.
    await expect(
      t.as(alice, (tx) =>
        tx.query(
          `insert into public.meal_overrides (household_id, meal_date, meal_period, delivery_status) values ($1, $2, 'lunch', 'delivered')`,
          [householdId, SUN],
        ),
      ),
    ).rejects.toThrow(/meal_overrides_not_sunday/);
  });

  it('a whole day can be marked not delivered and restored', async () => {
    const FRI = '2026-10-30';
    for (const p of ['lunch', 'dinner'] as const) {
      const r = await t.as(alice, (tx) => saveMeal(tx, FRI, p, { status: 'not_received' }, null));
      expect(r.row).toMatchObject({ delivery_status: 'not_received', main_dish: null, extra_curry_received: null });
    }
    const rows = (await overridesFor(bob)).filter((r) => r.meal_date === FRI);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const r = await t.as(bob, (tx) => saveMeal(tx, FRI, row.meal_period, { dish: 'chicken', curry: true }, row.version));
      expect(r.status).toBe('deleted');
    }
    expect((await overridesFor(alice)).filter((r) => r.meal_date === FRI)).toHaveLength(0);
  });

  it('the unique key prevents duplicate rows for the same meal', async () => {
    await expect(
      t.as(alice, (tx) =>
        tx.query(
          `insert into public.meal_overrides (household_id, meal_date, meal_period, delivery_status, main_dish, extra_curry_received)
           values ($1, $2, 'lunch', 'delivered', 'egg', false)`,
          [householdId, TUE],
        ),
      ),
    ).rejects.toThrow(/meal_overrides_household_date_period_key/);
  });

  it('clients cannot forge authorship or version', async () => {
    const row = (await overridesFor(alice)).find((r) => r.meal_date === TUE && r.meal_period === 'lunch')!;
    await t.as(alice, (tx) =>
      tx.query(`update public.meal_overrides set version = 99, created_by = $2, meal_date = '2026-10-28' where id = $1`, [row.id, bob.id]),
    );
    const after = (await overridesFor(alice)).find((r) => r.id === row.id)!;
    expect(after).toMatchObject({ version: row.version + 1, created_by: row.created_by, meal_date: TUE, updated_by: alice.id });
  });
});
