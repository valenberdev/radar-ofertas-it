import { describe, expect, it, vi } from "vitest";
import {
  matchOffers,
  SCORING_BATCH_SIZE,
  type MatchOffersDeps,
} from "../../src/application/match-offers";
import type { DailyQuota } from "../../src/application/ports/daily-quota";
import { LlmError } from "../../src/application/ports/llm-error";
import type {
  OfferReader,
  StoredOffer,
} from "../../src/application/ports/offer-reader";
import type {
  OfferScore,
  OfferScorer,
} from "../../src/application/ports/offer-scorer";
import type {
  ScoreCacheKey,
  ScoreStore,
} from "../../src/application/ports/score-store";
import { DEFAULT_TOP_K } from "../../src/domain/prefilter";
import { buildProfile } from "../../src/domain/profile";
import { profileHash } from "../../src/domain/profile-hash";
import {
  scorableOfferHash,
  toScorableOffer,
  type ScorableOffer,
} from "../../src/domain/scorable-offer";

const NOW = new Date("2026-11-10T12:00:00Z");
const PROFILE = buildProfile({ skills: [{ name: "Docker", aliases: [] }] });

function storedOffer(
  id: number,
  overrides: Partial<StoredOffer> = {},
): StoredOffer {
  return {
    id: String(id),
    source: "himalayas",
    sourceId: `s-${id}`,
    title: `Offer ${id}`,
    company: "Acme",
    url: `https://example.com/${id}`,
    description: `We use Docker (${id})`,
    postedAt: null,
    expiresAt: null,
    region: { kind: "worldwide" },
    ...overrides,
  };
}

function numbered(count: number): StoredOffer[] {
  return Array.from({ length: count }, (_, index) => storedOffer(index + 1));
}

function offerNumber(offer: ScorableOffer): number {
  return Number(/^Offer (\d+)$/.exec(offer.title)?.[1]);
}

interface Setup {
  readonly offers?: readonly StoredOffer[];
  readonly cached?: ReadonlyMap<string, OfferScore>;
  readonly scoreOf?: (offer: ScorableOffer) => number;
  readonly quotaAllows?: (call: number) => boolean;
  readonly scoreImplementation?: OfferScorer["score"];
}

function setup(options: Setup = {}) {
  const offers = options.offers ?? [];
  const stored = new Map<string, OfferScore>(options.cached ?? []);
  const listEligible = vi.fn<OfferReader["listEligible"]>(async () => offers);
  const findMany = vi.fn<ScoreStore["findMany"]>(async (_key, hashes) => {
    return new Map(
      hashes.flatMap((hash) =>
        stored.has(hash)
          ? [[hash, stored.get(hash) as OfferScore] as const]
          : [],
      ),
    );
  });
  const saveMany = vi.fn<ScoreStore["saveMany"]>(async (_key, entries) => {
    for (const entry of entries) {
      stored.set(entry.offerHash, entry.score);
    }
  });
  let quotaCalls = 0;
  const tryConsume = vi.fn<DailyQuota["tryConsume"]>(async () => {
    quotaCalls += 1;
    return options.quotaAllows?.(quotaCalls) ?? true;
  });
  const scoreOf =
    options.scoreOf ?? ((offer: ScorableOffer) => offerNumber(offer));
  const score = vi.fn<OfferScorer["score"]>(
    options.scoreImplementation ??
      (async (_profile, scorables) =>
        scorables.map((scorable) => ({
          score: scoreOf(scorable),
          reasonEs: "motivo",
          reasonEn: "reason",
        }))),
  );
  const deps: MatchOffersDeps = {
    reader: { listEligible },
    scorer: { id: "scorer-a", score },
    scores: { findMany, saveMany },
    quota: { tryConsume },
    now: () => NOW,
  };
  return { deps, listEligible, findMany, saveMany, tryConsume, score, stored };
}

function matchedIds(result: {
  matches: readonly { offer: StoredOffer }[];
}): string[] {
  return result.matches.map((match) => match.offer.id);
}

describe("SCORING_BATCH_SIZE", () => {
  it("is 10 offers per call", () => {
    expect(SCORING_BATCH_SIZE).toBe(10);
  });
});

