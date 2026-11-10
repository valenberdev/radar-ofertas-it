import { describe, expect, it } from "vitest";
import type { Persona, SnapshotOffer } from "../../../scripts/eval/dataset.mts";
import {
  orderItems,
  toLabelingItem,
  toLabelingPersona,
  type LabelingItem,
} from "../../../scripts/eval/labeling-items.mts";
import { createRandom } from "../../../scripts/eval/random.mts";
import { buildProfile } from "../../../src/domain/profile";

const OFFER: SnapshotOffer = {
  id: "10",
  key: "himalayas:abc",
  source: "himalayas",
  sourceId: "abc",
  title: "Backend Engineer",
  company: "Acme",
  url: "https://example.com/1",
  description: "Node.js",
  postedAt: "2026-11-01T12:00:00.000Z",
  contentHash: "a".repeat(64),
};

function item(persona: string, offer: string): LabelingItem {
  return toLabelingItem(persona, { ...OFFER, key: `himalayas:${offer}` });
}

describe("toLabelingItem", () => {
  it("keeps what the person needs to judge the offer and what the labels file needs", () => {
    expect(toLabelingItem("a-junior-backend", OFFER)).toEqual({
      persona: "a-junior-backend",
      offerKey: "himalayas:abc",
      contentHash: "a".repeat(64),
      title: "Backend Engineer",
      company: "Acme",
      url: "https://example.com/1",
      description: "Node.js",
      postedAt: "2026-11-01T12:00:00.000Z",
    });
  });

  it("does not leak the internal ids", () => {
    const keys = Object.keys(toLabelingItem("a-junior-backend", OFFER));

    expect(keys).not.toContain("id");
    expect(keys).not.toContain("sourceId");
    expect(keys).not.toContain("source");
  });

  it("keeps a missing company and date", () => {
    expect(
      toLabelingItem("a", { ...OFFER, company: null, postedAt: null }),
    ).toMatchObject({ company: null, postedAt: null });
  });
});

describe("toLabelingPersona", () => {
  const persona: Persona = {
    id: "a-junior-backend",
    label: "A · Junior",
    cvText: "I know Node.js",
    profile: buildProfile({
      seniority: "junior",
      yearsOfExperience: 1,
      skills: [
        { name: "Node.js", aliases: ["nodejs"] },
        { name: "SQL", aliases: [] },
      ],
      targetRoles: ["Backend Developer"],
    }),
  };

  it("shows the profile summary and the original text", () => {
    expect(toLabelingPersona(persona)).toEqual({
      id: "a-junior-backend",
      label: "A · Junior",
      seniority: "junior",
      yearsOfExperience: 1,
      skills: ["Node.js", "SQL"],
      targetRoles: ["Backend Developer"],
      cvText: "I know Node.js",
    });
  });

  it("refuses a persona without an extracted profile", () => {
    expect(() => toLabelingPersona({ ...persona, profile: null })).toThrow(
      "Persona a-junior-backend has no extracted profile yet. Run npm run eval:personas first.",
    );
  });
});

describe("orderItems", () => {
  const items = [
    ...["1", "2", "3", "4", "5", "6"].map((offer) => item("b", offer)),
    ...["1", "2", "3", "4", "5", "6"].map((offer) => item("a", offer)),
  ];

  it("groups the items by persona in the order of the persona ids", () => {
    const ordered = orderItems(items, ["a", "b"], createRandom(1));

    expect(ordered.map((entry) => entry.persona)).toEqual([
      ...Array.from({ length: 6 }, () => "a"),
      ...Array.from({ length: 6 }, () => "b"),
    ]);
  });

  it("keeps every item", () => {
    const ordered = orderItems(items, ["a", "b"], createRandom(1));

    expect(ordered).toHaveLength(12);
    expect(new Set(ordered)).toEqual(new Set(items));
  });

  it("shuffles inside each persona", () => {
    const ordered = orderItems(items, ["a", "b"], createRandom(1));

    expect(ordered.slice(0, 6).map((entry) => entry.offerKey)).not.toEqual(
      items.slice(6).map((entry) => entry.offerKey),
    );
  });

  it("repeats the same order for the same seed", () => {
    expect(orderItems(items, ["a", "b"], createRandom(3))).toEqual(
      orderItems(items, ["a", "b"], createRandom(3)),
    );
  });

  it("changes the order for another seed", () => {
    expect(orderItems(items, ["a", "b"], createRandom(3))).not.toEqual(
      orderItems(items, ["a", "b"], createRandom(4)),
    );
  });

  it("does not change the list it receives", () => {
    const copy = [...items];

    orderItems(items, ["a", "b"], createRandom(1));

    expect(items).toEqual(copy);
  });

  it("rejects an item of a persona that is not in the list", () => {
    expect(() =>
      orderItems([item("z", "1")], ["a", "b"], createRandom(1)),
    ).toThrow("Unknown persona z");
  });

  it("returns nothing for no items", () => {
    expect(orderItems([], ["a"], createRandom(1))).toEqual([]);
  });
});
