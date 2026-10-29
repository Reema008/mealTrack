-- Open access: no sign-in, PIN or approval. Every phone that opens MealTrack
-- is let in automatically. Each phone still has its own (invisible)
-- anonymous Supabase session so realtime sync and per-phone reminders work.
--
-- Anyone with the app link can view and edit the meal records.

create or replace function public.enter_mealtrack()
returns jsonb
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
  perform pg_advisory_xact_lock(hashtext('mealtrack.enter'));

  select id into v_household from public.households order by created_at limit 1;
  if v_household is null then
    insert into public.households (name, timezone, created_by)
    values ('MealTrack', 'Asia/Kolkata', v_uid)
    returning id into v_household;
  end if;

  -- Every phone gets full access. A unique automatic name keeps any name rules happy.
  insert into public.household_members (household_id, user_id, role, display_name, status)
  values (v_household, v_uid, 'admin', 'Phone ' || upper(left(replace(v_uid::text, '-', ''), 8)), 'approved')
  on conflict (user_id) do update set status = 'approved', role = 'admin';

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.enter_mealtrack() from public, anon;
grant execute on function public.enter_mealtrack() to authenticated;
