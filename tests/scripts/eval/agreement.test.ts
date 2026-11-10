import { describe, expect, it } from "vitest";
import { compareLabels } from "../../../scripts/eval/agreement.mts";
import type { Label } from "../../../scripts/eval/dataset.mts";

function label(
  offer: string,
  band: Label["band"],
  persona = "a-junior-backend",
): Label {
  return {
    persona,
    offerKey: `himalayas:${offer}`,
    contentHash: "a".repeat(64),
    title: "T",
    company: null,
    url: "https://example.com",
    band,
  };
}

describe("compareLabels", () => {
  it("returns empty results when no pair is shared", () => {
    expect(compareLabels([label("1", 2)], [label("2", 2)])).toEqual({
      pairs: 0,
      exactRate: null,
      withinOneRate: null,
      weightedKappa: null,
    });
  });

  it("returns empty results for empty lists", () => {
    expect(compareLabels([], []).pairs).toBe(0);
  });

  it("gives a kappa of 1 when the two rounds agree on varied labels", () => {
    const first = [label("1", 0), label("2", 1), label("3", 2), label("4", 3)];

    expect(compareLabels(first, first)).toEqual({
      pairs: 4,
      exactRate: 1,
      withinOneRate: 1,
      weightedKappa: 1,
    });
  });

  it("gives a kappa of 0 when the agreement is what chance would give", () => {
    const first = [label("1", 0), label("2", 3), label("3", 0), label("4", 3)];
    const second = [label("1", 0), label("2", 3), label("3", 3), label("4", 0)];

    expect(compareLabels(first, second).weightedKappa).toBeCloseTo(0, 10);
  });

  it("gives a negative kappa when the rounds disagree more than chance", () => {
    const first = [label("1", 0), label("2", 1), label("3", 2), label("4", 3)];
    const second = [label("1", 1), label("2", 2), label("3", 3), label("4", 0)];

    expect(compareLabels(first, second).weightedKappa).toBeCloseTo(-0.2, 10);
  });

  it("counts exact matches and matches within one band", () => {
    const first = [label("1", 0), label("2", 1), label("3", 2), label("4", 3)];
    const second = [label("1", 0), label("2", 2), label("3", 0), label("4", 3)];

    const result = compareLabels(first, second);

    expect(result.exactRate).toBe(0.5);
    expect(result.withinOneRate).toBe(0.75);
  });

  it("only compares the pairs present in both rounds", () => {
    const first = [label("1", 1), label("2", 2), label("3", 3)];
    const second = [label("2", 2), label("3", 0), label("9", 1)];

    const result = compareLabels(first, second);

    expect(result.pairs).toBe(2);
    expect(result.exactRate).toBe(0.5);
  });

  it("tells personas apart", () => {
    const result = compareLabels(
      [label("1", 0, "a-junior-backend")],
      [label("1", 3, "b-mid-frontend")],
    );

    expect(result.pairs).toBe(0);
  });

  it("gives no kappa when both rounds use a single band", () => {
    const same = [label("1", 2), label("2", 2)];

    expect(compareLabels(same, same)).toMatchObject({
      pairs: 2,
      exactRate: 1,
      weightedKappa: null,
    });
  });

  it("is symmetric", () => {
    const first = [
      label("1", 0),
      label("2", 1),
      label("3", 3),
      label("4", 3),
      label("5", 2),
    ];
    const second = [
      label("1", 1),
      label("2", 1),
      label("3", 2),
      label("4", 3),
      label("5", 0),
    ];

    expect(compareLabels(first, second).weightedKappa).toBeCloseTo(
      compareLabels(second, first).weightedKappa as number,
      10,
    );
  });

  it("matches a kappa calculated by hand", () => {
    const first = [label("1", 0), label("2", 0), label("3", 3), label("4", 3)];
    const second = [label("1", 0), label("2", 1), label("3", 3), label("4", 2)];

    expect(compareLabels(first, second).weightedKappa).toBeCloseTo(
      1 - 0.1666666667 / 0.5,
      6,
    );
  });
});
