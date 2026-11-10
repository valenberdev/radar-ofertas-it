import type { Profile } from "../../domain/profile";
import type { ScorableOffer } from "../../domain/scorable-offer";

export interface OfferScore {
  readonly score: number;
  readonly reasonEs: string;
  readonly reasonEn: string;
}

export interface OfferScorer {
  readonly id: string;
  score(
    profile: Profile,
    offers: readonly ScorableOffer[],
  ): Promise<readonly (OfferScore | null)[]>;
}
