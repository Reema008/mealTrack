-- MealTrack core schema: households, membership, invites and sparse meal overrides.
-- Default meal states are NOT stored; only explicit user changes live in meal_overrides.

-- ---------------------------------------------------------------------------
-- Households
-- ---------------------------------------------------------------------------
create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  timezone    text not null default 'Asia/Kolkata',
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

comment on column public.households.timezone is
  'IANA timezone used for "today", reports and the 10 PM reminder.';

create function public.validate_household_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Raises invalid_parameter_value for unknown zone names.
  perform now() at time zone new.timezone;
  return new;
exception when others then
  raise exception 'Unknown timezone: %', new.timezone using errcode = '22023';
end;
$$;

create trigger households_validate_timezone
  before insert or update of timezone on public.households
  for each row execute function public.validate_household_timezone();

-- ---------------------------------------------------------------------------
-- Members (one household per user)
-- ---------------------------------------------------------------------------
create table public.household_members (
  household_id  uuid not null references public.households (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  role          text not null default 'member' check (role in ('admin', 'member')),
  display_name  text not null check (char_length(btrim(display_name)) between 1 and 60),
  joined_at     timestamptz not null default now(),
  primary key (household_id, user_id),
  constraint household_members_one_household unique (user_id)
);

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------
create table public.household_invites (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  email         text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role          text not null default 'member' check (role in ('admin', 'member')),
  token         text not null unique
                  default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  invited_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '7 days',
  accepted_at   timestamptz,
  accepted_by   uuid references auth.users (id) on delete set null,
  revoked_at    timestamptz
);

create index household_invites_household_idx on public.household_invites (household_id);

-- ---------------------------------------------------------------------------
-- Meal overrides (sparse; one row per explicitly changed meal)
-- ---------------------------------------------------------------------------
create table public.meal_overrides (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid not null references public.households (id) on delete cascade,
  meal_date             date not null,
  meal_period           text not null check (meal_period in ('lunch', 'dinner')),
  delivery_status       text not null check (delivery_status in ('delivered', 'not_received')),
  main_dish             text check (main_dish in ('egg', 'chicken')),
  extra_curry_received  boolean,
  created_by            uuid references auth.users (id) on delete set null,
  updated_by            uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  version               integer not null default 1,

  constraint meal_overrides_household_date_period_key unique (household_id, meal_date, meal_period),
  -- Sunday (ISO weekday 7) has no scheduled meals.
  constraint meal_overrides_not_sunday check (extract(isodow from meal_date) <> 7),
  -- Non-veg days (Tue=2, Wed=3, Fri=5) need both non-veg fields; veg days must not have them.
  constraint meal_overrides_shape check (
    case
      when extract(isodow from meal_date) in (2, 3, 5)
        then main_dish is not null and extra_curry_received is not null
      else main_dish is null and extra_curry_received is null
    end
  )
);

comment on table public.meal_overrides is
  'Explicit changes only. A meal with no row uses the schedule default (delivered; chicken + extra curry on non-veg days).';

-- Stamp authorship/version server-side; identity columns cannot be changed by updates.
create function public.meal_overrides_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
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

create trigger meal_overrides_stamp
  before insert or update on public.meal_overrides
  for each row execute function public.meal_overrides_stamp();
