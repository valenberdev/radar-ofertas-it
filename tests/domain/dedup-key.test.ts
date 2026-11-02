import { describe, expect, it } from "vitest";
import { dedupKey } from "../../src/domain/dedup-key";
import type { SourceOffer } from "../../src/domain/source-offer";

function himalayas(overrides: Partial<SourceOffer> = {}): SourceOffer {
  return {
    source: "himalayas",
    sourceId: "https://himalayas.app/jobs/1",
    title: "React Engineer - Remote, Latin America",
    company: "Bluelight Consulting",
    url: "https://himalayas.app/jobs/1?utm_source=api",
    description: "<p>We are hiring a React engineer.</p>",
    postedAt: new Date("2026-11-01T12:32:02Z"),
    expiresAt: new Date("2026-12-01T12:32:02Z"),
    region: { kind: "countries", countries: ["Argentina", "Brazil"] },
    raw: { guid: "https://himalayas.app/jobs/1" },
    ...overrides,
  };
}

function hackerNews(overrides: Partial<SourceOffer> = {}): SourceOffer {
  return {
    source: "hackernews",
    sourceId: "49900001",
    title: "Oklo | Remote (US) or Santa Clara | Full time",
    company: "Oklo",
    url: "https://news.ycombinator.com/item?id=49900001",
    description:
      "Oklo | Remote (US) or Santa Clara | Full time\n\nWe build reactors.",
    postedAt: new Date("2026-10-02T09:00:00Z"),
    expiresAt: new Date("2026-11-16T09:00:00Z"),
    region: { kind: "countries", countries: ["United States"] },
    raw: { id: 49900001 },
    ...overrides,
  };
}

describe("dedupKey", () => {
  it("is a sha-256 digest in hexadecimal", () => {
    expect(dedupKey(himalayas())).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is the same for the same offer every time", () => {
    expect(dedupKey(himalayas())).toBe(dedupKey(himalayas()));
  });

  describe("Himalayas", () => {
    it("ignores everything that is not company, title and description", () => {
      const variant = himalayas({
        sourceId: "https://himalayas.app/jobs/2",
        url: "https://himalayas.app/jobs/2?utm_source=api",
        postedAt: new Date("2026-11-01T13:17:32Z"),
        expiresAt: null,
        region: { kind: "countries", countries: ["Chile"] },
        raw: { guid: "https://himalayas.app/jobs/2", extra: true },
      });

      expect(dedupKey(variant)).toBe(dedupKey(himalayas()));
    });

    it.each([
      ["company", { company: "Mercor" }],
      ["title", { title: "React Native Engineer - Remote, Latin America" }],
      [
        "description",
        {
          description:
            "<p>We are hiring a React engineer for another team.</p>",
        },
      ],
    ])("changes when the %s changes", (_field, overrides) => {
      expect(dedupKey(himalayas(overrides))).not.toBe(dedupKey(himalayas()));
    });

    it("ignores case and extra whitespace in company and title", () => {
      const variant = himalayas({
        company: "  BLUELIGHT   consulting ",
        title: "react engineer -\tRemote,  Latin America\n",
      });

      expect(dedupKey(variant)).toBe(dedupKey(himalayas()));
    });

    it("takes the description exactly as stored", () => {
      expect(
        dedupKey(
          himalayas({ description: "<p>We are hiring a React engineer.</p> " }),
        ),
      ).not.toBe(dedupKey(himalayas()));
      expect(
        dedupKey(
          himalayas({ description: "<P>We are hiring a React engineer.</P>" }),
        ),
      ).not.toBe(dedupKey(himalayas()));
    });

    it("tells an offer without company from one with a company", () => {
      expect(dedupKey(himalayas({ company: null }))).not.toBe(
        dedupKey(himalayas()),
      );
    });

    it("takes a blank company for a missing one", () => {
      expect(dedupKey(himalayas({ company: "   " }))).toBe(
        dedupKey(himalayas({ company: null })),
      );
    });
  });

  describe("Hacker News", () => {
    it("ignores the description, so a renewed post with edited text keeps its key", () => {
      const edited = hackerNews({
        sourceId: "50000002",
        url: "https://news.ycombinator.com/item?id=50000002",
        description:
          "Oklo | Remote (US) or Santa Clara | Full time\n\nWe build reactors and we are growing.",
      });

      expect(dedupKey(edited)).toBe(dedupKey(hackerNews()));
    });

    it.each([
      ["company", { company: "Oklo Inc" }],
      ["header", { title: "Oklo | Remote (EU) | Full time" }],
    ])("changes when the %s changes", (_field, overrides) => {
      expect(dedupKey(hackerNews(overrides))).not.toBe(dedupKey(hackerNews()));
    });

    it("ignores case and extra whitespace in the header", () => {
      const variant = hackerNews({
        title: "OKLO |  remote (us) or  Santa Clara | FULL TIME ",
      });

      expect(dedupKey(variant)).toBe(dedupKey(hackerNews()));
    });

    it("takes a missing company for a blank one", () => {
      expect(dedupKey(hackerNews({ company: null }))).toBe(
        dedupKey(hackerNews({ company: "" })),
      );
    });
  });

  it("never matches offers of different sources", () => {
    const shared = {
      title: "Backend Engineer",
      company: "Acme",
      description: "Same text.",
    };

    expect(dedupKey(himalayas(shared))).not.toBe(dedupKey(hackerNews(shared)));
  });

  it("does not confuse where one field ends and the next begins", () => {
    const first = himalayas({ company: "a|b", title: "c" });
    const second = himalayas({ company: "a", title: "b|c" });

    expect(dedupKey(first)).not.toBe(dedupKey(second));
  });

  it("accepts just the four fields it reads", () => {
    const key = dedupKey({
      source: "himalayas",
      company: null,
      title: "Engineer",
      description: "Text",
    });

    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});
