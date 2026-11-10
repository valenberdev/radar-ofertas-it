# ADR-0007: Profile extraction and offer scoring

Status: Accepted (2026-11-10)

## Context

The product compares a pasted CV or self-description with remote IT offers and ranks the offers by fit. Three constraints shape the design:

- Gemini runs on the free tier with billing disabled. The daily request quota is scarce, and going over it must produce a 429 and not a charge.
- On the free tier Google may use the content sent to the API to improve its products. Anything sent must be treated as leaving our control.
- A search can have hundreds of eligible offers. Sending all of them to the model on every search is neither affordable nor useful.

Both the CV and the offers are untrusted text written by third parties.

## Decision

### Pipeline

Profile extraction, once per distinct text:

1. Reject empty text and text over 12,000 characters.
2. Redact personal data with deterministic rules.
3. Hash the redacted text and look it up in the `profiles` cache.
4. On a miss, spend one unit of daily quota and ask Gemini for a structured profile.
5. Reject profiles without skills. Save the profile.

Matching, once per search:

1. Read the eligible offers for the country (dedup rules of ADR-0006 apply).
2. Prefilter by skills to the top 30 candidates.
3. Look up the scores already cached for this profile.
4. Score the rest in batches of 10 offers, one unit of quota per batch, saving each batch as it arrives.
5. Return the scored offers sorted by score, plus how many candidates stayed unscored and why scoring stopped.

### What leaves the server

Only redacted text and the structured profile go to Gemini. The raw CV is never stored: the `profiles` table keeps the structured profile, keyed by the hash of the redacted text. The redactor replaces emails, phone numbers and URLs. It does not recognize names, addresses, employers or obfuscated emails, and the interface must say that the pasted text is sent to Google.

The scoring prompt carries the structured profile (skill names without aliases, roles, languages, summary) and the offers, never the raw CV. Offers are redacted before they are sent, and their descriptions are cut to 1,500 characters.

### Cache keys

- `profiles`: `(text_hash, extractor_id)`.
- `scores`: `(profile_hash, offer_hash, scorer_id)`.

`extractor_id` and `scorer_id` contain the model and the prompt version, so changing either one invalidates the cache without a manual step.

`profile_hash` is computed from the canonical structured profile, ignoring the order of lists. Two different texts that produce the same profile share their scores. `offer_hash` is computed from the redacted and truncated title, company and description: an edited offer is scored again, and copies with identical content share one score.

### Daily quota

Usage is counted in Postgres, per day and per resource (one resource per model). The day is the Pacific day, because that is when Google resets its daily limit. The check and the increment are a single SQL statement, so concurrent requests cannot exceed the limit; a test fires 40 parallel requests against a limit of 5 and expects exactly 5 grants.

Quota is spent only on a cache miss, one unit per call, and is not given back when the call fails: the request probably counted on Google's side anyway. There are no automatic retries.

### Deterministic prefilter

A skill matches an offer when its name or one of its aliases appears in the title or the description. Matching ignores case, accents, and the difference between hyphens, underscores and spaces. A term must not touch a letter or digit on either side, and must not be followed by `+` or `#`, so `Java` does not match `JavaScript` and `C` does not match `C++`. Terms of two characters or fewer, like `Go` or `R`, are case-sensitive.

A skill found in the title is worth 3 points and in the description 1 point, counted once per skill. Offers with no match are left out. The top 30 go on, ordered by points, then by newest posting date, then by highest id.

The trade-off is explicit: an offer that never names any of the candidate's skills is never scored, even if a person would consider it a good fit. Aliases reduce this, and phase 6 measures it.

### Batched scoring and partial results

Ten offers per call turn 30 candidates into 3 calls instead of 30. Batches run one after another. After each batch the scores are saved, so a failure does not lose the earlier ones.

When the quota is exhausted, or Gemini is unavailable or answers with something unusable, scoring stops and the search returns what is scored, with `unscoredCount` and `stoppedBy`. A rejected request (a 4xx other than 429) and any unexpected error are not capacity problems, so they are raised and not hidden.

An offer the model skipped, answered twice, or answered with a score outside 0 to 100 or an empty reason stays unscored and is not cached.

### Untrusted text

The CV and the offers are wrapped in delimiters, the delimiter tags are removed from the text, the prompt says that the content is data and not instructions, and the output is constrained by a schema. This does not prevent prompt injection. It limits what an injection can do: the model has no tools and no secrets in its prompt, so the worst result is a wrong score for that offer.

### Left to measure in phase 6

The model, the thinking level, the temperature, the wording of the score bands, the number of candidates (30), the batch size (10) and the description limit (1,500) use defaults for now. Phase 6 compares them against a labeled dataset. Today `scorer_id` carries only the model and the prompt version, and the thinking level and temperature are not sent. If phase 6 starts sending them, they must become part of `scorer_id`, or cached scores would silently mix results from different settings.

## Consequences

- A search on a cold cache costs at most `ceil(candidates / 10)` calls, 3 with the default top 30. On a warm cache it costs none.
- `scores` grows with every profile and offer pair. It has `created_at` so phase 9 can purge old rows; `profiles` has `last_used_at` for the same reason.
- Scoring batches run sequentially. Three calls fit comfortably in a normal request, but the real duration must be checked against the Vercel function limit before the owner and demo modes ship.
- The reader returns every eligible offer with its full description on each search, and the prefilter runs in memory. This is fine for hundreds of offers. If the numbers grow, the prefilter moves into SQL.
- Offers sharing a title and company but with different descriptions are scored separately, as ADR-0006 requires them to be different offers.
