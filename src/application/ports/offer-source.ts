import type { SourceName, SourceOffer } from "../../domain/source-offer";

export interface FetchOffersOptions {
  readonly since: Date | null;
  readonly maxRequests: number;
}

export interface OfferSource {
  readonly name: SourceName;
  fetchOffers(
    options: FetchOffersOptions,
  ): AsyncIterable<readonly SourceOffer[]>;
}
