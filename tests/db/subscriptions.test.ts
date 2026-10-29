import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOtherHousehold, createTestDb, joinFamily, type TestDb, type TestUser } from './harness';

let t: TestDb;
let phone: TestUser;
let outsider: TestUser;
let homeId: string;

beforeAll(async () => {
  t = await createTestDb();
  phone = await t.createUser('phone@anon');
  outsider = await t.createUser('outsider@anon');
  await joinFamily(t, phone);
  homeId = (await t.db.query<{ id: string }>('select id from public.households order by created_at limit 1')).rows[0].id;
  await createOtherHousehold(t, outsider);
});
afterAll(() => t.close());

const add = (u: TestUser, hid: string, date: string, amount: number | null) =>
  t.as(u, (tx) => tx.query('insert into public.subscriptions (household_id, start_date, amount) values ($1, $2, $3)', [hid, date, amount]));

describe('subscription history (database)', () => {
  it('a phone can record renewals with amounts and read them back', async () => {
    await add(phone, homeId, '2026-11-02', 4200);
    await add(phone, homeId, '2026-11-30', 4350.5);
    const rows = await t.as(phone, async (tx) =>
      (await tx.query<{ start_date: string; amount: string; created_by: string }>(
        `select to_char(start_date, 'YYYY-MM-DD') as start_date, amount::text, created_by from public.subscriptions order by start_date`,
      )).rows,
    );
    expect(rows.map((r) => [r.start_date, r.amount])).toEqual([['2026-11-02', '4200.00'], ['2026-11-30', '4350.50']]);
    expect(rows[0].created_by).toBe(phone.id);
  });

  it('two subscriptions cannot start on the same date; amounts cannot be negative', async () => {
    await expect(add(phone, homeId, '2026-11-02', 100)).rejects.toThrow(/subscriptions_household_start_key/);
    await expect(add(phone, homeId, '2027-01-01', -5)).rejects.toThrow(/check/);
  });

  it('amount is optional, and entries can be edited and deleted', async () => {
    await add(phone, homeId, '2026-12-28', null);
    await t.as(phone, (tx) => tx.query(`update public.subscriptions set amount = 4400 where start_date = '2026-12-28'`));
    await t.as(phone, (tx) => tx.query(`delete from public.subscriptions where start_date = '2026-11-30'`));
    const n = (await t.db.query('select 1 from public.subscriptions')).rows.length;
    expect(n).toBe(2);
  });

  it('other households and visitors with no session see nothing', async () => {
    await t.as(outsider, async (tx) => expect((await tx.query('select 1 from public.subscriptions')).rows).toHaveLength(0));
    await expect(add(outsider, homeId, '2027-02-01', 1)).rejects.toThrow(/row-level security/);
    await expect(t.as(null, (tx) => tx.query('select 1 from public.subscriptions'))).rejects.toThrow(/permission denied/);
  });
});
