import { PGlite, type Transaction } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'supabase', 'migrations');

/**
 * Minimal stand-in for the parts of Supabase the migrations depend on:
 * the auth schema, JWT claim helpers, API roles, default privileges and the
 * realtime publication. Mirrors how PostgREST sets `role` and
 * `request.jwt.claims` for each request.
 */
const SUPABASE_SHIM = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;

  create schema extensions;
  grant usage on schema extensions to anon, authenticated, service_role;

  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
  $$;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;

  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

  create publication supabase_realtime;
`;

/** Migrations that need hosted-only extensions (pg_cron, pg_net, Vault). */
const HOSTED_ONLY = /_cron\.sql$/;

export interface TestUser {
  id: string;
  email: string;
}

export interface TestDb {
  db: PGlite;
  createUser(email: string): Promise<TestUser>;
  as<T>(user: TestUser | null, fn: (tx: Transaction) => Promise<T>): Promise<T>;
  asService<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && !HOSTED_ONLY.test(f))
    .sort();
}

/** Run one migration file the way the SQL Editor does: all statements in one transaction. */
export async function applyMigration(db: PGlite, file: string): Promise<void> {
  try {
    await db.exec(`begin;\n${readFileSync(join(MIGRATIONS_DIR, file), 'utf8')}\ncommit;`);
  } catch (err) {
    await db.exec('rollback').catch(() => {});
    throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
  }
}

/** @param upTo apply only migrations whose file name sorts before this prefix. */
export async function createTestDb(upTo?: string): Promise<TestDb> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_SHIM);

  for (const f of migrationFiles()) {
    if (upTo && f >= upTo) break;
    await applyMigration(db, f);
  }

  const run = <T>(role: string, claims: object, fn: (tx: Transaction) => Promise<T>) =>
    db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      await tx.exec(`set local role ${role}`);
      return fn(tx);
    });

  return {
    db,
    async createUser(email) {
      const user = { id: randomUUID(), email };
      await db.query('insert into auth.users (id, email) values ($1, $2)', [user.id, user.email]);
      return user;
    },
    as(user, fn) {
      return user
        ? run('authenticated', { sub: user.id, email: user.email, role: 'authenticated' }, fn)
        : run('anon', { role: 'anon' }, fn);
    },
    asService(fn) {
      return run('service_role', { role: 'service_role' }, fn);
    },
    close: () => db.close(),
  };
}

/** PIN used when tests set MealTrack up. */
export const FAMILY_PIN = '482913';

/** First-time setup: `user` becomes the admin, signing in as `displayName` with `pin`. */
export async function setupFamily(t: TestDb, user: TestUser, name = 'Family', pin = FAMILY_PIN, displayName = 'Owner'): Promise<string> {
  return t.as(user, async (tx) => {
    const r = await tx.query<{ r: { id: string } }>(`select public.setup_household($1, $2, $3) as r`, [name, displayName, pin]);
    return r.rows[0].r.id;
  });
}

/** A phone opens MealTrack (open access: let in automatically). */
export async function joinFamily(t: TestDb, user: TestUser) {
  await t.as(user, (tx) => tx.query('select public.enter_mealtrack()'));
}

/** Kept for older tests: with open access, opening the app is all it takes. */
export async function joinAndApprove(t: TestDb, _admin: TestUser, user: TestUser) {
  await joinFamily(t, user);
}

/** A second, unrelated household (only possible directly in the DB now). */
export async function createOtherHousehold(t: TestDb, user: TestUser, name = 'Other'): Promise<string> {
  const h = await t.db.query<{ id: string }>('insert into public.households (name) values ($1) returning id', [name]);
  await t.db.query(`insert into public.household_members (household_id, user_id, role, display_name) values ($1, $2, 'admin', 'Other')`, [
    h.rows[0].id,
    user.id,
  ]);
  return h.rows[0].id;
}

export interface SaveResult {
  status: 'saved' | 'deleted' | 'unchanged' | 'conflict';
  row: { id: string; version: number; delivery_status: string; main_dish: string | null; extra_curry_received: boolean | null } | null;
}

export async function saveMeal(
  tx: Transaction,
  date: string,
  period: 'lunch' | 'dinner',
  values: { status?: string; dish?: string | null; curry?: boolean | null },
  expectedVersion: number | null,
): Promise<SaveResult> {
  const res = await tx.query<{ r: SaveResult }>(
    'select public.save_meal_override($1, $2, $3, $4, $5, $6) as r',
    [date, period, values.status ?? 'delivered', values.dish ?? null, values.curry ?? null, expectedVersion],
  );
  return res.rows[0].r;
}
