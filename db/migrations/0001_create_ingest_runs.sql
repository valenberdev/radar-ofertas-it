create table ingest_runs (
  id bigint generated always as identity primary key,
  source text not null,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  fetched_count integer not null default 0 check (fetched_count >= 0),
  inserted_count integer not null default 0 check (inserted_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  error_message text,
  constraint ingest_runs_finished_matches_status
    check ((status = 'running') = (finished_at is null))
);