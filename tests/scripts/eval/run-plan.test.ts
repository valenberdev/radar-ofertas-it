import { describe, expect, it } from "vitest";
import { LlmError } from "../../../src/application/ports/llm-error";
import type { OfferScore } from "../../../src/application/ports/offer-scorer";
import type {
  CallRecord,
  PlannedCall,
} from "../../../scripts/eval/experiment.mts";
import {
  runPlan,
  type RunDeps,
  type RunOptions,
} from "../../../scripts/eval/run-plan.mts";

const OPTIONS: RunOptions = {
  maxCalls: null,
  quotaWaitMs: 65_000,
  unavailableWaitMs: 10_000,
};

function call(
  batchIndex: number,
  offerKeys: string[] = [`o:${batchIndex}a`, `o:${batchIndex}b`],
): PlannedCall {
  return {
    key: `c|1|p|${batchIndex}`,
    configId: "c",
    repetition: 1,
    persona: "p",
    batchIndex,
    offerKeys,
  };
}

function score(value: number): OfferScore {
  return { score: value, reasonEs: "es", reasonEn: "en" };
}

type Behavior = (
  call: PlannedCall,
  attempt: number,
) => readonly (OfferScore | null)[] | Error;

function setup(
  behavior: Behavior = (planned) => planned.offerKeys.map(() => score(50)),
) {
  const records: CallRecord[] = [];
  const sleeps: number[] = [];
  const logs: string[] = [];
  const attempts = new Map<string, number>();
  let clock = 1_000_000_000_000;
  const deps: RunDeps = {
    score: async (planned) => {
      const attempt = (attempts.get(planned.key) ?? 0) + 1;
      attempts.set(planned.key, attempt);
      clock += 250;
      const outcome = behavior(planned, attempt);
      if (outcome instanceof Error) {
        throw outcome;
      }
      return outcome;
    },
    append: async (record) => {
      records.push(record);
    },
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    now: () => clock,
    log: (message) => logs.push(message),
  };
  return { deps, records, sleeps, logs, attempts };
}

