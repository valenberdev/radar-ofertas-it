import type { Country } from "../domain/countries";
import { prefilterOffers } from "../domain/prefilter";
import type { Profile } from "../domain/profile";
import { profileHash } from "../domain/profile-hash";
import {
  scorableOfferHash,
  toScorableOffer,
  type ScorableOffer,
} from "../domain/scorable-offer";
import type { DailyQuota } from "./ports/daily-quota";
import { LlmError } from "./ports/llm-error";
import type { OfferReader, StoredOffer } from "./ports/offer-reader";
import type { OfferScore, OfferScorer } from "./ports/offer-scorer";
import type {
  ScoreCacheKey,
  ScoreEntry,
  ScoreStore,
} from "./ports/score-store";

export const SCORING_BATCH_SIZE = 10;

export interface MatchOffersDeps {
  readonly reader: OfferReader;
  readonly scorer: OfferScorer;
  readonly scores: ScoreStore;
  readonly quota: DailyQuota;
  readonly now: () => Date;
}

export interface MatchOffersInput {
  readonly profile: Profile;
  readonly country: Country;
  readonly limit?: number;
}

export interface OfferMatch {
  readonly offer: StoredOffer;
  readonly matchedSkills: readonly string[];
  readonly score: number;
  readonly reasonEs: string;
  readonly reasonEn: string;
}

export type ScoringStop = "quota" | "error";

export interface MatchOffersResult {
  readonly eligibleCount: number;
  readonly candidateCount: number;
  readonly matches: readonly OfferMatch[];
  readonly unscoredCount: number;
  readonly stoppedBy: ScoringStop | null;
}

async function scorePending(
  deps: MatchOffersDeps,
  profile: Profile,
  key: ScoreCacheKey,
  pending: ReadonlyMap<string, ScorableOffer>,
  known: Map<string, OfferScore>,
): Promise<ScoringStop | null> {
  const entries = [...pending];
  for (let start = 0; start < entries.length; start += SCORING_BATCH_SIZE) {
    const batch = entries.slice(start, start + SCORING_BATCH_SIZE);
    if (!(await deps.quota.tryConsume(1))) {
      return "quota";
    }

    let results: readonly (OfferScore | null)[];
    try {
      results = await deps.scorer.score(
        profile,
        batch.map(([, offer]) => offer),
      );
    } catch (error) {
      if (error instanceof LlmError && error.kind !== "rejected") {
        return error.kind === "quota" ? "quota" : "error";
      }
      throw error;
    }

    const fresh: ScoreEntry[] = [];
    batch.forEach(([offerHash], index) => {
      const score = results[index];
      if (score !== undefined && score !== null) {
        known.set(offerHash, score);
        fresh.push({ offerHash, score });
      }
    });
    if (fresh.length > 0) {
      await deps.scores.saveMany(key, fresh, deps.now());
    }
  }
  return null;
}

export async function matchOffers(
  deps: MatchOffersDeps,
  input: MatchOffersInput,
): Promise<MatchOffersResult> {
  const eligible = await deps.reader.listEligible({
    country: input.country,
    now: deps.now(),
  });
  const candidates = prefilterOffers(input.profile, eligible, input.limit);

  const prepared = candidates.map((candidate) => {
    const scorable = toScorableOffer(candidate.offer);
    return { candidate, scorable, hash: scorableOfferHash(scorable) };
  });

  const key: ScoreCacheKey = {
    profileHash: profileHash(input.profile),
    scorerId: deps.scorer.id,
  };
  const hashes = [...new Set(prepared.map((item) => item.hash))];
  const known = new Map(
    hashes.length === 0 ? [] : await deps.scores.findMany(key, hashes),
  );

  const pending = new Map<string, ScorableOffer>();
  for (const item of prepared) {
    if (!known.has(item.hash)) {
      pending.set(item.hash, item.scorable);
    }
  }

  const stoppedBy = await scorePending(
    deps,
    input.profile,
    key,
    pending,
    known,
  );

  const matches = prepared
    .flatMap(({ candidate, hash }): OfferMatch[] => {
      const score = known.get(hash);
      return score === undefined
        ? []
        : [
            {
              offer: candidate.offer,
              matchedSkills: candidate.matchedSkills,
              score: score.score,
              reasonEs: score.reasonEs,
              reasonEn: score.reasonEn,
            },
          ];
    })
    .sort((first, second) => second.score - first.score);

  return {
    eligibleCount: eligible.length,
    candidateCount: candidates.length,
    matches,
    unscoredCount: candidates.length - matches.length,
    stoppedBy,
  };
}