describe("matchOffers", () => {
  describe("reading and prefiltering", () => {
    it("asks the reader for the offers of the country at the current time", async () => {
      const { deps, listEligible } = setup();

      await matchOffers(deps, { profile: PROFILE, country: "Argentina" });

      expect(listEligible).toHaveBeenCalledExactlyOnceWith({
        country: "Argentina",
        now: NOW,
      });
    });

    it("returns an empty result without touching the store, the quota or the scorer when nothing is eligible", async () => {
      const { deps, findMany, tryConsume, score } = setup();

      expect(
        await matchOffers(deps, { profile: PROFILE, country: "Argentina" }),
      ).toEqual({
        eligibleCount: 0,
        candidateCount: 0,
        matches: [],
        unscoredCount: 0,
        stoppedBy: null,
      });
      expect(findMany).not.toHaveBeenCalled();
      expect(tryConsume).not.toHaveBeenCalled();
      expect(score).not.toHaveBeenCalled();
    });

    it("leaves out the offers that mention no skill of the profile", async () => {
      const { deps, score } = setup({
        offers: [storedOffer(1, { description: "Cooking" }), storedOffer(2)],
      });

      const result = await matchOffers(deps, {
        profile: PROFILE,
        country: "Argentina",
      });

      expect(result.eligibleCount).toBe(2);
      expect(result.candidateCount).toBe(1);
      expect(matchedIds(result)).toEqual(["2"]);
      expect(score.mock.calls[0]?.[1]).toHaveLength(1);
    });

    it(`scores at most ${DEFAULT_TOP_K} candidates by default`, async () => {
      const { deps } = setup({ offers: numbered(DEFAULT_TOP_K + 5) });

      const result = await matchOffers(deps, {
        profile: PROFILE,
        country: "Argentina",
      });

      expect(result.eligibleCount).toBe(DEFAULT_TOP_K + 5);
      expect(result.candidateCount).toBe(DEFAULT_TOP_K);
    });

    it("scores at most the requested number of candidates", async () => {
      const { deps } = setup({ offers: numbered(12) });

      const result = await matchOffers(deps, {
        profile: PROFILE,
        country: "Argentina",
        limit: 4,
      });

      expect(result.candidateCount).toBe(4);
      expect(result.matches).toHaveLength(4);
    });

    it("returns the matched skills of every offer", async () => {
      const profile = buildProfile({
        skills: [
          { name: "Docker", aliases: [] },
          { name: "Rust", aliases: [] },
        ],
      });
      const { deps } = setup({
        offers: [storedOffer(1, { description: "Docker and Rust" })],
      });

      const result = await matchOffers(deps, { profile, country: "Argentina" });

      expect(result.matches[0]?.matchedSkills).toEqual(["Docker", "Rust"]);
    });
  });

  describe("scoring", () => {
    it("returns the offers with their score and reasons, best first", async () => {
      const { deps } = setup({
        offers: numbered(3),
        scoreOf: (offer) => [0, 40, 90, 10][offerNumber(offer)] ?? 0,
      });

      const result = await matchOffers(deps, {
        profile: PROFILE,
        country: "Argentina",
      });

      expect(
        result.matches.map((match) => [match.offer.id, match.score]),
      ).toEqual([
        ["2", 90],
        ["1", 40],
        ["3", 10],
      ]);
      expect(result.matches[0]).toMatchObject({
        reasonEs: "motivo",
        reasonEn: "reason",
      });
      expect(result.unscoredCount).toBe(0);
      expect(result.stoppedBy).toBeNull();
    });

    it("keeps the prefilter order between offers with the same score", async () => {
      const offers = [
        storedOffer(1, { postedAt: new Date("2026-11-01T00:00:00Z") }),
        storedOffer(2, { postedAt: new Date("2026-11-05T00:00:00Z") }),
        storedOffer(3, { postedAt: new Date("2026-11-03T00:00:00Z") }),
      ];
      const { deps } = setup({ offers, scoreOf: () => 50 });

      const result = await matchOffers(deps, {
        profile: PROFILE,
        country: "Argentina",
      });

      expect(matchedIds(result)).toEqual(["2", "3", "1"]);
    });

    it("sends the scorer the profile and the redacted offers", async () => {
      const { deps, score } = setup({
        offers: [
          storedOffer(1, {
            description: "Docker. Write to jobs@acme.com",
            company: "  Acme  ",
          }),
        ],
      });

      await matchOffers(deps, { profile: PROFILE, country: "Argentina" });

      expect(score).toHaveBeenCalledExactlyOnceWith(PROFILE, [
        {
          title: "Offer 1",
          company: "Acme",
          description: "Docker. Write to [EMAIL]",
        },
      ]);
    });

    it("returns the original offer, not the redacted one", async () => {
      const original = storedOffer(1, {
        description: "Docker. Write to jobs@acme.com",
      });
      const { deps } = setup({ offers: [original] });

      const result = await matchOffers(deps, {
        profile: PROFILE,
        country: "Argentina",
      });

      expect(result.matches[0]?.offer).toBe(original);
    });

    it("looks in the cache with the hash of the profile and the id of the scorer", async () => {
      const { deps, findMany } = setup({ offers: [storedOffer(1)] });

      await matchOffers(deps, { profile: PROFILE, country: "Argentina" });

      const expectedKey: ScoreCacheKey = {
        profileHash: profileHash(PROFILE),
        scorerId: "scorer-a",
      };
      expect(findMany).toHaveBeenCalledExactlyOnceWith(expectedKey, [
        scorableOfferHash(toScorableOffer(storedOffer(1))),
      ]);
    });

    it("saves the fresh scores with the key, the hashes and the current time", async () => {
      const { deps, saveMany } = setup({ offers: numbered(2) });

      await matchOffers(deps, { profile: PROFILE, country: "Argentina" });

      expect(saveMany).toHaveBeenCalledTimes(1);
      const [key, entries, at] = saveMany.mock.calls[0] ?? [];
      expect(key).toEqual({
        profileHash: profileHash(PROFILE),
        scorerId: "scorer-a",
      });
      expect(at).toEqual(NOW);
      expect(entries).toHaveLength(2);
      expect(entries?.map((entry) => entry.offerHash).sort()).toEqual(
        numbered(2)
          .map((offer) => scorableOfferHash(toScorableOffer(offer)))
          .sort(),
      );
    });
  });

  describe("cache", () => {
    it("does not score nor consume quota when every score is cached", async () => {
      const first = setup({ offers: numbered(3) });
      await matchOffers(first.deps, { profile: PROFILE, country: "Argentina" });
      const second = setup({ offers: numbered(3), cached: first.stored });

      const result = await matchOffers(second.deps, {
        profile: PROFILE,
        country: "Argentina",
      });

      expect(second.score).not.toHaveBeenCalled();
      expect(second.tryConsume).not.toHaveBeenCalled();
      expect(second.saveMany).not.toHaveBeenCalled();
      expect(result.matches).toHaveLength(3);
      expect(result.stoppedBy).toBeNull();
    });

    it("scores only the offers that are not cached", async () => {
      const cached = new Map<string, OfferScore>([
        [
          scorableOfferHash(toScorableOffer(storedOffer(1))),
          { score: 77, reasonEs: "guardado", reasonEn: "stored" },
        ],
      ]);
      const { deps, score } = setup({ offers: numbered(2), cached });

      const result = await matchOffers(deps, {
        profile: PROFILE,
        country: "Argentina",
      });

      expect(score.mock.calls[0]?.[1].map(offerNumber)).toEqual([2]);
      expect(
        result.matches.find((match) => match.offer.id === "1"),
      ).toMatchObject({
        score: 77,
        reasonEs: "guardado",
        reasonEn: "stored",
      });
    });

    it("uses the cached scores even when the quota is exhausted", async () => {
      const cached = new Map<string, OfferScore>([
        [
          scorableOfferHash(toScorableOffer(storedOffer(1))),
          { score: 77, reasonEs: "a", reasonEn: "b" },
        ],
      ]);
      const { deps, score } = setup({
        offers: numbered(2),
        cached,
        quotaAllows: () => false,
      });

      const result = await matchOffers(deps, {
        profile: PROFILE,
        country: "Argentina",
      });

      expect(matchedIds(result)).toEqual(["1"]);
      expect(result.unscoredCount).toBe(1);
      expect(result.stoppedBy).toBe("quota");
      expect(score).not.toHaveBeenCalled();
    });

    it("scores once the offers that look the same after cleaning, and returns all of them", async () => {
      const offers = [
        storedOffer(1, { title: "Same", description: "Docker  jobs@a.com" }),
        storedOffer(2, { title: "Same", description: "Docker jobs@b.com" }),
      ];
      const { deps, score } = setup({ offers, scoreOf: () => 60 });

      const result = await matchOffers(deps, {
        profile: PROFILE,
        country: "Argentina",
      });

      expect(score.mock.calls[0]?.[1]).toHaveLength(1);
      expect(result.matches).toHaveLength(2);
      expect(result.unscoredCount).toBe(0);
    });
  });

  describe("batches and quota", () => {
    it("scores in batches and consumes one unit of quota per batch", async () => {
      const { deps, score, tryConsume } = setup({ offers: numbered(25) });

      const result = await matchOffers(deps, {
        profile: PROFILE,
        country: "Argentina",
      });

      expect(score.mock.calls.map((call) => call[1].length)).toEqual([
        10, 10, 5,
      ]);
      expect(tryConsume).toHaveBeenCalledTimes(3);
      expect(tryConsume).toHaveBeenNthCalledWith(1, 1);
      expect(result.matches).toHaveLength(25);
      expect(result.stoppedBy).toBeNull();
    });

    it("scores the best candidates first", async () => {
      const offers = [
        ...numbered(12),
        storedOffer(13, { title: "Docker engineer" }),
      ];
      const { deps, score } = setup({ offers, scoreOf: () => 1 });

      await matchOffers(deps, { profile: PROFILE, country: "Argentina" });

      expect(score.mock.calls[0]?.[1][0]?.title).toBe("Docker engineer");
    });

    it("asks for the quota before every call and not again after it is denied", async () => {
      const { deps, score, tryConsume } = setup({
        offers: numbered(25),
        quotaAllows: (call) => call < 2,
      });

      await matchOffers(deps, { profile: PROFILE, country: "Argentina" });

      expect(tryConsume).toHaveBeenCalledTimes(2);
      expect(score).toHaveBeenCalledTimes(1);
    });

    it("keeps and saves what was scored before the quota ran out", async () => {
      const { deps, saveMany } = setup({
        offers: numbered(25),
        quotaAllows: (call) => call < 2,
      });

      const result = await matchOffers(deps, {
        profile: PROFILE,
        country: "Argentina",
      });

      expect(result.matches).toHaveLength(10);
      expect(result.candidateCount).toBe(25);
      expect(result.unscoredCount).toBe(15);
      expect(result.stoppedBy).toBe("quota");
      expect(saveMany).toHaveBeenCalledTimes(1);
      expect(saveMany.mock.calls[0]?.[1]).toHaveLength(10);
    });

    it("does not call the scorer when the quota is denied from the start", async () => {
      const { deps, score, saveMany } = setup({
        offers: numbered(3),
        quotaAllows: () => false,
      });

      const result = await matchOffers(deps, {
        profile: PROFILE,
        country: "Argentina",
      });

      expect(score).not.toHaveBeenCalled();
      expect(saveMany).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        matches: [],
        unscoredCount: 3,
        stoppedBy: "quota",
      });
    });

    it("saves each batch right after scoring it", async () => {
      const events: string[] = [];
      const { deps, saveMany, score } = setup({ offers: numbered(15) });
      score.mockImplementation(async (_profile, scorables) => {
        events.push(`score ${scorables.length}`);
        return scorables.map(() => ({
          score: 50,
          reasonEs: "a",
          reasonEn: "b",
        }));
      });
      saveMany.mockImplementation(async (_key, entries) => {
        events.push(`save ${entries.length}`);
      });

      await matchOffers(deps, { profile: PROFILE, country: "Argentina" });

      expect(events).toEqual(["score 10", "save 10", "score 5", "save 5"]);
    });
  });

  describe("scorer failures", () => {
    it.each([
      ["quota", "quota"],
      ["unavailable", "error"],
      ["invalid_response", "error"],
    ] as const)(
      "stops without failing on an LlmError of kind %s",
      async (kind, stoppedBy) => {
        const { deps } = setup({
          offers: numbered(3),
          scoreImplementation: async () => {
            throw new LlmError(kind, "failed");
          },
        });

        const result = await matchOffers(deps, {
          profile: PROFILE,
          country: "Argentina",
        });

        expect(result).toMatchObject({
          matches: [],
          unscoredCount: 3,
          candidateCount: 3,
          stoppedBy,
        });
      },
    );

    it("keeps the batches scored before the failure and does not try the following ones", async () => {
      let calls = 0;
      const { deps, score, saveMany } = setup({
        offers: numbered(25),
        scoreImplementation: async (_profile, scorables) => {
          calls += 1;
          if (calls === 2) {
            throw new LlmError("unavailable", "down");
          }
          return scorables.map(() => ({
            score: 50,
            reasonEs: "a",
            reasonEn: "b",
          }));
        },
      });

      const result = await matchOffers(deps, {
        profile: PROFILE,
        country: "Argentina",
      });

      expect(score).toHaveBeenCalledTimes(2);
      expect(result.matches).toHaveLength(10);
      expect(result.unscoredCount).toBe(15);
      expect(result.stoppedBy).toBe("error");
      expect(saveMany).toHaveBeenCalledTimes(1);
    });

    it("does not give the quota back after a failure", async () => {
      const { deps, tryConsume } = setup({
        offers: numbered(3),
        scoreImplementation: async () => {
          throw new LlmError("unavailable", "down");
        },
      });

      await matchOffers(deps, { profile: PROFILE, country: "Argentina" });

      expect(tryConsume).toHaveBeenCalledTimes(1);
    });

    it("lets a rejected LlmError through", async () => {
      const error = new LlmError("rejected", "bad request");
      const { deps } = setup({
        offers: numbered(3),
        scoreImplementation: async () => {
          throw error;
        },
      });

      await expect(
        matchOffers(deps, { profile: PROFILE, country: "Argentina" }),
      ).rejects.toBe(error);
    });

    it("lets any other error through", async () => {
      const error = new Error("bug");
      const { deps } = setup({
        offers: numbered(3),
        scoreImplementation: async () => {
          throw error;
        },
      });

      await expect(
        matchOffers(deps, { profile: PROFILE, country: "Argentina" }),
      ).rejects.toBe(error);
    });

    it("leaves unscored the offers the scorer could not score, and goes on with the next batch", async () => {
      let calls = 0;
      const { deps, saveMany } = setup({
        offers: numbered(15),
        scoreImplementation: async (_profile, scorables) => {
          calls += 1;
          return scorables.map((_scorable, index) =>
            calls === 1 && index % 2 === 0
              ? null
              : { score: 50, reasonEs: "a", reasonEn: "b" },
          );
        },
      });

      const result = await matchOffers(deps, {
        profile: PROFILE,
        country: "Argentina",
      });

      expect(result.matches).toHaveLength(10);
      expect(result.unscoredCount).toBe(5);
      expect(result.stoppedBy).toBeNull();
      expect(saveMany.mock.calls.map((call) => call[1].length)).toEqual([5, 5]);
    });

    it("does not save anything when the scorer could score none of the offers", async () => {
      const { deps, saveMany } = setup({
        offers: numbered(3),
        scoreImplementation: async (_profile, scorables) =>
          scorables.map(() => null),
      });

      const result = await matchOffers(deps, {
        profile: PROFILE,
        country: "Argentina",
      });

      expect(saveMany).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        matches: [],
        unscoredCount: 3,
        stoppedBy: null,
      });
    });

    it("treats the missing results of a short answer as unscored", async () => {
      const { deps } = setup({
        offers: numbered(3),
        scoreImplementation: async () => [
          { score: 50, reasonEs: "a", reasonEn: "b" },
        ],
      });

      const result = await matchOffers(deps, {
        profile: PROFILE,
        country: "Argentina",
      });

      expect(result.matches).toHaveLength(1);
      expect(result.unscoredCount).toBe(2);
    });

    it("lets a store error through", async () => {
      const error = new Error("database down");
      const { deps, saveMany } = setup({ offers: numbered(2) });
      saveMany.mockRejectedValue(error);

      await expect(
        matchOffers(deps, { profile: PROFILE, country: "Argentina" }),
      ).rejects.toBe(error);
    });
  });
});
