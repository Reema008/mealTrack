import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { approveMember, createTestDb, FAMILY_PIN, joinAndApprove, joinFamily, saveMeal, setupFamily, type TestDb, type TestUser } from './harness';

let t: TestDb;
let admin: TestUser;

async function status(user: TestUser) {
  return t.as(user, async (tx) => (await tx.query<{ s: string }>('select public.mealtrack_status() as s')).rows[0].s);
}
const rpc = (user: TestUser, sql: string, params: unknown[] = []) =>
  t.as(user, async (tx) => (await tx.query<{ r: Record<string, unknown> }>(`select ${sql} as r`, params)).rows[0].r);
const visibleMeals = (user: TestUser) => t.as(user, async (tx) => (await tx.query('select 1 from public.meal_overrides')).rows.length);

beforeEach(async () => {
  await t?.close();
  t = await createTestDb();
  admin = await t.createUser('admin-device@anon');
});

afterAll(() => t.close());

describe('sign in with name + PIN, then admin approval', () => {
  it('reports setup status, and setup can happen only once', async () => {
    expect(await status(admin)).toBe('not_set_up');
    await setupFamily(t, admin);
    expect(await status(admin)).toBe('ready');
    const stranger = await t.createUser('stranger@anon');
    await expect(setupFamily(t, stranger, 'Takeover', '111111')).rejects.toThrow(/already set up/);
  });

  it('requires a 6–10 digit PIN', async () => {
    await expect(setupFamily(t, admin, 'F', '1234')).rejects.toThrow(/6 to 10 digits/);
    await expect(setupFamily(t, admin, 'F', 'abcdef')).rejects.toThrow(/6 to 10 digits/);
  });

  it('a correct PIN only creates a pending request: no viewing or editing until approved', async () => {
    await setupFamily(t, admin);
    await t.as(admin, (tx) => saveMeal(tx, '2026-10-27', 'lunch', { dish: 'egg', curry: true }, null));

    const priya = await t.createUser('priya@anon');
    expect(await joinFamily(t, priya, FAMILY_PIN, 'Priya')).toEqual({ ok: true, status: 'pending' });
    expect(await visibleMeals(priya)).toBe(0);
    await t.as(priya, async (tx) => expect((await tx.query('select 1 from public.households')).rows).toHaveLength(0));
    await expect(t.as(priya, (tx) => saveMeal(tx, '2026-10-27', 'dinner', { dish: 'egg', curry: true }, null))).rejects.toThrow(/not a member/);
    // Pending people can see their own request status.
    const own = await t.as(priya, async (tx) => (await tx.query<{ status: string }>('select status from public.household_members')).rows);
    expect(own).toEqual([{ status: 'pending' }]);

    // Signing in again does not create a second request.
    expect(await joinFamily(t, priya, FAMILY_PIN, 'Priya')).toEqual({ ok: true, status: 'pending' });

    await approveMember(t, admin, priya);
    expect(await joinFamily(t, priya, FAMILY_PIN, 'Priya')).toEqual({ ok: true, status: 'approved' });
    expect(await visibleMeals(priya)).toBe(1);
    expect((await t.as(priya, (tx) => saveMeal(tx, '2026-10-27', 'dinner', { dish: 'egg', curry: true }, null))).status).toBe('saved');
  });

  it('the admin sees pending requests; members cannot approve, decline or remove', async () => {
    await setupFamily(t, admin);
    const member = await t.createUser('m@anon');
    await joinAndApprove(t, admin, member);
    const waiting = await t.createUser('w@anon');
    await joinFamily(t, waiting, FAMILY_PIN, 'Waiting');

    const list = await t.as(admin, async (tx) =>
      (await tx.query<{ display_name: string; status: string }>('select display_name, status from public.household_members order by joined_at')).rows,
    );
    expect(list.map((r) => r.status)).toEqual(['approved', 'approved', 'pending']);

    await expect(t.as(member, (tx) => tx.query('select public.approve_member($1)', [waiting.id]))).rejects.toThrow(/Only an admin/);
    await expect(t.as(member, (tx) => tx.query('select public.remove_member($1)', [waiting.id]))).rejects.toThrow(/Only an admin/);
    await expect(t.as(member, (tx) => tx.query('delete from public.household_members where user_id = $1', [waiting.id]))).rejects.toThrow(/permission denied/);
    await expect(t.as(waiting, (tx) => tx.query('select public.approve_member($1)', [waiting.id]))).rejects.toThrow(/Only an admin/);
  });

  it('declining a request removes it; the person can sign in again later', async () => {
    await setupFamily(t, admin);
    const p = await t.createUser('p@anon');
    await joinFamily(t, p);
    await t.as(admin, (tx) => tx.query('select public.remove_member($1)', [p.id]));
    await t.as(p, async (tx) => expect((await tx.query('select 1 from public.household_members')).rows).toHaveLength(0));
    expect(await joinFamily(t, p)).toEqual({ ok: true, status: 'pending' });
  });

  it('removing an approved person revokes access and stops their reminders', async () => {
    await setupFamily(t, admin);
    const p = await t.createUser('p@anon');
    await joinAndApprove(t, admin, p);
    await t.as(p, (tx) => tx.query(`select public.register_push_subscription('https://push.example/p', 'k', 'a')`));
    await t.as(admin, (tx) => tx.query('select public.remove_member($1)', [p.id]));
    expect(await visibleMeals(p)).toBe(0);
    const subs = await t.db.query('select 1 from public.push_subscriptions where user_id = $1', [p.id]);
    expect(subs.rows).toHaveLength(0);
  });

  it('the last admin cannot be removed, demoted or sign out while others depend on them', async () => {
    await setupFamily(t, admin);
    const p = await t.createUser('p@anon');
    await joinAndApprove(t, admin, p);
    await expect(t.as(admin, (tx) => tx.query('select public.remove_member($1)', [admin.id]))).rejects.toThrow(/Sign out/);
    await expect(t.as(admin, (tx) => tx.query(`select public.set_member_role($1, 'member')`, [admin.id]))).rejects.toThrow(/at least one admin/);
    await expect(t.as(admin, (tx) => tx.query('select public.leave_household()'))).rejects.toThrow(/only admin/);

    await t.as(admin, (tx) => tx.query(`select public.set_member_role($1, 'admin')`, [p.id]));
    await t.as(admin, (tx) => tx.query('select public.leave_household()'));
    expect(await visibleMeals(admin)).toBe(0);
  });

  it('a wrong PIN gives no request and counts down attempts', async () => {
    await setupFamily(t, admin);
    const stranger = await t.createUser('stranger@anon');
    expect(await joinFamily(t, stranger, '000000')).toEqual({ ok: false, error: 'wrong_pin', attempts_left: 9 });
    expect(await joinFamily(t, stranger, '000001')).toMatchObject({ attempts_left: 8 });
    await t.as(stranger, async (tx) => expect((await tx.query('select 1 from public.household_members')).rows).toHaveLength(0));
  });

  it('locks PIN entry for everyone after 10 wrong attempts (even with the right PIN)', async () => {
    await setupFamily(t, admin);
    for (let i = 0; i < 10; i++) {
      const s = await t.createUser(`s${i}@anon`);
      await joinFamily(t, s, `9${String(i).padStart(5, '0')}`);
    }
    const family = await t.createUser('family@anon');
    expect(await joinFamily(t, family, FAMILY_PIN)).toEqual({ ok: false, error: 'locked' });
    await t.db.query(`update public.family_pin_attempts set created_at = now() - interval '16 minutes'`);
    expect(await joinFamily(t, family, FAMILY_PIN)).toEqual({ ok: true, status: 'pending' });
  });

  it('the PIN hash and attempt log are never readable by clients', async () => {
    await setupFamily(t, admin);
    await expect(t.as(admin, (tx) => tx.query('select pin_hash from public.households'))).rejects.toThrow(/permission denied/);
    await expect(t.as(admin, (tx) => tx.query('select * from public.family_pin_attempts'))).rejects.toThrow(/permission denied/);
    const stored = await t.db.query<{ pin_hash: string }>('select pin_hash from public.households');
    expect(stored.rows[0].pin_hash).not.toContain(FAMILY_PIN);
    expect(stored.rows[0].pin_hash).toMatch(/^\$2[abxy]\$/);
  });

  it('verify_family_pin (app-lock fallback) works for approved people only', async () => {
    await setupFamily(t, admin);
    expect(await rpc(admin, 'public.verify_family_pin($1)', [FAMILY_PIN])).toEqual({ ok: true });
    expect(await rpc(admin, `public.verify_family_pin('123123')`)).toMatchObject({ ok: false, error: 'wrong_pin' });
    const pending = await t.createUser('x@anon');
    await joinFamily(t, pending);
    await expect(rpc(pending, 'public.verify_family_pin($1)', [FAMILY_PIN])).rejects.toThrow(/not part of the family/);
  });

  it('only an admin can change the PIN; approved people stay signed in', async () => {
    await setupFamily(t, admin);
    const member = await t.createUser('m@anon');
    await joinAndApprove(t, admin, member);
    await expect(rpc(member, `public.change_family_pin($1, '777777')`, [FAMILY_PIN])).rejects.toThrow(/Only an admin/);
    expect(await rpc(admin, `public.change_family_pin('000000', '777777')`)).toMatchObject({ ok: false, error: 'wrong_pin' });
    expect(await rpc(admin, `public.change_family_pin($1, '777777')`, [FAMILY_PIN])).toEqual({ ok: true });

    expect(await joinFamily(t, await t.createUser('n1@anon'), FAMILY_PIN)).toMatchObject({ ok: false });
    expect(await joinFamily(t, await t.createUser('n2@anon'), '777777')).toEqual({ ok: true, status: 'pending' });
    expect(await visibleMeals(member)).toBe(0); // no meals saved, but still has access:
    expect(await t.as(member, async (tx) => (await tx.query('select 1 from public.households')).rows.length)).toBe(1);
  });

  it('a pending person can cancel their own request', async () => {
    await setupFamily(t, admin);
    const p = await t.createUser('p@anon');
    await joinFamily(t, p);
    await t.as(p, (tx) => tx.query('select public.leave_household()'));
    const rows = await t.db.query('select 1 from public.household_members where user_id = $1', [p.id]);
    expect(rows.rows).toHaveLength(0);
  });

  it('household creation outside setup is blocked, and the SQL-editor reset is not client-callable', async () => {
    await expect(t.as(admin, (tx) => tx.query(`select public.create_household('X', 'Y')`))).rejects.toThrow(/permission denied/);
    await expect(t.as(admin, (tx) => tx.query(`select public.admin_set_family_pin('123456')`))).rejects.toThrow(/permission denied/);
    await t.as(null, async (tx) => {
      await expect(tx.query('select public.mealtrack_status()')).rejects.toThrow(/permission denied/);
    });
  });

  it('admin_set_family_pin (SQL editor) sets a PIN on an older setup', async () => {
    await t.db.query(`insert into public.households (name) values ('Legacy')`);
    expect(await status(admin)).toBe('needs_pin');
    await t.db.query(`select public.admin_set_family_pin('246810')`);
    expect(await status(admin)).toBe('ready');
    expect(await joinFamily(t, admin, '246810')).toEqual({ ok: true, status: 'pending' });
  });
});
