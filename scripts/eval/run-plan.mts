import { LlmError } from "../../src/application/ports/llm-error";
import type { OfferScore } from "../../src/application/ports/offer-scorer";
import type { CallRecord, PlannedCall } from "./experiment.mts";

export interface RunDeps {
  readonly score: (
    call: PlannedCall,
  ) => Promise<readonly (OfferScore | null)[]>;
  readonly append: (record: CallRecord) => Promise<void>;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
  readonly log: (message: string) => void;
}

export interface RunOptions {
  readonly maxCalls: number | null;
  readonly quotaWaitMs: number;
  readonly unavailableWaitMs: number;
}

export type RunStop = "finished" | "budget" | "quota" | "unavailable";

export interface RunOutcome {
  readonly executed: number;
  readonly skipped: number;
  readonly remaining: number;
  readonly stoppedBy: RunStop;
}

const MAX_QUOTA_WAITS = 2;
const MAX_UNAVAILABLE_WAITS = 1;

function toRecord(
  call: PlannedCall,
  scores: readonly (number | null)[],
  failure: CallRecord["failure"],
  latencyMs: number,
  at: number,
): CallRecord {
  return {
    configId: call.configId,
    repetition: call.repetition,
    persona: call.persona,
    batchIndex: call.batchIndex,
    offerKeys: [...call.offerKeys],
    scores: [...scores],
    failure,
    latencyMs,
    at: new Date(at).toISOString(),
  };
}

export async function runPlan(
  plan: readonly PlannedCall[],
  done: ReadonlySet<string>,
  deps: RunDeps,
  options: RunOptions,
): Promise<RunOutcome> {
  const pending = plan.filter((call) => !done.has(call.key));
  const skipped = plan.length - pending.length;
  let executed = 0;

  for (const call of pending) {
    if (options.maxCalls !== null && executed >= options.maxCalls) {
      return {
        executed,
        skipped,
        remaining: pending.length - executed,
        stoppedBy: "budget",
      };
    }

    let quotaWaits = 0;
    let unavailableWaits = 0;
    let record: CallRecord | null = null;

    while (record === null) {
      const started = deps.now();
      try {
        const results = await deps.score(call);
        if (results.length !== call.offerKeys.length) {
          throw new Error(
            `The scorer returned ${results.length} result(s) for ${call.offerKeys.length} offer(s)`,
          );
        }
        const finished = deps.now();
        record = toRecord(
          call,
          results.map((result) => result?.score ?? null),
          null,
          finished - started,
          finished,
        );
      } catch (error) {
        if (!(error instanceof LlmError) || error.kind === "rejected") {
          throw error;
        }
        const finished = deps.now();
        if (error.kind === "invalid_response") {
          record = toRecord(
            call,
            call.offerKeys.map(() => null),
            "invalid_response",
            finished - started,
            finished,
          );
        } else if (error.kind === "quota") {
          if (quotaWaits >= MAX_QUOTA_WAITS) {
            return {
              executed,
              skipped,
              remaining: pending.length - executed,
              stoppedBy: "quota",
            };
          }
          quotaWaits += 1;
          deps.log(
            `Quota error, waiting ${Math.round(options.quotaWaitMs / 1000)} s before trying again (${quotaWaits}/${MAX_QUOTA_WAITS}).`,
          );
          await deps.sleep(options.quotaWaitMs);
        } else {
          if (unavailableWaits >= MAX_UNAVAILABLE_WAITS) {
            return {
              executed,
              skipped,
              remaining: pending.length - executed,
              stoppedBy: "unavailable",
            };
          }
          unavailableWaits += 1;
          deps.log(
            `Gemini unavailable, waiting ${Math.round(options.unavailableWaitMs / 1000)} s before trying again.`,
          );
          await deps.sleep(options.unavailableWaitMs);
        }
      }
    }

    await deps.append(record);
    executed += 1;
    const tag =
      record.failure === null
        ? `${Math.round(record.latencyMs)} ms`
        : `failed (${record.failure})`;
    deps.log(
      `${call.configId} rep ${call.repetition} ${call.persona} batch ${call.batchIndex + 1}: ${tag}`,
    );
  }

  return { executed, skipped, remaining: 0, stoppedBy: "finished" };
}
