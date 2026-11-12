import type { Pool } from "pg";
import type { SearchOffersDeps } from "../../application/search-offers";
import { createPgDailyQuota } from "../db/pg-daily-quota";
import { createPgOfferReader } from "../db/pg-offer-reader";
import { createPgProfileStore } from "../db/pg-profile-store";
import { createPgScoreStore } from "../db/pg-score-store";
import { createGeminiClient } from "../llm/gemini-client";
import { createGeminiOfferScorer } from "../llm/gemini-offer-scorer";
import { createGeminiProfileExtractor } from "../llm/gemini-profile-extractor";
import type { GeminiConfig } from "../parse-env";

export const GEMINI_QUOTA_RESOURCE = "gemini";
export const GEMINI_TIMEOUT_MS = 30_000;

export type SearchMode = "owner" | "demo";

export interface SearchDepsOptions {
  readonly pool: Pick<Pool, "query">;
  readonly fetch: typeof fetch;
  readonly gemini: GeminiConfig;
  readonly mode: SearchMode;
  readonly now?: () => Date;
}

export function createSearchDeps(options: SearchDepsOptions): SearchOffersDeps {
  const { pool, gemini } = options;
  const now = options.now ?? (() => new Date());
  const generator = createGeminiClient({
    fetch: options.fetch,
    apiKey: gemini.apiKey,
    model: gemini.model,
    timeoutMs: GEMINI_TIMEOUT_MS,
  });
  const quota = createPgDailyQuota(pool, {
    resource: GEMINI_QUOTA_RESOURCE,
    limit: options.mode === "owner" ? gemini.dailyLimit : gemini.demoDailyLimit,
    now,
  });
  return {
    extract: {
      extractor: createGeminiProfileExtractor(generator, gemini.model),
      profiles: createPgProfileStore(pool),
      quota,
      now,
    },
    match: {
      reader: createPgOfferReader(pool),
      scorer: createGeminiOfferScorer(generator, gemini.model),
      scores: createPgScoreStore(pool),
      quota,
      now,
    },
  };
}
