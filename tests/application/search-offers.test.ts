import { describe, expect, it, vi } from "vitest";
import type { DailyQuota } from "../../src/application/ports/daily-quota";
import { LlmError } from "../../src/application/ports/llm-error";
import type {
  OfferReader,
  StoredOffer,
} from "../../src/application/ports/offer-reader";
import type { OfferScorer } from "../../src/application/ports/offer-scorer";
import type { ProfileExtractor } from "../../src/application/ports/profile-extractor";
import type { ProfileStore } from "../../src/application/ports/profile-store";
import type { ScoreStore } from "../../src/application/ports/score-store";
import {
  searchOffers,
  type SearchOffersDeps,
} from "../../src/application/search-offers";
import {
  buildProfile,
  type Profile,
  type ProfileInput,
} from "../../src/domain/profile";
import { WORLDWIDE } from "../../src/domain/region";

const NOW = new Date("2026-11-11T20:00:00Z");

const INPUT: ProfileInput = {
  seniority: "junior",
  yearsOfExperience: 1,
  skills: [{ name: "Docker", aliases: [] }],
  targetRoles: ["Backend Developer"],
  languages: [],
  summary: "Junior developer.",
};

const OFFER: StoredOffer = {
  id: "1",
  source: "himalayas",
  sourceId: "a",
  title: "Backend Engineer",
  company: "Acme",
  url: "https://example.com/1",
  description: "We use Docker",
  postedAt: NOW,
  expiresAt: null,
  region: WORLDWIDE,
};

interface Setup {
  readonly extractOutcome?: ProfileInput | Error;
  readonly cachedProfile?: Profile;
}

function setup(options: Setup = {}) {
  const extract = vi.fn<ProfileExtractor["extract"]>(async () => {
    const outcome = options.extractOutcome ?? INPUT;
    if (outcome instanceof Error) {
      throw outcome;
    }
    return outcome;
  });
  const listEligible = vi.fn<OfferReader["listEligible"]>(async () => [OFFER]);
  const score = vi.fn<OfferScorer["score"]>(async (_profile, offers) =>
    offers.map(() => ({ score: 80, reasonEs: "Encaja", reasonEn: "Fits" })),
  );
  const tryConsume = vi.fn<DailyQuota["tryConsume"]>(async () => true);
  const quota: DailyQuota = { tryConsume };
  const profiles: ProfileStore = {
    find: async () => options.cachedProfile ?? null,
    save: async () => undefined,
  };
  const scores: ScoreStore = {
    findMany: async () => new Map(),
    saveMany: async () => undefined,
  };
  const deps: SearchOffersDeps = {
    extract: {
      extractor: { id: "extractor", extract },
      profiles,
      quota,
      now: () => NOW,
    },
    match: {
      reader: { listEligible },
      scorer: { id: "scorer", score },
      scores,
      quota,
      now: () => NOW,
    },
  };
  return { deps, extract, listEligible, score, tryConsume };
}

describe("searchOffers", () => {
  it("extracts the profile and scores the matching offers", async () => {
    const { deps, listEligible } = setup();

    const result = await searchOffers(deps, {
      text: "I use Docker",
      country: "Uruguay",
    });

    expect(result).toMatchObject({
      ok: true,
      profile: buildProfile(INPUT),
      profileFromCache: false,
    });
    expect(
      result.ok &&
        result.match.matches.map((match) => [match.offer.id, match.score]),
    ).toEqual([["1", 80]]);
    expect(listEligible).toHaveBeenCalledWith({ country: "Uruguay", now: NOW });
  });

  it("says when the profile came from the cache", async () => {
    const { deps, extract } = setup({ cachedProfile: buildProfile(INPUT) });

    const result = await searchOffers(deps, {
      text: "I use Docker",
      country: "Argentina",
    });

    expect(result.ok && result.profileFromCache).toBe(true);
    expect(extract).not.toHaveBeenCalled();
  });

  it("returns the failure of the extraction without looking for offers", async () => {
    const { deps, listEligible } = setup();

    expect(
      await searchOffers(deps, { text: "   ", country: "Argentina" }),
    ).toEqual({ ok: false, reason: "empty" });
    expect(listEligible).not.toHaveBeenCalled();
  });

  it("reports a profile without skills", async () => {
    const { deps, listEligible } = setup({
      extractOutcome: { ...INPUT, skills: [] },
    });

    expect(
      await searchOffers(deps, { text: "I cook", country: "Argentina" }),
    ).toEqual({ ok: false, reason: "no_skills" });
    expect(listEligible).not.toHaveBeenCalled();
  });

  it("reports an exhausted quota when Gemini answers 429 during the extraction", async () => {
    const { deps, listEligible } = setup({
      extractOutcome: new LlmError("quota", "429"),
    });

    expect(
      await searchOffers(deps, { text: "I use Docker", country: "Argentina" }),
    ).toEqual({ ok: false, reason: "quota_exhausted" });
    expect(listEligible).not.toHaveBeenCalled();
  });

  it.each(["unavailable", "invalid_response"] as const)(
    "reports Gemini as unavailable after %s",
    async (kind) => {
      const { deps } = setup({ extractOutcome: new LlmError(kind, "failed") });

      expect(
        await searchOffers(deps, {
          text: "I use Docker",
          country: "Argentina",
        }),
      ).toEqual({ ok: false, reason: "unavailable" });
    },
  );

  it("throws when Gemini rejects the request, because that is a setup problem", async () => {
    const { deps } = setup({ extractOutcome: new LlmError("rejected", "400") });

    await expect(
      searchOffers(deps, { text: "I use Docker", country: "Argentina" }),
    ).rejects.toThrow("400");
  });

  it("throws errors that do not come from Gemini", async () => {
    const { deps } = setup({ extractOutcome: new Error("database down") });

    await expect(
      searchOffers(deps, { text: "I use Docker", country: "Argentina" }),
    ).rejects.toThrow("database down");
  });

  it("spends one unit for the profile and one for the batch of offers", async () => {
    const { deps, tryConsume } = setup();

    await searchOffers(deps, { text: "I use Docker", country: "Argentina" });

    expect(tryConsume.mock.calls).toEqual([[1], [1]]);
  });
});
