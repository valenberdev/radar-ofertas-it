import type { SourceName, SourceOffer } from "../../domain/source-offer";

export interface FetchOffersOptions {
  readonly since: Date | null;
  readonly maxRequests: number;
}

export interface OfferBatch {
  readonly offers: readonly SourceOffer[];
  readonly rejected: number;
}

export interface OfferSource {
  readonly name: SourceName;
  fetchOffers(options: FetchOffersOptions): AsyncIterable<OfferBatch>;
}
