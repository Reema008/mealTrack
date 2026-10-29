import { describe, expect, it } from 'vitest';
import { applyMigration, createTestDb, migrationFiles } from './harness';

const FAMILY_PIN_MIGRATION = migrationFiles().find((f) => f.endsWith('_family_pin.sql'))!;
const NOT_DELIVERED_MIGRATION = migrationFiles().find((f) => f.endsWith('_not_delivered_clears_dish.sql'))!;
const APPROVAL_MIGRATION = migrationFiles().find((f) => f.endsWith('_admin_approval.sql'))!;
const PERSONAL_PIN_MIGRATION = migrationFiles().find((f) => f.endsWith('_personal_pins.sql'))!;

describe('upgrading an existing database', () => {
  it('clears dish/curry on existing not-delivered non-veg rows (real-world upgrade failure)', async () => {
    // Database as it was before the PIN + not-delivered changes.
    const t = await createTestDb(FAMILY_PIN_MIGRATION.slice(0, 14));
    const user = await t.createUser('old@example.com');
    const hid = (await t.as(user, (tx) => tx.query<{ id: string }>(`select id from public.create_household('Old', 'Me')`))).rows[0].id;
    await t.as(user, (tx) =>
      tx.query(
        `insert into public.meal_overrides (household_id, meal_date, meal_period, delivery_status, main_dish, extra_curry_received)
         values ($1, '2026-10-27', 'lunch', 'not_received', 'chicken', true),
                ($1, '2026-10-28', 'dinner', 'delivered', 'egg', false)`,
        [hid],
      ),
    );

    await applyMigration(t.db, FAMILY_PIN_MIGRATION);
    await applyMigration(t.db, NOT_DELIVERED_MIGRATION);
    await applyMigration(t.db, APPROVAL_MIGRATION);

    const rows = await t.db.query<{ meal_date: string; delivery_status: string; main_dish: string | null; extra_curry_received: boolean | null }>(
      `select to_char(meal_date, 'YYYY-MM-DD') as meal_date, delivery_status, main_dish, extra_curry_received from public.meal_overrides order by meal_date`,
    );
    expect(rows.rows).toEqual([
      { meal_date: '2026-10-27', delivery_status: 'not_received', main_dish: null, extra_curry_received: null },
      { meal_date: '2026-10-28', delivery_status: 'delivered', main_dish: 'egg', extra_curry_received: false },
    ]);

    // The pre-existing household has no PIN yet; the SQL-editor helper sets one.
    expect((await t.db.query<{ s: string }>('select public.mealtrack_status() as s')).rows[0].s).toBe('needs_pin');
    await t.db.query(`select public.admin_set_family_pin('135790')`);
    expect((await t.db.query<{ s: string }>('select public.mealtrack_status() as s')).rows[0].s).toBe('ready');
    // The person who created the old household is kept as an approved admin.
    const me = await t.db.query<{ role: string; status: string }>('select role, status from public.household_members where user_id = $1', [user.id]);
    expect(me.rows).toEqual([{ role: 'admin', status: 'approved' }]);
    expect(await t.as(user, async (tx) => (await tx.query('select 1 from public.meal_overrides')).rows.length)).toBe(2);
    await t.close();
  });

  it('the upgrade can safely be run twice', async () => {
    const t = await createTestDb();
    await applyMigration(t.db, FAMILY_PIN_MIGRATION);
    await applyMigration(t.db, NOT_DELIVERED_MIGRATION);
    await applyMigration(t.db, APPROVAL_MIGRATION);
    await applyMigration(t.db, PERSONAL_PIN_MIGRATION);
    await t.close();
  });
});
