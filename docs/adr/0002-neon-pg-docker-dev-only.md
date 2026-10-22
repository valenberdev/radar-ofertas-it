# ADR-0002: Neon Postgres, `pg` with explicit SQL, and Docker for development only

- Status: Accepted
- Date: 2026-10-22

## Context

The app needs a relational database in production at no cost and with no payment card attached. It runs on serverless functions, where each invocation may execute in a different instance, so no state can be kept in memory between requests. That includes the per-IP rate limit and the daily quota for LLM calls. Tests that touch SQL need a real Postgres, not a mock.

## Decision

- **Production database: Neon Free.** Postgres 18, the same major version as local development. Neon supports Postgres 14 to 18 and creates each project with one specific major version; moving to another major version means creating a new project and migrating the data.
- **Two connection strings.** `DATABASE_URL` (pooled) is used by the app at runtime and `DATABASE_URL_UNPOOLED` (direct) is used by migrations. The names match the variables Neon's Vercel integration sets. Both are validated with Zod at startup.
- **Access with `pg` and explicit SQL, no ORM.** Queries live in `src/infrastructure/db`. Schema changes are versioned `.sql` files in `db/migrations`.
- **Rate limit and quota live in Postgres.** An atomic counter per bucket, so there is no Redis.
- **Docker for development and tests only.** `docker-compose.yml` runs `postgres:18` with a named volume, a healthcheck and the port bound to `127.0.0.1` only (host port 5435, non-standard to avoid clashing with other local databases). CI will use a Postgres service container once the first integration test exists. There is no application Dockerfile: Vercel deploys from source.

## Consequences

- The database compute suspends when idle, so the first query after a quiet period pays a cold-start cost. It will be measured at deploy time.
- Exhausting the free monthly compute allowance suspends the database until the next cycle. This is a known risk of the free plan. Exact limits will be verified at deploy time, since they change.
- Local development has no pooler, so behavior that depends on connection pooling (for example session-level features under transaction pooling) is not reproduced locally. It will be checked against the pooled URL when migrations are added.
- Postgres major upgrades are manual: a new Neon project plus a data migration. Local and Neon must be moved together.
- The compose file uses throwaway credentials. That is acceptable only because the port is bound to the loopback interface.
- Using `pg` without an ORM means hand-written SQL and hand-written row types, in exchange for no new dependency and full control over queries.

## Alternatives considered

- **Supabase Free:** free projects are paused after a week of inactivity, which could leave the demo offline for a visitor who arrives after a quiet week.
- **Railway:** no clearly permanent free plan and metered billing, which conflicts with the zero-cost, no-card constraint.
- **An ORM or query builder:** rejected as an extra dependency that the project does not need. The queries are few and specific.
- **Redis for rate limiting:** rejected as new infrastructure. Postgres already holds the data and an atomic upsert covers the need.
- **Containerized deployment (app Dockerfile):** rejected, since Vercel builds and deploys from source and a container adds nothing for this app.
