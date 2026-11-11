import { describe, expect, it } from "vitest";
import {
  callKey,
  chunk,
  decide,
  estimateRecall,
  evaluateRanking,
  evaluateSearch,
  parseCallRecords,
  parseConfigs,
  planCalls,
  summarizeConfig,
  type CallRecord,
  type ConfigSummary,
  type ExperimentConfig,
  type RepetitionResult,
  type SearchEvaluation,
} from "../../../scripts/eval/experiment.mts";

const CONFIG: ExperimentConfig = {
  id: "lite-b10",
  model: "gemini-x",
  batchSize: 10,
};

function record(overrides: Partial<CallRecord> = {}): CallRecord {
  return {
    configId: "lite-b10",
    repetition: 1,
    persona: "a-junior-backend",
    batchIndex: 0,
    offerKeys: ["o:1", "o:2"],
    scores: [80, 20],
    failure: null,
    latencyMs: 1000,
    at: "2026-11-10T15:00:00.000Z",
    ...overrides,
  };
}

function evaluation(
  overrides: Partial<SearchEvaluation> = {},
): SearchEvaluation {
  return {
    spearman: 0.5,
    precisionAt5: 0.6,
    candidates: 30,
    calls: 3,
    latencyMs: 9000,
    unscored: 0,
    failures: 0,
    ...overrides,
  };
}

describe("parseConfigs", () => {
  it("accepts a list of configs", () => {
    expect(parseConfigs([CONFIG])).toEqual([CONFIG]);
  });

  it.each([
    ["an empty list", []],
    ["a config that is not an object", ["x"]],
    ["an id with capitals", [{ ...CONFIG, id: "Lite" }]],
    ["an empty model", [{ ...CONFIG, model: "" }]],
    ["a batch size of zero", [{ ...CONFIG, batchSize: 0 }]],
    ["a batch size above 30", [{ ...CONFIG, batchSize: 31 }]],
    ["a batch size with decimals", [{ ...CONFIG, batchSize: 2.5 }]],
  ])("rejects %s", (_name, value) => {
    expect(() => parseConfigs(value)).toThrow(/^Invalid configs file/);
  });

  it("accepts the batch sizes 1 and 30", () => {
    expect(
      parseConfigs([
        { ...CONFIG, batchSize: 1 },
        { ...CONFIG, id: "b30", batchSize: 30 },
      ]),
    ).toHaveLength(2);
  });

  it("rejects a repeated id", () => {
    expect(() => parseConfigs([CONFIG, CONFIG])).toThrow(
      "Invalid configs file: duplicate config id lite-b10",
    );
  });
});

describe("callKey", () => {
  it("joins the parts that identify a call", () => {
    expect(
      callKey({ configId: "c", repetition: 2, persona: "p", batchIndex: 1 }),
    ).toBe("c|2|p|1");
  });
});

describe("parseCallRecords", () => {
  it("reads one record per line", () => {
    const text = `${JSON.stringify(record())}\n${JSON.stringify(record({ batchIndex: 1 }))}\n`;

    expect(parseCallRecords(text)).toEqual([
      record(),
      record({ batchIndex: 1 }),
    ]);
  });

  it("ignores blank lines and a missing final newline", () => {
    const text = `\n${JSON.stringify(record())}\n\n${JSON.stringify(record({ batchIndex: 1 }))}`;

    expect(parseCallRecords(text)).toHaveLength(2);
  });

  it("reads an empty file", () => {
    expect(parseCallRecords("")).toEqual([]);
  });

  it("accepts a failed call with empty scores", () => {
    const failed = record({
      scores: [null, null],
      failure: "invalid_response",
    });

    expect(parseCallRecords(JSON.stringify(failed))).toEqual([failed]);
  });

  it("names the line that is not json", () => {
    expect(() =>
      parseCallRecords(`${JSON.stringify(record())}\n{broken`),
    ).toThrow("Invalid run record at line 2: not valid JSON");
  });

  it("names the field that fails", () => {
    expect(() =>
      parseCallRecords(JSON.stringify(record({ latencyMs: -1 }))),
    ).toThrow(/^Invalid run record at line 1 at latencyMs/);
  });

  it.each([
    ["one score too few", { scores: [80] }],
    ["one score too many", { scores: [80, 20, 10] }],
    ["no offers", { offerKeys: [], scores: [] }],
    ["a repetition of zero", { repetition: 0 }],
    ["a negative batch index", { batchIndex: -1 }],
    ["a bad time", { at: "now" }],
    ["another kind of failure", { failure: "quota" }],
  ])("rejects %s", (_name, change) => {
    expect(() =>
      parseCallRecords(JSON.stringify({ ...record(), ...change })),
    ).toThrow(/^Invalid run record at line 1/);
  });

  it("rejects the same call twice", () => {
    const line = JSON.stringify(record());

    expect(() => parseCallRecords(`${line}\n${line}`)).toThrow(
      "Invalid run record at line 2: duplicate call lite-b10|1|a-junior-backend|0",
    );
  });
});

