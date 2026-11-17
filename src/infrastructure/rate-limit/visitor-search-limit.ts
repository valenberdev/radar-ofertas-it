import type { Pool } from "pg";
import { createPgDailyQuota } from "../db/pg-daily-quota";
import { rateLimitResource } from "./client-key";

export const VISITOR_SEARCHES_PER_DAY = 5;

export interface VisitorSearchLimitOptions {
  readonly secret: string;
  readonly ip: string | null;
  readonly now: () => Date;
}

export function createVisitorSearchLimit(
  pool: Pick<Pool, "query">,
  options: VisitorSearchLimitOptions,
): () => Promise<boolean> {
  return () => {
    const at = options.now();
    const quota = createPgDailyQuota(pool, {
      resource: rateLimitResource("search-ip", options.secret, options.ip, at),
      limit: VISITOR_SEARCHES_PER_DAY,
      now: () => at,
    });
    return quota.tryConsume(1);
  };
}
