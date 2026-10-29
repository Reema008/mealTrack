-- Row Level Security. Every exposed table has RLS enabled; access is scoped to
-- the caller's household, verified against household_members (never trusting a
-- household id sent by the client).

-- Membership helpers. SECURITY DEFINER avoids recursive policy evaluation on
-- household_members; they only ever answer questions about auth.uid().
create function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid()
  );
$$;

create function public.is_household_admin(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid() and m.role = 'admin'
  );
$$;

create function public.my_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.household_id from public.household_members m where m.user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Privileges: the app requires sign-in, so anon gets nothing.
-- ---------------------------------------------------------------------------
revoke all on public.households, public.household_members, public.household_invites, public.meal_overrides
  from anon, authenticated;

grant select, update (name, timezone) on public.households to authenticated;
grant select, update (display_name), delete on public.household_members to authenticated;
grant select, insert, update (revoked_at) on public.household_invites to authenticated;
grant select, insert, update, delete on public.meal_overrides to authenticated;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.meal_overrides enable row level security;

-- households --------------------------------------------------------------
create policy "members read their household"
  on public.households for select to authenticated
  using (public.is_household_member(id));

create policy "admins update their household"
  on public.households for update to authenticated
  using (public.is_household_admin(id))
  with check (public.is_household_admin(id));

-- household_members -------------------------------------------------------
create policy "members read fellow members"
  on public.household_members for select to authenticated
  using (public.is_household_member(household_id));

create policy "members update their own display name"
  on public.household_members for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "admins remove other members"
  on public.household_members for delete to authenticated
  using (public.is_household_admin(household_id) and user_id <> auth.uid());

-- household_invites (admin only; invitees use the accept_invite RPC) ------
create policy "admins read invites"
  on public.household_invites for select to authenticated
  using (public.is_household_admin(household_id));

create policy "admins create invites"
  on public.household_invites for insert to authenticated
  with check (public.is_household_admin(household_id) and invited_by = auth.uid());

create policy "admins revoke invites"
  on public.household_invites for update to authenticated
  using (public.is_household_admin(household_id))
  with check (public.is_household_admin(household_id));

-- meal_overrides ----------------------------------------------------------
create policy "members read meals"
  on public.meal_overrides for select to authenticated
  using (public.is_household_member(household_id));

create policy "members add meals"
  on public.meal_overrides for insert to authenticated
  with check (public.is_household_member(household_id));

create policy "members change meals"
  on public.meal_overrides for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "members delete meals"
  on public.meal_overrides for delete to authenticated
  using (public.is_household_member(household_id));

revoke execute on function public.is_household_member(uuid), public.is_household_admin(uuid), public.my_household_id()
  from public, anon;
grant execute on function public.is_household_member(uuid), public.is_household_admin(uuid), public.my_household_id()
  to authenticated;
