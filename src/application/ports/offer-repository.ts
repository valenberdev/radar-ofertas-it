import type { SourceOffer } from "../../domain/source-offer";

export interface UpsertResult {
  readonly inserted: number;
  readonly updated: number;
}

export interface OfferRepository {
  upsertMany(
    offers: readonly SourceOffer[],
    ingestedAt: Date,
  ): Promise<UpsertResult>;
  deleteExpired(now: Date): Promise<number>;
}
