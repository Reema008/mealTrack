import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOtherHousehold, createTestDb, joinFamily, saveMeal, setupFamily, type TestDb, type TestUser } from './harness';

const TUE = '2026-10-27';

let t: TestDb;
let admin: TestUser;
let member: TestUser;
let outsider: TestUser; // belongs to a different household
let stranger: TestUser; // belongs to no household
let homeId: string;
let otherId: string;
let homeRowId: string;

beforeAll(async () => {
  t = await createTestDb();
  admin = await t.createUser('admin@example.com');
  member = await t.createUser('member@example.com');
  outsider = await t.createUser('outsider@example.com');
  stranger = await t.createUser('stranger@example.com');

  homeId = await setupFamily(t, admin, 'Home');
  otherId = await createOtherHousehold(t, outsider);

  await joinFamily(t, member, 'member');

  const r = await t.as(admin, (tx) => saveMeal(tx, TUE, 'lunch', { dish: 'egg', curry: true }, null));
  homeRowId = r.row!.id;
  await t.as(outsider, (tx) => saveMeal(tx, TUE, 'dinner', { status: 'not_received', dish: 'chicken', curry: false }, null));
});

afterAll(() => t.close());

const count = (rows: unknown[]) => rows.length;

describe('13. access rules', () => {
  it('outsiders cannot read another household’s meals, members or household', async () => {
    await t.as(outsider, async (tx) => {
      const meals = await tx.query<{ household_id: string }>('select household_id from public.meal_overrides');
      expect(meals.rows.every((r) => r.household_id === otherId)).toBe(true);
      expect(count((await tx.query('select 1 from public.households where id = $1', [homeId])).rows)).toBe(0);
      expect(count((await tx.query('select 1 from public.household_members where household_id = $1', [homeId])).rows)).toBe(0);
    });
  });

  it('users with no household see nothing', async () => {
    await t.as(stranger, async (tx) => {
      expect(count((await tx.query('select 1 from public.meal_overrides')).rows)).toBe(0);
      expect(count((await tx.query('select 1 from public.households')).rows)).toBe(0);
    });
  });

  it('anonymous requests are denied outright', async () => {
    await expect(t.as(null, (tx) => tx.query('select 1 from public.meal_overrides'))).rejects.toThrow(/permission denied/);
    await expect(t.as(null, (tx) => saveMeal(tx, TUE, 'lunch', {}, null))).rejects.toThrow(/permission denied/);
  });

  it('outsiders cannot insert into another household with a forged household_id', async () => {
    await expect(
      t.as(outsider, (tx) =>
        tx.query(
          `insert into public.meal_overrides (household_id, meal_date, meal_period, delivery_status, main_dish, extra_curry_received)
           values ($1, '2026-10-28', 'lunch', 'not_received', 'chicken', true)`,
          [homeId],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('outsiders cannot update or delete another household’s meals', async () => {
    await t.as(outsider, async (tx) => {
      const upd = await tx.query(`update public.meal_overrides set delivery_status = 'not_received' where id = $1`, [homeRowId]);
      expect(upd.affectedRows).toBe(0);
      const del = await tx.query('delete from public.meal_overrides where id = $1', [homeRowId]);
      expect(del.affectedRows).toBe(0);
    });
    const row = await t.as(admin, async (tx) => (await tx.query<{ delivery_status: string }>('select delivery_status from public.meal_overrides where id = $1', [homeRowId])).rows[0]);
    expect(row.delivery_status).toBe('delivered');
  });

  it('the save RPC always writes to the caller’s own household', async () => {
    const r = await t.as(outsider, (tx) => saveMeal(tx, '2026-10-28', 'lunch', { dish: 'egg', curry: true }, null));
    const hid = await t.as(outsider, async (tx) => (await tx.query<{ household_id: string }>('select household_id from public.meal_overrides where id = $1', [r.row!.id])).rows[0].household_id);
    expect(hid).toBe(otherId);
  });

  it('users without a household cannot save meals', async () => {
    await expect(t.as(stranger, (tx) => saveMeal(tx, TUE, 'lunch', { dish: 'egg', curry: true }, null))).rejects.toThrow(/not a member/);
  });

  it('members cannot move a row to another household', async () => {
    await t.as(member, (tx) => tx.query('update public.meal_overrides set household_id = $2 where id = $1', [homeRowId, otherId]));
    const hid = await t.as(admin, async (tx) => (await tx.query<{ household_id: string }>('select household_id from public.meal_overrides where id = $1', [homeRowId])).rows[0].household_id);
    expect(hid).toBe(homeId);
  });

  it('nobody can join through the old invite functions', async () => {
    await expect(t.as(admin, (tx) => tx.query(`select public.create_invite('x@example.com')`))).rejects.toThrow(/permission denied/);
    await expect(t.as(stranger, (tx) => tx.query(`select public.accept_invite('bogus', 'S')`))).rejects.toThrow(/permission denied/);
  });

  it('members cannot promote themselves or rename the household', async () => {
    await expect(t.as(member, (tx) => tx.query(`update public.household_members set role = 'admin' where user_id = $1`, [member.id]))).rejects.toThrow(/permission denied/);
    await expect(t.as(member, (tx) => tx.query(`select public.set_member_role($1, 'admin')`, [member.id]))).rejects.toThrow(/Only an admin/);
    const upd = await t.as(member, (tx) => tx.query(`update public.households set name = 'Hacked' where id = $1`, [homeId]));
    expect(upd.affectedRows).toBe(0);
  });

  it('the last admin cannot be demoted', async () => {
    await expect(t.as(admin, (tx) => tx.query(`select public.set_member_role($1, 'member')`, [admin.id]))).rejects.toThrow(/at least one admin/);
  });

  it('push subscriptions and the notification log are private to each user', async () => {
    await t.as(member, (tx) => tx.query(`select public.register_push_subscription('https://push.example/abc', 'p256', 'auth')`));
    await t.as(admin, async (tx) => {
      expect(count((await tx.query('select 1 from public.push_subscriptions')).rows)).toBe(0);
    });
    await t.as(member, async (tx) => {
      expect(count((await tx.query('select 1 from public.push_subscriptions')).rows)).toBe(1);
      const prefs = await tx.query<{ reminders_enabled: boolean }>('select reminders_enabled from public.notification_preferences');
      expect(prefs.rows[0].reminders_enabled).toBe(true);
    });
    await expect(
      t.as(member, (tx) => tx.query(`insert into public.notification_log (household_id, reminder_date) values ($1, '2026-10-27')`, [homeId])),
    ).rejects.toThrow(/permission denied/);
  });

  it('a device endpoint maps to one subscription (no duplicate pushes on a shared phone)', async () => {
    await t.as(admin, (tx) => tx.query(`select public.register_push_subscription('https://push.example/abc', 'p256b', 'authb')`));
    const rows = await t.asService(async (tx) => (await tx.query<{ user_id: string }>(`select user_id from public.push_subscriptions where endpoint = 'https://push.example/abc'`)).rows);
    expect(rows).toEqual([{ user_id: admin.id }]);
  });

  it('the daily log allows one reminder per device per date; failures retry up to 3 attempts', async () => {
    await t.asService(async (tx) => {
      const sub = (await tx.query<{ id: string }>('select id from public.push_subscriptions limit 1')).rows[0].id;
      const claim = async (date = '2026-10-27') =>
        (await tx.query<{ id: string | null }>('select public.claim_daily_reminder($1, $2, $3, $4) as id', [homeId, admin.id, sub, date])).rows[0].id;

      const first = await claim();
      expect(first).toBeTruthy();
      expect(await claim()).toBeNull(); // pending: no duplicate send
      await tx.query(`update public.notification_log set status = 'sent' where id = $1`, [first]);
      expect(await claim()).toBeNull(); // sent: never again that day
      expect(await claim('2026-10-28')).toBeTruthy(); // next day is a new reminder

      const other = await claim('2026-10-29');
      await tx.query(`update public.notification_log set status = 'failed' where id = $1`, [other]);
      expect(await claim('2026-10-29')).toBe(other); // attempt 2
      await tx.query(`update public.notification_log set status = 'failed' where id = $1`, [other]);
      expect(await claim('2026-10-29')).toBe(other); // attempt 3
      await tx.query(`update public.notification_log set status = 'failed' where id = $1`, [other]);
      expect(await claim('2026-10-29')).toBeNull(); // give up
    });
    await expect(
      t.as(admin, (tx) => tx.query(`select public.claim_daily_reminder($1, $2, gen_random_uuid(), '2026-10-27')`, [homeId, admin.id])),
    ).rejects.toThrow(/permission denied/);
  });
});
