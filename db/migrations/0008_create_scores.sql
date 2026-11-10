create table scores (
  profile_hash text not null check (profile_hash ~ '^[0-9a-f]{64}$'),
  offer_hash text not null check (offer_hash ~ '^[0-9a-f]{64}$'),
  scorer_id text not null check (btrim(scorer_id) <> ''),
  score smallint not null check (score between 0 and 100),
  reason_es text not null check (btrim(reason_es) <> ''),
  reason_en text not null check (btrim(reason_en) <> ''),
  created_at timestamptz not null default now(),
  primary key (profile_hash, offer_hash, scorer_id)
);