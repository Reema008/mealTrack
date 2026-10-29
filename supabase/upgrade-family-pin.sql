-- MealTrack upgrade: run this ONLY if you already ran an earlier setup-all.sql.
-- Adds: name + PIN sign-in with admin approval, fingerprint/Face ID lock, and the
-- not-delivered rule. Safe to run more than once.

-- ==== supabase/migrations/20261029000006_family_pin.sql ====
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

-- ==== supabase/migrations/20261029000007_not_delivered_clears_dish.sql ====
-- A meal that was not delivered has no main dish and no extra curries.
-- Non-veg rows therefore carry main_dish / extra_curry_received only when the
-- meal was delivered; not-received rows store NULL for both.

-- Drop the old rule first: it requires dish/curry on every non-veg row, so
-- clearing them while it is still in place would be rejected.
alter table public.meal_overrides drop constraint if exists meal_overrides_shape;

update public.meal_overrides
   set main_dish = null, extra_curry_received = null
 where delivery_status = 'not_received'
   and (main_dish is not null or extra_curry_received is not null);

alter table public.meal_overrides add constraint meal_overrides_shape check (
  case
    when extract(isodow from meal_date) in (2, 3, 5) and delivery_status = 'delivered'
      then main_dish is not null and extra_curry_received is not null
    else main_dish is null and extra_curry_received is null
  end
);

create or replace function public.save_meal_override(
  p_date date,
  p_period text,
  p_delivery_status text,
  p_main_dish text,
  p_extra_curry boolean,
  p_expected_version integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household uuid := public.my_household_id();
  v_dow int := extract(isodow from p_date);
  v_nonveg boolean := extract(isodow from p_date) in (2, 3, 5);
  v_is_default boolean;
  v_row public.meal_overrides;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if v_household is null then
    raise exception 'You are not a member of a household' using errcode = '42501';
  end if;
  if v_dow = 7 then
    raise exception 'No meals are scheduled on Sundays' using errcode = '22023';
  end if;
  if p_period not in ('lunch', 'dinner') then
    raise exception 'Invalid meal period' using errcode = '22023';
  end if;
  if p_delivery_status not in ('delivered', 'not_received') then
    raise exception 'Invalid delivery status' using errcode = '22023';
  end if;

  if v_nonveg and p_delivery_status = 'delivered' then
    if p_main_dish is null or p_extra_curry is null then
      raise exception 'Main dish and extra curry status are required for a delivered non-veg meal' using errcode = '22023';
    end if;
  else
    -- Veg meals, and meals that were not delivered, have no dish/curry details.
    p_main_dish := null;
    p_extra_curry := null;
  end if;

  v_is_default := p_delivery_status = 'delivered'
                  and (not v_nonveg or (p_main_dish = 'chicken' and p_extra_curry));

  select * into v_row
    from public.meal_overrides
   where household_id = v_household and meal_date = p_date and meal_period = p_period
   for update;

  if not found then
    if v_is_default then
      return jsonb_build_object('status', 'unchanged', 'row', null);
    end if;
    if p_expected_version is not null then
      return jsonb_build_object('status', 'conflict', 'row', null);
    end if;

    insert into public.meal_overrides (household_id, meal_date, meal_period, delivery_status, main_dish, extra_curry_received)
    values (v_household, p_date, p_period, p_delivery_status, p_main_dish, p_extra_curry)
    on conflict (household_id, meal_date, meal_period) do nothing
    returning * into v_row;

    if v_row.id is null then
      select * into v_row from public.meal_overrides
       where household_id = v_household and meal_date = p_date and meal_period = p_period;
      return jsonb_build_object('status', 'conflict', 'row', to_jsonb(v_row));
    end if;
    return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row));
  end if;

  if v_row.delivery_status = p_delivery_status
     and v_row.main_dish is not distinct from p_main_dish
     and v_row.extra_curry_received is not distinct from p_extra_curry then
    return jsonb_build_object('status', 'unchanged', 'row', to_jsonb(v_row));
  end if;

  if p_expected_version is distinct from v_row.version then
    return jsonb_build_object('status', 'conflict', 'row', to_jsonb(v_row));
  end if;

  if v_is_default then
    delete from public.meal_overrides where id = v_row.id;
    return jsonb_build_object('status', 'deleted', 'row', null);
  end if;

  update public.meal_overrides
     set delivery_status = p_delivery_status,
         main_dish = p_main_dish,
         extra_curry_received = p_extra_curry
   where id = v_row.id
  returning * into v_row;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row));
end;
$$;

-- ==== supabase/migrations/20261029000008_admin_approval.sql ====
-- Sign-in with name + PIN, then admin approval.
-- A correct PIN only creates a PENDING request; the person can see and edit
-- nothing until an admin approves them. Only admins manage people and the PIN.

alter table public.household_members
  add column if not exists status text not null default 'approved' check (status in ('pending', 'approved')),
  add column if not exists approved_by uuid references auth.users (id) on delete set null,
  add column if not exists approved_at timestamptz;

-- Access helpers now require an APPROVED membership. Every RLS policy and
-- RPC that uses them therefore excludes pending people automatically.
create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid() and m.status = 'approved'
  );
