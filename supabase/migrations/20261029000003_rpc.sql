-- Household setup, invitations and the conflict-aware meal save.

-- ---------------------------------------------------------------------------
-- create_household: the caller becomes the first administrator.
-- ---------------------------------------------------------------------------
create function public.create_household(p_name text, p_display_name text, p_timezone text default 'Asia/Kolkata')
returns public.households
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_household public.households;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if exists (select 1 from public.household_members where user_id = v_uid) then
    raise exception 'You already belong to a household' using errcode = 'P0001';
  end if;

  insert into public.households (name, timezone, created_by)
  values (btrim(p_name), coalesce(nullif(btrim(p_timezone), ''), 'Asia/Kolkata'), v_uid)
  returning * into v_household;

  insert into public.household_members (household_id, user_id, role, display_name)
  values (v_household.id, v_uid, 'admin', btrim(p_display_name));

  return v_household;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_invite: admins invite an email address. Returns the row incl. token.
-- ---------------------------------------------------------------------------
create function public.create_invite(p_email text, p_role text default 'member')
returns public.household_invites
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household uuid := public.my_household_id();
  v_invite public.household_invites;
begin
  if v_household is null or not public.is_household_admin(v_household) then
    raise exception 'Only household administrators can invite members' using errcode = '42501';
  end if;

  -- Revoke any earlier pending invite for the same address.
  update public.household_invites
     set revoked_at = now()
   where household_id = v_household
     and email = lower(btrim(p_email))
     and accepted_at is null
     and revoked_at is null;

  insert into public.household_invites (household_id, email, role, invited_by)
  values (v_household, lower(btrim(p_email)), coalesce(p_role, 'member'), auth.uid())
  returning * into v_invite;

  return v_invite;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_invite: lets an invitee preview an invite by token before accepting.
-- ---------------------------------------------------------------------------
create function public.get_invite(p_token text)
returns table (household_name text, email text, role text, expires_at timestamptz, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select h.name,
         i.email,
         i.role,
         i.expires_at,
         case
           when i.revoked_at is not null then 'revoked'
           when i.accepted_at is not null then 'accepted'
           when i.expires_at < now() then 'expired'
           else 'pending'
         end
    from public.household_invites i
    join public.households h on h.id = i.household_id
   where i.token = p_token
     and auth.uid() is not null;
$$;

-- ---------------------------------------------------------------------------
-- accept_invite: validates token, expiry and that the signed-in email matches.
-- ---------------------------------------------------------------------------
create function public.accept_invite(p_token text, p_display_name text)
returns public.household_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_invite public.household_invites;
  v_member public.household_members;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_invite from public.household_invites where token = p_token for update;
  if not found then
    raise exception 'This invite link is not valid' using errcode = 'P0002';
  end if;
  if v_invite.revoked_at is not null then
    raise exception 'This invite has been revoked' using errcode = 'P0001';
  end if;
  if v_invite.accepted_at is not null then
    raise exception 'This invite has already been used' using errcode = 'P0001';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'This invite has expired; ask your administrator for a new one' using errcode = 'P0001';
  end if;
  if v_invite.email <> v_email then
    raise exception 'This invite was sent to a different email address' using errcode = '42501';
  end if;
  if exists (select 1 from public.household_members where user_id = v_uid) then
    raise exception 'You already belong to a household' using errcode = 'P0001';
  end if;

  insert into public.household_members (household_id, user_id, role, display_name)
  values (v_invite.household_id, v_uid, v_invite.role, btrim(p_display_name))
  returning * into v_member;

  update public.household_invites
     set accepted_at = now(), accepted_by = v_uid
   where id = v_invite.id;

  return v_member;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_member_role: admins promote/demote; at least one admin must remain.
-- ---------------------------------------------------------------------------
create function public.set_member_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := public.my_household_id();
begin
  if v_household is null or not public.is_household_admin(v_household) then
    raise exception 'Only household administrators can change roles' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'Invalid role' using errcode = '22023';
  end if;
  if p_role = 'member' and not exists (
    select 1 from public.household_members
     where household_id = v_household and role = 'admin' and user_id <> p_user_id
  ) then
    raise exception 'A household needs at least one administrator' using errcode = 'P0001';
  end if;

  update public.household_members
     set role = p_role
   where household_id = v_household and user_id = p_user_id;
  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_meal_override: the single write path for meals.
--
-- Optimistic concurrency: the client sends the version it last saw
-- (null = "I saw no override, i.e. the default"). If the stored state has
-- moved on, nothing is written and the current row is returned as a conflict.
-- Saving values equal to the schedule default deletes the override.
-- Saving values identical to what is stored is a no-op ("unchanged"), which
-- makes offline replays idempotent.
--
-- Returns {"status": "saved" | "deleted" | "unchanged" | "conflict", "row": <row or null>}.
-- ---------------------------------------------------------------------------
create function public.save_meal_override(
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

  if v_nonveg then
    if p_main_dish is null or p_extra_curry is null then
      raise exception 'Main dish and extra curry status are required on non-veg days' using errcode = '22023';
    end if;
  else
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
      -- The override the client saw was removed by someone else.
      return jsonb_build_object('status', 'conflict', 'row', null);
    end if;

    insert into public.meal_overrides (household_id, meal_date, meal_period, delivery_status, main_dish, extra_curry_received)
    values (v_household, p_date, p_period, p_delivery_status, p_main_dish, p_extra_curry)
    on conflict (household_id, meal_date, meal_period) do nothing
    returning * into v_row;

    if v_row.id is null then
      -- Lost an insert race; report the winner instead of overwriting it.
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

revoke execute on function
  public.create_household(text, text, text),
  public.create_invite(text, text),
  public.get_invite(text),
  public.accept_invite(text, text),
  public.set_member_role(uuid, text),
  public.save_meal_override(date, text, text, text, boolean, integer)
  from public, anon;

grant execute on function
  public.create_household(text, text, text),
  public.create_invite(text, text),
  public.get_invite(text),
  public.accept_invite(text, text),
  public.set_member_role(uuid, text),
  public.save_meal_override(date, text, text, text, boolean, integer)
  to authenticated;
