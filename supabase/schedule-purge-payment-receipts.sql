-- Schedules the daily receipt purge with Supabase Cron (pg_cron + pg_net).
-- Run ONCE per project, from the SQL editor (it is not a migration because it
-- needs project-specific values and a secret that must never live in git).
--
-- Before running it:
--   1. Deploy the function:      supabase functions deploy purge-payment-receipts
--   2. Choose a long random secret and set it on the function:
--        supabase secrets set PURGE_CRON_SECRET=<random-secret>
--   3. Store the project URL and that same secret in Vault (replace the values):
--        select vault.create_secret('https://<project-ref>.supabase.co', 'purge_project_url');
--        select vault.create_secret('<random-secret>', 'purge_cron_secret');
--   4. Enable the pg_cron and pg_net extensions (Database > Extensions).

select cron.schedule(
  'purge-payment-receipts-daily',
  '15 6 * * *', -- 06:15 UTC every day (03:15 in Córdoba)
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'purge_project_url')
      || '/functions/v1/purge-payment-receipts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer '
        || (select decrypted_secret from vault.decrypted_secrets where name = 'purge_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- To inspect or remove it later:
--   select * from cron.job where jobname = 'purge-payment-receipts-daily';
--   select cron.unschedule('purge-payment-receipts-daily');
