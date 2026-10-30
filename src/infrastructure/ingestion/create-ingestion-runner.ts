import type { Pool } from "pg";
import {
  ingestOffers,
  type IngestOffersResult,
} from "../../application/ingest-offers";
import type { OfferSource } from "../../application/ports/offer-source";
import type { SourceName } from "../../domain/source-offer";
import { createPgIngestRunRepository } from "../db/pg-ingest-run-repository";
import { createPgOfferRepository } from "../db/pg-offer-repository";
import { createHackerNewsClient } from "../sources/hackernews/client";
import { createHackerNewsSource } from "../sources/hackernews/hackernews-source";
import { createHimalayasClient } from "../sources/himalayas/client";
import { createHimalayasSource } from "../sources/himalayas/himalayas-source";

export const USER_AGENT =
  "radar-ofertas-it/1.0 (+https://github.com/valenberdev/radar-ofertas-it)";
export const REQUEST_TIMEOUT_MS = 10_000;
export const SCHEDULED_DEADLINE_MS = 270_000;
export const SCHEDULED_MAX_REQUESTS = 2_000;

const SETTINGS: Record<
  SourceName,
  { readonly incremental: boolean; readonly backfillMaxRequests: number }
> = {
  himalayas: { incremental: true, backfillMaxRequests: 800 },
  hackernews: {
    incremental: false,
    backfillMaxRequests: SCHEDULED_MAX_REQUESTS,
  },
};

export interface IngestionRunnerDeps {
  readonly pool: Pick<Pool, "query">;
  readonly fetch: typeof fetch;
  readonly himalayasApiKey: string | undefined;
  readonly now?: () => Date;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly onRejected?: (source: SourceName, reason: string) => void;
}

export interface RunIngestionOptions {
  readonly backfill: boolean;
}

export interface IngestionReport {
  readonly run: IngestOffersResult;
  readonly purged: number | null;
  readonly purgeError: string | null;
}

export interface IngestionRunner {
  run(
    source: SourceName,
    options: RunIngestionOptions,
  ): Promise<IngestionReport>;
}

function createSource(
  name: SourceName,
  deps: IngestionRunnerDeps,
): OfferSource {
  const onRejected = (reason: string) => deps.onRejected?.(name, reason);
  switch (name) {
    case "himalayas":
      return createHimalayasSource({
        client: createHimalayasClient({
          fetch: deps.fetch,
          userAgent: USER_AGENT,
          timeoutMs: REQUEST_TIMEOUT_MS,
          apiKey: deps.himalayasApiKey,
        }),
        sleep: deps.sleep,
        onRejected,
      });
    case "hackernews":
      return createHackerNewsSource({
        client: createHackerNewsClient({
          fetch: deps.fetch,
          userAgent: USER_AGENT,
          timeoutMs: REQUEST_TIMEOUT_MS,
        }),
        onRejected,
      });
  }
}

export function createIngestionRunner(
  deps: IngestionRunnerDeps,
): IngestionRunner {
  const now = deps.now ?? (() => new Date());
  const offers = createPgOfferRepository(deps.pool);
  const runs = createPgIngestRunRepository(deps.pool);

  return {
    async run(
      name: SourceName,
      options: RunIngestionOptions,
    ): Promise<IngestionReport> {
      const settings = SETTINGS[name];
      const deadline = options.backfill
        ? null
        : new Date(now().getTime() + SCHEDULED_DEADLINE_MS);

      const run = await ingestOffers(
        { source: createSource(name, deps), offers, runs, now },
        {
          incremental: settings.incremental,
          maxRequests: options.backfill
            ? settings.backfillMaxRequests
            : SCHEDULED_MAX_REQUESTS,
          deadline,
        },
      );

      try {
        const purged = await offers.deleteExpired(now());
        return { run, purged, purgeError: null };
      } catch (cause) {
        const purgeError =
          cause instanceof Error && cause.message !== ""
            ? cause.message
            : "Unknown error";
        return { run, purged: null, purgeError };
      }
    },
  };
}
