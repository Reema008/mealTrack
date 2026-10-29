-- Schedules the daily reminder Edge Function. Requires the hosted Supabase
-- extensions pg_cron, pg_net and Vault (not run by the local PGlite tests).
--
-- The job runs every 15 minutes; the function itself decides, per household
-- timezone, whether it is 22:00–23:59 local time on Mon–Sat. This handles
-- half-hour offsets (IST is UTC+05:30) and daylight-saving transitions.
--
-- Before this works you must store two Vault secrets (see README, "Reminders"):
--   mealtrack_reminder_url  -> https://<project-ref>.supabase.co/functions/v1/send-daily-reminders
--   mealtrack_cron_secret   -> the same value as the function's CRON_SECRET

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'mealtrack-daily-reminders',
  '*/15 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'mealtrack_reminder_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'mealtrack_cron_secret')
      ),
      body := '{"source":"cron"}'::jsonb,
      timeout_milliseconds := 25000
    );
  $job$
);
