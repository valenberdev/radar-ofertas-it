# ADR-0006: Offer deduplication

Status: Accepted (2026-11-02), amended 2026-11-04 after implementation

## Context

The same job can reach the database more than once. Measured on 2026-11-02, after the first backfill:

| Source      | Offers | Distinct by chosen key | Hidden by dedup |
| ----------- | ------ | ---------------------- | --------------- |
| Himalayas   | 4,698  | 4,577                  | 121 (2.6%)      |
| Hacker News | 176    | 171                    | 5 (2.8%)        |

What the duplicates look like:

- Himalayas publishes the same job once per region. One company posted seven copies of a single title with identical descriptions and five different sets of allowed countries (from 7 to 56). The copies differ in location and time zone restrictions, and each has its own application link.
- Himalayas also has the same company and title with different descriptions (two other companies were checked). These are probably different roles that share a title, so a title-only key would hide offers that are not duplicates. Grouping by company and title alone would hide 202 rows instead of 121.
- On Hacker News the same header appears in the threads of two consecutive months. In at least three of the five pairs the text was edited between months.
- Every Himalayas URL is distinct, so the URL cannot be the key.
- Only 4 companies appear in both sources.

All the groups inspected were posted on 2026-11-01 between 12:00 and 13:30 UTC, during a one-off burst. The steady-state duplicate rate is not known.

Duplicates matter more than the 2.6% suggests. Among the Himalayas offers eligible for a candidate in Argentina (worldwide, or listing Argentina) the rate is 5.7%: 962 offers, 907 distinct keys, measured the same day. Duplicates in the top-K of phase 5 waste Gemini calls and show identical cards in the interface.

## Decision

### Rows are never merged

Every row stays as ingested and the upsert by `(source, source_id)` is unchanged. Deduplication is a read-time choice, not a write-time one.

Merging variants into one row was rejected. Eligibility is a location rule and a time zone rule evaluated together. A merged row would hold the union of countries from one variant and the union of time zones from another, and could admit a candidate that no variant admits. It would also lose the application link of the variant that does fit.

### Dedup key

Each offer gets a `dedup_key`: a SHA-256 hash, computed in TypeScript by a pure function with unit tests, of:

- Himalayas: source, company, title and description.
- Hacker News: source, company (empty if the header has none) and title. The title is the header line as stored, clipped to 160 characters.. The description is left out because the same header with edited text is the same offer renewed.

Company and title are trimmed, lower-cased and have whitespace runs collapsed. The description is hashed exactly as stored, after sanitization. The source is part of the hashed input, so keys never collide across sources.

The key is stored in `offers.dedup_key`. The repository computes it on every insert and update, from the sanitized offer, which is what gets stored. Rows that existed before got theirs from their stored columns, in a one-off script that was removed afterwards. The function lives in TypeScript and not in a generated SQL column, because the rules will change as more data arrives and a rule change should not require a migration.

### Reading

Consumers first filter offers row by row, keeping those that have not expired and whose region is worldwide or lists the candidate's country, and then keep one row per `dedup_key`: the newest `posted_at`, with ties broken by the highest `id`. Rows with no `posted_at` rank last. Filtering first means the representative shown is a variant that fits the candidate, with its own application link.

This rule is implemented once, in `OfferReader.listEligible`. No other code queries `offers` directly to list offers.

### Not done

There is no deduplication across sources. Four shared companies do not justify parsing the role out of a Hacker News header to compare it with a Himalayas title.

## Alternatives considered

- **Key by company and title only.** Hides 202 Himalayas rows and merges roles that only share a title.
- **Key by description only.** Ignores the title, so two roles written from the same template would be merged.
- **Merge variants into one row with the union of their restrictions.** Rejected, see above.
- **Fuzzy matching or an LLM to detect near-duplicates.** Ingestion does not call an LLM, and the measured gain would be a fraction of 2.6%.
- **Generated column in SQL.** Harder to test and to change.

## Consequences

- Migration 0005 adds `dedup_key` together with the region columns. It is nullable at first, because the key is computed in TypeScript and the rows already stored had none. Migration 0006 makes it required once every row had one.
- There is no index on `dedup_key`. The read query filters first and sorts a few thousand rows: with 30,000 synthetic rows it took about 24 ms with a sequential scan. Revisit if the table grows well beyond that or the query shows up as slow.
- Rows already stored got their key from stored data, without refetching anything.
- A code path that lists offers without the repository function will show duplicates. Keeping a single read function is what prevents that.
- Known misses: the same job with its words in a different order (for example "AWS, NodeJS - Latin America, Remote" and "Remote, Latin America") keeps two keys, and so does a Himalayas offer whose description was edited after publication.
- A Hacker News header reused with a different role is hidden. This is accepted.
- The measurements come from a day with an unusual burst. They should be repeated after a few weeks of regular ingestion before adding rules.
