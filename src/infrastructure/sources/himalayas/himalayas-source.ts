import type {
  FetchOffersOptions,
  OfferBatch,
  OfferSource,
} from "../../../application/ports/offer-source";
import type { JsonValue, SourceOffer } from "../../../domain/source-offer";
import type { HimalayasClient } from "./client";
import { mapHimalayasJob } from "./map-job";

export const INGESTED_CATEGORIES: readonly string[] = [
  "Developer",
  "Data Science",
];

const DEFAULT_MIN_INTERVAL_MS = 1000;
const MIN_ATTEMPTED_BEFORE_ABORT = 20;
const MAX_REJECTED_SHARE = 0.25;

export interface HimalayasSourceOptions {
  readonly client: HimalayasClient;
  readonly minIntervalMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
  readonly onRejected?: (reason: string) => void;
}

interface PageResult {
  readonly offers: readonly SourceOffer[];
  readonly attempted: number;
  readonly rejected: number;
  readonly allOlder: boolean;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asRecord(value: JsonValue): { [key: string]: JsonValue } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value;
}

function readStringList(value: JsonValue | undefined): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      return null;
    }
    result.push(item);
  }
  return result;
}

function readUnixSeconds(value: JsonValue | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function processPage(
  jobs: readonly JsonValue[],
  since: Date | null,
  onRejected: ((reason: string) => void) | undefined,
): PageResult {
  const sinceMs = since === null ? null : since.getTime();
  const offers: SourceOffer[] = [];
  let attempted = 0;
  let rejected = 0;
  let allOlder = true;

  for (const job of jobs) {
    const record = asRecord(job);
    const publishedSeconds = readUnixSeconds(record?.pubDate);
    const isOlder =
      sinceMs !== null &&
      publishedSeconds !== null &&
      publishedSeconds * 1000 < sinceMs;
    if (isOlder) {
      continue;
    }
    allOlder = false;

    const categories = readStringList(record?.parentCategories);
    if (categories === null) {
      attempted += 1;
      rejected += 1;
      onRejected?.("parentCategories: missing or not a list of strings");
      continue;
    }
    if (
      !categories.some((category) => INGESTED_CATEGORIES.includes(category))
    ) {
      continue;
    }

    attempted += 1;
    try {
      offers.push(mapHimalayasJob(job));
    } catch (error) {
      rejected += 1;
      onRejected?.(error instanceof Error ? error.message : "unknown error");
    }
  }

  return { offers, attempted, rejected, allOlder };
}

export function createHimalayasSource(
  options: HimalayasSourceOptions,
): OfferSource {
  const minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;

  return {
    name: "himalayas",
    async *fetchOffers(
      fetchOptions: FetchOffersOptions,
    ): AsyncGenerator<OfferBatch> {
      let cursor: string | null = null;
      let lastRequestAt: number | null = null;
      let attemptedTotal = 0;
      let rejectedTotal = 0;

      for (
        let requests = 0;
        requests < fetchOptions.maxRequests;
        requests += 1
      ) {
        if (lastRequestAt !== null) {
          const wait = lastRequestAt + minIntervalMs - now();
          if (wait > 0) {
            await sleep(wait);
          }
        }
        lastRequestAt = now();

        const page = await options.client.fetchPage(cursor);
        if (page.jobs.length === 0) {
          return;
        }

        const result = processPage(
          page.jobs,
          fetchOptions.since,
          options.onRejected,
        );
        yield { offers: result.offers, rejected: result.rejected };

        attemptedTotal += result.attempted;
        rejectedTotal += result.rejected;
        if (
          attemptedTotal >= MIN_ATTEMPTED_BEFORE_ABORT &&
          rejectedTotal / attemptedTotal > MAX_REJECTED_SHARE
        ) {
          throw new Error(
            `Himalayas ingestion aborted: ${rejectedTotal} of ${attemptedTotal} relevant jobs were rejected`,
          );
        }

        if (page.nextCursor === null || result.allOlder) {
          return;
        }
        cursor = page.nextCursor;
      }
    },
  };
}
