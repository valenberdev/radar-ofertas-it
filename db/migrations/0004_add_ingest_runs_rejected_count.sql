alter table ingest_runs
  add column rejected_count integer not null default 0 check (rejected_count >= 0);