import { describe, expect, it } from "vitest";
import {
  buildPool,
  DEFAULT_POOL_SIZES,
  type PoolItem,
  type PoolOrigin,
} from "../../../scripts/eval/build-pool.mts";
import type { SnapshotOffer } from "../../../scripts/eval/dataset.mts";
import { createRandom } from "../../../scripts/eval/random.mts";
import { buildProfile } from "../../../src/domain/profile";

const PROFILE = buildProfile({ skills: [{ name: "Docker", aliases: [] }] });

function snapshotOffer(
  id: number,
  overrides: Partial<SnapshotOffer> = {},
): SnapshotOffer {
  return {
    id: String(id),
    key: `himalayas:${id}`,
    source: "himalayas",
    sourceId: String(id),
    title: `Offer ${id}`,
    company: "Acme",
    url: `https://example.com/${id}`,
    description: `We use Docker (${id})`,
    postedAt: null,
    contentHash: "a".repeat(64),
    ...overrides,
  };
}

function matching(count: number, firstId = 1): SnapshotOffer[] {
  return Array.from({ length: count }, (_, index) =>
    snapshotOffer(firstId + index),
  );
}

function unmatching(count: number, firstId = 1000): SnapshotOffer[] {
  return Array.from({ length: count }, (_, index) =>
    snapshotOffer(firstId + index, {
      description: `We cook pasta (${firstId + index})`,
    }),
  );
}

function ofOrigin(
  pool: readonly PoolItem[],
  origin: PoolOrigin,
): SnapshotOffer[] {
  return pool
    .filter((item) => item.origin === origin)
    .map((item) => item.offer);
}

describe("DEFAULT_POOL_SIZES", () => {
  it("is 30 candidates, 8 beyond the top and 7 unmatched", () => {
    expect(DEFAULT_POOL_SIZES).toEqual({
      candidates: 30,
      beyondTop: 8,
      unmatched: 7,
    });
  });
});

