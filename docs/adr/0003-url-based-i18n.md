# ADR 0003: URL-based i18n with hand-made dictionaries

## Status

Accepted

## Context

The app is bilingual (Spanish and English) and is also a portfolio piece, so pages must be linkable and indexable in each language. It is a single Next.js deployable on Vercel Hobby, built by one person, and the interface text is small: a handful of screens and no content that varies by region beyond the language.

Options considered:

- **Cookie or header only, no locale in the URL.** Every page would depend on request data, so it could not be prerendered, and a link would show a different language to each reader.
- **Subdomains per language** (`es.example.com`). Needs DNS and domain setup that the zero-cost deployment does not have.
- **A locale prefix in the path** (`/en`, `/es`).
- **An i18n library** such as next-intl. Solid, but a new dependency for two languages and a few dozen strings.

## Decision

Locale prefix in the path, implemented by hand.

- The app lives under a `[lang]` segment. `generateStaticParams` returns the supported locales and `dynamicParams = false`, so `/en` and `/es` are prerendered and any other value is a 404.
- Dictionaries are typed TypeScript objects. The `Dictionary` type is inferred from the English one, so the Spanish dictionary fails to compile if a key is missing or extra.
- `src/proxy.ts` redirects any path without a locale prefix (307, temporary) to the negotiated locale and keeps the query string. Priority: `NEXT_LOCALE` cookie, then `Accept-Language` (q-values honored, primary subtag only, `q=0` excluded), then the default `en`. Languages we do not support, such as Portuguese, fall back to English.
- The proxy skips `api/`, `_next/` and any path containing a dot (static files).
- Negotiation, prefix detection and path switching are pure functions with unit tests, outside the Next-specific files.
- The language switcher is a client component. It writes the `NEXT_LOCALE` cookie on click, never in the proxy: `Link` prefetches the other language, and a cookie set while serving a URL would change the visitor's language without any action from them.
- No i18n library for now.

## Consequences

- Pages stay static, URLs are shareable and each language is crawlable.
- Every internal link must carry the locale prefix. `switchLocalePath` and `prefixWithLocale` exist for that; a hardcoded `/jobs` would go through a redirect.
- The proxy runs on every request that is not an asset or an API call. The cost is small, but it is a hop for visitors landing on `/`.
- Adding a language means touching `locales`, `localeNames` and a new dictionary; the compiler flags what is missing.
- Known limits: the switcher drops the query string (`usePathname` does not include it), paths containing a dot are never redirected, and there is no plural or date/number formatting layer. Each gets handled when a screen needs it.
- If the number of languages or the amount of text grows enough that this code becomes a burden, migrating to a library is a contained change: the dictionaries and the `[lang]` segment map directly to what those libraries expect.
