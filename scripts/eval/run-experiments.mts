import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { OfferScorer } from "../../src/application/ports/offer-scorer";
import { DEFAULT_TOP_K } from "../../src/domain/prefilter";
import type { Profile } from "../../src/domain/profile";
import { toScorableOffer } from "../../src/domain/scorable-offer";
import { createGeminiClient } from "../../src/infrastructure/llm/gemini-client";
import { createGeminiOfferScorer } from "../../src/infrastructure/llm/gemini-offer-scorer";
import { rankOffers } from "./build-pool.mts";
import { parseSnapshot } from "./dataset.mts";
import { parseCallRecords, parseConfigs, planCalls } from "./experiment.mts";
import { EVAL_PATHS, loadPersonaFiles, readJsonFile } from "./files.mts";
import { runPlan } from "./run-plan.mts";

const REQUEST_TIMEOUT_MS = 60_000;
const QUOTA_WAIT_MS = 65_000;
const UNAVAILABLE_WAIT_MS = 10_000;

async function readRunText(): Promise<string> {
  try {
    return await readFile(EVAL_PATHS.runs, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function readMaxCalls(args: readonly string[]): number | null {
  const index = args.indexOf("--max-calls");
  if (index === -1) {
    return null;
  }
  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("--max-calls needs a positive whole number.");
  }
  return value;
}

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY must be set.");
  }
  const maxCalls = readMaxCalls(process.argv.slice(2));

  const configs = parseConfigs(await readJsonFile(EVAL_PATHS.configs));
  const snapshot = parseSnapshot(await readJsonFile(EVAL_PATHS.snapshot));
  const personas = (await loadPersonaFiles(EVAL_PATHS.personas)).map(
    (file) => file.persona,
  );
  const offersByKey = new Map(
    snapshot.offers.map((offer) => [offer.key, offer]),
  );

  const profiles = new Map<string, Profile>();
  const candidates = new Map<string, string[]>();
  for (const persona of personas) {
    if (persona.profile === null) {
      throw new Error(
        `Persona ${persona.id} has no extracted profile yet. Run npm run eval:personas first.`,
      );
    }
    profiles.set(persona.id, persona.profile);
    candidates.set(
      persona.id,
      rankOffers(persona.profile, snapshot.offers)
        .ranked.slice(0, DEFAULT_TOP_K)
        .map((entry) => entry.offer.key),
    );
  }

  const plan = planCalls(configs, candidates);
  const done = new Set(
    parseCallRecords(await readRunText()).map(
      (record) =>
        `${record.configId}|${record.repetition}|${record.persona}|${record.batchIndex}`,
    ),
  );

  const scorers = new Map<string, OfferScorer>(
    configs.map((config) => [
      config.id,
      createGeminiOfferScorer(
        createGeminiClient({
          fetch,
          apiKey,
          model: config.model,
          timeoutMs: REQUEST_TIMEOUT_MS,
        }),
        config.model,
      ),
    ]),
  );

  await mkdir(dirname(EVAL_PATHS.runs), { recursive: true });
  const outcome = await runPlan(
    plan,
    done,
    {
      score: async (call) => {
        const scorer = scorers.get(call.configId);
        const profile = profiles.get(call.persona);
        if (scorer === undefined || profile === undefined) {
          throw new Error(`Unknown config or persona in call ${call.key}`);
        }
        const offers = call.offerKeys.map((key) => {
          const offer = offersByKey.get(key);
          if (offer === undefined) {
            throw new Error(`Offer ${key} is not in the snapshot.`);
          }
          return toScorableOffer(offer);
        });
        return scorer.score(profile, offers);
      },
      append: (record) =>
        appendFile(EVAL_PATHS.runs, `${JSON.stringify(record)}\n`, "utf8"),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: () => Date.now(),
      log: (message) => console.log(message),
    },
    {
      maxCalls,
      quotaWaitMs: QUOTA_WAIT_MS,
      unavailableWaitMs: UNAVAILABLE_WAIT_MS,
    },
  );

  console.log(
    `Planned ${plan.length} call(s): ${outcome.skipped} already done, ${outcome.executed} made now, ${outcome.remaining} left.`,
  );
  if (outcome.stoppedBy === "quota") {
    console.log(
      "Stopped by the quota. The daily limit resets at midnight Pacific time (05:00 in Buenos Aires). Run the same command again to continue where it stopped.",
    );
  } else if (outcome.stoppedBy === "unavailable") {
    console.log(
      "Stopped because Gemini was unavailable. Run the same command again to continue where it stopped.",
    );
  } else if (outcome.stoppedBy === "budget") {
    console.log(
      "Stopped at the limit you set with --max-calls. Run the same command again to continue.",
    );
  } else {
    console.log("Everything planned is done. Run npm run eval:report.");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
