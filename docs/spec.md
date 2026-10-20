# Remote IT Jobs Radar with Fit Score: Project Spec

## 1. Overview

A full-stack app where a user pastes a free-text profile (stack, experience, preferences). The app ingests remote job postings from open sources, deduplicates them, assigns each one an AI-generated fit score with a justification, and shows the postings ranked.

The public demo lets a visitor paste a sample profile and see ranked postings with per-posting justifications, with nothing to install.

The value is in ingestion, deduplication, a measured scoring quality, and cost control. It is not a generic CRUD app.

## 2. Goals and constraints

- **Success criterion:** every design decision is defensible with data (measured score quality, dedup, cost control). Minimum bar: a visitor gets a usable demo within 2 minutes.
- **Budget:** $0, no payment card attached to any service. "Spending cap" means never enabling billing.
- **Deployment:** public URL.
- **New technology:** Next.js only (App Router, server components, server actions, protected GET route for cron). Everything else builds on the existing stack.
- **Scope rule (YAGNI):** nothing that the demo does not need. When time is short, UI polish and extras are cut, never measurement, dedup, quota or rate limiting.

## 3. Key decisions

1. **No email or Telegram alerts.** Owner mode shows "new postings since your last visit" using a `last_seen_at` timestamp. The project does not use AWS.
2. **Gemini cost control.**
   - Deterministic pre-filter first (region, stack, seniority). Gemini only scores the top K.
   - Cache keyed by profile hash + offer + `prompt_version` + model.
   - Per-IP limit.
   - Own daily counter in Postgres, with a cap below Google's real limit. Google's 429 is only a safety net.
   - When the daily demo cap is reached, the form and scoring are hidden and a notice is shown. The rest of the app keeps working, and the cached sample profile stays available.
3. **Two job sources of different nature:** one structured (JSON API) and one free text. Sources are chosen only after verifying terms of use, rate limits and stability. **Region eligibility is a hard criterion** of the pre-filter, since many "remote" postings are restricted to the US or EU.
4. **Profile as free text with LLM extraction.** One Gemini call turns the text into a structured profile validated with Zod, cached by the hash of the normalized text. If validation fails, the profile is rejected. Only the structured profile is stored, never the raw text. The per-IP limit also applies to extraction. The demo warns that the text is sent to Gemini.
5. **Two modes, no real login.**
   - _Owner mode:_ secret key in an environment variable, compared in constant time. A server action sets an httpOnly cookie with a signed, expiring token (never the key itself). Persistent profile (`owner_profile`, at most one row), `last_seen_at`, and a reserved quota bucket. Login attempts go through the per-IP limit.
   - _Demo mode:_ anonymous, no accounts, no user persistence. Results are identified by the profile hash.
   - A server action is still a public POST endpoint: it validates and authorizes inside.
6. **Score measurement.** A static dataset of 30-50 real postings (versioned JSON), hand-labeled without seeing model output ("fits / unsure / does not fit"). A Vitest script runs the scorer and reports metrics (top-K precision, agreement with labels). Part of the dataset is held out while the prompt is iterated. Evaluation runs on a separate Google Cloud project from the demo.
7. **Layered architecture in a single package** (see section 4). No monorepo.
8. **Postgres on Neon Free.** Pooled URL for the app, direct URL for migrations, same Postgres major version locally and on Neon. The per-IP limit lives in Postgres (serverless instances do not share memory), so there is no Redis.
9. **Docker for development and tests only.** `docker-compose.yml` with local Postgres; a service container in CI. No app Dockerfile: Vercel deploys from source.
10. **Batch scoring with configurable `batchSize`** (starts at 5; 1 means one call per offer, K means a single call). Batches run in parallel and results stream in progressively. `batchSize` 1, 5 and K are compared against the hand labels and cost.
11. **Bilingual UI (ES/EN)** with hand-written i18n and no i18n library (section 6).
12. **Justifications in both languages in one Gemini call** (`justification.en`, `justification.es`, validated with Zod). Language is not part of the cache key. If measurement shows too many tokens, truncation or poor Spanish, fall back to English only.
13. **Daily ingestion without an LLM,** via a Vercel Hobby cron (one run per day), a GET handler protected by a secret, idempotent (upsert), logging every run.
14. **No other new technology:** no Tailwind (CSS Modules or plain CSS), no Redis, no OAuth, no i18n library, no monorepo.
15. **Repository documents and code are in English.** Only the app is bilingual.

