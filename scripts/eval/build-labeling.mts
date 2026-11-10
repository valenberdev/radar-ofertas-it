import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { buildPool } from "./build-pool.mts";
import { parseLabels, parseSnapshot, type Snapshot } from "./dataset.mts";
import { EVAL_PATHS, loadPersonaFiles, readJsonFile } from "./files.mts";
import {
  orderItems,
  toLabelingItem,
  toLabelingPersona,
  type LabelingItem,
} from "./labeling-items.mts";
import { buildLabelingPage } from "./labeling-page.mts";
import { createRandom, hashSeed, sampled } from "./random.mts";

const ORDER_SEED = 20261110;
const RETEST_COUNT = 20;

function offersByKey(
  snapshot: Snapshot,
): Map<string, Snapshot["offers"][number]> {
  return new Map(snapshot.offers.map((offer) => [offer.key, offer]));
}

async function main(): Promise<void> {
  const retest = process.argv.includes("--retest");
  const snapshot = parseSnapshot(await readJsonFile(EVAL_PATHS.snapshot));
  const personaFiles = await loadPersonaFiles(EVAL_PATHS.personas);
  const personas = personaFiles.map((file) => file.persona);
  const labelingPersonas = personas.map(toLabelingPersona);
  const personaIds = personas.map((persona) => persona.id);

  let items: LabelingItem[];
  if (retest) {
    const labels = parseLabels(await readJsonFile(EVAL_PATHS.labels));
    if (labels.snapshotId !== snapshot.snapshotId) {
      throw new Error(
        "eval/labels.json belongs to a different snapshot than eval/snapshot.local.json.",
      );
    }
    const offers = offersByKey(snapshot);
    const chosen = sampled(
      labels.labels,
      RETEST_COUNT,
      createRandom(ORDER_SEED),
    );
    items = chosen.map((label) => {
      const offer = offers.get(label.offerKey);
      if (offer === undefined) {
        throw new Error(
          `Labeled offer ${label.offerKey} is not in the snapshot.`,
        );
      }
      return toLabelingItem(label.persona, offer);
    });
  } else {
    items = [];
    for (const persona of personas) {
      if (persona.profile === null) {
        throw new Error(
          `Persona ${persona.id} has no extracted profile yet. Run npm run eval:personas first.`,
        );
      }
      const pool = buildPool(
        persona.profile,
        snapshot.offers,
        createRandom(hashSeed(persona.id)),
      );
      const counts = { candidate: 0, beyond_top: 0, unmatched: 0 };
      for (const entry of pool) {
        counts[entry.origin] += 1;
        items.push(toLabelingItem(persona.id, entry.offer));
      }
      console.log(
        `${persona.id}: ${pool.length} offers (${counts.candidate} candidates, ${counts.beyond_top} beyond the top, ${counts.unmatched} unmatched)`,
      );
    }
  }

  const ordered = orderItems(items, personaIds, createRandom(ORDER_SEED));
  const path = retest ? EVAL_PATHS.retestPage : EVAL_PATHS.labelingPage;
  await writeFile(
    path,
    buildLabelingPage({
      mode: retest ? "retest" : "label",
      snapshotId: snapshot.snapshotId,
      personas: labelingPersonas,
      items: ordered,
    }),
    "utf8",
  );
  console.log(`Wrote ${ordered.length} item(s) to ${path}`);
  console.log(`Open it in your browser: ${pathToFileURL(path).href}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