$$;

create or replace function public.is_household_admin(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid() and m.role = 'admin' and m.status = 'approved'
  );
$$;

create or replace function public.my_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.household_id from public.household_members m where m.user_id = auth.uid() and m.status = 'approved';
$$;

-- People can always see their own row (to show "waiting for approval").
drop policy if exists "users read own membership" on public.household_members;
create policy "users read own membership"
  on public.household_members for select to authenticated
  using (user_id = auth.uid());

-- Only admins remove people (through remove_member, which also stops reminders).
drop policy if exists "admins remove other members" on public.household_members;
revoke delete on public.household_members from authenticated;

-- ---------------------------------------------------------------------------
-- join_with_pin (sign in): a correct PIN creates a pending request.
-- Returns {"ok": true, "status": "pending"|"approved"} or a PIN error.
-- ---------------------------------------------------------------------------
create or replace function public.join_with_pin(p_pin text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_existing text;
  v_failures int;
  v_household uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  select status into v_existing from public.household_members where user_id = v_uid;
  if v_existing is not null then
    return jsonb_build_object('ok', true, 'status', v_existing);
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 60 then
    raise exception 'Please enter your name' using errcode = '22023';
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
  insert into public.household_members (household_id, user_id, role, display_name, status)
  values (v_household, v_uid, 'member', btrim(p_display_name), 'pending');
  return jsonb_build_object('ok', true, 'status', 'pending');
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin actions
-- ---------------------------------------------------------------------------
create or replace function public.approve_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := public.my_household_id();
begin
  if v_household is null or not public.is_household_admin(v_household) then
    raise exception 'Only an admin can approve people' using errcode = '42501';
  end if;
  update public.household_members
     set status = 'approved', approved_by = auth.uid(), approved_at = now()
   where household_id = v_household and user_id = p_user_id and status = 'pending';
  if not found then
    raise exception 'That request no longer exists' using errcode = 'P0002';
  end if;
end;
$$;

-- Decline a pending request, or remove an approved person. Also deletes their
-- reminder settings and push registrations so they stop getting reminders.
create or replace function public.remove_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := public.my_household_id();
begin
  if v_household is null or not public.is_household_admin(v_household) then
    raise exception 'Only an admin can remove people' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Use Sign out to remove yourself' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.household_members
     where household_id = v_household and user_id = p_user_id and role = 'admin' and status = 'approved'
  ) and not exists (
    select 1 from public.household_members
     where household_id = v_household and role = 'admin' and status = 'approved' and user_id <> p_user_id
  ) then
    raise exception 'MealTrack needs at least one admin' using errcode = 'P0001';
  end if;
  delete from public.push_subscriptions where user_id = p_user_id and household_id = v_household;
  delete from public.notification_preferences where user_id = p_user_id and household_id = v_household;
  delete from public.household_members where household_id = v_household and user_id = p_user_id;
end;
$$;

-- set_member_role: only for approved people; at least one admin must remain.
create or replace function public.set_member_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := public.my_household_id();
begin
  if v_household is null or not public.is_household_admin(v_household) then
    raise exception 'Only an admin can change roles' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'Invalid role' using errcode = '22023';
  end if;
  if p_role = 'member' and not exists (
    select 1 from public.household_members
     where household_id = v_household and role = 'admin' and status = 'approved' and user_id <> p_user_id
  ) then
    raise exception 'MealTrack needs at least one admin' using errcode = 'P0001';
  end if;
  update public.household_members
     set role = p_role
   where household_id = v_household and user_id = p_user_id and status = 'approved';
  if not found then
    raise exception 'Person not found' using errcode = 'P0002';
  end if;
end;
$$;

-- leave_household (sign out / cancel request): the last admin cannot leave
-- while other people still depend on them.
create or replace function public.leave_household()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_household uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  select household_id into v_household from public.household_members
   where user_id = v_uid and role = 'admin' and status = 'approved';
  if v_household is not null
     and not exists (select 1 from public.household_members
                      where household_id = v_household and role = 'admin' and status = 'approved' and user_id <> v_uid)
     and exists (select 1 from public.household_members where household_id = v_household and user_id <> v_uid) then
    raise exception 'You are the only admin. Make someone else an admin before signing out.' using errcode = 'P0001';
  end if;
  delete from public.push_subscriptions where user_id = v_uid;
  delete from public.notification_preferences where user_id = v_uid;
  delete from public.household_members where user_id = v_uid;
end;
$$;

-- Only admins may change the PIN.
create or replace function public.change_family_pin(p_current text, p_new text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_check jsonb;
  v_household uuid := public.my_household_id();
begin
  if v_household is null or not public.is_household_admin(v_household) then
    raise exception 'Only an admin can change the PIN' using errcode = '42501';
  end if;
  perform public._validate_pin(p_new);
  v_check := public.verify_family_pin(p_current);
  if not (v_check ->> 'ok')::boolean then
    return v_check;
  end if;
  update public.households
     set pin_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 8))
   where id = v_household;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.approve_member(uuid), public.remove_member(uuid) from public, anon;
grant execute on function public.approve_member(uuid), public.remove_member(uuid) to authenticated;
