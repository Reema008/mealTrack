-- Personal PINs replace the shared family PIN.
--   * Each person signs in with their NAME + their OWN PIN.
--   * A new name creates a pending request; an admin approves it ONCE.
--   * A returning person (new phone, reinstall, signed out) with the right
--     PIN is let straight back in with the same role: no approval.
--   * Names are unique per household (case-insensitive).
--   * Wrong PINs: 5 per name per 15 minutes, 30 overall per 15 minutes.

alter table public.household_members add column if not exists pin_hash text;
alter table public.family_pin_attempts add column if not exists name_key text;

create unique index if not exists household_members_name_key
  on public.household_members (household_id, lower(display_name));

-- Members may read each other's rows, but never the PIN hash.
revoke select on public.household_members from authenticated;
grant select (household_id, user_id, role, display_name, joined_at, status, approved_by, approved_at)
  on public.household_members to authenticated;

create or replace function public._validate_pin(p_pin text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_pin is null or p_pin !~ '^[0-9]{6,10}$' then
    raise exception 'Your PIN must be 6 to 10 digits' using errcode = '22023';
  end if;
end;
$$;

-- Failed attempts for one name, and overall, in the last 15 minutes.
create or replace function public._pin_failures(p_name_key text, out for_name int, out overall int)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) filter (where name_key = p_name_key)::int, count(*)::int
    from public.family_pin_attempts
   where not success and created_at > now() - interval '15 minutes';
$$;
revoke execute on function public._pin_failures(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- mealtrack_status: 'not_set_up' until the first person sets MealTrack up.
-- ---------------------------------------------------------------------------
create or replace function public.mealtrack_status()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (select 1 from public.households) then 'ready' else 'not_set_up' end;
$$;

-- ---------------------------------------------------------------------------
-- setup_household: the first person (name + their PIN) becomes the admin.
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
  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 60 then
    raise exception 'Please enter your name' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('mealtrack.setup'));
  if exists (select 1 from public.households) then
    raise exception 'MealTrack is already set up. Sign in with your name and PIN.' using errcode = 'P0001';
  end if;

  insert into public.households (name, timezone, created_by)
  values (coalesce(nullif(btrim(p_name), ''), 'MealTrack'), coalesce(nullif(btrim(p_timezone), ''), 'Asia/Kolkata'), v_uid)
  returning id into v_id;

  insert into public.household_members (household_id, user_id, role, display_name, status, pin_hash)
  values (v_id, v_uid, 'admin', btrim(p_display_name), 'approved', extensions.crypt(p_pin, extensions.gen_salt('bf', 8)));

  return jsonb_build_object('id', v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- sign_in(name, pin, create):
--   known name + right PIN  -> this phone takes over that person (same role,
--                               same approval status); their old phone is signed out
--   known name + wrong PIN  -> {"ok": false, "error": "wrong_pin", "attempts_left": n}
--   unknown name, create=false -> {"ok": false, "error": "new_user"} (ask to confirm PIN)
--   unknown name, create=true  -> pending request for the admin
-- Wrong attempts are returned (not raised) so they are recorded.
-- ---------------------------------------------------------------------------
create or replace function public.sign_in(p_name text, p_pin text, p_create boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_key text := lower(btrim(coalesce(p_name, '')));
  v_household uuid;
  v_member record;
  v_existing text;
  v_fail record;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  select status into v_existing from public.household_members where user_id = v_uid;
  if v_existing is not null then
    return jsonb_build_object('ok', true, 'status', v_existing);
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'Please enter your name' using errcode = '22023';
  end if;
  select id into v_household from public.households order by created_at limit 1;
  if v_household is null then
    raise exception 'MealTrack is not set up yet' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('mealtrack.signin'));
  select * into v_fail from public._pin_failures(v_key);
  if v_fail.for_name >= 5 or v_fail.overall >= 30 then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;

  select user_id, status, pin_hash into v_member
    from public.household_members
   where household_id = v_household and lower(display_name) = v_key
   for update;

  if found then
    if v_member.pin_hash is null then
      return jsonb_build_object('ok', false, 'error', 'no_pin');
    end if;
    if v_member.pin_hash <> extensions.crypt(coalesce(p_pin, ''), v_member.pin_hash) then
      insert into public.family_pin_attempts (user_id, success, name_key) values (v_uid, false, v_key);
      return jsonb_build_object('ok', false, 'error', 'wrong_pin', 'attempts_left', greatest(0, 4 - v_fail.for_name));
    end if;
    insert into public.family_pin_attempts (user_id, success, name_key) values (v_uid, true, v_key);
    -- Move this person to the new phone. The previous phone loses access and its reminders.
    delete from public.push_subscriptions where user_id = v_member.user_id;
    delete from public.notification_preferences where user_id = v_member.user_id;
    update public.household_members set user_id = v_uid
     where household_id = v_household and user_id = v_member.user_id;
    return jsonb_build_object('ok', true, 'status', v_member.status, 'returning', true);
  end if;

  if not coalesce(p_create, false) then
    return jsonb_build_object('ok', false, 'error', 'new_user');
  end if;
  perform public._validate_pin(p_pin);
  if (select count(*) from public.household_members where household_id = v_household and status = 'pending') >= 10 then
    raise exception 'Too many sign-in requests are waiting. Ask the admin to review them first.' using errcode = 'P0001';
  end if;
  insert into public.household_members (household_id, user_id, role, display_name, status, pin_hash)
  values (v_household, v_uid, 'member', v_name, 'pending', extensions.crypt(p_pin, extensions.gen_salt('bf', 8)));
  return jsonb_build_object('ok', true, 'status', 'pending');
end;
$$;

-- ---------------------------------------------------------------------------
-- verify_my_pin: app-lock fallback (approved people only).
-- ---------------------------------------------------------------------------
create or replace function public.verify_my_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row record;
  v_fail record;
begin
  select lower(display_name) as name_key, pin_hash into v_row
    from public.household_members where user_id = v_uid and status = 'approved';
  if not found then
    raise exception 'You are not signed in to MealTrack' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('mealtrack.signin'));
  select * into v_fail from public._pin_failures(v_row.name_key);
  if v_fail.for_name >= 5 then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  if v_row.pin_hash is not null and v_row.pin_hash = extensions.crypt(coalesce(p_pin, ''), v_row.pin_hash) then
    insert into public.family_pin_attempts (user_id, success, name_key) values (v_uid, true, v_row.name_key);
    return jsonb_build_object('ok', true);
  end if;
  insert into public.family_pin_attempts (user_id, success, name_key) values (v_uid, false, v_row.name_key);
  return jsonb_build_object('ok', false, 'error', 'wrong_pin', 'attempts_left', greatest(0, 4 - v_fail.for_name));