describe("chunk", () => {
  it("splits a list into groups of the given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns one group when the size is larger than the list", () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
  });

  it("returns nothing for an empty list", () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it.each([0, -1, 1.5])("rejects the size %s", (size) => {
    expect(() => chunk([1], size)).toThrow(RangeError);
  });
});

describe("planCalls", () => {
  const candidates = new Map([
    ["a", ["a1", "a2", "a3"]],
    ["b", ["b1", "b2"]],
  ]);
  const configs: ExperimentConfig[] = [
    { id: "c2", model: "m", batchSize: 2 },
    { id: "c5", model: "m", batchSize: 5 },
  ];

  it("plans every batch of every persona for every config and repetition", () => {
    expect(planCalls(configs, candidates, 3)).toHaveLength(3 * (2 + 1 + 1 + 1));
  });

  it("uses three repetitions by default", () => {
    expect(
      new Set(planCalls(configs, candidates).map((call) => call.repetition)),
    ).toEqual(new Set([1, 2, 3]));
  });

  it("goes repetition by repetition so a partial run stays balanced", () => {
    const plan = planCalls(configs, candidates, 2);

    expect(plan.map((call) => call.repetition)).toEqual([
      1, 1, 1, 1, 1, 2, 2, 2, 2, 2,
    ]);
  });

  it("keeps the candidate order inside the batches", () => {
    const plan = planCalls([configs[0] as ExperimentConfig], candidates, 1);

    expect(
      plan.map((call) => [call.persona, call.batchIndex, ...call.offerKeys]),
    ).toEqual([
      ["a", 0, "a1", "a2"],
      ["a", 1, "a3"],
      ["b", 0, "b1", "b2"],
    ]);
  });

  it("gives every call a unique key built from its parts", () => {
    const plan = planCalls(configs, candidates, 3);

    expect(new Set(plan.map((call) => call.key)).size).toBe(plan.length);
    for (const call of plan) {
      expect(call.key).toBe(callKey(call));
    }
  });

  it("plans nothing for no personas", () => {
    expect(planCalls(configs, new Map(), 3)).toEqual([]);
  });
});

describe("evaluateRanking", () => {
  it("measures how well the scores follow the bands", () => {
    const ranking = evaluateRanking([
      { score: 90, band: 3 },
      { score: 60, band: 2 },
      { score: 30, band: 1 },
      { score: 10, band: 0 },
    ]);

    expect(ranking.spearman).toBeCloseTo(1, 12);
    expect(ranking.precisionAt5).toBe(0.5);
  });

  it("has no correlation when every score is the same", () => {
    expect(
      evaluateRanking([
        { score: 5, band: 0 },
        { score: 5, band: 3 },
      ]).spearman,
    ).toBeNull();
  });

  it("looks at the five highest scores for the precision", () => {
    const items = [
      ...Array.from({ length: 4 }, () => ({ score: 90, band: 3 })),
      { score: 80, band: 0 },
      ...Array.from({ length: 5 }, () => ({ score: 10, band: 3 })),
    ];

    expect(evaluateRanking(items).precisionAt5).toBe(0.8);
  });

  it("counts the band 2 as relevant and the band 1 as not relevant", () => {
    expect(
      evaluateRanking([
        { score: 2, band: 2 },
        { score: 1, band: 1 },
      ]).precisionAt5,
    ).toBe(0.5);
  });
});

