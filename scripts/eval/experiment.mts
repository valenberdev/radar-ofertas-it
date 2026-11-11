import { z } from "zod";
import { failure, PERSONA_ID } from "./dataset.mts";
import { mean, precisionAtK, spearman } from "./metrics.mts";

export const REPETITIONS = 3;
export const PRECISION_K = 5;
export const RELEVANT_FROM_BAND = 2;
const UNSCORED = -1;
const TOLERANCE = 1e-9;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const configSchema = z.object({
  id: z.string().regex(SLUG),
  model: z.string().min(1),
  batchSize: z.number().int().min(1).max(30),
});

const configsSchema = z.array(configSchema).min(1);

export type ExperimentConfig = z.infer<typeof configSchema>;

export function parseConfigs(value: unknown): ExperimentConfig[] {
  const result = configsSchema.safeParse(value);
  if (!result.success) {
    throw failure("configs file", result.error);
  }
  const seen = new Set<string>();
  for (const config of result.data) {
    if (seen.has(config.id)) {
      throw new Error(`Invalid configs file: duplicate config id ${config.id}`);
    }
    seen.add(config.id);
  }
  return result.data;
}

const callRecordSchema = z
  .object({
    configId: z.string().regex(SLUG),
    repetition: z.number().int().min(1),
    persona: z.string().regex(PERSONA_ID),
    batchIndex: z.number().int().min(0),
    offerKeys: z.array(z.string().min(1)).min(1),
    scores: z.array(z.number().nullable()),
    failure: z.literal("invalid_response").nullable(),
    latencyMs: z.number().min(0),
    at: z.iso.datetime(),
  })
  .refine((record) => record.scores.length === record.offerKeys.length, {
    message: "There must be one score per offer",
    path: ["scores"],
  });

export type CallRecord = z.infer<typeof callRecordSchema>;

export interface CallId {
  readonly configId: string;
  readonly repetition: number;
  readonly persona: string;
  readonly batchIndex: number;
}

export function callKey(call: CallId): string {
  return `${call.configId}|${call.repetition}|${call.persona}|${call.batchIndex}`;
}

export function parseCallRecords(text: string): CallRecord[] {
  const records: CallRecord[] = [];
  const seen = new Set<string>();
  text.split("\n").forEach((line, index) => {
    if (line.trim() === "") {
      return;
    }
    const number = index + 1;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`Invalid run record at line ${number}: not valid JSON`);
    }
    const result = callRecordSchema.safeParse(value);
    if (!result.success) {
      const issue = result.error.issues[0];
      const location =
        issue === undefined || issue.path.length === 0
          ? ""
          : ` at ${issue.path.map(String).join(".")}`;
      throw new Error(
        `Invalid run record at line ${number}${location}: ${issue?.message ?? "unknown problem"}`,
      );
    }
    const key = callKey(result.data);
    if (seen.has(key)) {
      throw new Error(
        `Invalid run record at line ${number}: duplicate call ${key}`,
      );
    }
    seen.add(key);
    records.push(result.data);
  });
  return records;
}

export interface PlannedCall extends CallId {
  readonly key: string;
  readonly offerKeys: readonly string[];
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError("The size must be a positive integer");
  }
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    result.push(items.slice(start, start + size));
  }
  return result;
}

export function planCalls(
  configs: readonly ExperimentConfig[],
  candidates: ReadonlyMap<string, readonly string[]>,
  repetitions: number = REPETITIONS,
): PlannedCall[] {
  const plan: PlannedCall[] = [];
  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    for (const config of configs) {
      for (const [persona, offerKeys] of candidates) {
        chunk(offerKeys, config.batchSize).forEach((batch, batchIndex) => {
          const id: CallId = {
            configId: config.id,
            repetition,
            persona,
            batchIndex,
          };
          plan.push({ ...id, key: callKey(id), offerKeys: batch });
        });
      }
    }
  }
  return plan;
}

export interface RankedCandidate {
  readonly score: number;
  readonly band: number;
}

