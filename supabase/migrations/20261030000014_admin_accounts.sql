-- Username + password accounts that only an admin can create.
--
-- Supabase Auth needs an email address, so each username is stored as
-- "<username>@mealtrack.invalid". The .invalid domain can never receive mail,
-- and nothing ever sends any: accounts are created confirmed, and password
-- resets are done by an admin inside the app.
--
-- New phones no longer get in automatically: enter_mealtrack() and the old
-- join/invite functions stop working, and the anonymous phone sessions used
-- for open access are removed.

alter table public.household_members
  add column if not exists username text,
  add column if not exists must_change_password boolean not null default false;

create unique index if not exists household_members_username_key
  on public.household_members (lower(username));

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable through the API)
-- ---------------------------------------------------------------------------
create or replace function public._login_email(p_username text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(p_username)) || '@mealtrack.invalid';
$$;

create or replace function public._validate_account(p_username text, p_password text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(lower(btrim(p_username)), '') !~ '^[a-z0-9][a-z0-9._-]{2,29}$' then
    raise exception 'Username must be 3–30 characters: letters, numbers, dot, dash or underscore'
      using errcode = '22023';
  end if;
  if char_length(coalesce(p_password, '')) < 8 then
    raise exception 'Password must be at least 8 characters' using errcode = '22023';
  end if;
end;
$$;

-- Creates a confirmed email/password login in Supabase Auth; returns its user id.
create or replace function public._create_login(p_username text, p_password text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := gen_random_uuid();
  v_email text := public._login_email(p_username);
begin
  perform public._validate_account(p_username, p_password);
  if exists (select 1 from auth.users where lower(email) = v_email)
     or exists (select 1 from public.household_members where lower(username) = lower(btrim(p_username))) then
    raise exception 'That username is already taken' using errcode = '23505';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('username', lower(btrim(p_username))), now(), now(),
    '', '', '', ''
  );
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    v_uid::text, v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );
  return v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_first_admin: run once in the SQL Editor to make the first admin.
-- Refuses if an admin account with a username already exists.
-- ---------------------------------------------------------------------------
create or replace function public.create_first_admin(p_username text, p_password text, p_display_name text default 'Admin')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_household uuid;
begin
  if exists (select 1 from public.household_members where role = 'admin' and username is not null) then
    raise exception 'An admin account already exists. Sign in as that admin to add people.' using errcode = 'P0001';
  end if;
  select id into v_household from public.households order by created_at limit 1;
  if v_household is null then
    insert into public.households (name, timezone) values ('MealTrack', 'Asia/Kolkata') returning id into v_household;
  end if;
  v_uid := public._create_login(p_username, p_password);
  insert into public.household_members (household_id, user_id, role, display_name, status, username, must_change_password)
  values (v_household, v_uid, 'admin', btrim(p_display_name), 'approved', lower(btrim(p_username)), true);
  return v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin actions
-- ---------------------------------------------------------------------------
create or replace function public.create_account(p_display_name text, p_username text, p_password text, p_role text default 'member')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := public.my_household_id();
  v_uid uuid;
begin
  if v_household is null or not public.is_household_admin(v_household) then
    raise exception 'Only an admin can create accounts' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'Invalid role' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 60 then
    raise exception 'Please enter a name' using errcode = '22023';
  end if;
  v_uid := public._create_login(p_username, p_password);
  insert into public.household_members (household_id, user_id, role, display_name, status, approved_by, approved_at, username, must_change_password)
  values (v_household, v_uid, p_role, btrim(p_display_name), 'approved', auth.uid(), now(), lower(btrim(p_username)), true);
  return v_uid;
end;
$$;

-- Sets a new password for someone who forgot theirs; they must change it after signing in.
create or replace function public.reset_account_password(p_user_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := public.my_household_id();
begin
  if v_household is null or not public.is_household_admin(v_household) then
    raise exception 'Only an admin can reset passwords' using errcode = '42501';
  end if;
  if char_length(coalesce(p_password, '')) < 8 then
    raise exception 'Password must be at least 8 characters' using errcode = '22023';
  end if;
  if not exists (select 1 from public.household_members where household_id = v_household and user_id = p_user_id) then
    raise exception 'Person not found' using errcode = 'P0002';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
   where id = p_user_id;
  update public.household_members set must_change_password = (p_user_id <> auth.uid())
   where household_id = v_household and user_id = p_user_id;
end;
$$;

-- Deletes someone's account completely: they can no longer sign in and stop getting reminders.
create or replace function public.delete_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := public.my_household_id();
begin
  if v_household is null or not public.is_household_admin(v_household) then
    raise exception 'Only an admin can delete accounts' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own account' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.household_members where household_id = v_household and user_id = p_user_id) then
    raise exception 'Person not found' using errcode = 'P0002';
  end if;
  -- Cascades to the membership, reminder settings and push registrations.
  delete from auth.users where id = p_user_id;
end;
$$;

-- Called after the person has changed their own password.
create or replace function public.password_changed()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.household_members set must_change_password = false where user_id = auth.uid();
$$;

-- Open access is over: phones without an account are no longer let in.
create or replace function public.enter_mealtrack()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Please sign in with the username and password your admin gave you.' using errcode = '42501';
end;
$$;

-- When an account is deleted, the database clears created_by / updated_by on
-- the meals it saved. That clearing must not be undone by the stamp trigger
-- (or count as an edit), so changes made from inside another trigger, such as
-- the foreign-key cascade, pass through untouched.
create or replace function public.meal_overrides_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.updated_by := new.created_by;
    new.created_at := now();
    new.updated_at := now();
    new.version := 1;
  else
    new.id := old.id;
    new.household_id := old.household_id;
    new.meal_date := old.meal_date;
    new.meal_period := old.meal_period;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := coalesce(auth.uid(), new.updated_by);
    new.updated_at := now();
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

-- Remove the anonymous phone sessions that open access created (their
-- memberships, reminder settings and push registrations go with them).
-- Meal records and subscriptions belong to the family and are kept.
delete from auth.users where is_anonymous;

revoke execute on function public._create_login(text, text) from public, anon, authenticated;
revoke execute on function public._validate_account(text, text) from public, anon, authenticated;
revoke execute on function public.create_first_admin(text, text, text) from public, anon, authenticated;
revoke execute on function public.create_account(text, text, text, text) from public, anon;
revoke execute on function public.reset_account_password(uuid, text) from public, anon;
revoke execute on function public.delete_account(uuid) from public, anon;
revoke execute on function public.password_changed() from public, anon;
grant execute on function public.create_account(text, text, text, text) to authenticated;
grant execute on function public.reset_account_password(uuid, text) to authenticated;
grant execute on function public.delete_account(uuid) to authenticated;
grant execute on function public.password_changed() to authenticated;

-- Old ways of joining are switched off.
revoke execute on function public.join_with_pin(text, text) from public, anon, authenticated;
revoke execute on function public.create_household(text, text, text) from public, anon, authenticated;
revoke execute on function public.accept_invite(text, text) from public, anon, authenticated;
revoke execute on function public.create_invite(text, text) from public, anon, authenticated;
revoke execute on function public.setup_household(text, text, text, text) from public, anon, authenticated;