describe("evaluateSearch", () => {
  const candidates = [
    { offerKey: "o:1", band: 3 },
    { offerKey: "o:2", band: 0 },
    { offerKey: "o:3", band: 2 },
  ];

  it("joins the scores of all the batches and measures the ranking", () => {
    const result = evaluateSearch(candidates, [
      record({ offerKeys: ["o:1", "o:2"], scores: [90, 10], latencyMs: 1000 }),
      record({
        batchIndex: 1,
        offerKeys: ["o:3"],
        scores: [70],
        latencyMs: 500,
      }),
    ]);

    expect(result).toMatchObject({
      spearman: expect.closeTo(1, 12),
      candidates: 3,
      calls: 2,
      latencyMs: 1500,
      unscored: 0,
      failures: 0,
    });
    expect(result.precisionAt5).toBe(2 / 3);
  });

  it("counts the offers without a score and ranks them last", () => {
    const result = evaluateSearch(candidates, [
      record({ offerKeys: ["o:1", "o:2", "o:3"], scores: [90, 10, null] }),
    ]);

    expect(result.unscored).toBe(1);
    expect(result.spearman).toBeCloseTo(0.5, 12);
  });

  it("ranks an offer without a score below every offer that has one", () => {
    const labeled = [
      { offerKey: "o:1", band: 3 },
      { offerKey: "o:2", band: 2 },
      { offerKey: "o:3", band: 0 },
    ];

    const result = evaluateSearch(labeled, [
      record({ offerKeys: ["o:1", "o:2", "o:3"], scores: [90, 10, null] }),
    ]);

    expect(result.spearman).toBeCloseTo(1, 12);
  });

  it("counts an offer that no call covers as unscored", () => {
    const result = evaluateSearch(candidates, [
      record({ offerKeys: ["o:1"], scores: [90] }),
    ]);

    expect(result.unscored).toBe(2);
    expect(result.calls).toBe(1);
  });

  it("counts the failed calls", () => {
    const result = evaluateSearch(candidates, [
      record({
        offerKeys: ["o:1", "o:2", "o:3"],
        scores: [null, null, null],
        failure: "invalid_response",
      }),
    ]);

    expect(result.failures).toBe(1);
    expect(result.unscored).toBe(3);
    expect(result.spearman).toBeNull();
  });

  it("reports no calls and nothing scored for no records", () => {
    expect(evaluateSearch(candidates, [])).toMatchObject({
      calls: 0,
      latencyMs: 0,
      unscored: 3,
    });
  });
});

describe("summarizeConfig", () => {
  const results: RepetitionResult[] = [
    {
      repetition: 1,
      personas: {
        a: evaluation({
          spearman: 0.6,
          precisionAt5: 0.8,
          calls: 3,
          latencyMs: 9000,
        }),
        b: evaluation({
          spearman: 0.4,
          precisionAt5: 0.4,
          calls: 3,
          latencyMs: 12000,
          unscored: 3,
          failures: 1,
        }),
      },
    },
    {
      repetition: 2,
      personas: {
        a: evaluation({
          spearman: 0.5,
          precisionAt5: 0.6,
          calls: 3,
          latencyMs: 9000,
        }),
        b: evaluation({
          spearman: null,
          precisionAt5: 0.2,
          calls: 3,
          latencyMs: 12000,
        }),
      },
    },
  ];

  it("averages over the personas and then over the repetitions", () => {
    const summary = summarizeConfig(CONFIG, results);

    expect(summary.qualityByRepetition).toEqual([0.5, 0.25]);
    expect(summary.quality).toBe(0.375);
  });

  it("counts a missing correlation as zero", () => {
    expect(summarizeConfig(CONFIG, results).qualityByPersona).toEqual({
      a: 0.55,
      b: 0.2,
    });
  });

  it("averages the precision, the calls and the latency per search", () => {
    const summary = summarizeConfig(CONFIG, results);

    expect(summary.precisionAt5).toBeCloseTo(0.5, 12);
    expect(summary.callsPerSearch).toBe(3);
    expect(summary.searchLatencyMs).toBe(10500);
  });

  it("counts a missing precision as zero", () => {
    const summary = summarizeConfig(CONFIG, [
      {
        repetition: 1,
        personas: {
          a: evaluation({ precisionAt5: null, calls: 0, latencyMs: 0 }),
          b: evaluation({ precisionAt5: 1 }),
        },
      },
    ]);

    expect(summary.precisionAt5).toBe(0.5);
  });

  it("reports the unscored rate and the failures", () => {
    const summary = summarizeConfig(CONFIG, results);

    expect(summary.unscoredRate).toBeCloseTo(3 / 120, 12);
    expect(summary.failures).toBe(1);
  });

  it("carries the config and the number of repetitions", () => {
    expect(summarizeConfig(CONFIG, results)).toMatchObject({
      configId: "lite-b10",
      model: "gemini-x",
      batchSize: 10,
      completeRepetitions: 2,
    });
  });

  it("has no numbers when no repetition is done", () => {
    expect(summarizeConfig(CONFIG, [])).toMatchObject({
      completeRepetitions: 0,
      quality: null,
      precisionAt5: null,
      callsPerSearch: null,
      searchLatencyMs: null,
      unscoredRate: null,
    });
  });
});

