import type { Country } from "../../domain/countries";
import type { Region } from "../../domain/region";
import type { SourceName } from "../../domain/source-offer";

export interface StoredOffer {
  readonly id: string;
  readonly source: SourceName;
  readonly sourceId: string;
  readonly title: string;
  readonly company: string | null;
  readonly url: string;
  readonly description: string;
  readonly postedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly region: Region;
}

export interface EligibleOffersQuery {
  readonly country: Country;
  readonly now: Date;
}

export interface OfferReader {
  listEligible(query: EligibleOffersQuery): Promise<readonly StoredOffer[]>;
}
