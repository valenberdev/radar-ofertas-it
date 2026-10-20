# ADR-0001: Layered architecture in a single package

- Status: Accepted
- Date: 2026-10-20

## Context

The app is a single Next.js deployable built and maintained by one person. Its value lives in logic that must be easy to test without a database or network access (deduplication, scoring, parsing, locale negotiation, env validation), and in two integrations that must be replaceable in tests and in evaluation: the job sources and the LLM client.

## Decision

Four layers inside one package:

- `src/domain`: pure logic (normalize, dedup, pre-filter, hash, pure scoring).
- `src/application`: use cases (`ingestOffers`, `evaluateProfile`, `checkQuota`) and the ports they need.
- `src/infrastructure`: adapters (Postgres with `pg` and explicit SQL, LLM client, job sources, env).
- `src/app`: Next.js pages, server actions and route handlers, kept thin.

Dependency rule: `app -> application -> domain`. `infrastructure` implements what `application` needs, and `app` wires everything together.

| Layer          | May import                                          | Must not import                                  |
| -------------- | --------------------------------------------------- | ------------------------------------------------ |
| domain         | relative paths, `node:` builtins, `vitest` in tests | any external package, other layers               |
| application    | domain, pure libraries such as Zod                  | infrastructure, app, Next, React, `pg`, LLM SDKs |
| infrastructure | application, domain, `pg`, Zod                      | app, Next, React                                 |
| app            | all layers                                          | `pg` and LLM SDKs directly                       |

Interfaces exist only where there are two real implementations or a test double is needed: `OfferSource` (two sources) and `LlmClient` (a fake is used in tests and in evaluation).

The rule is enforced with ESLint `no-restricted-imports` in the flat config, plus a ban on dynamic `import()` in domain and application. No new tooling is added.

## Consequences

- Domain and application logic is testable without a database, network or framework.
- Replacing the LLM model, its SDK or a job source touches only `infrastructure`.
- Violations fail `npm run lint`, which CI runs on every push.
- There are more folders and files than in a flat Next.js app. That is accepted for the testability gain.
- The rule compares import strings and does not resolve paths, so it can produce false positives for third-party subpaths that contain `app` or `application` segments. It does not cover `require()`.
- Domain cannot use Zod. If a domain model needs schema validation, revisit this ADR.

## Alternatives considered

- Monorepo or Turborepo: rejected, since there is a single deployable and the tooling overhead is not justified.
- Flat Next.js structure: rejected, because business logic would be coupled to the framework and harder to test.
- Dedicated architecture-linting tools: not adopted, because the built-in ESLint rule covers the needed boundaries without a new dependency.