function summary(
  id: string,
  qualityByRepetition: number[],
  callsPerSearch: number,
  searchLatencyMs: number,
): ConfigSummary {
  return {
    configId: id,
    model: "m",
    batchSize: 10,
    completeRepetitions: qualityByRepetition.length,
    qualityByRepetition,
    quality:
      qualityByRepetition.reduce((sum, value) => sum + value, 0) /
      qualityByRepetition.length,
    qualityByPersona: {},
    precisionAt5: 0.5,
    callsPerSearch,
    searchLatencyMs,
    unscoredRate: 0,
    failures: 0,
  };
}

describe("decide", () => {
  it("returns nothing when no config has all its repetitions", () => {
    expect(decide([summary("a", [0.5, 0.5], 3, 1000)])).toBeNull();
    expect(decide([])).toBeNull();
  });

  it("picks the cheapest config whose quality is within the noise of the best", () => {
    const decision = decide([
      summary("best", [0.7, 0.72, 0.74], 6, 20000),
      summary("close", [0.68, 0.7, 0.72], 3, 15000),
      summary("far", [0.5, 0.52, 0.54], 1, 5000),
    ]);

    expect(decision).toMatchObject({
      best: "best",
      chosen: "close",
      equivalent: ["best", "close"],
    });
    expect(decision?.noise).toBeCloseTo(0.02, 12);
    expect(decision?.bestQuality).toBeCloseTo(0.72, 12);
  });

  it("uses the largest swing between repetitions of any config as the noise", () => {
    const decision = decide([
      summary("a", [0.7, 0.7, 0.7], 6, 1000),
      summary("b", [0.5, 0.7, 0.9], 3, 1000),
    ]);

    expect(decision?.noise).toBeCloseTo(0.2, 12);
  });

  it("includes a config exactly at the edge of the noise", () => {
    const decision = decide([
      summary("best", [0.5, 0.75, 1], 6, 1000),
      summary("edge", [0.5, 0.5, 0.5], 3, 1000),
    ]);

    expect(decision?.noise).toBe(0.25);
    expect(decision?.equivalent).toEqual(["best", "edge"]);
  });

  it("excludes a config just past the edge of the noise", () => {
    const decision = decide([
      summary("best", [0.5, 0.75, 1], 6, 1000),
      summary("past", [0.49, 0.49, 0.49], 3, 1000),
    ]);

    expect(decision?.equivalent).toEqual(["best"]);
  });

  it("is not thrown off by decimals at the edge of the noise", () => {
    const decision = decide([
      summary("best", [0.7, 0.72, 0.74], 6, 1000),
      summary("close", [0.68, 0.7, 0.72], 3, 1000),
    ]);

    expect(decision?.equivalent).toEqual(["best", "close"]);
  });

  it("breaks a tie in calls with the latency and then with the id", () => {
    const sameCalls = decide([
      summary("a-slow", [0.7, 0.7, 0.7], 3, 9000),
      summary("z-fast", [0.7, 0.7, 0.7], 3, 4000),
    ]);
    const sameBoth = decide([
      summary("b", [0.7, 0.7, 0.7], 3, 4000),
      summary("a", [0.7, 0.7, 0.7], 3, 4000),
    ]);

    expect(sameCalls?.chosen).toBe("z-fast");
    expect(sameBoth?.chosen).toBe("a");
  });

  it("ignores the configs with missing repetitions", () => {
    const decision = decide([
      summary("done", [0.5, 0.5, 0.5], 3, 1000),
      summary("partial", [0.9, 0.9], 1, 100),
    ]);

    expect(decision?.best).toBe("done");
  });

  it("picks the only config when there is one", () => {
    expect(decide([summary("only", [0.4, 0.5, 0.6], 3, 1000)])).toMatchObject({
      best: "only",
      chosen: "only",
      equivalent: ["only"],
    });
  });

  it("breaks a tie in quality with the id when naming the best", () => {
    expect(
      decide([
        summary("b", [0.7, 0.7, 0.7], 3, 1000),
        summary("a", [0.7, 0.7, 0.7], 3, 1000),
      ])?.best,
    ).toBe("a");
  });
});

