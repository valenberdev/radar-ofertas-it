import type { Label } from "./dataset.mts";

export interface Agreement {
  readonly pairs: number;
  readonly exactRate: number | null;
  readonly withinOneRate: number | null;
  readonly weightedKappa: number | null;
}

const BAND_COUNT = 4;

function weight(first: number, second: number): number {
  return Math.abs(first - second) / (BAND_COUNT - 1);
}

export function compareLabels(
  first: readonly Label[],
  second: readonly Label[],
): Agreement {
  const secondById = new Map(
    second.map((label) => [`${label.persona}|${label.offerKey}`, label.band]),
  );
  const pairs: Array<readonly [number, number]> = [];
  for (const label of first) {
    const other = secondById.get(`${label.persona}|${label.offerKey}`);
    if (other !== undefined) {
      pairs.push([label.band, other]);
    }
  }
  if (pairs.length === 0) {
    return {
      pairs: 0,
      exactRate: null,
      withinOneRate: null,
      weightedKappa: null,
    };
  }

  const exact = pairs.filter(([a, b]) => a === b).length;
  const withinOne = pairs.filter(([a, b]) => Math.abs(a - b) <= 1).length;

  const firstShare = Array.from({ length: BAND_COUNT }, () => 0);
  const secondShare = Array.from({ length: BAND_COUNT }, () => 0);
  let observed = 0;
  for (const [a, b] of pairs) {
    firstShare[a] = (firstShare[a] ?? 0) + 1 / pairs.length;
    secondShare[b] = (secondShare[b] ?? 0) + 1 / pairs.length;
    observed += weight(a, b) / pairs.length;
  }
  let expected = 0;
  for (let a = 0; a < BAND_COUNT; a += 1) {
    for (let b = 0; b < BAND_COUNT; b += 1) {
      expected += (firstShare[a] ?? 0) * (secondShare[b] ?? 0) * weight(a, b);
    }
  }

  return {
    pairs: pairs.length,
    exactRate: exact / pairs.length,
    withinOneRate: withinOne / pairs.length,
    weightedKappa: expected === 0 ? null : 1 - observed / expected,
  };
}
