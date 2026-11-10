import { compareLabels } from "./agreement.mts";
import { parseLabels } from "./dataset.mts";
import { EVAL_PATHS, readJsonFile } from "./files.mts";

function percent(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
  const original = parseLabels(await readJsonFile(EVAL_PATHS.labels));
  const retest = parseLabels(await readJsonFile(EVAL_PATHS.retestLabels));
  if (original.snapshotId !== retest.snapshotId) {
    throw new Error("The two label files belong to different snapshots.");
  }
  const agreement = compareLabels(original.labels, retest.labels);
  console.log(`Compared pairs: ${agreement.pairs}`);
  console.log(`Exact agreement: ${percent(agreement.exactRate)}`);
  console.log(`Within one band: ${percent(agreement.withinOneRate)}`);
  console.log(
    `Linearly weighted kappa: ${agreement.weightedKappa === null ? "n/a" : agreement.weightedKappa.toFixed(2)}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