export interface RankingQuality {
  readonly spearman: number | null;
  readonly precisionAt5: number | null;
}

export function evaluateRanking(
  candidates: readonly RankedCandidate[],
): RankingQuality {
  return {
    spearman: spearman(
      candidates.map((candidate) => candidate.score),
      candidates.map((candidate) => candidate.band),
    ),
    precisionAt5: precisionAtK(candidates, PRECISION_K, RELEVANT_FROM_BAND),
  };
}

export interface LabeledCandidate {
  readonly offerKey: string;
  readonly band: number;
}

export interface SearchEvaluation extends RankingQuality {
  readonly candidates: number;
  readonly calls: number;
  readonly latencyMs: number;
  readonly unscored: number;
  readonly failures: number;
}

export function evaluateSearch(
  candidates: readonly LabeledCandidate[],
  records: readonly CallRecord[],
): SearchEvaluation {
  const scoreByKey = new Map<string, number | null>();
  for (const record of records) {
    record.offerKeys.forEach((key, index) =>
      scoreByKey.set(key, record.scores[index] ?? null),
    );
  }
  const scored = candidates.map((candidate) => ({
    score: scoreByKey.get(candidate.offerKey) ?? null,
    band: candidate.band,
  }));
  return {
    ...evaluateRanking(
      scored.map((item) => ({
        score: item.score ?? UNSCORED,
        band: item.band,
      })),
    ),
    candidates: candidates.length,
    calls: records.length,
    latencyMs: records.reduce((sum, record) => sum + record.latencyMs, 0),
    unscored: scored.filter((item) => item.score === null).length,
    failures: records.filter((record) => record.failure !== null).length,
  };
}

export interface RepetitionResult {
  readonly repetition: number;
  readonly personas: Readonly<Record<string, SearchEvaluation>>;
}

export interface ConfigSummary {
  readonly configId: string;
  readonly model: string;
  readonly batchSize: number;
  readonly completeRepetitions: number;
  readonly qualityByRepetition: readonly number[];
  readonly quality: number | null;
  readonly qualityByPersona: Readonly<Record<string, number | null>>;
  readonly precisionAt5: number | null;
  readonly callsPerSearch: number | null;
  readonly searchLatencyMs: number | null;
  readonly unscoredRate: number | null;
  readonly failures: number;
}

function personaMean(
  results: readonly RepetitionResult[],
  pick: (evaluation: SearchEvaluation) => number | null,
): number | null {
  return mean(
    results.flatMap((result) =>
      Object.values(result.personas).map((evaluation) => pick(evaluation) ?? 0),
    ),
  );
}

export function summarizeConfig(
  config: ExperimentConfig,
  results: readonly RepetitionResult[],
): ConfigSummary {
  const qualityByRepetition = results.map(
    (result) =>
      mean(
        Object.values(result.personas).map(
          (evaluation) => evaluation.spearman ?? 0,
        ),
      ) ?? 0,
  );
  const personaIds = [
    ...new Set(results.flatMap((result) => Object.keys(result.personas))),
  ].sort();
  const evaluations = results.flatMap((result) =>
    Object.values(result.personas),
  );
  const totalCandidates = evaluations.reduce(
    (sum, evaluation) => sum + evaluation.candidates,
    0,
  );
  return {
    configId: config.id,
    model: config.model,
    batchSize: config.batchSize,
    completeRepetitions: results.length,
    qualityByRepetition,
    quality: mean(qualityByRepetition),
    qualityByPersona: Object.fromEntries(
      personaIds.map((persona) => [
        persona,
        mean(results.map((result) => result.personas[persona]?.spearman ?? 0)),
      ]),
    ),
    precisionAt5: personaMean(results, (evaluation) => evaluation.precisionAt5),
    callsPerSearch: personaMean(results, (evaluation) => evaluation.calls),
    searchLatencyMs: personaMean(results, (evaluation) => evaluation.latencyMs),
    unscoredRate:
      totalCandidates === 0
        ? null
        : evaluations.reduce(
            (sum, evaluation) => sum + evaluation.unscored,
            0,
          ) / totalCandidates,
    failures: evaluations.reduce(
      (sum, evaluation) => sum + evaluation.failures,
      0,
    ),
  };
}

