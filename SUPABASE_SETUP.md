# Supabase job-feed setup

The site now has separate Search Jobs and My Profile pages, broad job-title/location search, optional-CV application drafts, and local application history. Profile details are stored in browser local storage; CV files, application records, and cached listings use IndexedDB on the device. CVs and application details are not sent to Supabase. Browser storage can still be removed by the user or browser, so it is not a guaranteed backup or cross-device account. The profile page can request persistent browser storage and delete local data.

OTP verification and email-alert previews remain simulated; this setup does not send candidate emails or SMS. Saving an application stores a local record only and does not notify the employer. If a listing has an employer application link, the user must continue there to submit.

The importer runs once per day at **12:00 AM IST** (18:30 UTC). It imports only feeds you are authorized to use. It cannot crawl every job site, and no feed is configured in this repository.

The Search Jobs page fetches active listings from Supabase when opened, offers a manual refresh, and checks again every five minutes while the page is open. My Profile has a refresh control for recommendations. Live data requires a Supabase URL, publishable key, and at least one enabled/imported source; the placeholders in `assets/supabase-config.js` are intentionally blank.

## Run the pages locally

Open the repository in VS Code and start a local static web server (for example, the Live Server extension). Open the served `index.html` page rather than using `file://` so both pages share the same browser origin and on-device storage. A small multi-industry sample catalog remains visible until a Supabase project and authorized job feeds are configured.

## Configure the Supabase project

1. Install the Supabase CLI, create or select a project, then link this folder:

   ```powershell
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   ```

2. Before applying the schedule migration, add these named secrets in Supabase Vault:

   - `project_url`: `https://YOUR_PROJECT_REF.supabase.co`
   - `project_secret_key`: the project's default `sb_secret_...` key

   Do not put secret keys in this repository or in `assets/supabase-config.js`. Supabase `pg_net` temporarily queues request headers; restrict database access to trusted administrators.

3. Apply the database migrations:

   ```powershell
   supabase db push
   ```

   The first migration creates the job, source, and import-run tables with public read-only access to active job listings. The second schedules `import-jobs` at 18:30 UTC daily. Confirm the database's `cron.timezone` is UTC if you need the run to be exactly midnight IST.

4. Configure Edge Function secrets in the Supabase Dashboard. Set `JOB_FEED_HOSTS` to a comma-separated allowlist of exact feed hostnames, for example `api.authorized-provider.example,careers.your-company.example`. Do not include URL paths or wildcard domains. If a partner feed requires an API token, add that token as a separate Edge Function secret; never store the token in the source row or repository.

5. Add each authorized HTTPS JSON feed to `public.job_sources` using the SQL Editor:

   ```sql
   insert into public.job_sources (name, feed_url)
   values ('Provider name', 'https://api.authorized-provider.example/jobs');
   ```

   For a token-protected feed, store the complete header value (for example `Bearer …`) as an Edge Function secret and reference its *name* on the source row:

   ```sql
   insert into public.job_sources (name, feed_url, auth_header_name, auth_secret_name)
   values ('Partner feed', 'https://api.authorized-provider.example/jobs', 'Authorization', 'PARTNER_FEED_AUTHORIZATION');
   ```

   The feed must return JSON in this shape:

   ```json
   {
     "jobs": [
       {
         "id": "provider-job-id",
         "title": "QA Engineer",
         "company": "Example employer",
         "city": "Dubai",
         "job_type": "Automation",
         "experience_min": 2,
         "experience_max": 5,
         "salary": "AED 10,000–15,000",
         "posted_at": "2026-11-25T00:00:00Z",
         "skills": ["selenium", "java"],
         "description": "Role description",
         "source_url": "https://api.authorized-provider.example/jobs/provider-job-id",
         "apply_url": "https://careers.example/job/provider-job-id"
       }
     ]
   }
   ```

   Feeds with a different schema need a provider-specific adapter before they can be imported. The function only fetches HTTPS URLs whose exact hostname is in `JOB_FEED_HOSTS`, rejects redirects, limits each response to 2 MB and 1,000 jobs, and upserts by source and external job ID.

6. Deploy the importer:

   ```powershell
   supabase functions deploy import-jobs
   ```

7. Add the project URL and **publishable** key (not the secret key) to `assets/supabase-config.js` so the browser can read active jobs. Active listings are cached in IndexedDB on the device. If a live query fails, the site shows an error and uses cached listings where available, then sample listings.

## Check the schedule and import results

```sql
select jobname, schedule, active
from cron.job
where jobname = 'testora-midnight-ist-job-import';

select source_id, started_at, completed_at, status, imported_count, rejected_count, error_message
from public.job_import_runs
order by completed_at desc
limit 50;
```

The scheduled function requires at least one enabled source. Failed or partially invalid feeds are recorded per source. Job coverage depends on the authorized feeds configured; the importer cannot fetch jobs from every site on the internet. Email job alerts, real candidate OTP verification, and account-backed profile storage require additional Supabase Auth and email/SMS-provider configuration; they are not enabled by this importer.
