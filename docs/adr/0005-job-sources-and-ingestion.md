# ADR-0005: Job sources and daily ingestion

Status: Accepted (2026-11-02)

## Context

The app ranks remote IT offers against a candidate profile. It needs a steady supply of offers under hard constraints: no cost, no payment card, no scraping of sites whose terms forbid it, and a run time that fits Vercel Hobby (one cron run per day per job, a 300 second limit per function, delivery that is best effort and can be missed or duplicated).

The design also asks for two different kinds of source: one structured, one free text.

## Decision

### Sources

- **Himalayas** (public jobs API). Structured, remote by nature. The feed is newest first, 20 jobs per page, with no server-side filters, so filtering happens on our side: only the `Developer` and `Data Science` categories are kept. Requests are spaced at one per second. An API key is optional and, when present, is sent as a bearer token.
- **Hacker News** ("Ask HN: Who is hiring?" threads, through the public Firebase API). Free text. The two most recent threads of the `whoishiring` account are read, and every top-level comment is a candidate offer. A comment is kept only if its text mentions "remote" (case-insensitive). Deleted, dead and blank comments are skipped.

Both sources identify themselves with a descriptive `User-Agent` that links to the repository.

Conditions that come with using Himalayas, to be honored by later phases:

- Show the source visibly ("Fuente: Himalayas") and keep the original application link unchanged (phase 8).
- Do not send Himalayas job text to Gemini until the current terms have been checked and, if they require it, written permission has been obtained (gate for phase 5).
- Re-read the terms before launch (phase 10).

### Scheduling

One cron entry per source, each pointing to its own route (`/api/cron/ingest/<source>`), at different hours. A failure or a slow run in one source cannot consume the other's time budget. Each invocation is protected by `CRON_SECRET`; without the secret configured, every request is refused.

Ingestion never calls an LLM. It is deterministic and costs nothing.

### Incremental reads and the time limit

- Himalayas is incremental: a run reads from the newest page backwards and stops at the first page that contains only offers older than `since`. `since` is the start time of the last **succeeded** run minus two hours. The overlap absorbs the up-to-one-hour jitter that Hobby adds to cron timing. The first run has no `since` and reads everything.
- Hacker News is not incremental. Its threads are not chronological and comments can be edited, so each run reads both threads in full and the upsert refreshes what changed.
- Every scheduled run has a deadline of 270 seconds, 30 below the platform limit. Reaching it marks the run `failed`, keeps what was already saved and does not move `since`.
- A scheduled run's request ceiling is deliberately very high (2000). The sources end normally when the ceiling is reached, and the run would then be recorded as `succeeded` and advance `since`, leaving a silent gap. The deadline is the real limiter.
- A backfill (a long manual first load) has no deadline and a low request cap, and is refused outside local development.

### Data hygiene

- Offers are upserted by `(source, source_id)`. Running an ingestion twice never duplicates a row, which also makes duplicated or retried cron deliveries harmless.
- Text is sanitized before storing: NUL characters and lone surrogates are removed or replaced, because Postgres `jsonb` rejects them.
- Within one batch, duplicate keys are collapsed (last one wins), because a single `INSERT ... ON CONFLICT` cannot touch the same row twice.
- Items that fail validation are counted as `rejected` and logged by reason, never by content.
- Format-change guards: a run aborts if at least 20 items were attempted and more than a quarter were rejected, and the Hacker News source fails if it read at least 50 comments and parsed none. A silent change in a source's format should fail loudly, not produce an empty database.

### Retention

Each offer carries `expires_at`: the source's own expiry date for Himalayas, and the posting date plus 45 days for Hacker News, which publishes none (a thread lives about a month; the margin avoids deleting an offer that is still listed). At the end of every run, successful or not, offers with `expires_at` in the past are deleted. An offer without `expires_at` is kept.

### Reporting

A run that ends `failed` answers HTTP 500, so Vercel shows the invocation as failed instead of green. Each run logs one line with its counts. A failed purge does not fail the run.

## Alternatives considered

- **Scraping job boards (LinkedIn, Indeed and similar).** Rejected: forbidden by their terms and brittle.
- **An LLM during ingestion.** Rejected: it would spend the Gemini quota on offers nobody will view. Scoring happens later, only for the top candidates.
- **A lock to prevent overlapping runs.** Rejected: Neon is reached through a connection pooler, where session advisory locks are not reliable. Idempotent upserts make overlap harmless, and a distributed lock would add a new service.
- **Cron more often than daily.** Not available on Hobby, and an upgrade is outside the budget.
- **GitHub Actions on a schedule.** Kept as plan B if the real volume of Himalayas does not fit in 270 seconds. It adds a second place to operate, so it is only worth it if the numbers demand it.

## Consequences

- Ingestion is cheap, idempotent and testable end to end against a real Postgres.
- The first deployment needs a backfill against the production database from a developer machine. A scheduled run with no history cannot finish a full read within 270 seconds, so it would end `failed` every day and never record the `succeeded` run that sets `since`.
- Known limitations, accepted for now:
  - The Hacker News "remote" filter looks at the whole text, so an on-site offer that says "no remote work" is kept. Region and work-mode parsing belong to phase 4.
  - A run killed by the platform before it can record its end stays `running` forever. It does not affect `since`, which only looks at `succeeded` runs.
  - One offer that always breaks the upsert would fail its whole batch every day. There is no per-row retry.
  - Offers without `expires_at` are never deleted. How many there are will be measured.
  - Hacker News comments include usernames and sometimes recruiter emails inside `raw` and the text. Privacy treatment is a phase 9 task.
- Not yet measured: the expected volume of about 4,000 new Himalayas jobs per day (roughly 200 pages, about 200 of the 270 available seconds) is an estimate. The first real runs decide whether the margin is enough or plan B is needed.
