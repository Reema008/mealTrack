-- Reminder preferences, Web Push subscriptions and the delivery log.
-- Push private keys never live in the database; they are Edge Function secrets.

create table public.notification_preferences (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  household_id       uuid not null references public.households (id) on delete cascade,
  reminders_enabled  boolean not null default false,
  updated_at         timestamptz not null default now()
);

create table public.push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  household_id     uuid not null references public.households (id) on delete cascade,
  endpoint         text not null unique check (endpoint ~ '^https://'),
  p256dh           text not null,
  auth             text not null,
  user_agent       text,
  created_at       timestamptz not null default now(),
  last_success_at  timestamptz,
  disabled_at      timestamptz
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id) where disabled_at is null;

create table public.notification_log (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households (id) on delete cascade,
  user_id          uuid references auth.users (id) on delete cascade,
  subscription_id  uuid references public.push_subscriptions (id) on delete set null,
  kind             text not null default 'daily' check (kind in ('daily', 'test')),
  reminder_date    date not null,
  status           text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'gone')),
  attempts         integer not null default 1,
  http_status      integer,
  error            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- One daily reminder per device per household-local date.
create unique index notification_log_daily_once
  on public.notification_log (subscription_id, reminder_date)
  where kind = 'daily';

create index notification_log_household_idx on public.notification_log (household_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: users manage only their own preferences/subscriptions. The log is
-- written exclusively by the Edge Function using the service role.
-- ---------------------------------------------------------------------------
revoke all on public.notification_preferences, public.push_subscriptions, public.notification_log
  from anon, authenticated;

grant select, insert, update (reminders_enabled, updated_at) on public.notification_preferences to authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant select on public.notification_log to authenticated;

alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_log enable row level security;

create policy "users read own preferences"
  on public.notification_preferences for select to authenticated
  using (user_id = auth.uid());

create policy "users create own preferences"
  on public.notification_preferences for insert to authenticated
  with check (user_id = auth.uid() and public.is_household_member(household_id));

create policy "users change own preferences"
  on public.notification_preferences for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_household_member(household_id));

create policy "users read own subscriptions"
  on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());

create policy "users remove own subscriptions"
  on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());

create policy "users read own notification log"
  on public.notification_log for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- register_push_subscription: a browser endpoint identifies one device, so it
-- is (re)assigned to whoever subscribed on it most recently. This keeps one
-- row per device and prevents duplicate notifications to a shared phone.
-- ---------------------------------------------------------------------------
create function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_household uuid := public.my_household_id();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if v_household is null then
    raise exception 'You are not a member of a household' using errcode = '42501';
  end if;

  insert into public.push_subscriptions (user_id, household_id, endpoint, p256dh, auth, user_agent)
  values (v_uid, v_household, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        household_id = excluded.household_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        disabled_at = null
  returning id into v_id;

  insert into public.notification_preferences (user_id, household_id, reminders_enabled)
  values (v_uid, v_household, true)
  on conflict (user_id) do update set reminders_enabled = true, household_id = excluded.household_id, updated_at = now();

  return v_id;
end;
$$;

revoke execute on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- claim_daily_reminder (service role only): atomically reserves the right to
-- send one device its reminder for a local date. Returns the log id when the
-- caller should send, or null when it was already sent (or is in flight).
-- A failed attempt may be retried on a later cron tick, up to 3 attempts.
-- ---------------------------------------------------------------------------
create function public.claim_daily_reminder(
  p_household_id uuid,
  p_user_id uuid,
  p_subscription_id uuid,
  p_reminder_date date
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  insert into public.notification_log (household_id, user_id, subscription_id, kind, reminder_date, status)
  values (p_household_id, p_user_id, p_subscription_id, 'daily', p_reminder_date, 'pending')
  on conflict (subscription_id, reminder_date) where kind = 'daily'
  do update set status = 'pending', attempts = public.notification_log.attempts + 1, error = null, updated_at = now()
     where public.notification_log.status = 'failed' and public.notification_log.attempts < 3
  returning id;
$$;

revoke execute on function public.claim_daily_reminder(uuid, uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.claim_daily_reminder(uuid, uuid, uuid, date) to service_role;

-- Realtime: broadcast meal changes (RLS still applies to subscribers).
alter publication supabase_realtime add table public.meal_overrides;
