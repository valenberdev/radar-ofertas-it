import type { SourceOffer } from "../domain/source-offer";
import type {
  IngestRunCounts,
  IngestRunId,
  IngestRunRepository,
} from "./ports/ingest-run-repository";
import type { OfferRepository } from "./ports/offer-repository";
import type { OfferSource } from "./ports/offer-source";
import { sanitizeOffer } from "./sanitize-offer";

export const DEFAULT_OVERLAP_MS = 2 * 60 * 60 * 1000;

export interface IngestOffersDeps {
  readonly source: OfferSource;
  readonly offers: OfferRepository;
  readonly runs: IngestRunRepository;
  readonly now: () => Date;
}

export interface IngestOffersOptions {
  readonly incremental: boolean;
  readonly maxRequests: number;
  readonly deadline: Date | null;
  readonly overlapMs?: number;
}

export interface IngestOffersResult {
  readonly runId: IngestRunId;
  readonly status: "succeeded" | "failed";
  readonly counts: IngestRunCounts;
  readonly error: string | null;
}

function describeError(error: unknown): string {
  return error instanceof Error && error.message !== ""
    ? error.message
    : "Unknown error";
}

function dedupeBySourceId(offers: readonly SourceOffer[]): SourceOffer[] {
  const bySourceId = new Map<string, SourceOffer>();
  for (const offer of offers) {
    bySourceId.set(offer.sourceId, offer);
  }
  return [...bySourceId.values()];
}

export async function ingestOffers(
  deps: IngestOffersDeps,
  options: IngestOffersOptions,
): Promise<IngestOffersResult> {
  const startedAt = deps.now();

  let since: Date | null = null;
  if (options.incremental) {
    const lastStart = await deps.runs.findLastSucceededStart(deps.source.name);
    if (lastStart !== null) {
      since = new Date(
        lastStart.getTime() - (options.overlapMs ?? DEFAULT_OVERLAP_MS),
      );
    }
  }

  const runId = await deps.runs.start(deps.source.name, startedAt);

  let fetched = 0;
  let inserted = 0;
  let updated = 0;
  let rejected = 0;
  let error: string | null = null;

  try {
    for await (const batch of deps.source.fetchOffers({
      since,
      maxRequests: options.maxRequests,
    })) {
      const batchTime = deps.now();
      fetched += batch.offers.length;
      rejected += batch.rejected;

      const unique = dedupeBySourceId(batch.offers.map(sanitizeOffer));
      if (unique.length > 0) {
        const result = await deps.offers.upsertMany(unique, batchTime);
        inserted += result.inserted;
        updated += result.updated;
      }

      if (
        options.deadline !== null &&
        batchTime.getTime() >= options.deadline.getTime()
      ) {
        error = `Deadline reached after ${fetched} offers`;
        break;
      }
    }
  } catch (cause) {
    error = describeError(cause);
  }

  const counts: IngestRunCounts = { fetched, inserted, updated, rejected };
  const status = error === null ? "succeeded" : "failed";
  await deps.runs.finish(runId, {
    status,
    finishedAt: deps.now(),
    counts,
    error,
  });

  return { runId, status, counts, error };
}
