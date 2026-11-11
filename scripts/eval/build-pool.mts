import { DEFAULT_TOP_K, prefilterOffers } from "../../src/domain/prefilter";
import type { Profile } from "../../src/domain/profile";
import type { SnapshotOffer } from "./dataset.mts";
import { sampled, type Random } from "./random.mts";

export type PoolOrigin = "candidate" | "beyond_top" | "unmatched";

export interface PoolItem {
  readonly offer: SnapshotOffer;
  readonly origin: PoolOrigin;
}

export interface PoolSizes {
  readonly candidates: number;
  readonly beyondTop: number;
  readonly unmatched: number;
}

export interface RankedOffer {
  readonly offer: SnapshotOffer;
  readonly score: number;
}

export interface Ranking {
  readonly ranked: readonly RankedOffer[];
  readonly unmatched: readonly SnapshotOffer[];
}

export const DEFAULT_POOL_SIZES: PoolSizes = {
  candidates: DEFAULT_TOP_K,
  beyondTop: 8,
  unmatched: 7,
};

export function rankOffers(
  profile: Profile,
  offers: readonly SnapshotOffer[],
): Ranking {
  const prepared = offers.map((offer) => ({
    id: offer.id,
    title: offer.title,
    description: offer.description,
    postedAt: offer.postedAt === null ? null : new Date(offer.postedAt),
    offer,
  }));
  const matches = prefilterOffers(
    profile,
    prepared,
    Math.max(1, prepared.length),
  );
  const matchedIds = new Set(matches.map((match) => match.offer.id));
  return {
    ranked: matches.map((match) => ({
      offer: match.offer.offer,
      score: match.score,
    })),
    unmatched: prepared
      .filter((item) => !matchedIds.has(item.id))
      .map((item) => item.offer),
  };
}

export function buildPool(
  profile: Profile,
  offers: readonly SnapshotOffer[],
  random: Random,
  sizes: PoolSizes = DEFAULT_POOL_SIZES,
): PoolItem[] {
  const { ranked, unmatched } = rankOffers(profile, offers);

  const candidates = ranked
    .slice(0, sizes.candidates)
    .map((entry) => entry.offer);
  const beyondTop = ranked.slice(sizes.candidates).map((entry) => entry.offer);

  const beyondSample = sampled(beyondTop, sizes.beyondTop, random);
  const unmatchedWanted =
    sizes.unmatched + (sizes.beyondTop - beyondSample.length);
  const unmatchedSample = sampled(unmatched, unmatchedWanted, random);

  return [
    ...candidates.map((offer): PoolItem => ({ offer, origin: "candidate" })),
    ...beyondSample.map((offer): PoolItem => ({ offer, origin: "beyond_top" })),
    ...unmatchedSample.map(
      (offer): PoolItem => ({ offer, origin: "unmatched" }),
    ),
  ];
}
