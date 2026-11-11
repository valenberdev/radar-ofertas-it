import { readFile } from "node:fs/promises";
import { DEFAULT_TOP_K } from "../../src/domain/prefilter";
import { buildPool, DEFAULT_POOL_SIZES, rankOffers } from "./build-pool.mts";
import {
  parseLabels,
  parseSnapshot,
  type Label,
  type Snapshot,
} from "./dataset.mts";
import {
  decide,
  estimateRecall,
  evaluateRanking,
  evaluateSearch,
  parseCallRecords,
  parseConfigs,
  planCalls,
  PRECISION_K,
  RELEVANT_FROM_BAND,
  REPETITIONS,
  summarizeConfig,
  type CallRecord,
  type ConfigSummary,
  type LabeledCandidate,
  type RepetitionResult,
} from "./experiment.mts";
import {
  EVAL_PATHS,
  loadPersonaFiles,
  readJsonFile,
  writeJsonFile,
} from "./files.mts";
import { mean } from "./metrics.mts";
import { createRandom, hashSeed } from "./random.mts";

function bandOf(
  labels: ReadonlyMap<string, Label>,
  snapshot: Snapshot,
  persona: string,
  offerKey: string,
): number {
  const label = labels.get(`${persona}|${offerKey}`);
  if (label === undefined) {
    throw new Error(
      `There is no label for ${persona} and ${offerKey}. Finish eval/labels.json first.`,
    );
  }
  const offer = snapshot.offers.find((entry) => entry.key === offerKey);
  if (offer === undefined || offer.contentHash !== label.contentHash) {
    throw new Error(
      `The label for ${persona} and ${offerKey} does not match the snapshot.`,
    );
  }
  return label.band;
}

function fixed(value: number | null, digits = 2): string {
  return value === null ? "n/a" : value.toFixed(digits);
}

