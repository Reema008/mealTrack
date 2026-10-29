import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb, type TestUser } from './harness';

let t: TestDb;
let admin: TestUser;
let memberId: string;

const asUser = (id: string): TestUser => ({ id, email: '' });
const rpc = (u: TestUser | null, sql: string, params: unknown[] = []) => t.as(u, (tx) => tx.query(sql, params));
const passwordOk = async (id: string, pw: string) =>
  (await t.db.query<{ ok: boolean }>('select encrypted_password = extensions.crypt($2, encrypted_password) as ok from auth.users where id = $1', [id, pw])).rows[0]
    ?.ok;

beforeAll(async () => {
  t = await createTestDb();
  const r = await t.db.query<{ id: string }>(`select public.create_first_admin('admin', 'Temp-pass-123') as id`);
  admin = asUser(r.rows[0].id);
});
afterAll(() => t.close());

describe('accounts created by the admin', () => {
  it('the first admin gets a confirmed login and must change the password', async () => {
    const u = (await t.db.query('select email, email_confirmed_at from auth.users where id = $1', [admin.id])).rows[0] as { email: string; email_confirmed_at: string };
    expect(u.email).toBe('admin@mealtrack.invalid');
    expect(u.email_confirmed_at).toBeTruthy();
    expect(await passwordOk(admin.id, 'Temp-pass-123')).toBe(true);
    const m = (await t.db.query('select role, username, must_change_password from public.household_members where user_id = $1', [admin.id])).rows[0];
    expect(m).toMatchObject({ role: 'admin', username: 'admin', must_change_password: true });
    expect((await t.db.query('select 1 from auth.identities where user_id = $1', [admin.id])).rows).toHaveLength(1);
  });

  it('a second first admin cannot be created', async () => {
    await expect(t.db.query(`select public.create_first_admin('boss', 'Another-pass-1')`)).rejects.toThrow(/already exists/);
  });

  it('the admin creates an account that can sign in', async () => {
    const r = await rpc(admin, `select public.create_account('Priya', 'Priya', 'Welcome-123', 'member') as id`);
    memberId = (r.rows[0] as { id: string }).id;
    expect(await passwordOk(memberId, 'Welcome-123')).toBe(true);
    const m = (await t.db.query('select role, username, display_name, must_change_password from public.household_members where user_id = $1', [memberId])).rows[0];
    expect(m).toMatchObject({ role: 'member', username: 'priya', display_name: 'Priya', must_change_password: true });
  });

  it('usernames are unique (ignoring case) and validated', async () => {
    await expect(rpc(admin, `select public.create_account('P2', 'PRIYA', 'Welcome-123')`)).rejects.toThrow(/already taken/);
    await expect(rpc(admin, `select public.create_account('X', 'a b', 'Welcome-123')`)).rejects.toThrow(/Username/);
    await expect(rpc(admin, `select public.create_account('X', 'arjun', 'short')`)).rejects.toThrow(/at least 8/);
  });

  it('members cannot create, reset or delete accounts', async () => {
    const m = asUser(memberId);
    await expect(rpc(m, `select public.create_account('Arjun', 'arjun', 'Welcome-123')`)).rejects.toThrow(/Only an admin/);
    await expect(rpc(m, 'select public.reset_account_password($1, $2)', [admin.id, 'Hacked-123'])).rejects.toThrow(/Only an admin/);
    await expect(rpc(m, 'select public.delete_account($1)', [admin.id])).rejects.toThrow(/Only an admin/);
  });

  it('the internal helpers and first-admin setup are not callable from the app', async () => {
    await expect(rpc(admin, `select public._create_login('sneaky', 'Welcome-123')`)).rejects.toThrow(/permission denied/);
    await expect(rpc(admin, `select public.create_first_admin('sneaky', 'Welcome-123')`)).rejects.toThrow(/permission denied/);
    await expect(rpc(null, `select public.create_account('A', 'anon1', 'Welcome-123')`)).rejects.toThrow(/permission denied/);
  });

  it('changing your own password clears the reminder flag', async () => {
    await rpc(asUser(memberId), 'select public.password_changed()');
    const m = (await t.db.query('select must_change_password from public.household_members where user_id = $1', [memberId])).rows[0];
    expect(m).toMatchObject({ must_change_password: false });
  });

  it('an admin reset sets a new password the person must change', async () => {
    await rpc(admin, 'select public.reset_account_password($1, $2)', [memberId, 'Reset-pass-9']);
    expect(await passwordOk(memberId, 'Reset-pass-9')).toBe(true);
    expect(await passwordOk(memberId, 'Welcome-123')).toBe(false);
    const m = (await t.db.query('select must_change_password from public.household_members where user_id = $1', [memberId])).rows[0];
    expect(m).toMatchObject({ must_change_password: true });
  });

  it('opening the app without an account no longer lets a phone in', async () => {
    const stranger = await t.createUser('phone@anon');
    await expect(rpc(stranger, 'select public.enter_mealtrack()')).rejects.toThrow(/sign in/);
    await expect(rpc(stranger, `select public.join_with_pin('1234', 'Me')`)).rejects.toThrow(/permission denied/);
    expect((await rpc(stranger, 'select 1 from public.meal_overrides')).rows).toHaveLength(0);
  });

  it('the admin cannot delete themselves, but can delete others', async () => {
    await expect(rpc(admin, 'select public.delete_account($1)', [admin.id])).rejects.toThrow(/your own/);
    await rpc(admin, 'select public.delete_account($1)', [memberId]);
    expect((await t.db.query('select 1 from auth.users where id = $1', [memberId])).rows).toHaveLength(0);
    expect((await t.db.query('select 1 from public.household_members where user_id = $1', [memberId])).rows).toHaveLength(0);
  });
});
