-- Subscription history: one row per renewal, with the amount paid.
-- Each subscription covers 4 weeks (28 days) from its start date, or until
-- the next renewal if that comes sooner.

create table if not exists public.subscriptions (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  start_date    date not null,
  amount        numeric(10, 2) check (amount is null or amount >= 0),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint subscriptions_household_start_key unique (household_id, start_date)
);

comment on table public.subscriptions is
  'Subscription renewals. Each covers 28 days from start_date (or until the next renewal).';

alter table public.subscriptions enable row level security;

revoke all on public.subscriptions from anon, authenticated;
grant select, insert, update (start_date, amount), delete on public.subscriptions to authenticated;

drop policy if exists "members read subscriptions" on public.subscriptions;
create policy "members read subscriptions"
  on public.subscriptions for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists "members add subscriptions" on public.subscriptions;
create policy "members add subscriptions"
  on public.subscriptions for insert to authenticated
  with check (public.is_household_member(household_id));

drop policy if exists "members change subscriptions" on public.subscriptions;
create policy "members change subscriptions"
  on public.subscriptions for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists "members remove subscriptions" on public.subscriptions;
create policy "members remove subscriptions"
  on public.subscriptions for delete to authenticated
  using (public.is_household_member(household_id));

-- Stamp who recorded it.
create or replace function public.subscriptions_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by := coalesce(auth.uid(), new.created_by);
  return new;
end;
$$;

drop trigger if exists subscriptions_stamp on public.subscriptions;
create trigger subscriptions_stamp
  before insert on public.subscriptions
  for each row execute function public.subscriptions_stamp();

-- Carry over a renewal date that was already set.
insert into public.subscriptions (household_id, start_date)
select id, subscription_start from public.households where subscription_start is not null
on conflict (household_id, start_date) do nothing;
