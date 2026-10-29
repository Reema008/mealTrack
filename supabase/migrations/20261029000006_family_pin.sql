-- Family PIN access: no email accounts. Each phone signs in anonymously
-- (Supabase anonymous auth) and joins the single family household by entering
-- the shared PIN. Membership then drives the existing RLS policies unchanged.
--
-- PIN security:
--   * stored only as a bcrypt hash (pgcrypto), never readable by clients;
--   * 6–10 digits;
--   * all PIN checks share a global limit of 10 wrong attempts per 15 minutes.

create extension if not exists pgcrypto with schema extensions;

alter table public.households add column if not exists pin_hash text;

-- Clients may read every household column except the PIN hash.
revoke select on public.households from authenticated;
grant select (id, name, timezone, created_by, created_at) on public.households to authenticated;

create table if not exists public.family_pin_attempts (
  id          bigint generated always as identity primary key,
  user_id     uuid,
  success     boolean not null,
  created_at  timestamptz not null default now()
);
create index if not exists family_pin_attempts_recent_idx on public.family_pin_attempts (created_at) where not success;

-- No client access at all (RLS on, no policies, no grants).
alter table public.family_pin_attempts enable row level security;
revoke all on public.family_pin_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------
create or replace function public._pin_failures_recent()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.family_pin_attempts
   where not success and created_at > now() - interval '15 minutes';
$$;

create or replace function public._validate_pin(p_pin text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_pin is null or p_pin !~ '^[0-9]{6,10}$' then
    raise exception 'The family PIN must be 6 to 10 digits' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public._pin_failures_recent(), public._validate_pin(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- mealtrack_status: lets a new phone know whether to show "Set up" or
-- "Enter PIN". Reveals nothing beyond that.
-- ---------------------------------------------------------------------------
create or replace function public.mealtrack_status()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.households) then 'not_set_up'
    when not exists (select 1 from public.households where pin_hash is not null) then 'needs_pin'
    else 'ready'
  end;
$$;

-- ---------------------------------------------------------------------------
-- setup_household: first-time setup. Only possible while no household exists.
-- ---------------------------------------------------------------------------
create or replace function public.setup_household(p_name text, p_display_name text, p_pin text, p_timezone text default 'Asia/Kolkata')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  perform public._validate_pin(p_pin);
  perform pg_advisory_xact_lock(hashtext('mealtrack.setup'));
  if exists (select 1 from public.households) then
    raise exception 'MealTrack is already set up. Enter the family PIN to join.' using errcode = 'P0001';
  end if;

  insert into public.households (name, timezone, created_by, pin_hash)
  values (btrim(p_name), coalesce(nullif(btrim(p_timezone), ''), 'Asia/Kolkata'), v_uid,
          extensions.crypt(p_pin, extensions.gen_salt('bf', 8)))
  returning id into v_id;

  insert into public.household_members (household_id, user_id, role, display_name)
  values (v_id, v_uid, 'admin', btrim(p_display_name));

  return jsonb_build_object('id', v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- join_with_pin: adds this phone (anonymous user) to the family.
-- Returns {"ok": true} or {"ok": false, "error": "wrong_pin"|"locked", "attempts_left": n}.
-- Wrong attempts are returned (not raised) so the attempt record is committed.
-- ---------------------------------------------------------------------------
create or replace function public.join_with_pin(p_pin text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_failures int;
  v_household uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if exists (select 1 from public.household_members where user_id = v_uid) then
    return jsonb_build_object('ok', true);
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 60 then
    raise exception 'Please enter a name for this phone' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('mealtrack.pin'));
  v_failures := public._pin_failures_recent();
  if v_failures >= 10 then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;

  select id into v_household
    from public.households
   where pin_hash is not null and pin_hash = extensions.crypt(coalesce(p_pin, ''), pin_hash)
   limit 1;

  if v_household is null then
    insert into public.family_pin_attempts (user_id, success) values (v_uid, false);
    return jsonb_build_object('ok', false, 'error', 'wrong_pin', 'attempts_left', greatest(0, 9 - v_failures));
  end if;

  insert into public.family_pin_attempts (user_id, success) values (v_uid, true);
  -- Every family phone has equal rights.
  insert into public.household_members (household_id, user_id, role, display_name)
  values (v_household, v_uid, 'admin', btrim(p_display_name));
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- verify_family_pin: app-lock fallback when fingerprint/Face ID is unavailable.
-- ---------------------------------------------------------------------------
create or replace function public.verify_family_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_household uuid := public.my_household_id();
  v_failures int;
  v_ok boolean;
begin
  if v_household is null then
    raise exception 'This phone is not part of the family yet' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('mealtrack.pin'));
  v_failures := public._pin_failures_recent();
  if v_failures >= 10 then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  select pin_hash = extensions.crypt(coalesce(p_pin, ''), pin_hash) into v_ok
    from public.households where id = v_household;
  insert into public.family_pin_attempts (user_id, success) values (v_uid, coalesce(v_ok, false));
  if coalesce(v_ok, false) then
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'wrong_pin', 'attempts_left', greatest(0, 9 - v_failures));
end;
$$;

-- ---------------------------------------------------------------------------
-- change_family_pin: any family phone, given the current PIN. Phones that
-- already joined stay joined; new phones need the new PIN.
-- ---------------------------------------------------------------------------
create or replace function public.change_family_pin(p_current text, p_new text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_check jsonb;
begin
  perform public._validate_pin(p_new);
  v_check := public.verify_family_pin(p_current);
  if not (v_check ->> 'ok')::boolean then
    return v_check;
  end if;
  update public.households
     set pin_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 8))
   where id = public.my_household_id();
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- leave_household: "Remove this phone" — deletes this phone's membership,
-- reminder settings and push registration.
-- ---------------------------------------------------------------------------
create or replace function public.leave_household()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  delete from public.push_subscriptions where user_id = v_uid;
  delete from public.notification_preferences where user_id = v_uid;
  delete from public.household_members where user_id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_set_family_pin: for the Supabase SQL Editor only (e.g. a household
-- created before PINs existed, or a forgotten PIN). Not callable by clients.
--   select public.admin_set_family_pin('123456');
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_family_pin(p_pin text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  perform public._validate_pin(p_pin);
  update public.households set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8));
  get diagnostics v_count = row_count;
  delete from public.family_pin_attempts;
  return v_count;
end;
$$;

-- Household creation now only happens through setup_household (single family).
revoke execute on function public.create_household(text, text, text) from authenticated;

revoke execute on function
  public.mealtrack_status(),
  public.setup_household(text, text, text, text),
  public.join_with_pin(text, text),
  public.verify_family_pin(text),
  public.change_family_pin(text, text),
  public.leave_household(),
  public.admin_set_family_pin(text)
  from public, anon;

grant execute on function
  public.mealtrack_status(),
  public.setup_household(text, text, text, text),
  public.join_with_pin(text, text),
  public.verify_family_pin(text),
  public.change_family_pin(text, text),
  public.leave_household()
  to authenticated;

revoke execute on function public.admin_set_family_pin(text) from authenticated;