async function main(): Promise<void> {
  const snapshot = parseSnapshot(await readJsonFile(EVAL_PATHS.snapshot));
  const labelsFile = parseLabels(await readJsonFile(EVAL_PATHS.labels));
  if (labelsFile.snapshotId !== snapshot.snapshotId) {
    throw new Error(
      "eval/labels.json belongs to a different snapshot than eval/snapshot.local.json.",
    );
  }
  const labels = new Map(
    labelsFile.labels.map((label) => [
      `${label.persona}|${label.offerKey}`,
      label,
    ]),
  );
  const configs = parseConfigs(await readJsonFile(EVAL_PATHS.configs));
  const personas = (await loadPersonaFiles(EVAL_PATHS.personas)).map(
    (file) => file.persona,
  );
  const records = parseCallRecords(await readFile(EVAL_PATHS.runs, "utf8"));
  const recordsByKey = new Map(
    records.map((record) => [
      `${record.configId}|${record.repetition}|${record.persona}|${record.batchIndex}`,
      record,
    ]),
  );

  const labeledCandidates = new Map<string, LabeledCandidate[]>();
  const candidateKeys = new Map<string, string[]>();
  const recall: Record<string, ReturnType<typeof estimateRecall>> = {};
  const baselineByPersona: Record<
    string,
    ReturnType<typeof evaluateRanking>
  > = {};

  for (const persona of personas) {
    if (persona.profile === null) {
      throw new Error(`Persona ${persona.id} has no extracted profile yet.`);
    }
    const { ranked, unmatched } = rankOffers(persona.profile, snapshot.offers);
    const top = ranked.slice(0, DEFAULT_TOP_K);
    const bands = top.map((entry) =>
      bandOf(labels, snapshot, persona.id, entry.offer.key),
    );
    labeledCandidates.set(
      persona.id,
      top.map((entry, index) => ({
        offerKey: entry.offer.key,
        band: bands[index] as number,
      })),
    );
    candidateKeys.set(
      persona.id,
      top.map((entry) => entry.offer.key),
    );
    baselineByPersona[persona.id] = evaluateRanking(
      top.map((entry, index) => ({
        score: entry.score,
        band: bands[index] as number,
      })),
    );

    const pool = buildPool(
      persona.profile,
      snapshot.offers,
      createRandom(hashSeed(persona.id)),
      DEFAULT_POOL_SIZES,
    );
    const sampleBands = (origin: "beyond_top" | "unmatched"): number[] =>
      pool
        .filter((item) => item.origin === origin)
        .map((item) => bandOf(labels, snapshot, persona.id, item.offer.key));
    recall[persona.id] = estimateRecall({
      candidateBands: bands,
      beyondPopulation: Math.max(0, ranked.length - DEFAULT_TOP_K),
      beyondSampleBands: sampleBands("beyond_top"),
      unmatchedPopulation: unmatched.length,
      unmatchedSampleBands: sampleBands("unmatched"),
    });
  }

  const plan = planCalls(configs, candidateKeys);
  const summaries: ConfigSummary[] = configs.map((config) => {
    const results: RepetitionResult[] = [];
    for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
      const calls = plan.filter(
        (call) => call.configId === config.id && call.repetition === repetition,
      );
      const found = calls.map((call) => recordsByKey.get(call.key));
      if (found.some((record) => record === undefined)) {
        continue;
      }
      const done = found as CallRecord[];
      results.push({
        repetition,
        personas: Object.fromEntries(
          personas.map((persona) => [
            persona.id,
            evaluateSearch(
              labeledCandidates.get(persona.id) ?? [],
              done.filter((record) => record.persona === persona.id),
            ),
          ]),
        ),
      });
    }
    return summarizeConfig(config, results);
  });

  const decision = decide(summaries);
  const baselineQuality = mean(
    Object.values(baselineByPersona).map((entry) => entry.spearman ?? 0),
  );

  console.log(
    `Snapshot ${snapshot.snapshotId}. Relevant means band ${RELEVANT_FROM_BAND} or more.`,
  );
  console.log("");
  console.log(
    "Prefilter recall at 30 (estimated from the sample beyond the top and the unmatched sample)",
  );
  for (const persona of personas) {
    const entry = recall[persona.id];
    if (entry === undefined) {
      continue;
    }
    console.log(
      `  ${persona.id}: recall ${fixed(entry.recall)}  relevant in top 30: ${entry.relevantInCandidates}  beyond top: ${entry.relevantInBeyondSample}/${entry.beyondSampleSize}  unmatched: ${entry.relevantInUnmatchedSample}/${entry.unmatchedSampleSize}`,
    );
  }
  console.log("");
  console.log(
    `Baseline, the prefilter order itself: Spearman ${fixed(baselineQuality)}`,
  );
  console.log("");
  console.log(
    "Config, repetitions done, Spearman, precision at 5, calls per search, search latency, unscored",
  );
  for (const summary of summaries) {
    console.log(
      `  ${summary.configId}: ${summary.completeRepetitions}/${REPETITIONS}  rho ${fixed(summary.quality)} (${summary.qualityByRepetition.map((value) => fixed(value)).join(", ")})  p@${PRECISION_K} ${fixed(summary.precisionAt5)}  calls ${fixed(summary.callsPerSearch, 1)}  ${summary.searchLatencyMs === null ? "n/a" : `${(summary.searchLatencyMs / 1000).toFixed(1)} s`}  unscored ${summary.unscoredRate === null ? "n/a" : `${(summary.unscoredRate * 100).toFixed(1)}%`}  failures ${summary.failures}`,
    );
  }
  console.log("");
  if (decision === null) {
    console.log(
      `No config has its ${REPETITIONS} repetitions yet, so there is no decision.`,
    );
  } else {
    console.log(
      `Best: ${decision.best} (${fixed(decision.bestQuality)}). Noise: ${fixed(decision.noise, 3)}. Within the noise: ${decision.equivalent.join(", ")}.`,
    );
    console.log(
      `Chosen by the rule (fewest calls, then lowest latency): ${decision.chosen}`,
    );
  }

  await writeJsonFile(EVAL_PATHS.results, {
    snapshotId: snapshot.snapshotId,
    repetitions: REPETITIONS,
    relevantFromBand: RELEVANT_FROM_BAND,
    precisionK: PRECISION_K,
    prefilterRecall: recall,
    prefilterBaseline: {
      quality: baselineQuality,
      byPersona: baselineByPersona,
    },
    configs: summaries,
    decision,
  });
  console.log(`Saved ${EVAL_PATHS.results}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
