import { access, readFile } from "node:fs/promises";
import { parseSnapshot, type Band } from "./dataset.mts";
import {
  EVAL_PATHS,
  loadPersonaFiles,
  readJsonFile,
  writeJsonFile,
} from "./files.mts";
import { judgeLabels, parseJudgeAnswer, poolItems } from "./judge.mts";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  if (!process.argv.includes("--force") && (await exists(EVAL_PATHS.labels))) {
    throw new Error(
      "eval/labels.json already exists. Pass --force to replace it.",
    );
  }
  const snapshot = parseSnapshot(await readJsonFile(EVAL_PATHS.snapshot));
  const personas = (await loadPersonaFiles(EVAL_PATHS.personas)).map(
    (file) => file.persona,
  );
  const items = personas.flatMap((persona) =>
    poolItems(persona, snapshot.offers),
  );
  const bands = new Map<string, Map<string, Band>>();
  for (const persona of personas) {
    const path = EVAL_PATHS.judgeAnswer(persona.id);
    const keys = items
      .filter((item) => item.persona === persona.id)
      .map((item) => item.offerKey);
    try {
      bands.set(
        persona.id,
        parseJudgeAnswer(await readFile(path, "utf8"), persona.id, keys),
      );
    } catch (error) {
      throw new Error(
        `${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    console.log(`${persona.id}: ${keys.length} labels read`);
  }
  await writeJsonFile(EVAL_PATHS.labels, {
    snapshotId: snapshot.snapshotId,
    labels: judgeLabels(items, bands),
  });
  console.log(`Wrote ${items.length} labels to ${EVAL_PATHS.labels}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
