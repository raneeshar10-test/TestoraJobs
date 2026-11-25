-- Supabase Cron uses UTC by default. 18:30 UTC is 00:00 the following day in IST.
create extension if not exists supabase_vault with schema vault;

select cron.unschedule(jobid)
from cron.job
where jobname = 'testora-midnight-ist-job-import';

select cron.schedule(
  'testora-midnight-ist-job-import',
  '30 18 * * *',
  $job$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'project_url'
      ) || '/functions/v1/import-jobs',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'project_secret_key'
        )
      ),
      body := jsonb_build_object('trigger', 'scheduled')
    );
  $job$
);
