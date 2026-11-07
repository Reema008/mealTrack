-- A meal that did not come is "cancelled", either by the sender (the food
-- service; the default) or by you (the family). Null on older rows = sender.

alter table public.meal_overrides
  add column if not exists cancelled_by text;

alter table public.meal_overrides drop constraint if exists meal_overrides_cancelled_by;
alter table public.meal_overrides add constraint meal_overrides_cancelled_by check (
  cancelled_by is null or (cancelled_by in ('sender', 'you') and delivery_status = 'not_received')
);

-- ---------------------------------------------------------------------------
-- save_meal_v3: save_meal_v2 plus who cancelled the meal.
-- ---------------------------------------------------------------------------
create or replace function public.save_meal_v3(
  p_date date,
  p_period text,
  p_delivery_status text,
  p_main_dish text,
  p_extra_curry boolean,
  p_extra_curry_type text,
  p_cancelled_by text,
  p_expected_version integer,
  p_keep boolean default false
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

  if p_delivery_status = 'not_received' then
    p_cancelled_by := coalesce(p_cancelled_by, 'sender');
    if p_cancelled_by not in ('sender', 'you') then
      raise exception 'A meal is cancelled by the sender or by you' using errcode = '22023';
    end if;
  else
    p_cancelled_by := null;
  end if;

  if v_nonveg and p_delivery_status = 'delivered' then
    if p_main_dish is null or p_extra_curry is null then
      raise exception 'Main dish and extra curry status are required for a delivered non-veg meal' using errcode = '22023';
    end if;
    p_extra_curry_type := coalesce(p_extra_curry_type, 'chicken');
    if p_extra_curry_type not in ('chicken', 'egg') then
      raise exception 'Extra curry must be chicken or egg' using errcode = '22023';
    end if;
  else
    p_main_dish := null;
    p_extra_curry := null;
    p_extra_curry_type := null;
  end if;

  v_is_default := not coalesce(p_keep, false)
                  and p_delivery_status = 'delivered'
                  and (not v_nonveg or (p_main_dish = 'chicken' and p_extra_curry and p_extra_curry_type = 'chicken'));

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

    insert into public.meal_overrides (household_id, meal_date, meal_period, delivery_status, main_dish, extra_curry_received, extra_curry_type, cancelled_by)
    values (v_household, p_date, p_period, p_delivery_status, p_main_dish, p_extra_curry, p_extra_curry_type, p_cancelled_by)
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
     and v_row.extra_curry_received is not distinct from p_extra_curry
     and (case when v_row.extra_curry_received is null then null else coalesce(v_row.extra_curry_type, 'chicken') end)
         is not distinct from p_extra_curry_type
     and (case when v_row.delivery_status = 'not_received' then coalesce(v_row.cancelled_by, 'sender') end)
         is not distinct from p_cancelled_by then
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
         extra_curry_received = p_extra_curry,
         extra_curry_type = p_extra_curry_type,
         cancelled_by = p_cancelled_by
   where id = v_row.id
  returning * into v_row;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row));
end;
$$;

revoke execute on function public.save_meal_v3(date, text, text, text, boolean, text, text, integer, boolean) from public, anon;
grant execute on function public.save_meal_v3(date, text, text, text, boolean, text, text, integer, boolean) to authenticated;

-- Phones still running an older app version call save_meal_v2 (or save_meal,
-- which calls v2): keep who cancelled the meal as already saved.
create or replace function public.save_meal_v2(
  p_date date,
  p_period text,
  p_delivery_status text,
  p_main_dish text,
  p_extra_curry boolean,
  p_extra_curry_type text,
  p_expected_version integer,
  p_keep boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_by text;
begin
  select o.cancelled_by into v_by
    from public.meal_overrides o
   where o.household_id = public.my_household_id() and o.meal_date = p_date and o.meal_period = p_period;
  return public.save_meal_v3(p_date, p_period, p_delivery_status, p_main_dish, p_extra_curry, p_extra_curry_type, v_by, p_expected_version, p_keep);
end;
$$;
