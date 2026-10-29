import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb, type TestUser } from './harness';

let t: TestDb;
let admin: TestUser;
let priya: TestUser;
let arjun: TestUser;

const asUser = (id: string): TestUser => ({ id, email: '' });
const rename = (by: TestUser, who: TestUser, name: string) => t.as(by, (tx) => tx.query('select public.change_username($1, $2)', [who.id, name]));
const login = async (u: TestUser) =>
  (await t.db.query<{ email: string; username: string; idemail: string }>(
    `select u.email, m.username, i.identity_data ->> 'email' as idemail
       from auth.users u join public.household_members m on m.user_id = u.id join auth.identities i on i.user_id = u.id
      where u.id = $1`,
    [u.id],
  )).rows[0];

beforeAll(async () => {
  t = await createTestDb();
  admin = asUser((await t.db.query<{ id: string }>(`select public.create_first_admin('admin', 'Temp-pass-123') as id`)).rows[0].id);
  priya = asUser((await t.as(admin, (tx) => tx.query<{ id: string }>(`select public.create_account('Priya', 'priya', 'Welcome-123') as id`))).rows[0].id);
  arjun = asUser((await t.as(admin, (tx) => tx.query<{ id: string }>(`select public.create_account('Arjun', 'arjun', 'Welcome-123') as id`))).rows[0].id);
});
afterAll(() => t.close());

describe('changing usernames', () => {
  it('an admin renames someone: their login email changes too, the password stays', async () => {
    const before = (await t.db.query('select encrypted_password from auth.users where id = $1', [priya.id])).rows[0];
    await rename(admin, priya, ' Priya.S ');
    expect(await login(priya)).toEqual({ email: 'priya.s@mealtrack.invalid', username: 'priya.s', idemail: 'priya.s@mealtrack.invalid' });
    expect((await t.db.query('select encrypted_password from auth.users where id = $1', [priya.id])).rows[0]).toEqual(before);
  });

  it('anyone can rename themselves, and an admin can rename themselves', async () => {
    await rename(arjun, arjun, 'arjun99');
    expect((await login(arjun)).username).toBe('arjun99');
    await rename(admin, admin, 'mom');
    expect((await login(admin)).email).toBe('mom@mealtrack.invalid');
  });

  it('members cannot rename other people', async () => {
    await expect(rename(arjun, priya, 'hacked')).rejects.toThrow(/Only an admin/);
  });

  it('usernames stay unique and valid', async () => {
    await expect(rename(admin, arjun, 'PRIYA.S')).rejects.toThrow(/already taken/);
    await expect(rename(admin, arjun, 'no spaces')).rejects.toThrow(/Username/);
    await rename(admin, arjun, 'arjun99'); // keeping the same name is fine
  });

  it('signed-out visitors cannot call it', async () => {
    await expect(t.as(null, (tx) => tx.query('select public.change_username($1, $2)', [priya.id, 'x123']))).rejects.toThrow(/permission denied/);
  });
});
