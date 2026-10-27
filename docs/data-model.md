# Data model

Postgres 18. Schema changes go through numbered SQL files in `db/migrations`, applied by `npm run db:migrate` (see ADR-0004).

## Implemented

### `offers` (migration 0002)

One row per job posting, identified by `(source, source_id)`. Ingestion upserts on that key, so running it twice never duplicates a row.

| Column                        | Notes                                                                                                                                                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                          | Surrogate key, used by every table that refers to an offer.                                                                                                                                                                              |
| `source`, `source_id`         | Where the offer came from and its id there. Unique together.                                                                                                                                                                             |
| `title`, `url`, `description` | Required. `title` cannot be blank.                                                                                                                                                                                                       |
| `company`, `posted_at`        | Nullable: free-text sources do not always provide them.                                                                                                                                                                                  |
| `raw`                         | Original payload from the source. Kept so phase 4 can extract region, stack and seniority without refetching offers that may have left the source. Its size is measured after the first real ingestion and dropped if it costs too much. |
| `first_ingested_at`           | First time an ingestion saw the offer. Drives "new since your last visit".                                                                                                                                                               |
| `last_ingested_at`            | Last time an ingestion saw it. Drives retention.                                                                                                                                                                                         |

Normalized fields (region, stack, seniority) and deduplication columns are deliberately absent. They are added by phase 4 with their own migration, once the sources are known.

### `ingest_runs` (migration 0001)

One row per ingestion run and source: `status` (`running`, `succeeded`, `failed`), start and end time, counts of fetched, inserted and updated offers, and an error message for failures. A run that is `running` has no end time, and any other status requires one; the database enforces it.

## Planned

These tables exist in the design but have no migration yet. Each is created by the phase that first uses it, because their columns depend on decisions that phase makes.

| Table            | Purpose                                                                                                                    | Created in | Open question                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------- |
| `profiles`       | Structured profile extracted from the pasted text, keyed by the hash of the normalized text. The raw text is never stored. | 5          | Retention of profiles nobody asks for again.                    |
| `scores`         | Cached score and bilingual justification per profile, offer, prompt version and model.                                     | 5          | Retention: it grows with distinct profiles times scored offers. |
| `usage_counters` | Daily counter per bucket (demo, owner) for the Gemini quota, incremented atomically.                                       | 5          | Exact daily cap, below Google's real limit.                     |
| `owner_profile`  | At most one row: the owner's profile and the time of the last visit.                                                       | 7          | Enforcing the single row.                                       |
| `rate_limits`    | Per-IP counters with a salted hash of the address.                                                                         | 9          | Window size and limit.                                          |

## Storage budget and retention (open)

Neon Free allows 1 GB per project, and writes fail once it is full. Nothing is billed and nothing is deleted when that happens, but the app would stop ingesting and scoring.

Proposed policy, to be confirmed with measurements:

- Delete offers whose `last_ingested_at` is older than a retention window. An offer that no ingestion has seen for that long has most likely been taken down by its source.
- Keep the offers table under roughly half of the budget, so the cache tables of phase 5 have room.
- Set the window from the measured size per offer and the real daily volume, not from a guess.

Measure after the first real ingestion (phase 3):

```sql
select
  count(*) as offers,
  pg_size_pretty(pg_total_relation_size('offers')) as total,
  pg_size_pretty(pg_total_relation_size('offers') / nullif(count(*), 0)) as per_offer
from offers;

select
  avg(pg_column_size(raw))::int as raw_bytes,
  avg(pg_column_size(description))::int as description_bytes
from offers;
```

If `raw` is a large share of the total, the decision is whether to keep it for every offer or only the fields phase 4 needs.
