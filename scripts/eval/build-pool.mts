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

export const DEFAULT_POOL_SIZES: PoolSizes = {
  candidates: DEFAULT_TOP_K,
  beyondTop: 8,
  unmatched: 7,
};

export function buildPool(
  profile: Profile,
  offers: readonly SnapshotOffer[],
  random: Random,
  sizes: PoolSizes = DEFAULT_POOL_SIZES,
): PoolItem[] {
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

  const candidates = matches
    .slice(0, sizes.candidates)
    .map((match) => match.offer.offer);
  const beyondTop = matches
    .slice(sizes.candidates)
    .map((match) => match.offer.offer);
  const unmatched = prepared
    .filter((item) => !matchedIds.has(item.id))
    .map((item) => item.offer);

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
