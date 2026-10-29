import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, joinAndApprove, saveMeal, setupFamily, type TestDb, type TestUser } from './harness';

const WED = '2026-10-28';

let t: TestDb;
let a: TestUser;
let b: TestUser;

beforeAll(async () => {
  t = await createTestDb();
  a = await t.createUser('a@example.com');
  b = await t.createUser('b@example.com');
  await setupFamily(t, a);
  await joinAndApprove(t, a, b);
});

afterAll(() => t.close());

describe('15. concurrent edits', () => {
  it('two members creating the same meal: the second gets a conflict, not a duplicate', async () => {
    // Both loaded the default (expected version null).
    const first = await t.as(a, (tx) => saveMeal(tx, WED, 'lunch', { dish: 'egg', curry: true }, null));
    const second = await t.as(b, (tx) => saveMeal(tx, WED, 'lunch', { status: 'not_received', dish: 'chicken', curry: true }, null));
    expect(first.status).toBe('saved');
    expect(second.status).toBe('conflict');
    expect(second.row).toMatchObject({ main_dish: 'egg', version: 1 });
    const n = await t.as(a, async (tx) => (await tx.query(`select 1 from public.meal_overrides where meal_date = $1 and meal_period = 'lunch'`, [WED])).rows.length);
    expect(n).toBe(1);
  });

  it('a stale version is rejected and the newer row is returned', async () => {
    const v2 = await t.as(a, (tx) => saveMeal(tx, WED, 'lunch', { dish: 'egg', curry: false }, 1));
    expect(v2.status).toBe('saved');
    expect(v2.row!.version).toBe(2);

    const stale = await t.as(b, (tx) => saveMeal(tx, WED, 'lunch', { status: 'not_received', dish: 'egg', curry: true }, 1));
    expect(stale.status).toBe('conflict');
    expect(stale.row).toMatchObject({ version: 2, extra_curry_received: false });

    // After refreshing, B can apply their change on top of the latest version.
    const retry = await t.as(b, (tx) => saveMeal(tx, WED, 'lunch', { status: 'not_received', dish: 'egg', curry: false }, 2));
    expect(retry.status).toBe('saved');
    expect(retry.row!.version).toBe(3);
  });

  it('replaying an already-applied change (e.g. after a network retry) is a no-op', async () => {
    const replay = await t.as(b, (tx) => saveMeal(tx, WED, 'lunch', { status: 'not_received', dish: 'egg', curry: false }, 2));
    expect(replay.status).toBe('unchanged');
    expect(replay.row!.version).toBe(3);
  });

  it('restoring a default that someone else already changed again is a conflict', async () => {
    const del = await t.as(a, (tx) => saveMeal(tx, WED, 'lunch', { dish: 'chicken', curry: true }, 3));
    expect(del.status).toBe('deleted');
    // B still thinks version 3 exists and edits it.
    const late = await t.as(b, (tx) => saveMeal(tx, WED, 'lunch', { dish: 'egg', curry: true }, 3));
    expect(late).toEqual({ status: 'conflict', row: null });
  });

  it('a failed transaction leaves no partial write', async () => {
    await expect(
      t.as(a, async (tx) => {
        await saveMeal(tx, WED, 'dinner', { dish: 'egg', curry: true }, null);
        throw new Error('network dropped');
      }),
    ).rejects.toThrow('network dropped');
    const n = await t.as(a, async (tx) => (await tx.query(`select 1 from public.meal_overrides where meal_date = $1 and meal_period = 'dinner'`, [WED])).rows.length);
    expect(n).toBe(0);
  });
});
