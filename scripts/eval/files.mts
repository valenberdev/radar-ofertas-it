import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePersona, type Persona } from "./dataset.mts";

const DIRECTORY = fileURLToPath(new URL("../../eval/", import.meta.url));

export const EVAL_PATHS = {
  directory: DIRECTORY,
  personas: join(DIRECTORY, "personas"),
  snapshot: join(DIRECTORY, "snapshot.local.json"),
  labels: join(DIRECTORY, "labels.json"),
  retestLabels: join(DIRECTORY, "labels-retest.json"),
  labelingPage: join(DIRECTORY, "labeling.local.html"),
  retestPage: join(DIRECTORY, "retest.local.html"),
} as const;

export async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

export async function writeJsonFile(
  path: string,
  value: unknown,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export interface PersonaFile {
  readonly path: string;
  readonly persona: Persona;
}

export async function loadPersonaFiles(
  directory: string,
): Promise<PersonaFile[]> {
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const files: PersonaFile[] = [];
  for (const name of names) {
    const path = join(directory, name);
    const persona = parsePersona(await readJsonFile(path));
    if (`${persona.id}.json` !== name) {
      throw new Error(
        `Persona id ${persona.id} does not match the file name ${name}`,
      );
    }
    files.push({ path, persona });
  }
  if (files.length === 0) {
    throw new Error("There are no persona files");
  }
  return files;
}
