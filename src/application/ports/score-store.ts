import type { OfferScore } from "./offer-scorer";

export interface ScoreCacheKey {
  readonly profileHash: string;
  readonly scorerId: string;
}

export interface ScoreEntry {
  readonly offerHash: string;
  readonly score: OfferScore;
}

export interface ScoreStore {
  findMany(
    key: ScoreCacheKey,
    offerHashes: readonly string[],
  ): Promise<ReadonlyMap<string, OfferScore>>;
  saveMany(
    key: ScoreCacheKey,
    entries: readonly ScoreEntry[],
    at: Date,
  ): Promise<void>;
}
