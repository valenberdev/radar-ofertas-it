import { describe, expect, it } from "vitest";
import {
  contentHash,
  offerKey,
  parseLabels,
  parsePersona,
  parseSnapshot,
} from "../../../scripts/eval/dataset.mts";

const HASH = "a".repeat(64);

const PERSONA = {
  id: "a-junior-backend",
  label: "A · Junior",
  cvText: "I know Node.js",
  profile: null,
};

const OFFER = {
  id: "10",
  key: "himalayas:abc",
  source: "himalayas",
  sourceId: "abc",
  title: "Backend Engineer",
  company: "Acme",
  url: "https://example.com/1",
  description: "Node.js",
  postedAt: "2026-11-01T12:00:00.000Z",
  contentHash: HASH,
};

const SNAPSHOT = {
  snapshotId: "2026-11-10",
  country: "Argentina",
  capturedAt: "2026-11-10T15:00:00.000Z",
  offers: [OFFER],
};

const LABEL = {
  persona: "a-junior-backend",
  offerKey: "himalayas:abc",
  contentHash: HASH,
  title: "Backend Engineer",
  company: "Acme",
  url: "https://example.com/1",
  band: 2,
};

const LABELS = { snapshotId: "2026-11-10", labels: [LABEL] };

describe("offerKey", () => {
  it("joins the source and the source id", () => {
    expect(offerKey("himalayas", "abc")).toBe("himalayas:abc");
  });
});

