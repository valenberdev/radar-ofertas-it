import { describe, expect, it } from "vitest";
import type { MatchOffersResult } from "../../../src/application/match-offers";
import type { StoredOffer } from "../../../src/application/ports/offer-reader";
import { safeUrl, toSearchView } from "../../../src/app/_search/search-view";
import { buildProfile } from "../../../src/domain/profile";
import { WORLDWIDE } from "../../../src/domain/region";

function offer(id: string, overrides: Partial<StoredOffer> = {}): StoredOffer {
  return {
    id,
    source: "himalayas",
    sourceId: `s-${id}`,
    title: `Offer ${id}`,
    company: "Acme",
    url: `https://example.com/${id}`,
    description: "A long description that the browser does not need",
    postedAt: new Date("2026-11-10T12:00:00.000Z"),
    expiresAt: null,
    firstSeenAt: new Date("2026-11-09T08:00:00.000Z"),
    region: WORLDWIDE,
    ...overrides,
  };
}

const PROFILE = buildProfile({
  seniority: "junior",
  yearsOfExperience: 1,
  skills: [
    { name: "Node.js", aliases: ["node"] },
    { name: "SQL", aliases: [] },
  ],
});

function match(overrides: Partial<MatchOffersResult> = {}): MatchOffersResult {
  return {
    eligibleCount: 40,
    candidateCount: 3,
    matches: [
      {
        offer: offer("1"),
        matchedSkills: ["Node.js"],
        score: 90,
        reasonEs: "Encaja",
        reasonEn: "Fits",
      },
      {
        offer: offer("2"),
        matchedSkills: ["SQL"],
        score: 40,
        reasonEs: "Parcial",
        reasonEn: "Partial",
      },
    ],
    unscored: [
      {
        offer: offer("3", { postedAt: null, company: null }),
        matchedSkills: ["Node.js", "SQL"],
      },
    ],
    unscoredCount: 1,
    stoppedBy: "quota",
    ...overrides,
  };
}

describe("safeUrl", () => {
  it.each([
    "https://example.com/a?b=1&c=2#d",
    "http://example.com",
    "HTTPS://Example.com/Jobs/A",
  ])("keeps %s exactly as it is", (url) => {
    expect(safeUrl(url)).toBe(url);
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,hi",
    "mailto:a@b.com",
    "/relative/path",
    "not a url",
    "",
  ])("rejects %j", (url) => {
    expect(safeUrl(url)).toBeNull();
  });
});

describe("toSearchView", () => {
  const view = toSearchView({
    ok: true,
    profile: PROFILE,
    profileFromCache: true,
    match: match(),
  });

  it("summarizes the profile without the aliases", () => {
    expect(view.profile).toEqual({
      seniority: "junior",
      yearsOfExperience: 1,
      skills: ["Node.js", "SQL"],
    });
  });

  it("lists the scored offers first, in their order, and then the unscored ones", () => {
    expect(view.offers.map((entry) => [entry.id, entry.score])).toEqual([
      ["1", 90],
      ["2", 40],
      ["3", null],
    ]);
  });

  it("keeps both reasons of a scored offer", () => {
    expect(view.offers[0]?.reason).toEqual({ es: "Encaja", en: "Fits" });
  });

  it("has no reason for an unscored offer", () => {
    expect(view.offers[2]?.reason).toBeNull();
  });

  it("sends what the list needs", () => {
    expect(view.offers[0]).toEqual({
      id: "1",
      source: "himalayas",
      title: "Offer 1",
      company: "Acme",
      url: "https://example.com/1",
      postedAt: "2026-11-10T12:00:00.000Z",
      firstSeenAt: "2026-11-09T08:00:00.000Z",
      matchedSkills: ["Node.js"],
      score: 90,
      reason: { es: "Encaja", en: "Fits" },
    });
  });

  it("does not send the description to the browser", () => {
    expect(JSON.stringify(view)).not.toContain("long description");
  });

  it("keeps a missing company and date", () => {
    expect(view.offers[2]).toMatchObject({
      company: null,
      postedAt: null,
      matchedSkills: ["Node.js", "SQL"],
    });
  });

  it("drops a link that is not http", () => {
    const unsafe = toSearchView({
      ok: true,
      profile: PROFILE,
      profileFromCache: false,
      match: match({
        matches: [],
        unscored: [
          {
            offer: offer("9", { url: "javascript:alert(1)" }),
            matchedSkills: [],
          },
        ],
      }),
    });

    expect(unsafe.offers[0]?.url).toBeNull();
  });

  it("carries the counts, the cache flag and why the scoring stopped", () => {
    expect(view).toMatchObject({
      profileFromCache: true,
      eligibleCount: 40,
      unscoredCount: 1,
      scoringStoppedBy: "quota",
    });
  });

  it("can be sent as JSON without losing anything", () => {
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });
});