describe("buildPool", () => {
  it("builds the default pool from a large snapshot", () => {
    const pool = buildPool(
      PROFILE,
      [...matching(50), ...unmatching(40)],
      createRandom(1),
    );

    expect(pool).toHaveLength(45);
    expect(ofOrigin(pool, "candidate")).toHaveLength(30);
    expect(ofOrigin(pool, "beyond_top")).toHaveLength(8);
    expect(ofOrigin(pool, "unmatched")).toHaveLength(7);
  });

  it("lists the candidates first, then the offers beyond the top, then the unmatched", () => {
    const pool = buildPool(
      PROFILE,
      [...matching(50), ...unmatching(40)],
      createRandom(1),
    );

    expect(pool.map((item) => item.origin)).toEqual([
      ...Array.from({ length: 30 }, () => "candidate"),
      ...Array.from({ length: 8 }, () => "beyond_top"),
      ...Array.from({ length: 7 }, () => "unmatched"),
    ]);
  });

  it("takes as candidates the offers the prefilter ranks highest", () => {
    const offers = [
      ...matching(40),
      snapshotOffer(500, { title: "Docker engineer" }),
      ...unmatching(10),
    ];

    const pool = buildPool(PROFILE, offers, createRandom(1));

    expect(pool[0]?.offer.id).toBe("500");
    expect(ofOrigin(pool, "candidate").map((offer) => offer.id)).toContain(
      "500",
    );
  });

  it("takes the other offers beyond the candidates, never among them", () => {
    const pool = buildPool(
      PROFILE,
      [...matching(50), ...unmatching(40)],
      createRandom(1),
    );
    const candidateIds = new Set(
      ofOrigin(pool, "candidate").map((offer) => offer.id),
    );

    for (const offer of ofOrigin(pool, "beyond_top")) {
      expect(candidateIds.has(offer.id)).toBe(false);
      expect(offer.description).toContain("Docker");
    }
  });

  it("takes the unmatched offers only from those that mention no skill", () => {
    const pool = buildPool(
      PROFILE,
      [...matching(50), ...unmatching(40)],
      createRandom(1),
    );

    for (const offer of ofOrigin(pool, "unmatched")) {
      expect(offer.description).not.toContain("Docker");
    }
  });

  it("does not repeat an offer", () => {
    const pool = buildPool(
      PROFILE,
      [...matching(50), ...unmatching(40)],
      createRandom(1),
    );

    expect(new Set(pool.map((item) => item.offer.id)).size).toBe(pool.length);
  });

  it("returns the offer objects it received", () => {
    const offers = [...matching(3), ...unmatching(3)];

    const pool = buildPool(PROFILE, offers, createRandom(1));

    for (const item of pool) {
      expect(offers).toContain(item.offer);
    }
  });

  it("gives the free places beyond the top to the unmatched when there are not enough matching offers", () => {
    const pool = buildPool(
      PROFILE,
      [...matching(33), ...unmatching(40)],
      createRandom(1),
    );

    expect(ofOrigin(pool, "candidate")).toHaveLength(30);
    expect(ofOrigin(pool, "beyond_top")).toHaveLength(3);
    expect(ofOrigin(pool, "unmatched")).toHaveLength(12);
  });

  it("has no offers beyond the top when there are no more than the candidates", () => {
    const pool = buildPool(
      PROFILE,
      [...matching(20), ...unmatching(40)],
      createRandom(1),
    );

    expect(ofOrigin(pool, "candidate")).toHaveLength(20);
    expect(ofOrigin(pool, "beyond_top")).toHaveLength(0);
    expect(ofOrigin(pool, "unmatched")).toHaveLength(15);
  });

  it("only takes unmatched offers when nothing matches", () => {
    const pool = buildPool(PROFILE, unmatching(40), createRandom(1));

    expect(pool).toHaveLength(15);
    expect(pool.every((item) => item.origin === "unmatched")).toBe(true);
  });

  it("returns a shorter pool when there are not enough unmatched offers", () => {
    const pool = buildPool(
      PROFILE,
      [...matching(50), ...unmatching(2)],
      createRandom(1),
    );

    expect(ofOrigin(pool, "unmatched")).toHaveLength(2);
    expect(pool).toHaveLength(40);
  });

  it("returns an empty pool for an empty snapshot", () => {
    expect(buildPool(PROFILE, [], createRandom(1))).toEqual([]);
  });

  it("returns an empty pool for a profile without skills", () => {
    const pool = buildPool(buildProfile({}), matching(5), createRandom(1));

    expect(ofOrigin(pool, "candidate")).toEqual([]);
    expect(ofOrigin(pool, "beyond_top")).toEqual([]);
    expect(ofOrigin(pool, "unmatched")).toHaveLength(5);
  });

  it("respects custom sizes", () => {
    const pool = buildPool(
      PROFILE,
      [...matching(50), ...unmatching(40)],
      createRandom(1),
      {
        candidates: 5,
        beyondTop: 2,
        unmatched: 1,
      },
    );

    expect(ofOrigin(pool, "candidate")).toHaveLength(5);
    expect(ofOrigin(pool, "beyond_top")).toHaveLength(2);
    expect(ofOrigin(pool, "unmatched")).toHaveLength(1);
  });

  it("uses the posting date to rank candidates with the same score", () => {
    const offers = [
      snapshotOffer(1, { postedAt: "2026-11-01T00:00:00.000Z" }),
      snapshotOffer(2, { postedAt: "2026-11-05T00:00:00.000Z" }),
      snapshotOffer(3, { postedAt: "2026-11-03T00:00:00.000Z" }),
    ];

    const pool = buildPool(PROFILE, offers, createRandom(1), {
      candidates: 3,
      beyondTop: 0,
      unmatched: 0,
    });

    expect(pool.map((item) => item.offer.id)).toEqual(["2", "3", "1"]);
  });

  it("repeats the same pool for the same seed", () => {
    const offers = [...matching(50), ...unmatching(40)];

    expect(buildPool(PROFILE, offers, createRandom(7))).toEqual(
      buildPool(PROFILE, offers, createRandom(7)),
    );
  });

  it("samples other offers for other seeds", () => {
    const offers = [...matching(50), ...unmatching(40)];

    const first = ofOrigin(
      buildPool(PROFILE, offers, createRandom(1)),
      "unmatched",
    ).map((offer) => offer.id);
    const second = ofOrigin(
      buildPool(PROFILE, offers, createRandom(2)),
      "unmatched",
    ).map((offer) => offer.id);

    expect(first).not.toEqual(second);
  });

  it("samples the offers beyond the top instead of taking the first ones", () => {
    const offers = [...matching(60), ...unmatching(10)];
    const firstBeyond = new Set(
      buildPool(PROFILE, offers, createRandom(1), {
        candidates: 30,
        beyondTop: 30,
        unmatched: 0,
      })
        .filter((item) => item.origin === "beyond_top")
        .map((item) => item.offer.id),
    );
    const sampledIds = Array.from({ length: 5 }, (_, seed) =>
      ofOrigin(
        buildPool(PROFILE, offers, createRandom(seed), {
          candidates: 30,
          beyondTop: 8,
          unmatched: 0,
        }),
        "beyond_top",
      ).map((offer) => offer.id),
    );

    expect(
      new Set(sampledIds.map((ids) => ids.join(","))).size,
    ).toBeGreaterThan(1);
    for (const ids of sampledIds) {
      expect(ids.every((id) => firstBeyond.has(id))).toBe(true);
    }
  });

  it("does not change the list it receives", () => {
    const offers = [...matching(5), ...unmatching(5)];
    const copy = [...offers];

    buildPool(PROFILE, offers, createRandom(1));

    expect(offers).toEqual(copy);
  });
});
