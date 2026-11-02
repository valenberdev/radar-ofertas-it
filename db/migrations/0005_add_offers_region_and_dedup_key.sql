alter table offers
  add column region_status text not null default 'unknown'
    check (region_status in ('worldwide', 'countries', 'unknown')),
  add column allowed_countries text[] not null default '{}',
  add column dedup_key text
    check (dedup_key is null or dedup_key ~ '^[0-9a-f]{64}$'),
  add constraint offers_region_matches_countries
    check ((region_status = 'countries') = (cardinality(allowed_countries) > 0));