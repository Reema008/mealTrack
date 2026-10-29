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