end;
$$;

-- ---------------------------------------------------------------------------
-- change_my_pin: anyone approved. If they have no PIN yet (older accounts),
-- the current PIN is not required.
-- ---------------------------------------------------------------------------
create or replace function public.change_my_pin(p_current text, p_new text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_has_pin boolean;
  v_check jsonb;
begin
  select pin_hash is not null into v_has_pin
    from public.household_members where user_id = v_uid and status = 'approved';
  if not found then
    raise exception 'You are not signed in to MealTrack' using errcode = '42501';
  end if;
  perform public._validate_pin(p_new);
  if v_has_pin then
    v_check := public.verify_my_pin(p_current);
    if not (v_check ->> 'ok')::boolean then
      return v_check;
    end if;
  end if;
  update public.household_members
     set pin_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 8))
   where user_id = v_uid;
  return jsonb_build_object('ok', true);
end;
$$;

-- Whether the signed-in person has a PIN yet (older accounts may not).
create or replace function public.i_have_pin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select pin_hash is not null from public.household_members where user_id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- reset_member_pin: an admin sets a new PIN for someone who forgot theirs.
-- ---------------------------------------------------------------------------
create or replace function public.reset_member_pin(p_user_id uuid, p_new text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := public.my_household_id();
  v_key text;
begin
  if v_household is null or not public.is_household_admin(v_household) then
    raise exception 'Only an admin can reset a PIN' using errcode = '42501';
  end if;
  perform public._validate_pin(p_new);
  update public.household_members
     set pin_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 8))
   where household_id = v_household and user_id = p_user_id
  returning lower(display_name) into v_key;
  if v_key is null then
    raise exception 'Person not found' using errcode = 'P0002';
  end if;
  delete from public.family_pin_attempts where name_key = v_key; -- clear any lockout
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_set_person_pin: SQL Editor only, e.g. if the only admin forgets their PIN.
--   select public.admin_set_person_pin('Reema', '123456');
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_person_pin(p_name text, p_pin text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  perform public._validate_pin(p_pin);
  update public.household_members
     set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8))
   where lower(display_name) = lower(btrim(p_name));
  get diagnostics v_count = row_count;
  delete from public.family_pin_attempts where name_key = lower(btrim(p_name));
  return v_count;
end;
$$;

-- Sign out no longer removes anyone; leave_household is only used to cancel a
-- pending request (and by approved people who really want to leave).

-- The shared family PIN is retired.
revoke execute on function public.join_with_pin(text, text) from authenticated;
revoke execute on function public.verify_family_pin(text) from authenticated;
revoke execute on function public.change_family_pin(text, text) from authenticated;
update public.households set pin_hash = null;

revoke execute on function
  public.sign_in(text, text, boolean),
  public.verify_my_pin(text),
  public.change_my_pin(text, text),
  public.i_have_pin(),
  public.reset_member_pin(uuid, text),
  public.admin_set_person_pin(text, text)
  from public, anon;

grant execute on function
  public.sign_in(text, text, boolean),
  public.verify_my_pin(text),
  public.change_my_pin(text, text),
  public.i_have_pin(),
  public.reset_member_pin(uuid, text)
  to authenticated;

revoke execute on function public.admin_set_person_pin(text, text) from authenticated;
