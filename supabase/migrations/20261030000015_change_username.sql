-- Change a username. Admins can rename anyone; everyone can rename themselves.
-- The login email ("<username>@mealtrack.invalid") changes with it, so the
-- person signs in with the new username from then on. The password stays.

create or replace function public.change_username(p_user_id uuid, p_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := public.my_household_id();
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_email text := public._login_email(p_username);
begin
  if v_household is null or (p_user_id <> auth.uid() and not public.is_household_admin(v_household)) then
    raise exception 'Only an admin can change someone else''s username' using errcode = '42501';
  end if;
  if not exists (select 1 from public.household_members where household_id = v_household and user_id = p_user_id) then
    raise exception 'Person not found' using errcode = 'P0002';
  end if;
  if v_username !~ '^[a-z0-9][a-z0-9._-]{2,29}$' then
    raise exception 'Username must be 3–30 characters: letters, numbers, dot, dash or underscore' using errcode = '22023';
  end if;
  if exists (select 1 from public.household_members where lower(username) = v_username and user_id <> p_user_id)
     or exists (select 1 from auth.users where lower(email) = v_email and id <> p_user_id) then
    raise exception 'That username is already taken' using errcode = '23505';
  end if;

  update auth.users
     set email = v_email,
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('username', v_username),
         updated_at = now()
   where id = p_user_id;
  update auth.identities
     set identity_data = identity_data || jsonb_build_object('email', v_email),
         updated_at = now()
   where user_id = p_user_id and provider = 'email';
  update public.household_members set username = v_username where user_id = p_user_id;
end;
$$;

revoke execute on function public.change_username(uuid, text) from public, anon;
grant execute on function public.change_username(uuid, text) to authenticated;