describe("runPlan", () => {
  it("makes every planned call in order and saves one record for each", async () => {
    const { deps, records } = setup();

    const outcome = await runPlan([call(0), call(1)], new Set(), deps, OPTIONS);

    expect(outcome).toEqual({
      executed: 2,
      skipped: 0,
      remaining: 0,
      stoppedBy: "finished",
    });
    expect(records.map((record) => record.batchIndex)).toEqual([0, 1]);
  });

  it("saves the scores and the identity of the call", async () => {
    const { deps, records } = setup(() => [score(80), null]);

    await runPlan([call(0)], new Set(), deps, OPTIONS);

    expect(records[0]).toMatchObject({
      configId: "c",
      repetition: 1,
      persona: "p",
      batchIndex: 0,
      offerKeys: ["o:0a", "o:0b"],
      scores: [80, null],
      failure: null,
    });
  });

  it("does not save the reasons", async () => {
    const { deps, records } = setup();

    await runPlan([call(0)], new Set(), deps, OPTIONS);

    expect(JSON.stringify(records[0])).not.toContain("reason");
  });

  it("measures the latency of the call and stamps the time it finished", async () => {
    const { deps, records } = setup();

    await runPlan([call(0)], new Set(), deps, OPTIONS);

    expect(records[0]?.latencyMs).toBe(250);
    expect(records[0]?.at).toBe(new Date(1_000_000_000_250).toISOString());
  });

  it("skips the calls that are already done", async () => {
    const { deps, records, attempts } = setup();

    const outcome = await runPlan(
      [call(0), call(1), call(2)],
      new Set(["c|1|p|0", "c|1|p|2"]),
      deps,
      OPTIONS,
    );

    expect(outcome).toEqual({
      executed: 1,
      skipped: 2,
      remaining: 0,
      stoppedBy: "finished",
    });
    expect(records.map((record) => record.batchIndex)).toEqual([1]);
    expect([...attempts.keys()]).toEqual(["c|1|p|1"]);
  });

  it("finishes at once when everything is done", async () => {
    const { deps, records } = setup();

    const outcome = await runPlan(
      [call(0)],
      new Set(["c|1|p|0"]),
      deps,
      OPTIONS,
    );

    expect(outcome).toEqual({
      executed: 0,
      skipped: 1,
      remaining: 0,
      stoppedBy: "finished",
    });
    expect(records).toEqual([]);
  });

  it("stops at the budget and reports what is left", async () => {
    const { deps, records } = setup();

    const outcome = await runPlan(
      [call(0), call(1), call(2), call(3)],
      new Set(["c|1|p|0"]),
      deps,
      { ...OPTIONS, maxCalls: 2 },
    );

    expect(outcome).toEqual({
      executed: 2,
      skipped: 1,
      remaining: 1,
      stoppedBy: "budget",
    });
    expect(records.map((record) => record.batchIndex)).toEqual([1, 2]);
  });

  it("does not count skipped calls against the budget", async () => {
    const { deps } = setup();

    const outcome = await runPlan(
      [call(0), call(1)],
      new Set(["c|1|p|0"]),
      deps,
      { ...OPTIONS, maxCalls: 1 },
    );

    expect(outcome.stoppedBy).toBe("finished");
  });

  it("finishes without stopping when the budget equals the pending calls", async () => {
    const { deps } = setup();

    const outcome = await runPlan([call(0), call(1)], new Set(), deps, {
      ...OPTIONS,
      maxCalls: 2,
    });

    expect(outcome).toMatchObject({
      executed: 2,
      remaining: 0,
      stoppedBy: "finished",
    });
  });

  describe("when the quota is exceeded", () => {
    it("waits and tries the same call again", async () => {
      const { deps, records, sleeps } = setup((_planned, attempt) =>
        attempt === 1 ? new LlmError("quota", "429") : [score(10), score(20)],
      );

      const outcome = await runPlan([call(0)], new Set(), deps, OPTIONS);

      expect(outcome.stoppedBy).toBe("finished");
      expect(sleeps).toEqual([65_000]);
      expect(records).toHaveLength(1);
    });

    it("measures only the latency of the attempt that worked", async () => {
      const { deps, records } = setup((_planned, attempt) =>
        attempt === 1 ? new LlmError("quota", "429") : [score(10), score(20)],
      );

      await runPlan([call(0)], new Set(), deps, OPTIONS);

      expect(records[0]?.latencyMs).toBe(250);
    });

    it("gives up after two waits and keeps what was already saved", async () => {
      const { deps, records, sleeps, attempts } = setup((planned) =>
        planned.batchIndex === 1
          ? new LlmError("quota", "429")
          : planned.offerKeys.map(() => score(5)),
      );

      const outcome = await runPlan(
        [call(0), call(1), call(2)],
        new Set(),
        deps,
        OPTIONS,
      );

      expect(outcome).toEqual({
        executed: 1,
        skipped: 0,
        remaining: 2,
        stoppedBy: "quota",
      });
      expect(sleeps).toEqual([65_000, 65_000]);
      expect(attempts.get("c|1|p|1")).toBe(3);
      expect(attempts.has("c|1|p|2")).toBe(false);
      expect(records).toHaveLength(1);
    });

    it("starts the waits again for the next call", async () => {
      const { deps, sleeps } = setup((planned, attempt) =>
        attempt === 1
          ? new LlmError("quota", "429")
          : planned.offerKeys.map(() => score(5)),
      );

      const outcome = await runPlan(
        [call(0), call(1)],
        new Set(),
        deps,
        OPTIONS,
      );

      expect(outcome.stoppedBy).toBe("finished");
      expect(sleeps).toEqual([65_000, 65_000]);
    });
  });

  describe("when Gemini is unavailable", () => {
    it("waits once and tries again", async () => {
      const { deps, records, sleeps } = setup((_planned, attempt) =>
        attempt === 1
          ? new LlmError("unavailable", "503")
          : [score(1), score(2)],
      );

      const outcome = await runPlan([call(0)], new Set(), deps, OPTIONS);

      expect(outcome.stoppedBy).toBe("finished");
      expect(sleeps).toEqual([10_000]);
      expect(records).toHaveLength(1);
    });

    it("stops when it is still unavailable", async () => {
      const { deps, records, sleeps } = setup(
        () => new LlmError("unavailable", "503"),
      );

      const outcome = await runPlan(
        [call(0), call(1)],
        new Set(),
        deps,
        OPTIONS,
      );

      expect(outcome).toEqual({
        executed: 0,
        skipped: 0,
        remaining: 2,
        stoppedBy: "unavailable",
      });
      expect(sleeps).toEqual([10_000]);
      expect(records).toEqual([]);
    });
  });

  describe("when the answer is not valid", () => {
    it("saves the call as a failure with no scores and goes on", async () => {
      const { deps, records } = setup((planned) =>
        planned.batchIndex === 0
          ? new LlmError("invalid_response", "bad")
          : planned.offerKeys.map(() => score(5)),
      );

      const outcome = await runPlan(
        [call(0), call(1)],
        new Set(),
        deps,
        OPTIONS,
      );

      expect(outcome).toMatchObject({ executed: 2, stoppedBy: "finished" });
      expect(records[0]).toMatchObject({
        scores: [null, null],
        failure: "invalid_response",
      });
      expect(records[1]).toMatchObject({ scores: [5, 5], failure: null });
    });

    it("does not try the call again", async () => {
      const { deps, attempts, sleeps } = setup(
        () => new LlmError("invalid_response", "bad"),
      );

      await runPlan([call(0)], new Set(), deps, OPTIONS);

      expect(attempts.get("c|1|p|0")).toBe(1);
      expect(sleeps).toEqual([]);
    });
  });

  describe("when something is wrong with the setup", () => {
    it("throws when Gemini rejects the request", async () => {
      const { deps, records } = setup(() => new LlmError("rejected", "400"));

      await expect(
        runPlan([call(0)], new Set(), deps, OPTIONS),
      ).rejects.toThrow("400");
      expect(records).toEqual([]);
    });

    it("throws errors that are not from Gemini", async () => {
      const { deps } = setup(() => new Error("boom"));

      await expect(
        runPlan([call(0)], new Set(), deps, OPTIONS),
      ).rejects.toThrow("boom");
    });

    it("throws when the scorer returns the wrong number of results", async () => {
      const { deps, records } = setup(() => [score(1)]);

      await expect(
        runPlan([call(0)], new Set(), deps, OPTIONS),
      ).rejects.toThrow("The scorer returned 1 result(s) for 2 offer(s)");
      expect(records).toEqual([]);
    });
  });

  it("logs each call it makes", async () => {
    const { deps, logs } = setup((planned) =>
      planned.batchIndex === 1
        ? new LlmError("invalid_response", "bad")
        : planned.offerKeys.map(() => score(5)),
    );

    await runPlan([call(0), call(1)], new Set(), deps, OPTIONS);

    expect(logs).toEqual([
      "c rep 1 p batch 1: 250 ms",
      "c rep 1 p batch 2: failed (invalid_response)",
    ]);
  });

  it("logs the wait before trying again", async () => {
    const { deps, logs } = setup((_planned, attempt) =>
      attempt === 1 ? new LlmError("quota", "429") : [score(1), score(2)],
    );

    await runPlan([call(0)], new Set(), deps, OPTIONS);

    expect(logs[0]).toBe(
      "Quota error, waiting 65 s before trying again (1/2).",
    );
  });
});
