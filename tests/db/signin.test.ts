import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { approveMember, createTestDb, FAMILY_PIN, joinAndApprove, joinFamily, saveMeal, setupFamily, signIn, type TestDb, type TestUser } from './harness';

const ADMIN_PIN = '135790';
const PRIYA_PIN = '246810';

let t: TestDb;
let adminPhone: TestUser;

const rpc = (user: TestUser, sql: string, params: unknown[] = []) =>
  t.as(user, async (tx) => (await tx.query<{ r: Record<string, unknown> }>(`select ${sql} as r`, params)).rows[0].r);
const visibleMeals = (user: TestUser) => t.as(user, async (tx) => (await tx.query('select 1 from public.meal_overrides')).rows.length);
const hasAccess = (user: TestUser) =>
  t.as(user, async (tx) => (await tx.query('select 1 from public.households')).rows.length === 1);
const status = (user: TestUser) => t.as(user, async (tx) => (await tx.query<{ s: string }>('select public.mealtrack_status() as s')).rows[0].s);

beforeEach(async () => {
  await t?.close();
  t = await createTestDb();
  adminPhone = await t.createUser('reema-phone@anon');
});

afterAll(() => t.close());

describe('sign in with name + personal PIN', () => {
  it('the first person sets MealTrack up once and becomes admin', async () => {
    expect(await status(adminPhone)).toBe('not_set_up');
    await setupFamily(t, adminPhone, 'MealTrack', ADMIN_PIN, 'Reema');
    expect(await status(adminPhone)).toBe('ready');
    const stranger = await t.createUser('x@anon');
    await expect(setupFamily(t, stranger, 'X', '111111', 'X')).rejects.toThrow(/already set up/);
  });

  it('requires a 6–10 digit PIN', async () => {
    await expect(setupFamily(t, adminPhone, 'M', '1234', 'Reema')).rejects.toThrow(/6 to 10 digits/);
    await setupFamily(t, adminPhone, 'M', ADMIN_PIN, 'Reema');
    await expect(joinFamily(t, await t.createUser('p@anon'), 'abcdef', 'Priya')).rejects.toThrow(/6 to 10 digits/);
  });

  it('a new name asks for confirmation, then creates a pending request with no access', async () => {
    await setupFamily(t, adminPhone, 'M', ADMIN_PIN, 'Reema');
    const priyaPhone = await t.createUser('priya-phone@anon');
    expect(await signIn(t, priyaPhone, 'Priya', PRIYA_PIN, false)).toEqual({ ok: false, error: 'new_user' });
    expect(await signIn(t, priyaPhone, 'Priya', PRIYA_PIN, true)).toEqual({ ok: true, status: 'pending' });
    expect(await hasAccess(priyaPhone)).toBe(false);
    await expect(t.as(priyaPhone, (tx) => saveMeal(tx, '2026-10-27', 'lunch', { dish: 'egg', curry: true }, null))).rejects.toThrow(/not a member/);
    await approveMember(t, adminPhone, priyaPhone);
    expect(await hasAccess(priyaPhone)).toBe(true);
  });

  it('a returning person with the right PIN gets straight in on a new phone: no approval, same role', async () => {
    await setupFamily(t, adminPhone, 'M', ADMIN_PIN, 'Reema');
    await t.as(adminPhone, (tx) => saveMeal(tx, '2026-10-27', 'lunch', { dish: 'egg', curry: true }, null));
    const oldPhone = await t.createUser('priya-old@anon');
    await signIn(t, oldPhone, 'Priya', PRIYA_PIN, true);
    await approveMember(t, adminPhone, oldPhone);

    const newPhone = await t.createUser('priya-new@anon');
    expect(await signIn(t, newPhone, 'priya', PRIYA_PIN)).toEqual({ ok: true, status: 'approved', returning: true });
    expect(await visibleMeals(newPhone)).toBe(1);
    expect(await hasAccess(oldPhone)).toBe(false); // one phone per person

    // The admin, signing in again on a new phone, is still admin.
    const adminNew = await t.createUser('reema-new@anon');
    expect(await signIn(t, adminNew, 'Reema', ADMIN_PIN)).toMatchObject({ ok: true, status: 'approved' });
    await expect(t.as(adminNew, (tx) => tx.query(`select public.set_member_role($1, 'admin')`, [newPhone.id]))).resolves.toBeTruthy();
  });

  it('nobody can sign in as someone else without their PIN', async () => {
    await setupFamily(t, adminPhone, 'M', ADMIN_PIN, 'Reema');
    const intruder = await t.createUser('i@anon');
    expect(await signIn(t, intruder, 'Reema', '000000')).toEqual({ ok: false, error: 'wrong_pin', attempts_left: 4 });
    expect(await signIn(t, intruder, 'Reema', '000000', true)).toMatchObject({ ok: false, error: 'wrong_pin' });
    expect(await hasAccess(intruder)).toBe(false);
    expect(await hasAccess(adminPhone)).toBe(true);
  });

  it('a pending person returning on a new phone is still pending', async () => {
    await setupFamily(t, adminPhone, 'M', ADMIN_PIN, 'Reema');
    await signIn(t, await t.createUser('a@anon'), 'Arjun', PRIYA_PIN, true);
    const second = await t.createUser('b@anon');
    expect(await signIn(t, second, 'Arjun', PRIYA_PIN)).toEqual({ ok: true, status: 'pending', returning: true });
    expect(await hasAccess(second)).toBe(false);
  });

  it('locks a name after 5 wrong PINs for 15 minutes; other names still work', async () => {
    await setupFamily(t, adminPhone, 'M', ADMIN_PIN, 'Reema');
    const p = await t.createUser('p@anon');
    await joinAndApprove(t, adminPhone, p, PRIYA_PIN);
    for (let i = 0; i < 5; i++) await signIn(t, await t.createUser(`x${i}@anon`), 'Reema', `90000${i}`);
    const realAdmin = await t.createUser('real@anon');
    expect(await signIn(t, realAdmin, 'Reema', ADMIN_PIN)).toEqual({ ok: false, error: 'locked' });
    expect(await signIn(t, await t.createUser('pp@anon'), 'p', PRIYA_PIN)).toMatchObject({ ok: true });
    await t.db.query(`update public.family_pin_attempts set created_at = now() - interval '16 minutes'`);
    expect(await signIn(t, realAdmin, 'Reema', ADMIN_PIN)).toMatchObject({ ok: true, status: 'approved' });
  });

  it('names are unique regardless of capitals', async () => {
    await setupFamily(t, adminPhone, 'M', ADMIN_PIN, 'Reema');
    // "REEMA" is the existing person, so this is treated as Reema signing in (wrong PIN), not a new request.
    expect(await signIn(t, await t.createUser('d@anon'), 'REEMA', PRIYA_PIN, true)).toMatchObject({ error: 'wrong_pin' });
    await expect(t.as(adminPhone, (tx) => tx.query(`update public.household_members set display_name = 'Priya'`))).resolves.toBeTruthy();
    const p = await t.createUser('p2@anon');
    expect(await signIn(t, p, 'priya', ADMIN_PIN)).toMatchObject({ ok: true, returning: true }); // renamed admin signs in by new name
  });

  it('PIN hashes are never readable by clients', async () => {
    await setupFamily(t, adminPhone, 'M', ADMIN_PIN, 'Reema');
    await expect(t.as(adminPhone, (tx) => tx.query('select pin_hash from public.household_members'))).rejects.toThrow(/permission denied/);
    await expect(t.as(adminPhone, (tx) => tx.query('select * from public.household_members'))).rejects.toThrow(/permission denied/);
    const rows = await t.as(adminPhone, async (tx) => (await tx.query('select display_name, role, status from public.household_members')).rows);
    expect(rows).toEqual([{ display_name: 'Reema', role: 'admin', status: 'approved' }]);
    const stored = await t.db.query<{ pin_hash: string }>('select pin_hash from public.household_members');
    expect(stored.rows[0].pin_hash).toMatch(/^\$2[abxy]\$/);
  });

  it('verify_my_pin (app-lock fallback) and change_my_pin work for the person themselves', async () => {
    await setupFamily(t, adminPhone, 'M', ADMIN_PIN, 'Reema');
    expect(await rpc(adminPhone, 'public.verify_my_pin($1)', [ADMIN_PIN])).toEqual({ ok: true });
    expect(await rpc(adminPhone, `public.verify_my_pin('111111')`)).toMatchObject({ ok: false, error: 'wrong_pin' });
    expect(await rpc(adminPhone, `public.change_my_pin('111111', '777777')`)).toMatchObject({ ok: false, error: 'wrong_pin' });
    expect(await rpc(adminPhone, `public.change_my_pin($1, '777777')`, [ADMIN_PIN])).toEqual({ ok: true });
    expect(await signIn(t, await t.createUser('n@anon'), 'Reema', '777777')).toMatchObject({ ok: true });
  });

  it('an admin can reset a forgotten PIN (and clear its lockout); members cannot', async () => {
    await setupFamily(t, adminPhone, 'M', ADMIN_PIN, 'Reema');
    const p = await t.createUser('p@anon');
    await joinAndApprove(t, adminPhone, p, PRIYA_PIN);
    await expect(t.as(p, (tx) => tx.query(`select public.reset_member_pin($1, '555555')`, [adminPhone.id]))).rejects.toThrow(/Only an admin/);
    for (let i = 0; i < 5; i++) await signIn(t, await t.createUser(`y${i}@anon`), 'p', `80000${i}`);
    await t.as(adminPhone, (tx) => tx.query(`select public.reset_member_pin($1, '555555')`, [p.id]));
    expect(await signIn(t, await t.createUser('p-new@anon'), 'p', '555555')).toMatchObject({ ok: true, status: 'approved' });
  });

  it('older accounts without a PIN: sign-in says so, and they can set one without a current PIN', async () => {
    await setupFamily(t, adminPhone, 'M', ADMIN_PIN, 'Reema');
    await t.db.query('update public.household_members set pin_hash = null');
    expect(await signIn(t, await t.createUser('z@anon'), 'Reema', ADMIN_PIN)).toEqual({ ok: false, error: 'no_pin' });
    expect(await rpc(adminPhone, 'public.i_have_pin()')).toBe(false);
    expect(await rpc(adminPhone, `public.change_my_pin('', '424242')`)).toEqual({ ok: true });
    expect(await rpc(adminPhone, 'public.i_have_pin()')).toBe(true);
  });

  it('SQL-editor reset works there and is not callable from the app', async () => {
    await setupFamily(t, adminPhone, 'M', ADMIN_PIN, 'Reema');
    await expect(t.as(adminPhone, (tx) => tx.query(`select public.admin_set_person_pin('Reema', '999999')`))).rejects.toThrow(/permission denied/);
    await t.db.query(`select public.admin_set_person_pin('reema', '999999')`);
    expect(await signIn(t, await t.createUser('q@anon'), 'Reema', '999999')).toMatchObject({ ok: true });
  });

  it('the old shared family-PIN functions are switched off', async () => {
    await setupFamily(t, adminPhone, 'M', ADMIN_PIN, 'Reema');
    await expect(t.as(adminPhone, (tx) => tx.query(`select public.join_with_pin('1', 'x')`))).rejects.toThrow(/permission denied/);
    await expect(t.as(adminPhone, (tx) => tx.query(`select public.verify_family_pin('1')`))).rejects.toThrow(/permission denied/);
    await expect(t.as(adminPhone, (tx) => tx.query(`select public.change_family_pin('1', '2')`))).rejects.toThrow(/permission denied/);
  });

  it('a pending person can cancel; an admin can decline or remove', async () => {
    await setupFamily(t, adminPhone, 'M', ADMIN_PIN, 'Reema');
    const a = await t.createUser('a@anon');
    await joinFamily(t, a, FAMILY_PIN, 'Anu');
    await t.as(a, (tx) => tx.query('select public.leave_household()'));
    expect((await t.db.query(`select 1 from public.household_members where display_name = 'Anu'`)).rows).toHaveLength(0);

    const b = await t.createUser('b@anon');
    await joinFamily(t, b, FAMILY_PIN, 'Bala');
    await t.as(adminPhone, (tx) => tx.query('select public.remove_member($1)', [b.id]));
    expect((await t.db.query(`select 1 from public.household_members where display_name = 'Bala'`)).rows).toHaveLength(0);
  });

  it('too many waiting requests are refused', async () => {
    await setupFamily(t, adminPhone, 'M', ADMIN_PIN, 'Reema');
    for (let i = 0; i < 10; i++) await joinFamily(t, await t.createUser(`r${i}@anon`), FAMILY_PIN, `Person ${i}`);
    await expect(joinFamily(t, await t.createUser('r10@anon'), FAMILY_PIN, 'Person 10')).rejects.toThrow(/Too many sign-in requests/);
  });
});
