import { describe, expect, it } from "vitest";
import type {
  JsonValue,
  SourceOffer,
} from "../../../../src/domain/source-offer";
import { parseHackerNewsComment } from "../../../../src/infrastructure/sources/hackernews/parse-comment";

type JsonObject = { [key: string]: JsonValue };

const POSTED = 1790000000;

function makeComment(text: string, overrides: JsonObject = {}): JsonObject {
  return {
    id: 49900001,
    by: "someone",
    time: POSTED,
    type: "comment",
    parent: 49900000,
    text,
    ...overrides,
  };
}

function offerFrom(item: JsonValue): SourceOffer {
  const parsed = parseHackerNewsComment(item);
  if (parsed.kind !== "offer") {
    throw new Error(`expected an offer, got ${parsed.kind}`);
  }
  return parsed.offer;
}

describe("parseHackerNewsComment", () => {
  describe("the offer", () => {
    it("maps the fields of a remote job post", () => {
      const item = makeComment(
        "Acme | Backend Engineer | Remote (US) | Full-time<p>We build things.",
      );

      const offer = offerFrom(item);

      expect(offer.source).toBe("hackernews");
      expect(offer.sourceId).toBe("49900001");
      expect(offer.url).toBe("https://news.ycombinator.com/item?id=49900001");
      expect(offer.title).toBe(
        "Acme | Backend Engineer | Remote (US) | Full-time",
      );
      expect(offer.company).toBe("Acme");
      expect(offer.description).toBe(
        "Acme | Backend Engineer | Remote (US) | Full-time\n\nWe build things.",
      );
      expect(offer.postedAt?.toISOString()).toBe(
        new Date(POSTED * 1000).toISOString(),
      );
      expect(offer.raw).toEqual(item);
    });

    it("expires 45 days after it was posted", () => {
      const offer = offerFrom(makeComment("Acme | Engineer | Remote"));

      const difference =
        (offer.expiresAt?.getTime() ?? 0) - (offer.postedAt?.getTime() ?? 0);

      expect(difference).toBe(45 * 24 * 60 * 60 * 1000);
    });

    it("keeps every paragraph in the description and only the first line in the title", () => {
      const offer = offerFrom(
        makeComment(
          "Acme | Engineer | Remote<p>Second paragraph<p>Third paragraph",
        ),
      );

      expect(offer.title).toBe("Acme | Engineer | Remote");
      expect(offer.description).toBe(
        "Acme | Engineer | Remote\n\nSecond paragraph\n\nThird paragraph",
      );
    });

    it("uses the first paragraph as the title when the text starts with a paragraph break", () => {
      const offer = offerFrom(
        makeComment("<p>Acme | Engineer | Remote<p>More"),
      );

      expect(offer.title).toBe("Acme | Engineer | Remote");
    });

    it("decodes entities and links in the title", () => {
      const html =
        'Acme &amp; Co | <a href="https:&#x2F;&#x2F;acme.example&#x2F;" rel="nofollow">https:&#x2F;&#x2F;acme.example&#x2F;</a> | REMOTE(Worldwide) or ONSITE | We&#x27;re hiring';

      expect(offerFrom(makeComment(html)).title).toBe(
        "Acme & Co | https://acme.example/ | REMOTE(Worldwide) or ONSITE | We're hiring",
      );
    });

    it("collapses repeated whitespace in the title", () => {
      const offer = offerFrom(makeComment("Acme  |   Engineer \t| Remote"));

      expect(offer.title).toBe("Acme | Engineer | Remote");
    });
  });

  describe("title length", () => {
    const prefix = "Acme | Remote | ";

    it("keeps a title of exactly 160 characters", () => {
      const header = prefix + "x".repeat(160 - prefix.length);

      expect(offerFrom(makeComment(header)).title).toBe(header);
    });

    it("clips a longer title to 160 characters ending in an ellipsis", () => {
      const header = prefix + "x".repeat(300);

      const title = offerFrom(makeComment(header)).title;

      expect([...title]).toHaveLength(160);
      expect(title.endsWith("…")).toBe(true);
    });

    it("does not split an emoji when clipping", () => {
      const header = prefix + "\u{1F600}".repeat(200);

      const title = offerFrom(makeComment(header)).title;

      expect(title).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
      expect([...title]).toHaveLength(160);
    });
  });

  describe("company", () => {
    it.each([
      ["Acme | Backend Engineer | Remote | Full-time", "Acme"],
      ["Acme | Remote | Full-time", "Acme"],
      ["<i>Fastly | Software Engineers | Remote | Full-time</i>", "Fastly"],
    ])("takes the first segment of %j", (html, expected) => {
      expect(offerFrom(makeComment(html)).company).toBe(expected);
    });

    it("drops a URL in parentheses after the name", () => {
      const html =
        'Beta (<a href="https:&#x2F;&#x2F;beta.example" rel="nofollow">https:&#x2F;&#x2F;beta.example</a>) | Senior Engineer | REMOTE';

      expect(offerFrom(makeComment(html)).company).toBe("Beta");
    });

    it("keeps other parentheses in the name", () => {
      expect(
        offerFrom(
          makeComment(
            "Elman (Deep Science Ventures) | CTO | REMOTE considered",
          ),
        ).company,
      ).toBe("Elman (Deep Science Ventures)");
    });

    it.each([
      ["with a single pipe", "Acme | Remote"],
      ["without pipes, in dash style", "Software Engineer — Remote — US Only"],
      ["in free prose", "We're hiring engineers at Gamma! Remote OK."],
      [
        "when the first segment is a URL",
        "https://acme.example | Engineer | Remote",
      ],
      [
        "when the first segment is a long sentence",
        `${"Backed by a famous investor and building an AI platform ".repeat(2)}| Engineer | Remote`,
      ],
    ])("is null %s", (_label, html) => {
      expect(offerFrom(makeComment(html)).company).toBeNull();
    });
  });

  describe("the remote filter", () => {
    it.each([
      ["in the header", "Acme | Engineer | Remote<p>Details"],
      ["in uppercase", "Acme | Engineer | REMOTE<p>Details"],
      [
        "as part of another word",
        "Acme | Engineer | Remotely friendly<p>Details",
      ],
      ["only in the body", "Acme | Engineer | SF<p>We are remote-first."],
    ])("keeps a post that mentions remote %s", (_label, html) => {
      expect(parseHackerNewsComment(makeComment(html)).kind).toBe("offer");
    });

    it("skips a post that never mentions remote", () => {
      expect(
        parseHackerNewsComment(
          makeComment("Acme | Engineer | Onsite in Austin<p>Details"),
        ),
      ).toEqual({
        kind: "skipped",
      });
    });
  });

  describe("comments that are not live posts", () => {
    it.each([
      ["deleted", { deleted: true }],
      ["dead", { dead: true, text: "Acme | Remote" }],
      ["without text", { text: undefined }],
      ["with blank text", { text: "  \n " }],
      ["with a non-string text", { text: 42 }],
    ])("skips a comment that is %s", (_label, overrides) => {
      const base = makeComment("Acme | Remote");
      const item: JsonObject = { ...base };
      for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined) {
          delete item[key];
        } else {
          item[key] = value;
        }
      }

      expect(parseHackerNewsComment(item)).toEqual({ kind: "skipped" });
    });

    it("skips a deleted comment even when it lacks id and time", () => {
      expect(parseHackerNewsComment({ deleted: true })).toEqual({
        kind: "skipped",
      });
    });
  });

  describe("malformed items", () => {
    it.each([[null], [5], ["text"], [[]], [true]])(
      "rejects %j, which is not an object",
      (item) => {
        expect(parseHackerNewsComment(item)).toEqual({
          kind: "rejected",
          reason: "item is not an object",
        });
      },
    );

    it.each([
      ["id is missing", "id", undefined],
      ["id is a string", "id", "49900001"],
      ["id is zero", "id", 0],
      ["time is missing", "time", undefined],
      ["time is in milliseconds", "time", 1790000000000],
      ["time is a string", "time", "yesterday"],
    ])("rejects a live comment whose %s", (_label, key, value) => {
      const item = makeComment("Acme | Remote");
      if (value === undefined) {
        delete item[key];
      } else {
        item[key] = value;
      }

      const parsed = parseHackerNewsComment(item);

      expect(parsed.kind).toBe("rejected");
      expect(parsed.kind === "rejected" && parsed.reason).toContain(key);
    });

    it("does not put the comment text in the rejection reason", () => {
      const parsed = parseHackerNewsComment(
        makeComment("Secret | Remote", { id: "oops" }),
      );

      expect(parsed.kind === "rejected" && parsed.reason).not.toContain(
        "Secret",
      );
    });
  });
});
