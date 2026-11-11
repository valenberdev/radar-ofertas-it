export function mean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] as number;
  return sorted.length % 2 === 1
    ? upper
    : ((sorted[middle - 1] as number) + upper) / 2;
}

export function ranks(values: readonly number[]): number[] {
  const order = values
    .map((value, index) => ({ value, index }))
    .sort((first, second) => first.value - second.value);
  const result = Array.from({ length: values.length }, () => 0);
  let start = 0;
  while (start < order.length) {
    let end = start;
    while (
      end + 1 < order.length &&
      (order[end + 1] as { value: number }).value ===
        (order[start] as { value: number }).value
    ) {
      end += 1;
    }
    const shared = (start + end) / 2 + 1;
    for (let position = start; position <= end; position += 1) {
      result[(order[position] as { index: number }).index] = shared;
    }
    start = end + 1;
  }
  return result;
}

function pearson(
  first: readonly number[],
  second: readonly number[],
): number | null {
  const firstMean = mean(first) as number;
  const secondMean = mean(second) as number;
  let covariance = 0;
  let firstVariance = 0;
  let secondVariance = 0;
  first.forEach((value, index) => {
    const a = value - firstMean;
    const b = (second[index] as number) - secondMean;
    covariance += a * b;
    firstVariance += a * a;
    secondVariance += b * b;
  });
  if (firstVariance === 0 || secondVariance === 0) {
    return null;
  }
  return covariance / Math.sqrt(firstVariance * secondVariance);
}

export function spearman(
  first: readonly number[],
  second: readonly number[],
): number | null {
  if (first.length !== second.length) {
    throw new RangeError("Both lists must have the same length");
  }
  return pearson(ranks(first), ranks(second));
}

export interface ScoredBand {
  readonly score: number;
  readonly band: number;
}

export function precisionAtK(
  items: readonly ScoredBand[],
  k: number,
  relevantFromBand: number,
): number | null {
  if (!Number.isInteger(k) || k < 1) {
    throw new RangeError("k must be a positive integer");
  }
  const top = [...items]
    .sort((first, second) => second.score - first.score)
    .slice(0, k);
  if (top.length === 0) {
    return null;
  }
  return (
    top.filter((item) => item.band >= relevantFromBand).length / top.length
  );
}
