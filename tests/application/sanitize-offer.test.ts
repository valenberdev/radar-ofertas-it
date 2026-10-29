import { describe, expect, it } from "vitest";
import { sanitizeOffer } from "../../src/application/sanitize-offer";
import type { JsonValue, SourceOffer } from "../../src/domain/source-offer";

const NUL = String.fromCharCode(0);
const REPLACEMENT = String.fromCharCode(0xfffd);
const HIGH = String.fromCharCode(0xd83d);
const LOW = String.fromCharCode(0xde00);
const GRIN = HIGH + LOW;
const ROCKET = String.fromCodePoint(0x1f680);

function makeOffer(overrides: Partial<SourceOffer> = {}): SourceOffer {
  return {
    source: "himalayas",
    sourceId: "https://himalayas.app/job/1",
    title: "Backend Engineer",
    company: "Acme Corp",
    url: "https://example.com/apply/1",
    description: "We build things.",
    postedAt: new Date("2026-10-01T10:00:00Z"),
    expiresAt: new Date("2026-11-01T10:00:00Z"),
    raw: {
      guid: "https://himalayas.app/job/1",
      tags: ["a", "b"],
      salary: 100,
      remote: true,
      note: null,
    },
    ...overrides,
  };
}

describe("sanitizeOffer", () => {
  it("returns an equal offer when there is nothing to clean", () => {
    const offer = makeOffer();

    expect(sanitizeOffer(offer)).toEqual(offer);
  });

  it("removes NUL characters from every text field", () => {
    const offer = makeOffer({
      sourceId: `id${NUL}1`,
      title: `Back${NUL}end`,
      company: `Ac${NUL}me`,
      url: `https://example.com/${NUL}apply`,
      description: `${NUL}We build${NUL} things.${NUL}`,
    });

    const cleaned = sanitizeOffer(offer);

    expect(cleaned.sourceId).toBe("id1");
    expect(cleaned.title).toBe("Backend");
    expect(cleaned.company).toBe("Acme");
    expect(cleaned.url).toBe("https://example.com/apply");
    expect(cleaned.description).toBe("We build things.");
  });

  it("keeps a missing company as null", () => {
    expect(sanitizeOffer(makeOffer({ company: null })).company).toBeNull();
  });

  it("keeps dates untouched", () => {
    const cleaned = sanitizeOffer(makeOffer());

    expect(cleaned.postedAt?.toISOString()).toBe("2026-10-01T10:00:00.000Z");
    expect(cleaned.expiresAt?.toISOString()).toBe("2026-11-01T10:00:00.000Z");
  });

  it("keeps missing dates as null", () => {
    const cleaned = sanitizeOffer(
      makeOffer({ postedAt: null, expiresAt: null }),
    );

    expect(cleaned.postedAt).toBeNull();
    expect(cleaned.expiresAt).toBeNull();
  });

  it("keeps the source", () => {
    expect(sanitizeOffer(makeOffer({ source: "hackernews" })).source).toBe(
      "hackernews",
    );
  });

  describe("raw", () => {
    it("removes NUL characters from nested strings, arrays and keys", () => {
      const raw: JsonValue = {
        [`ke${NUL}y`]: `va${NUL}lue`,
        list: [`a${NUL}`, { deep: `b${NUL}` }],
        nested: { inner: { text: `${NUL}x` } },
      };

      const cleaned = sanitizeOffer(makeOffer({ raw })).raw;

      expect(cleaned).toEqual({
        key: "value",
        list: ["a", { deep: "b" }],
        nested: { inner: { text: "x" } },
      });
    });

    it("leaves numbers, booleans and null alone", () => {
      const raw: JsonValue = {
        n: 1.5,
        t: true,
        f: false,
        z: null,
        list: [1, null, false],
      };

      expect(sanitizeOffer(makeOffer({ raw })).raw).toEqual(raw);
    });

    it("handles a raw value that is not an object", () => {
      expect(sanitizeOffer(makeOffer({ raw: `a${NUL}b` })).raw).toBe("ab");
      expect(sanitizeOffer(makeOffer({ raw: [1, `c${NUL}`] })).raw).toEqual([
        1,
        "c",
      ]);
      expect(sanitizeOffer(makeOffer({ raw: null })).raw).toBeNull();
    });

    it("keeps a key called __proto__ as an own key", () => {
      const raw = JSON.parse(
        '{"__proto__": {"a": "x\\u0000y"}, "b": 1}',
      ) as JsonValue;

      const cleaned = sanitizeOffer(makeOffer({ raw })).raw as {
        [key: string]: JsonValue;
      };

      expect(Object.keys(cleaned)).toEqual(["__proto__", "b"]);
      expect(JSON.stringify(cleaned)).toBe('{"__proto__":{"a":"xy"},"b":1}');
    });
  });

  describe("lone surrogates", () => {
    it("replaces a lone high surrogate with the replacement character", () => {
      expect(sanitizeOffer(makeOffer({ title: `a${HIGH}b` })).title).toBe(
        `a${REPLACEMENT}b`,
      );
    });

    it("replaces a lone low surrogate with the replacement character", () => {
      expect(sanitizeOffer(makeOffer({ title: `a${LOW}b` })).title).toBe(
        `a${REPLACEMENT}b`,
      );
    });

    it("replaces a lone surrogate at the end of the text", () => {
      expect(
        sanitizeOffer(makeOffer({ description: `cut here${HIGH}` }))
          .description,
      ).toBe(`cut here${REPLACEMENT}`);
    });

    it("keeps valid surrogate pairs", () => {
      expect(
        sanitizeOffer(makeOffer({ title: `Rocket ${ROCKET} engineer` })).title,
      ).toBe(`Rocket ${ROCKET} engineer`);
    });

    it("replaces only the unpaired one in a run of surrogates", () => {
      expect(sanitizeOffer(makeOffer({ title: HIGH + GRIN })).title).toBe(
        REPLACEMENT + GRIN,
      );
    });

    it("cleans lone surrogates inside raw, keys included", () => {
      const raw: JsonValue = { [`k${HIGH}`]: [`v${LOW}`] };

      expect(sanitizeOffer(makeOffer({ raw })).raw).toEqual({
        [`k${REPLACEMENT}`]: [`v${REPLACEMENT}`],
      });
    });

    it("produces text that serializes without surrogate escapes", () => {
      const cleaned = sanitizeOffer(
        makeOffer({ raw: { text: `a${HIGH}` } }),
      ).raw;

      expect(JSON.stringify(cleaned)).not.toMatch(/\\ud[89ab]/i);
    });
  });

  it("does not modify the offer it receives", () => {
    const offer = makeOffer({ title: `Back${NUL}end`, raw: { a: `x${NUL}` } });

    sanitizeOffer(offer);

    expect(offer.title).toBe(`Back${NUL}end`);
    expect(offer.raw).toEqual({ a: `x${NUL}` });
  });
});
