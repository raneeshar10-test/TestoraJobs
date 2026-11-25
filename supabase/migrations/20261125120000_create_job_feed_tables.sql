create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table if not exists public.job_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  feed_url text not null check (feed_url ~ '^https://'),
  auth_header_name text,
  auth_secret_name text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  check ((auth_header_name is null) = (auth_secret_name is null))
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.job_sources(id) on delete cascade,
  external_id text not null,
  title text not null,
  company text not null,
  city text not null,
  job_type text not null default 'Other',
  experience_min numeric(4,1) not null default 0,
  experience_max numeric(4,1) not null default 0,
  salary text,
  posted_at timestamptz not null default now(),
  skills text[] not null default '{}',
  description text not null default '',
  source_url text,
  apply_url text,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, external_id),
  check (experience_min >= 0 and experience_max >= experience_min)
);

create table if not exists public.job_import_runs (
  id bigint generated always as identity primary key,
  source_id uuid not null references public.job_sources(id) on delete cascade,
  started_at timestamptz not null,
  completed_at timestamptz not null default now(),
  status text not null check (status in ('succeeded', 'partial', 'failed')),
  imported_count integer not null default 0 check (imported_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  error_message text
);

create index if not exists jobs_active_posted_idx
  on public.jobs (posted_at desc) where is_active;
create index if not exists jobs_active_city_idx
  on public.jobs (city) where is_active;

alter table public.job_sources enable row level security;
alter table public.jobs enable row level security;
alter table public.job_import_runs enable row level security;

drop policy if exists "Anyone can read active jobs" on public.jobs;
create policy "Anyone can read active jobs"
  on public.jobs for select
  to anon, authenticated
  using (is_active);

revoke all on public.job_sources, public.job_import_runs from anon, authenticated;
revoke insert, update, delete on public.jobs from anon, authenticated;
grant select on public.jobs to anon, authenticated;
grant all on public.job_sources, public.jobs, public.job_import_runs to service_role;
grant usage, select on sequence public.job_import_runs_id_seq to service_role;
