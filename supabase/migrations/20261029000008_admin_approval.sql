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
