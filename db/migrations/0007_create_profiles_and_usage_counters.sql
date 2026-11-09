create table profiles (
  text_hash text not null check (text_hash ~ '^[0-9a-f]{64}$'),
  extractor_id text not null check (btrim(extractor_id) <> ''),
  profile jsonb not null check (jsonb_typeof(profile) = 'object'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  primary key (text_hash, extractor_id)
);

create table usage_counters (
  day date not null,
  resource text not null check (btrim(resource) <> ''),
  used integer not null check (used >= 0),
  primary key (day, resource)
);