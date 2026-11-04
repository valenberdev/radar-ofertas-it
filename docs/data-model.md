# Data model

Postgres 18. Schema changes go through numbered SQL files in `db/migrations`, applied by `npm run db:migrate` (see ADR-0004).

## Implemented

### `offers` (migrations 0002, 0003, 0005 and 0006)

One row per job posting, identified by `(source, source_id)`. Ingestion upserts on that key, so running it twice never duplicates a row. Rows are never merged: duplicates are hidden when reading (see "Reading eligible offers" and ADR-0006).

| Column                               | Notes                                                                                                                                                                                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                 | Surrogate key, used by every table that refers to an offer.                                                                                                                                                                                                                 |
| `source`, `source_id`                | Where the offer came from and its id there. Unique together.                                                                                                                                                                                                                |
| `title`, `url`, `description`        | Required. `title` cannot be blank.                                                                                                                                                                                                                                          |
| `company`, `posted_at`               | Nullable: free-text sources do not always provide them.                                                                                                                                                                                                                     |
| `expires_at`                         | Nullable. When the offer stops being valid: the expiry date the source publishes (Himalayas) or the posting date plus 45 days (Hacker News, which publishes none). Drives retention.                                                                                        |
| `raw`                                | Original payload from the source. Kept so region and the deduplication key can be recomputed without refetching offers that may have left the source. Whether it should keep the full description is still open (see "Storage budget and retention").                       |
| `region_status`, `allowed_countries` | Where the offer can be worked from. `region_status` is `worldwide`, `countries` or `unknown`. `allowed_countries` lists country names spelled as the Himalayas feed spells them, and is non-empty exactly when the status is `countries`. The database enforces both rules. |
| `dedup_key`                          | Required. SHA-256 of the source, the normalized company, the normalized title and, for Himalayas only, the description, as 64 lowercase hex characters (enforced by a check). Not unique: it groups rows that count as the same offer.                                      |
| `first_ingested_at`                  | First time an ingestion saw the offer. Drives "new since your last visit".                                                                                                                                                                                                  |
| `last_ingested_at`                   | Last time an ingestion updated the row. Informational only: Himalayas ingestion is incremental and does not revisit old offers, so this column does not say whether an offer is still listed.                                                                               |

Stack and seniority are not stored in this table. Phase 5 extracts them with the model and caches the result.

Rows stored before migration 0005 were filled from `raw` by a one-off script, after which migration 0006 made `dedup_key` required. From then on the repository writes region and key on every insert and update.

### Region

Computed by each source while mapping an offer, never by the database.

- Himalayas: `locationRestrictions` lists the countries. An empty list with an empty or complete timezone list (37 offsets) means worldwide. An empty list with a partial or missing timezone list is unknown.
- Hacker News: a deterministic parser reads only the first line of the comment, takes the scope next to the word "remote" ("Remote (US)", "US Remote", "Remote - US") and resolves it to countries or worldwide. It is all or nothing: if any term in the scope is not understood, the region is unknown. Time zones, hours and residency requirements are not modeled and also give unknown.

`unknown` is the safe error: an offer whose region is unknown is never offered as eligible.

Measured on 2026-11-02 over 4,874 offers:

| Source      | Worldwide | Countries | Unknown |
| ----------- | --------- | --------- | ------- |
| Himalayas   | 164       | 4,534     | 0       |
| Hacker News | 5         | 75        | 96      |

Known limitation: 96 of 176 Hacker News offers (55%) are unknown. In a hand-checked sample of 40 of them, 20 gave no usable scope (plain "Remote", only cities, on-site), 13 were restricted to places that exclude Argentina, and 7 could be eligible: one needed "any timezone" read as neutral and one needed South America (both fixed afterwards), one mixes "Worldwide" with a list of regions and stays unknown, and four depend on time zones, which the model does not cover. Only 7 Hacker News offers were eligible for Argentina, against 907 from Himalayas, so this source adds little coverage today.

### Reading eligible offers

`OfferReader.listEligible({ country, now })` applies the rule of ADR-0006 in a single query:

1. Keep offers that have not expired at `now` and whose region is worldwide or lists the country.
2. Of those, keep one row per `dedup_key`: the newest `posted_at` (undated last), and on a tie the highest `id`.
3. Return the result newest first, undated last.

Filtering comes before choosing, so the newest copy of an offer never hides an older, eligible one. There is no index: with 30,000 synthetic rows the query took about 24 ms with a sequential scan.

Measured on 2026-11-02: Himalayas 4,698 rows give 4,577 distinct keys (121 hidden, 2.6%), Hacker News 176 give 171, and among the Himalayas offers eligible for Argentina 962 give 907 (5.7%).

### `ingest_runs` (migrations 0001 and 0004)

One row per ingestion run and source: `status` (`running`, `succeeded`, `failed`), start and end time, counts of fetched, inserted, updated and rejected offers, and an error message for failures. A rejected item is one the source returned that failed validation and was skipped. A run that is `running` has no end time, and any other status requires one; the database enforces it.

The next incremental run starts from the start time of the last `succeeded` run, minus an overlap of two hours. Failed runs never move that point, so a failure cannot leave a gap. The flip side is that after several failed days the window grows until a run no longer fits in the 270 second deadline, ends as `failed` and the point never moves. The way out is a manual backfill from a developer machine.

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

Measured on 2026-11-04: 5,703 offers take 49 MB in the table (about 8.6 KB each) and the database is 57 MB. Himalayas adds about 400 offers a day and expiry dates reach about 68 days ahead, so the steady state is roughly 27,000 rows and 230 MB, close to a quarter of the budget. That is a linear estimate, not a measurement.

Still open:

- No offer lacks `expires_at` so far (0 of 5,703), so no fallback rule is needed yet.
- Offers whose vacancy closed before `expires_at` stay stored, because incremental ingestion never revisits them. Before the interface (phase 8), check what share of offers older than 30 days no longer answer at their link.
- Keeping the offers table under roughly half of the budget, so the cache tables of phase 5 have room.
- Whether `raw` keeps the full description or only the fields needed to recompute region and key. The description is stored twice today.

Queries to repeat the size measurement:

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
