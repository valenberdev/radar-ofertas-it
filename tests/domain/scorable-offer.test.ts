import { describe, expect, it } from "vitest";
import {
  MAX_OFFER_DESCRIPTION_LENGTH,
  scorableOfferHash,
  toScorableOffer,
  type ScorableOffer,
} from "../../src/domain/scorable-offer";

const OFFER: ScorableOffer = {
  title: "Backend Engineer",
  company: "Acme",
  description: "Node.js and PostgreSQL.",
};

describe("MAX_OFFER_DESCRIPTION_LENGTH", () => {
  it("is 1500 characters", () => {
    expect(MAX_OFFER_DESCRIPTION_LENGTH).toBe(1500);
  });
});

describe("toScorableOffer", () => {
  it("keeps a clean offer as it is", () => {
    expect(toScorableOffer(OFFER)).toEqual(OFFER);
  });

  it("collapses whitespace and trims every field", () => {
    expect(
      toScorableOffer({
        title: "  Backend \n Engineer ",
        company: " Acme\tCorp ",
        description: "Node.js\n\n and   PostgreSQL \n",
      }),
    ).toEqual({
      title: "Backend Engineer",
      company: "Acme Corp",
      description: "Node.js and PostgreSQL",
    });
  });

  it("keeps a missing company as null", () => {
    expect(toScorableOffer({ ...OFFER, company: null }).company).toBeNull();
  });

  it.each(["", "   ", "\n"])(
    "turns the blank company %j into null",
    (company) => {
      expect(toScorableOffer({ ...OFFER, company }).company).toBeNull();
    },
  );

  it("redacts personal data in every field", () => {
    const result = toScorableOffer({
      title: "Engineer - jobs@acme.com",
      company: "Acme +54 9 291 456-7890",
      description:
        "Apply at https://acme.com/jobs or write to hiring@acme.com, tel 2914567890",
    });

    expect(result).toEqual({
      title: "Engineer - [EMAIL]",
      company: "Acme [PHONE]",
      description: "Apply at [URL] or write to [EMAIL], tel [PHONE]",
    });
  });

  describe("truncation", () => {
    it("keeps a description of exactly the limit", () => {
      const description = "a".repeat(MAX_OFFER_DESCRIPTION_LENGTH);

      expect(toScorableOffer({ ...OFFER, description }).description).toBe(
        description,
      );
    });

    it("cuts a description that is one character over the limit", () => {
      const description = "a".repeat(MAX_OFFER_DESCRIPTION_LENGTH + 1);

      expect(toScorableOffer({ ...OFFER, description }).description).toBe(
        "a".repeat(MAX_OFFER_DESCRIPTION_LENGTH),
      );
    });

    it("removes the space left at the end by the cut", () => {
      const description = `${"a".repeat(MAX_OFFER_DESCRIPTION_LENGTH - 1)} bbbbb`;

      expect(toScorableOffer({ ...OFFER, description }).description).toBe(
        "a".repeat(MAX_OFFER_DESCRIPTION_LENGTH - 1),
      );
    });

    it("does not split a character made of two code units", () => {
      const description = `${"a".repeat(MAX_OFFER_DESCRIPTION_LENGTH - 1)}😀😀`;

      const result = toScorableOffer({ ...OFFER, description }).description;

      expect(result).toBe("a".repeat(MAX_OFFER_DESCRIPTION_LENGTH - 1));
    });

    it("keeps a full character that fits in the limit", () => {
      const description = `${"a".repeat(MAX_OFFER_DESCRIPTION_LENGTH - 2)}😀😀`;

      expect(toScorableOffer({ ...OFFER, description }).description).toBe(
        `${"a".repeat(MAX_OFFER_DESCRIPTION_LENGTH - 2)}😀`,
      );
    });

    it("measures the limit after collapsing whitespace", () => {
      const description = `${"a ".repeat(MAX_OFFER_DESCRIPTION_LENGTH / 2)}\n\n\n   \n`;

      expect(toScorableOffer({ ...OFFER, description }).description).toBe(
        "a ".repeat(MAX_OFFER_DESCRIPTION_LENGTH / 2).trim(),
      );
    });

    it("redacts before cutting, so a phone number on the border leaves no digits behind", () => {
      const description = `${"a ".repeat(745)}+54 9 291 456-7890 tail`;

      const result = toScorableOffer({ ...OFFER, description }).description;

      expect(result).toContain("[PHONE]");
      expect(result).not.toMatch(/\d{3}/);
    });

    it("does not cut the title or the company", () => {
      const long = "x".repeat(MAX_OFFER_DESCRIPTION_LENGTH + 10);

      const result = toScorableOffer({
        title: long,
        company: long,
        description: "",
      });

      expect(result.title).toBe(long);
      expect(result.company).toBe(long);
    });
  });

  it("does not modify its input", () => {
    const input = { title: " A ", company: " B ", description: " C " };

    toScorableOffer(input);

    expect(input).toEqual({ title: " A ", company: " B ", description: " C " });
  });
});

describe("scorableOfferHash", () => {
  it("returns a lowercase sha-256 hex digest", () => {
    expect(scorableOfferHash(OFFER)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable", () => {
    expect(scorableOfferHash(OFFER)).toBe(scorableOfferHash({ ...OFFER }));
  });

  it.each([
    ["title", { title: "Frontend Engineer" }],
    ["company", { company: "Other" }],
    ["a missing company", { company: null }],
    ["description", { description: "Rust" }],
  ])("changes when the %s changes", (_name, change) => {
    expect(scorableOfferHash({ ...OFFER, ...change })).not.toBe(
      scorableOfferHash(OFFER),
    );
  });

  it("tells apart text that moves between fields", () => {
    const first: ScorableOffer = {
      title: "ab",
      company: "c",
      description: "d",
    };
    const second: ScorableOffer = {
      title: "a",
      company: "bc",
      description: "d",
    };

    expect(scorableOfferHash(first)).not.toBe(scorableOfferHash(second));
  });

  it("tells apart a missing company from the text null", () => {
    expect(scorableOfferHash({ ...OFFER, company: null })).not.toBe(
      scorableOfferHash({ ...OFFER, company: "null" }),
    );
  });
});