export interface Decision {
  readonly best: string;
  readonly bestQuality: number;
  readonly noise: number;
  readonly equivalent: readonly string[];
  readonly chosen: string;
}

export function decide(summaries: readonly ConfigSummary[]): Decision | null {
  const eligible = summaries.filter(
    (summary) =>
      summary.completeRepetitions >= REPETITIONS &&
      summary.quality !== null &&
      summary.callsPerSearch !== null &&
      summary.searchLatencyMs !== null,
  );
  if (eligible.length === 0) {
    return null;
  }
  const quality = (summary: ConfigSummary): number => summary.quality as number;
  const best = [...eligible].sort(
    (first, second) =>
      quality(second) - quality(first) ||
      first.configId.localeCompare(second.configId),
  )[0] as ConfigSummary;
  const noise = Math.max(
    ...eligible.map(
      (summary) =>
        (Math.max(...summary.qualityByRepetition) -
          Math.min(...summary.qualityByRepetition)) /
        2,
    ),
  );
  const equivalent = eligible.filter(
    (summary) => quality(summary) >= quality(best) - noise - TOLERANCE,
  );
  const chosen = [...equivalent].sort(
    (first, second) =>
      (first.callsPerSearch as number) - (second.callsPerSearch as number) ||
      (first.searchLatencyMs as number) - (second.searchLatencyMs as number) ||
      first.configId.localeCompare(second.configId),
  )[0] as ConfigSummary;
  return {
    best: best.configId,
    bestQuality: quality(best),
    noise,
    equivalent: equivalent.map((summary) => summary.configId).sort(),
    chosen: chosen.configId,
  };
}

export interface RecallInput {
  readonly candidateBands: readonly number[];
  readonly beyondPopulation: number;
  readonly beyondSampleBands: readonly number[];
  readonly unmatchedPopulation: number;
  readonly unmatchedSampleBands: readonly number[];
}

export interface Recall {
  readonly relevantInCandidates: number;
  readonly relevantInBeyondSample: number;
  readonly beyondSampleSize: number;
  readonly relevantInUnmatchedSample: number;
  readonly unmatchedSampleSize: number;
  readonly estimatedRelevantTotal: number | null;
  readonly recall: number | null;
}

function relevantCount(bands: readonly number[]): number {
  return bands.filter((band) => band >= RELEVANT_FROM_BAND).length;
}

function estimateStratum(
  population: number,
  sampleBands: readonly number[],
): number | null {
  if (population === 0) {
    return 0;
  }
  if (sampleBands.length === 0) {
    return null;
  }
  return (population * relevantCount(sampleBands)) / sampleBands.length;
}

export function estimateRecall(input: RecallInput): Recall {
  const relevantInCandidates = relevantCount(input.candidateBands);
  const beyond = estimateStratum(
    input.beyondPopulation,
    input.beyondSampleBands,
  );
  const unmatched = estimateStratum(
    input.unmatchedPopulation,
    input.unmatchedSampleBands,
  );
  const estimatedRelevantTotal =
    beyond === null || unmatched === null
      ? null
      : relevantInCandidates + beyond + unmatched;
  return {
    relevantInCandidates,
    relevantInBeyondSample: relevantCount(input.beyondSampleBands),
    beyondSampleSize: input.beyondSampleBands.length,
    relevantInUnmatchedSample: relevantCount(input.unmatchedSampleBands),
    unmatchedSampleSize: input.unmatchedSampleBands.length,
    estimatedRelevantTotal,
    recall:
      estimatedRelevantTotal === null || estimatedRelevantTotal === 0
        ? null
        : relevantInCandidates / estimatedRelevantTotal,
  };
}
