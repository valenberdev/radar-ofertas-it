import { writeFile } from "node:fs/promises";
import { parseSnapshot } from "./dataset.mts";
import { EVAL_PATHS, loadPersonaFiles, readJsonFile } from "./files.mts";
import { judgeDocument, poolItems } from "./judge.mts";
import { toLabelingPersona } from "./labeling-items.mts";
import { createRandom, hashSeed, shuffled } from "./random.mts";

async function main(): Promise<void> {
  const snapshot = parseSnapshot(await readJsonFile(EVAL_PATHS.snapshot));
  const personas = (await loadPersonaFiles(EVAL_PATHS.personas)).map(
    (file) => file.persona,
  );
  for (const persona of personas) {
    const items = shuffled(
      poolItems(persona, snapshot.offers),
      createRandom(hashSeed(`judge-${persona.id}`)),
    );
    const path = EVAL_PATHS.judgeDocument(persona.id);
    await writeFile(
      path,
      judgeDocument(toLabelingPersona(persona), items),
      "utf8",
    );
    console.log(`${persona.id}: ${items.length} offers written to ${path}`);
  }
  console.log(
    "Send each file to a new Claude chat, then save each answer as eval/judge-<persona>.answer.txt.",
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
