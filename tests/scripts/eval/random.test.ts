import { describe, expect, it } from "vitest";
import {
  createRandom,
  hashSeed,
  sampled,
  shuffled,
} from "../../../scripts/eval/random.mts";

describe("createRandom", () => {
  it("produces the reference sequence of the algorithm", () => {
    const random = createRandom(1);

    expect([random(), random(), random()]).toEqual([
      0.6270739405881613, 0.002735721180215478, 0.5274470399599522,
    ]);
  });

  it("repeats the same sequence for the same seed", () => {
    const first = createRandom(42);
    const second = createRandom(42);

    expect(Array.from({ length: 20 }, () => first())).toEqual(
      Array.from({ length: 20 }, () => second()),
    );
  });

  it("produces other sequences for other seeds", () => {
    expect(createRandom(1)()).not.toBe(createRandom(2)());
  });

  it("stays in the range from 0 up to but not including 1", () => {
    const random = createRandom(7);

    for (let count = 0; count < 5000; count += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("spreads values over the whole range", () => {
    const random = createRandom(3);
    const buckets = Array.from({ length: 10 }, () => 0);

    for (let count = 0; count < 10_000; count += 1) {
      const bucket = Math.floor(random() * 10);
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    }

    for (const size of buckets) {
      expect(size).toBeGreaterThan(800);
      expect(size).toBeLessThan(1200);
    }
  });
});

describe("hashSeed", () => {
  it.each([
    ["", 2166136261],
    ["a", 0xe40c292c],
    ["foobar", 0xbf9cf968],
  ])("hashes %j to the FNV-1a value", (text, expected) => {
    expect(hashSeed(text)).toBe(expected);
  });

  it("gives different numbers to different persona ids", () => {
    expect(hashSeed("a-junior-backend")).not.toBe(hashSeed("b-mid-frontend"));
  });
});

describe("shuffled", () => {
  const items = Array.from({ length: 20 }, (_, index) => index);

  it("keeps the same items", () => {
    expect([...shuffled(items, createRandom(1))].sort((a, b) => a - b)).toEqual(
      items,
    );
  });

  it("does not change the list it receives", () => {
    const copy = [...items];

    shuffled(items, createRandom(1));

    expect(items).toEqual(copy);
  });

  it("repeats the same order for the same seed", () => {
    expect(shuffled(items, createRandom(5))).toEqual(
      shuffled(items, createRandom(5)),
    );
  });

  it("changes the order for other seeds", () => {
    expect(shuffled(items, createRandom(5))).not.toEqual(
      shuffled(items, createRandom(6)),
    );
  });

  it("does not keep the original order", () => {
    expect(shuffled(items, createRandom(5))).not.toEqual(items);
  });

  it("moves every position over many seeds", () => {
    const seen = new Set<number>();

    for (let seed = 0; seed < 200; seed += 1) {
      seen.add(shuffled(items, createRandom(seed))[0] as number);
    }

    expect(seen.size).toBe(items.length);
  });

  it.each([[[]], [[1]]])("handles the short list %j", (list) => {
    expect(shuffled(list, createRandom(1))).toEqual(list);
  });
});

describe("sampled", () => {
  const items = Array.from({ length: 30 }, (_, index) => index);

  it("returns the requested number of different items", () => {
    const result = sampled(items, 8, createRandom(1));

    expect(result).toHaveLength(8);
    expect(new Set(result).size).toBe(8);
    expect(result.every((item) => items.includes(item))).toBe(true);
  });

  it("returns every item when asked for more than there are", () => {
    expect(
      [...sampled(items, 100, createRandom(1))].sort((a, b) => a - b),
    ).toEqual(items);
  });

  it("returns nothing when asked for none", () => {
    expect(sampled(items, 0, createRandom(1))).toEqual([]);
  });

  it("repeats the same sample for the same seed", () => {
    expect(sampled(items, 8, createRandom(9))).toEqual(
      sampled(items, 8, createRandom(9)),
    );
  });
});
