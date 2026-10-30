# Data model

Postgres 18. Schema changes go through numbered SQL files in `db/migrations`, applied by `npm run db:migrate` (see ADR-0004).

## Implemented

### `offers` (migrations 0002 and 0003)

One row per job posting, identified by `(source, source_id)`. Ingestion upserts on that key, so running it twice never duplicates a row.

| Column                        | Notes                                                                                                                                                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                          | Surrogate key, used by every table that refers to an offer.                                                                                                                                                                              |
| `source`, `source_id`         | Where the offer came from and its id there. Unique together.                                                                                                                                                                             |
| `title`, `url`, `description` | Required. `title` cannot be blank.                                                                                                                                                                                                       |
| `company`, `posted_at`        | Nullable: free-text sources do not always provide them.                                                                                                                                                                                  |
| `expires_at`                  | Nullable. When the offer stops being valid: the expiry date the source publishes (Himalayas) or the posting date plus 45 days (Hacker News, which publishes none). Drives retention.                                                     |
| `raw`                         | Original payload from the source. Kept so phase 4 can extract region, stack and seniority without refetching offers that may have left the source. Its size is measured after the first real ingestion and dropped if it costs too much. |
| `first_ingested_at`           | First time an ingestion saw the offer. Drives "new since your last visit".                                                                                                                                                               |
| `last_ingested_at`            | Last time an ingestion updated the row. Informational only: Himalayas ingestion is incremental and does not revisit old offers, so this column does not say whether an offer is still listed.                                            |

Normalized fields (region, stack, seniority) and deduplication columns are deliberately absent. They are added by phase 4 with their own migration, once the sources are known.

### `ingest_runs` (migrations 0001 and 0004)

One row per ingestion run and source: `status` (`running`, `succeeded`, `failed`), start and end time, counts of fetched, inserted, updated and rejected offers, and an error message for failures. A rejected item is one the source returned that failed validation and was skipped. A run that is `running` has no end time, and any other status requires one; the database enforces it.

The next incremental run starts from the start time of the last `succeeded` run, minus an overlap of two hours. Failed runs never move that point, so a failure cannot leave a gap.

## Planned

These tables exist in the design but have no migration yet. Each is created by the phase that first uses it, because their columns depend on decisions that phase makes.

| Table            | Purpose                                                                                                                    | Created in | Open question                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------- |
| `profiles`       | Structured profile extracted from the pasted text, keyed by the hash of the normalized text. The raw text is never stored. | 5          | Retention of profiles nobody asks for again.                    |
| `scores`         | Cached score and bilingual justification per profile, offer, prompt version and model.                                     | 5          | Retention: it grows with distinct profiles times scored offers. |
| `usage_counters` | Daily counter per bucket (demo, owner) for the Gemini quota, incremented atomically.                                       | 5          | Exact daily cap, below Google's real limit.                     |
| `owner_profile`  | At most one row: the owner's profile and the time of the last visit.                                                       | 7          | Enforcing the single row.                                       |
| `rate_limits`    | Per-IP counters with a salted hash of the address.                                                                         | 9          | Window size and limit.                                          |

## Storage budget and retention

Neon Free allows 1 GB per project, and writes fail once it is full. Nothing is billed and nothing is deleted when that happens, but the app would stop ingesting and scoring.

Implemented policy: at the end of every ingestion run, successful or not, offers with `expires_at` in the past are deleted. An offer without `expires_at` is never deleted.

Still open, to be decided with measurements:

- How many offers arrive without `expires_at`, and whether they need a fallback rule (for example, deleting by `first_ingested_at` after a fixed number of days). Until then they accumulate.
- Keeping the offers table under roughly half of the budget, so the cache tables of phase 5 have room.
- Whether `raw` keeps the full description or only the fields phase 4 needs.

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

select
  source,
  count(*) as offers,
  count(*) filter (where expires_at is null) as without_expiry
from offers
group by source;
```

If `raw` is a large share of the total, the decision is whether to keep it for every offer or only the fields phase 4 needs.
