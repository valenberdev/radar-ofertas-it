import type {
  FetchOffersOptions,
  OfferBatch,
  OfferSource,
} from "../../../application/ports/offer-source";
import type { JsonValue, SourceOffer } from "../../../domain/source-offer";
import type { HackerNewsClient } from "./client";
import { parseHackerNewsComment } from "./parse-comment";

const HIRING_USER = "whoishiring";
const HIRING_TITLE = /^Ask HN: Who is hiring\?/i;
const THREADS_TO_READ = 2;
const MAX_THREAD_CANDIDATES = 12;
const DEFAULT_CONCURRENCY = 10;
const MIN_ATTEMPTED_BEFORE_ABORT = 20;
const MAX_REJECTED_SHARE = 0.25;
const MIN_COMMENTS_EXPECTING_OFFERS = 50;

export interface HackerNewsSourceOptions {
  readonly client: HackerNewsClient;
  readonly concurrency?: number;
  readonly onRejected?: (reason: string) => void;
}

function asRecord(value: JsonValue): { [key: string]: JsonValue } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value;
}

function readIds(value: JsonValue | undefined): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is number =>
      typeof entry === "number" && Number.isSafeInteger(entry) && entry > 0,
  );
}

export function createHackerNewsSource(
  options: HackerNewsSourceOptions,
): OfferSource {
  const concurrency = Math.max(
    1,
    Math.floor(options.concurrency ?? DEFAULT_CONCURRENCY),
  );

  return {
    name: "hackernews",
    async *fetchOffers(
      fetchOptions: FetchOffersOptions,
    ): AsyncGenerator<OfferBatch> {
      let remaining = fetchOptions.maxRequests;
      if (remaining < 1) {
        return;
      }

      const submitted = await options.client.fetchUserSubmitted(HIRING_USER);
      remaining -= 1;

      const commentIds: number[] = [];
      let threadsFound = 0;
      for (const id of submitted.slice(0, MAX_THREAD_CANDIDATES)) {
        if (remaining < 1 || threadsFound >= THREADS_TO_READ) {
          break;
        }
        remaining -= 1;
        const record = asRecord(await options.client.fetchItem(id));
        if (
          record !== null &&
          typeof record.title === "string" &&
          HIRING_TITLE.test(record.title)
        ) {
          threadsFound += 1;
          commentIds.push(...readIds(record.kids));
        }
      }
      if (threadsFound === 0) {
        if (remaining < 1) {
          return;
        }
        throw new Error(
          "Hacker News ingestion failed: no Who is hiring thread found",
        );
      }

      const sinceMs =
        fetchOptions.since === null ? null : fetchOptions.since.getTime();
      let commentsRead = 0;
      let parsedOffers = 0;
      let attemptedTotal = 0;
      let rejectedTotal = 0;

      for (
        let start = 0;
        start < commentIds.length && remaining > 0;
        start += concurrency
      ) {
        const ids = commentIds.slice(
          start,
          start + Math.min(concurrency, remaining),
        );
        remaining -= ids.length;
        const results = await Promise.allSettled(
          ids.map((id) => options.client.fetchItem(id)),
        );
        commentsRead += ids.length;

        const offers: SourceOffer[] = [];
        let rejected = 0;
        for (const result of results) {
          if (result.status === "rejected") {
            attemptedTotal += 1;
            rejected += 1;
            options.onRejected?.(
              result.reason instanceof Error
                ? result.reason.message
                : "unknown error",
            );
            continue;
          }
          if (result.value === null) {
            continue;
          }
          const parsed = parseHackerNewsComment(result.value);
          if (parsed.kind === "skipped") {
            continue;
          }
          attemptedTotal += 1;
          if (parsed.kind === "rejected") {
            rejected += 1;
            options.onRejected?.(parsed.reason);
            continue;
          }
          parsedOffers += 1;
          const postedAt = parsed.offer.postedAt;
          if (
            sinceMs === null ||
            postedAt === null ||
            postedAt.getTime() >= sinceMs
          ) {
            offers.push(parsed.offer);
          }
        }

        rejectedTotal += rejected;
        yield { offers, rejected };

        if (
          attemptedTotal >= MIN_ATTEMPTED_BEFORE_ABORT &&
          rejectedTotal / attemptedTotal > MAX_REJECTED_SHARE
        ) {
          throw new Error(
            `Hacker News ingestion aborted: ${rejectedTotal} of ${attemptedTotal} relevant comments were rejected`,
          );
        }
      }

      if (commentsRead >= MIN_COMMENTS_EXPECTING_OFFERS && parsedOffers === 0) {
        throw new Error(
          `Hacker News ingestion found no offers in ${commentsRead} comments; the format may have changed`,
        );
      }
    },
  };
}