describe("estimateRecall", () => {
  it("is 1 when nothing relevant was found outside the top", () => {
    const recall = estimateRecall({
      candidateBands: [3, 2, 0],
      beyondPopulation: 100,
      beyondSampleBands: [0, 1, 0, 0],
      unmatchedPopulation: 200,
      unmatchedSampleBands: [0, 0, 1],
    });

    expect(recall).toMatchObject({
      relevantInCandidates: 2,
      estimatedRelevantTotal: 2,
      recall: 1,
    });
  });

  it("scales what the samples find up to the size of each stratum", () => {
    const recall = estimateRecall({
      candidateBands: [3, 3, 2, 0],
      beyondPopulation: 20,
      beyondSampleBands: [2, 0, 0, 0],
      unmatchedPopulation: 40,
      unmatchedSampleBands: [3, 0, 0, 0, 0, 0, 0, 0],
    });

    expect(recall.estimatedRelevantTotal).toBeCloseTo(3 + 5 + 5, 12);
    expect(recall.recall).toBeCloseTo(3 / 13, 12);
    expect(recall).toMatchObject({
      relevantInBeyondSample: 1,
      beyondSampleSize: 4,
      relevantInUnmatchedSample: 1,
      unmatchedSampleSize: 8,
    });
  });

  it("counts the band 2 as relevant and the band 1 as not", () => {
    const recall = estimateRecall({
      candidateBands: [2, 1],
      beyondPopulation: 0,
      beyondSampleBands: [],
      unmatchedPopulation: 0,
      unmatchedSampleBands: [],
    });

    expect(recall).toMatchObject({ relevantInCandidates: 1, recall: 1 });
  });

  it("needs no sample for a stratum that has no offers", () => {
    const recall = estimateRecall({
      candidateBands: [3],
      beyondPopulation: 0,
      beyondSampleBands: [],
      unmatchedPopulation: 10,
      unmatchedSampleBands: [0, 0],
    });

    expect(recall.recall).toBe(1);
  });

  it("cannot estimate when a stratum with offers has no sample", () => {
    const recall = estimateRecall({
      candidateBands: [3],
      beyondPopulation: 5,
      beyondSampleBands: [],
      unmatchedPopulation: 0,
      unmatchedSampleBands: [],
    });

    expect(recall).toMatchObject({
      estimatedRelevantTotal: null,
      recall: null,
    });
  });

  it("has no recall when nothing relevant exists", () => {
    const recall = estimateRecall({
      candidateBands: [0, 1],
      beyondPopulation: 5,
      beyondSampleBands: [0],
      unmatchedPopulation: 5,
      unmatchedSampleBands: [0],
    });

    expect(recall).toMatchObject({ estimatedRelevantTotal: 0, recall: null });
  });

  it("is exact when the sample is the whole stratum", () => {
    const recall = estimateRecall({
      candidateBands: [3, 3],
      beyondPopulation: 2,
      beyondSampleBands: [3, 0],
      unmatchedPopulation: 0,
      unmatchedSampleBands: [],
    });

    expect(recall.recall).toBeCloseTo(2 / 3, 12);
  });
});