## 4. Architecture

```
src/
  domain/          pure logic: normalize, dedup, pre-filter, hash, pure scoring
  application/     use cases: ingestOffers, evaluateProfile, checkQuota
  infrastructure/  adapters: db (pg + SQL), llm, sources/, env
  app/             Next.js: pages, server actions, route handlers (thin)
db/migrations/     numbered .sql files
docs/adr/          architecture decision records
eval/              labeled dataset + measurement script
```

- Dependency rule: `app -> application -> domain`. `infrastructure` implements what `application` needs. `domain` imports nothing external (no Next, no `pg`, no Gemini SDK).
- Interfaces only where justified: `OfferSource` (two implementations) and `LlmClient` (a fake is needed in tests and evaluation).
- The rule is enforced with ESLint `no-restricted-imports` (flat config).
- Strict TypeScript with `noUncheckedIndexedAccess`.
- "Professional" means: one-way dependencies, pure testable logic, Zod-validated env, versioned SQL migrations, typed errors, structured logs, CI with lint, typecheck and tests, short ADRs.

## 5. Key flows

**Demo**

1. Normalize the pasted text and compute its hash.
2. If the profile is not cached, check quota and IP limit.
3. Extract the structured profile with Gemini (validated with Zod).
4. Deterministic pre-filter: region (hard criterion), stack, seniority.
5. Score the top K in batches and stream results.

Scores are cached by `(profile_hash, offer_id, prompt_version, model)`.

**Quota:** atomic daily counter per bucket (demo, owner) in Postgres, using `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` to avoid races.

**Content safety:** job postings (third-party free text) and profiles are treated as data inside the prompt, never as instructions. Output is validated with Zod. Prompt injection is a real risk.

## 6. Internationalization

- Languages: `en` (default) and `es`.
- The language lives in the URL (`/en`, `/es`). `/` redirects using, in order: the language cookie, the `Accept-Language` header, then `en`. No IP geolocation.
- The language switcher is a link to the same page in the other language and stores the choice in the cookie. A manual choice always wins.
- i18n lives only in `app/`. `domain` and `application` return codes and data, not text.
- Typed `en` and `es` dictionaries, with a test that enforces identical keys.
- The sample profile exists in both languages and is pre-cached once per language. Extraction returns canonical English labels so the pre-filter does not depend on the profile language. At least one Spanish profile is covered in extraction tests.
- Portuguese falls back to English.

## 7. Data model (tentative)

`offers`, `ingest_runs`, `profiles` (hash and structured JSON), `scores`, `usage_counters`, `rate_limits` (salted IP hash), `owner_profile` (at most one row, with `last_seen_at`). Includes a retention policy for old offers to respect the Neon Free storage limit.

## 8. Security and privacy

- No secret reaches the client. Env is validated with Zod at startup and fails early with a clear message.
- Server actions validate and authorize inside.
- The demo discloses that pasted text is sent to Gemini on the free tier, where Google may review it and use it to improve its products, and it offers a sample-profile button.

## 9. Out of scope

- Email or Telegram alerts, user accounts, OAuth.
- App Dockerfile and container deployment.
- Profile editing after extraction, feedback buttons in the UI.
- Precomputed-profile fallback (the cached sample profile covers the minimum).
- Admin panel, metrics beyond structured logs, advanced search.

## 10. Phases

1. Skeleton, Zod env, compose, CI, i18n skeleton
2. Data model and migrations
3. Ingestion of two sources and cron
4. Normalization and dedup
5. Profile, extraction, batch scoring, cache, daily quota, bilingual justifications
6. Dataset, labeling and measurement
7. Owner mode and "new since your last visit"
8. UI, translations and language switcher
9. Per-IP limit, errors and privacy
10. Deploy, README, ADRs

**Cut order:** UI polish first, then bilingual justifications (back to English only), then the second contrasting profile and extra integration tests.

**Never cut:** dedup, measurement, quota, per-IP limit.
