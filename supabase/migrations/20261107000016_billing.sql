-- Monthly billing: subscription prices, the start day of each monthly
-- subscription, and which extra curry (chicken or egg) each non-veg meal had.
--
-- Prices are editable by admins and used to work out the next subscription
-- amount: monthly amount − missed meals − missed extra curries.

alter table public.households
  add column if not exists billing_day int not null default 1,
  add column if not exists monthly_amount numeric(10, 2) not null default 6600,
  add column if not exists veg_meal_price numeric(10, 2) not null default 90,
  add column if not exists nonveg_meal_price numeric(10, 2) not null default 150,
  add column if not exists chicken_curry_price numeric(10, 2) not null default 70,
  add column if not exists egg_curry_price numeric(10, 2) not null default 30;

alter table public.households drop constraint if exists households_billing_check;
alter table public.households add constraint households_billing_check check (
  billing_day between 1 and 28
  and monthly_amount >= 0 and veg_meal_price >= 0 and nonveg_meal_price >= 0
  and chicken_curry_price >= 0 and egg_curry_price >= 0
);

grant select (billing_day, monthly_amount, veg_meal_price, nonveg_meal_price, chicken_curry_price, egg_curry_price)
  on public.households to authenticated;
grant update (billing_day, monthly_amount, veg_meal_price, nonveg_meal_price, chicken_curry_price, egg_curry_price)
  on public.households to authenticated;

-- Which extra curry a delivered non-veg meal had (or was missing). Null on
-- older rows means chicken, the usual curry.
alter table public.meal_overrides
  add column if not exists extra_curry_type text;

alter table public.meal_overrides drop constraint if exists meal_overrides_curry_type;
alter table public.meal_overrides add constraint meal_overrides_curry_type check (
  extra_curry_type is null
  or (
    extra_curry_type in ('chicken', 'egg')
    and extract(isodow from meal_date) in (2, 3, 5)
    and delivery_status = 'delivered'
  )
);

-- ---------------------------------------------------------------------------
-- save_meal_v2: save_meal plus the extra curry type. The standard default for
-- a non-veg meal is: delivered, chicken, chicken curry received.
-- ---------------------------------------------------------------------------
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

    insert into public.meal_overrides (household_id, meal_date, meal_period, delivery_status, main_dish, extra_curry_received, extra_curry_type)
    values (v_household, p_date, p_period, p_delivery_status, p_main_dish, p_extra_curry, p_extra_curry_type)
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
         is not distinct from p_extra_curry_type then
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
         extra_curry_type = p_extra_curry_type
   where id = v_row.id
  returning * into v_row;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row));
end;
$$;

revoke execute on function public.save_meal_v2(date, text, text, text, boolean, text, integer, boolean) from public, anon;
grant execute on function public.save_meal_v2(date, text, text, text, boolean, text, integer, boolean) to authenticated;

-- Phones still running the previous app version call save_meal: keep the
-- curry type already saved on the meal so their edits don't reset it.
create or replace function public.save_meal(
  p_date date,
  p_period text,
  p_delivery_status text,
  p_main_dish text,
  p_extra_curry boolean,
  p_expected_version integer,
  p_keep boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_type text;
begin
  select o.extra_curry_type into v_type
    from public.meal_overrides o
   where o.household_id = public.my_household_id() and o.meal_date = p_date and o.meal_period = p_period;
  return public.save_meal_v2(p_date, p_period, p_delivery_status, p_main_dish, p_extra_curry, v_type, p_expected_version, p_keep);
end;
$$;