describe("contentHash", () => {
  const base = { title: "T", company: "C", description: "D" };

  it("returns a lowercase sha-256 hex digest", () => {
    expect(contentHash(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable", () => {
    expect(contentHash(base)).toBe(contentHash({ ...base }));
  });

  it.each([
    ["title", { title: "X" }],
    ["company", { company: "X" }],
    ["a missing company", { company: null }],
    ["description", { description: "X" }],
  ])("changes with the %s", (_name, change) => {
    expect(contentHash({ ...base, ...change })).not.toBe(contentHash(base));
  });

  it("tells apart text that moves between fields", () => {
    expect(
      contentHash({ title: "ab", company: "c", description: "d" }),
    ).not.toBe(contentHash({ title: "a", company: "bc", description: "d" }));
  });

  it("tells apart a missing company from the text null", () => {
    expect(contentHash({ ...base, company: null })).not.toBe(
      contentHash({ ...base, company: "null" }),
    );
  });
});

describe("parsePersona", () => {
  it("accepts a persona without a profile yet", () => {
    expect(parsePersona(PERSONA)).toEqual(PERSONA);
  });

  it("builds a normalized profile", () => {
    const persona = parsePersona({
      ...PERSONA,
      profile: {
        seniority: " Junior ",
        yearsOfExperience: 1,
        skills: [{ name: "Node.js", aliases: ["nodejs", "NodeJS"] }],
        targetRoles: ["Backend Developer"],
        languages: ["Spanish (native)"],
        summary: "Junior developer.",
      },
    });

    expect(persona.profile?.seniority).toBe("junior");
    expect(persona.profile?.skills).toEqual([
      { name: "Node.js", aliases: ["nodejs"] },
    ]);
  });

  it.each([
    ["an id with capitals", { id: "A-Junior" }],
    ["an id with spaces", { id: "a junior" }],
    ["an id that starts with a dash", { id: "-a" }],
    ["an id that ends with a dash", { id: "a-" }],
    ["an empty id", { id: "" }],
    ["an empty label", { label: "" }],
    ["an empty text", { cvText: "" }],
    ["a missing profile field", { profile: undefined }],
    ["a profile without skills list", { profile: { seniority: null } }],
  ])("rejects %s", (_name, change) => {
    expect(() => parsePersona({ ...PERSONA, ...change })).toThrow(
      /^Invalid persona file/,
    );
  });

  it("rejects something that is not an object", () => {
    expect(() => parsePersona(null)).toThrow(/^Invalid persona file/);
  });

  it("names the field that failed", () => {
    expect(() => parsePersona({ ...PERSONA, id: "BAD" })).toThrow(
      /^Invalid persona file at id:/,
    );
  });
});

describe("parseSnapshot", () => {
  it("accepts a complete snapshot", () => {
    expect(parseSnapshot(SNAPSHOT)).toEqual(SNAPSHOT);
  });

  it("accepts an offer without company and date", () => {
    const snapshot = {
      ...SNAPSHOT,
      offers: [{ ...OFFER, company: null, postedAt: null }],
    };

    expect(parseSnapshot(snapshot).offers[0]).toMatchObject({
      company: null,
      postedAt: null,
    });
  });

  it("accepts a snapshot without offers", () => {
    expect(parseSnapshot({ ...SNAPSHOT, offers: [] }).offers).toEqual([]);
  });

  it.each([
    ["a bad snapshot id", { snapshotId: "10-11-2026" }],
    ["a bad capture time", { capturedAt: "yesterday" }],
    ["an empty country", { country: "" }],
    ["offers that are not a list", { offers: {} }],
  ])("rejects %s", (_name, change) => {
    expect(() => parseSnapshot({ ...SNAPSHOT, ...change })).toThrow(
      /^Invalid snapshot/,
    );
  });

  it.each([
    ["a hash that is not sha-256", { contentHash: "abc" }],
    ["an uppercase hash", { contentHash: "A".repeat(64) }],
    ["a bad posting date", { postedAt: "2026-11-01" }],
    ["an empty key", { key: "" }],
    ["an empty url", { url: "" }],
    ["a missing description", { description: undefined }],
  ])("rejects an offer with %s", (_name, change) => {
    expect(() =>
      parseSnapshot({ ...SNAPSHOT, offers: [{ ...OFFER, ...change }] }),
    ).toThrow(/^Invalid snapshot at offers\.0/);
  });

  it("rejects two offers with the same key", () => {
    expect(() =>
      parseSnapshot({ ...SNAPSHOT, offers: [OFFER, { ...OFFER, id: "11" }] }),
    ).toThrow("Invalid snapshot at offers.1.key: Duplicate offer key");
  });
});

describe("parseLabels", () => {
  it("accepts a labels file", () => {
    expect(parseLabels(LABELS)).toEqual(LABELS);
  });

  it("accepts an empty labels file", () => {
    expect(parseLabels({ ...LABELS, labels: [] }).labels).toEqual([]);
  });

  it.each([0, 1, 2, 3])("accepts the band %s", (band) => {
    expect(
      parseLabels({ ...LABELS, labels: [{ ...LABEL, band }] }).labels[0]?.band,
    ).toBe(band);
  });

  it.each([-1, 4, 1.5, "2", null])("rejects the band %j", (band) => {
    expect(() =>
      parseLabels({ ...LABELS, labels: [{ ...LABEL, band }] }),
    ).toThrow(/^Invalid labels file at labels\.0\.band/);
  });

  it.each([
    ["a bad persona id", { persona: "Bad Id" }],
    ["an empty offer key", { offerKey: "" }],
    ["a bad hash", { contentHash: "xyz" }],
    ["a missing url", { url: undefined }],
  ])("rejects a label with %s", (_name, change) => {
    expect(() =>
      parseLabels({ ...LABELS, labels: [{ ...LABEL, ...change }] }),
    ).toThrow(/^Invalid labels file at labels\.0/);
  });

  it("rejects a bad snapshot id", () => {
    expect(() => parseLabels({ ...LABELS, snapshotId: "today" })).toThrow(
      /^Invalid labels file at snapshotId/,
    );
  });

  it("rejects the same offer labeled twice for one persona", () => {
    expect(() =>
      parseLabels({ ...LABELS, labels: [LABEL, { ...LABEL, band: 0 }] }),
    ).toThrow("Invalid labels file at labels.1: Duplicate label");
  });

  it("accepts the same offer labeled for two personas", () => {
    expect(
      parseLabels({
        ...LABELS,
        labels: [LABEL, { ...LABEL, persona: "b-mid-frontend" }],
      }).labels,
    ).toHaveLength(2);
  });
});
