# ADR 0008: Abuse limits, owner mode and data retention

## Status

Accepted

## Context

The radar is public: recruiters can try it without an account, and the owner uses it for his own job search. Three things make that risky.

- Every search can call Gemini up to four times (one profile extraction and up to three scoring batches), and the free tier gives one daily quota for the whole project. One visitor could use it up in minutes and leave the owner without searches.
- The text people paste is usually a CV, which is personal data, and the Gemini free tier may use what it receives to improve Google's products.
- The project must stay at zero cost, without new paid services.

## Decision

### Owner mode

- The owner signs in once with `OWNER_SECRET` (at least 32 characters). The secret is compared in constant time after hashing both sides with SHA-256, so neither its content nor its length leaks through timing.
- The session is a stateless cookie: `v1.<expiry>.<HMAC-SHA256 of the expiry>`, signed with the same secret. It is `httpOnly`, `SameSite=Strict`, `Secure` in production and valid for 30 days. There is no session table. Signing out deletes the cookie, and rotating the secret revokes every session at once.
- The sign-in page is not linked from anywhere and is marked `noindex`.

### Shared daily quota with a ceiling for visitors

- Gemini usage is counted in units, one per call, in `usage_counters` under the resource `gemini` and the current Pacific day, which is when the free tier resets. The counter is updated with one atomic `insert … on conflict … where used + units <= limit`, so concurrent searches can never pass the limit.
- The owner may use up to `GEMINI_DAILY_LIMIT`. Visitors share `DEMO_DAILY_LIMIT`, which must not be greater. Both count on the same counter, so visitors stop at their ceiling while the owner can keep going.
- Units are not refunded when Gemini fails, because the call may have counted on Google's side too.
- When the quota runs out in the middle of a search, the offers found by the prefilter are still shown, without a score and with the reason.

### Per-client limit for visitors

- A visitor can run 5 searches per Pacific day. The limit is checked before searching, so parallel requests cannot all get through, and requests rejected earlier (unknown country, search disabled) do not count. The owner is exempt. If the counter cannot be read, the search is refused (fail closed).
- The client address is read from `x-vercel-forwarded-for`. Vercel overwrites the forwarding headers with the real client address and drops values sent by the client, so the address cannot be spoofed in production. Other headers are only a fallback for local development.
- IPv6 addresses are reduced to their `/64` block, because a single connection usually owns a whole block and could otherwise rotate addresses to skip the limit. IPv4-mapped IPv6 addresses count as the IPv4 address they are.
- The address is never stored. The counter is named `search-ip:` followed by the first 32 hex characters of `HMAC-SHA256(IP_HASH_SECRET, "<Pacific day>|<address>")`. Without the secret the value cannot be reversed, even by trying every IPv4 address, and because the day is part of the input the same address gives unrelated values on different days.

### What is sent to Google

- Before the profile text is sent, emails, phone numbers and links are removed with deterministic patterns, and a notice next to the text field says where the text goes.
- Offers are sent with their title, company and the first 1,500 characters of the description, after the same redaction. The candidate is described to the scorer only through the structured profile, never through the original text.

### Retention

A daily cron (`/api/cron/purge`, 09:00 UTC, protected by `CRON_SECRET`) deletes:

| Data             | Kept for                                      | Why                                                        |
| ---------------- | --------------------------------------------- | ---------------------------------------------------------- |
| `usage_counters` | the current Pacific day and the two before it | they hold hashed client counters and are only needed today |
| `profiles`       | 30 days after their last use                  | they are derived from CVs; a profile still in use is kept  |
| `scores`         | 30 days after they were computed              | offers change, so an old score is stale cache              |

Offers are purged by the ingestion run itself. The "new since your last search" marks keep the last search time only in the visitor's browser (`localStorage`), never on the server.

### Errors

- Users only see a generic, translated message for unexpected failures. Logs keep `error.message` only, never stacks, profile text or addresses.
- Unknown pages and crashes have their own pages in Spanish and English. A catch-all route under `[lang]` makes unknown paths reach the translated "not found" page.

## Consequences

- Visitors behind a shared address (an office, a university, a mobile carrier) share their 5 daily searches. That is acceptable for a demo, but it would not be for a product with many users.
- Someone who changes networks or uses many VPN exits can search more than 5 times a day. The visitor ceiling still caps the total damage at `DEMO_DAILY_LIMIT` units, and the owner keeps the rest.
- A stolen owner cookie works for up to 30 days, until the secret is rotated.
- Three secrets must be set in production: `OWNER_SECRET`, `IP_HASH_SECRET` and `CRON_SECRET`. The app refuses to start if Gemini is configured without all its settings.
- Repeated searches with the same text and the same offers do not call Gemini, because profiles and scores are cached. The purge only bounds how long that cache lives.

## Alternatives considered

- **A hosted rate limiter such as Redis.** It would add a new service and a new technology to an app that already has an atomic counter in Postgres.
- **CAPTCHA.** It adds friction for the recruiters the demo is meant for, and the daily limits already bound the cost.
- **User accounts.** They would add registration, password handling and more personal data, only to protect a free demo.
- **Hashing addresses without a secret.** The IPv4 space is small enough to reverse a plain hash by brute force.
