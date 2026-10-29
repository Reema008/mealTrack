import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, joinFamily, type TestDb, type TestUser } from './harness';

let t: TestDb;
let phone: TestUser;
const TUE = '2026-10-27';

const save = (status: string, dish: string | null, curry: boolean | null, version: number | null, keep: boolean) =>
  t.as(phone, async (tx) =>
    (
      await tx.query<{ r: { status: string; row: { version: number; delivery_status: string } | null } }>(
        'select public.save_meal($1, $2, $3, $4, $5, $6, $7) as r',
        [TUE, 'lunch', status, dish, curry, version, keep],
      )
    ).rows[0].r,
  );
const rows = () => t.as(phone, async (tx) => (await tx.query('select 1 from public.meal_overrides')).rows.length);

beforeAll(async () => {
  t = await createTestDb();
  phone = await t.createUser('phone@anon');
  await joinFamily(t, phone);
});
afterAll(() => t.close());

describe('confirming a meal before its cutoff (save_meal with keep)', () => {
  it('without keep, saving the default writes nothing (assumed as before)', async () => {
    expect((await save('delivered', 'chicken', true, null, false)).status).toBe('unchanged');
    expect(await rows()).toBe(0);
  });

  it('with keep, "Delivered" is recorded even though it equals the default', async () => {
    const r = await save('delivered', 'chicken', true, null, true);
    expect(r.status).toBe('saved');
    expect(r.row).toMatchObject({ delivery_status: 'delivered', version: 1 });
    expect(await rows()).toBe(1);
  });

  it('it can then be changed to not delivered, and restored to the schedule', async () => {
    const r = await save('not_received', null, null, 1, false);
    expect(r.status).toBe('saved');
    expect((await save('delivered', 'chicken', true, 2, false)).status).toBe('deleted');
    expect(await rows()).toBe(0);
  });

  it('visitors with no session cannot call it', async () => {
    await expect(t.as(null, (tx) => tx.query(`select public.save_meal('2026-10-27', 'lunch', 'delivered', 'chicken', true, null, true)`))).rejects.toThrow(/permission denied/);
  });
});
