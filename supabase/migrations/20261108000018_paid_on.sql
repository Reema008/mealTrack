-- The date a subscription was actually paid (separate from the month it pays for).
-- Optional. Payments recorded before this change get the 1st of their month.

alter table public.subscriptions
  add column if not exists paid_on date;

update public.subscriptions set paid_on = start_date where paid_on is null;

alter table public.subscriptions
  drop constraint if exists subscriptions_paid_on_sane;
alter table public.subscriptions
  add constraint subscriptions_paid_on_sane check (paid_on is null or paid_on >= date '2020-01-01');

comment on column public.subscriptions.paid_on is 'When the payment was made (optional).';

grant update (paid_on) on public.subscriptions to authenticated;
