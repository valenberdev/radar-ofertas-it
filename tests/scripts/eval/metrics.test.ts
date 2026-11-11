import { describe, expect, it } from "vitest";
import {
  mean,
  median,
  precisionAtK,
  ranks,
  spearman,
} from "../../../scripts/eval/metrics.mts";

describe("mean", () => {
  it("averages the values", () => {
    expect(mean([1, 2, 6])).toBe(3);
  });

  it("returns null for no values", () => {
    expect(mean([])).toBeNull();
  });
});

describe("median", () => {
  it("returns the middle value of an odd list", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("averages the two middle values of an even list", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("returns the only value", () => {
    expect(median([7])).toBe(7);
  });

  it("returns null for no values", () => {
    expect(median([])).toBeNull();
  });

  it("does not change the list it receives", () => {
    const values = [3, 1, 2];

    median(values);

    expect(values).toEqual([3, 1, 2]);
  });
});

describe("ranks", () => {
  it("ranks from the lowest value up, starting at one", () => {
    expect(ranks([30, 10, 20])).toEqual([3, 1, 2]);
  });

  it("gives tied values the average of their positions", () => {
    expect(ranks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
  });

  it("gives the same rank to all equal values", () => {
    expect(ranks([5, 5, 5])).toEqual([2, 2, 2]);
  });

  it("handles ties at the start and at the end", () => {
    expect(ranks([1, 1, 2, 3, 3])).toEqual([1.5, 1.5, 3, 4.5, 4.5]);
  });

  it("returns an empty list for no values", () => {
    expect(ranks([])).toEqual([]);
  });
});

describe("spearman", () => {
  it("is 1 for the same order", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 12);
  });

  it("is -1 for the opposite order", () => {
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1, 12);
  });

  it.each([
    [[1, 2, 3, 4, 5], [5, 6, 7, 8, 7], 0.8207826816681233],
    [[10, 20, 20, 30, 40, 40], [1, 3, 2, 2, 4, 5], 0.8508410434878082],
    [[3, 1, 2], [1, 2, 3], -0.5],
  ])("matches the reference value for %j and %j", (first, second, expected) => {
    expect(spearman(first as number[], second as number[])).toBeCloseTo(
      expected as number,
      10,
    );
  });

  it("only depends on the order, not on the values", () => {
    expect(spearman([1, 2, 3, 4], [1, 4, 9, 100])).toBeCloseTo(1, 12);
  });

  it("is symmetric", () => {
    const first = [3, 1, 4, 1, 5];
    const second = [2, 7, 1, 8, 2];

    expect(spearman(first, second)).toBeCloseTo(
      spearman(second, first) as number,
      12,
    );
  });

  it("is null when one list never changes", () => {
    expect(spearman([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(spearman([1, 2, 3], [4, 4, 4])).toBeNull();
  });

  it("is null for fewer than two values", () => {
    expect(spearman([1], [1])).toBeNull();
    expect(spearman([], [])).toBeNull();
  });

  it("rejects lists of different length", () => {
    expect(() => spearman([1, 2], [1])).toThrow(RangeError);
    expect(() => spearman([1], [1, 2])).toThrow(RangeError);
  });
});

describe("precisionAtK", () => {
  const items = [
    { score: 90, band: 3 },
    { score: 80, band: 0 },
    { score: 70, band: 2 },
    { score: 60, band: 1 },
    { score: 50, band: 3 },
  ];

  it("counts the relevant offers among the k highest scores", () => {
    expect(precisionAtK(items, 3, 2)).toBeCloseTo(2 / 3, 12);
  });

  it("uses the threshold to decide what is relevant", () => {
    expect(precisionAtK(items, 5, 3)).toBe(2 / 5);
    expect(precisionAtK(items, 5, 1)).toBe(4 / 5);
  });

  it("looks at the scores and not at the order of the list", () => {
    expect(precisionAtK([...items].reverse(), 3, 2)).toBeCloseTo(2 / 3, 12);
  });

  it("keeps the list order between equal scores", () => {
    const tied = [
      { score: 10, band: 0 },
      { score: 10, band: 3 },
    ];

    expect(precisionAtK(tied, 1, 2)).toBe(0);
  });

  it("divides by what exists when there are fewer than k items", () => {
    expect(precisionAtK(items.slice(0, 2), 5, 2)).toBe(0.5);
  });

  it("returns null for no items", () => {
    expect(precisionAtK([], 5, 2)).toBeNull();
  });

  it.each([0, -1, 1.5])("rejects k = %s", (k) => {
    expect(() => precisionAtK(items, k, 2)).toThrow(RangeError);
  });

  it("does not change the list it receives", () => {
    const copy = [...items];

    precisionAtK(items, 2, 2);

    expect(items).toEqual(copy);
  });
});
