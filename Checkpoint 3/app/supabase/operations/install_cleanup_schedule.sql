-- Optional deployment operation, NOT a local migration and NOT run by setup.
-- Review after deployment. Configure Vault entries storage_project_url and
-- storage_scheduler_secret privately beforehand. Never put secret values here.
-- Confirm Cron uses UTC. This runs daily at 03:00, not the scan dispatcher.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('inboxtotask-storage-cleanup','0 3 * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='storage_project_url') || '/functions/v1/storage_cleanup',
    headers := jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='storage_scheduler_secret')),
    body := '{}'::jsonb
  );
$$);
