-- Subscription renewal date. Each subscription period lasts 4 weeks
-- (28 days) from this date; the next period starts automatically.
alter table public.households add column if not exists subscription_start date;

comment on column public.households.subscription_start is
  'Renewal date of the food subscription. Periods are 28 days: [start + 28n, start + 28n + 27].';

grant select (subscription_start) on public.households to authenticated;
grant update (subscription_start) on public.households to authenticated;
