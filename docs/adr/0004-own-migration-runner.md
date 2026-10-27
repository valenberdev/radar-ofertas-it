# ADR 0004: Own SQL migration runner

## Status

Accepted

## Context

The project uses plain SQL through `pg`, with no ORM, so schema changes need a tool of their own. Requirements:

- Versioned, reviewable changes that apply in the same order everywhere (local Docker, CI, Neon).
- Safe against two runs at once and against history being rewritten after a migration was applied.
- No new runtime dependency unless it earns its place.

Neon sits behind PgBouncer in transaction mode when the pooled URL is used. Session-level features such as advisory locks are not reliable there, so migrations must use the direct URL.

## Decision

A small runner in `scripts/migrate`, about 200 lines plus tests, instead of a migration library.

- **Files.** `db/migrations/NNNN_snake_case_name.sql`. Four digits, consecutive from 0001, no gaps or duplicates. Anything in the folder that does not match the pattern is an error, never silently ignored. Migrations only move forward; a mistake is corrected by a new migration.
- **Tracking.** A `schema_migrations` table stores version, name, SHA-256 checksum and timestamp. The checksum ignores CRLF versus LF and a leading BOM, so a Windows checkout and the Linux CI hash the same file identically.
- **Safety.** Before applying anything the runner compares history with the folder and stops if an applied migration was edited, renamed, deleted, or if the applied versions skip a number.
- **Atomicity.** Each migration runs in its own transaction together with its row in `schema_migrations`.
- **Concurrency.** A session-level advisory lock; a second run fails immediately instead of waiting.
- **Direct connection only.** The script reads `DATABASE_URL_UNPOOLED` and refuses a host containing `-pooler`.
- **Structure.** A pure core (file naming and ordering, checksum, the plan of what to apply) and a thin I/O layer. The core has unit tests; the rest has integration tests against a throwaway database created per test, with a guard that refuses any non-local server.
- **Execution.** TypeScript run directly by Node (type stripping), so no loader or build step is added. Scripts are `.mts` files with relative imports that carry the extension, and no path aliases. `erasableSyntaxOnly` makes the compiler reject syntax Node cannot run.
- **Production.** Applied by hand with `npm run db:migrate:prod`, which reads a git-ignored `.env.production.local`.

## Alternatives considered

- **`node-pg-migrate`.** A mature option that covers the same ground. Not evaluated in depth: it adds a dependency, and the runner above is small enough to own. Worth revisiting if requirements grow, for example rollbacks or migrations written in code.
- **An ORM with its own migration tool.** Ruled out by the decision to write explicit SQL.
- **`tsx` to run the script.** Unnecessary on Node 22.18 or later.

## Consequences

- No down migrations. Recovering from a bad migration means writing a forward one.
- No non-transactional statements, such as `create index concurrently`. They would need an opt-out in the runner.
- The `-pooler` check is a convention of Neon, not a Postgres feature. If the naming changed the check would stop detecting pooled URLs, and the lock would silently lose its guarantee. Its test documents the convention.
- We maintain this code. The cost is bounded by its size and by the tests.
- Node 22.18 or later is required to run the scripts. CI uses Node 22.
- Applying migrations in production is a manual step. Automating it is a later decision, and it must not run on preview deployments, because they share the production database today.
