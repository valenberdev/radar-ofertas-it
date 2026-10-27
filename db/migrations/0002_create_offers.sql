create table offers (
  id bigint generated always as identity primary key,
  source text not null,
  source_id text not null,
  title text not null check (btrim(title) <> ''),
  company text,
  url text not null,
  description text not null,
  posted_at timestamptz,
  raw jsonb not null,
  first_ingested_at timestamptz not null default now(),
  last_ingested_at timestamptz not null default now(),
  constraint offers_source_source_id_key unique (source, source_id)
);