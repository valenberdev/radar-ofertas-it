import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EVAL_PATHS,
  loadPersonaFiles,
  readJsonFile,
  writeJsonFile,
} from "../../../scripts/eval/files.mts";

let directory = "";

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "radar-eval-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function personaJson(id: string): string {
  return JSON.stringify({ id, label: id, cvText: "text", profile: null });
}

describe("writeJsonFile and readJsonFile", () => {
  it("writes two-space json with a final newline", async () => {
    const path = join(directory, "out.json");

    await writeJsonFile(path, { a: [1, 2] });

    expect(await readFile(path, "utf8")).toBe(
      '{\n  "a": [\n    1,\n    2\n  ]\n}\n',
    );
  });

  it("creates missing folders", async () => {
    const path = join(directory, "one", "two", "out.json");

    await writeJsonFile(path, { ok: true });

    expect(await readJsonFile(path)).toEqual({ ok: true });
  });

  it("reads back what it wrote", async () => {
    const path = join(directory, "out.json");
    const value = { text: "ñ <b> é", list: [null, 1] };

    await writeJsonFile(path, value);

    expect(await readJsonFile(path)).toEqual(value);
  });

  it("fails on a file that does not exist", async () => {
    await expect(
      readJsonFile(join(directory, "missing.json")),
    ).rejects.toThrow();
  });
});

describe("loadPersonaFiles", () => {
  it("loads the personas sorted by file name", async () => {
    await writeFile(join(directory, "b-two.json"), personaJson("b-two"));
    await writeFile(join(directory, "a-one.json"), personaJson("a-one"));

    const files = await loadPersonaFiles(directory);

    expect(files.map((file) => file.persona.id)).toEqual(["a-one", "b-two"]);
    expect(files.map((file) => file.path)).toEqual([
      join(directory, "a-one.json"),
      join(directory, "b-two.json"),
    ]);
  });

  it("sorts many personas by file name whatever order the folder lists them in", async () => {
    const ids = [
      "h-eight",
      "g-seven",
      "f-six",
      "e-five",
      "d-four",
      "c-three",
      "b-two",
      "a-one",
    ];
    for (const id of ids) {
      await writeFile(join(directory, `${id}.json`), personaJson(id));
    }

    const files = await loadPersonaFiles(directory);

    expect(files.map((file) => file.persona.id)).toEqual([...ids].reverse());
  });

  it("ignores files that are not json", async () => {
    await writeFile(join(directory, "a-one.json"), personaJson("a-one"));
    await writeFile(join(directory, "notes.md"), "notes");

    expect(await loadPersonaFiles(directory)).toHaveLength(1);
  });

  it("rejects a persona whose id does not match the file name", async () => {
    await writeFile(join(directory, "a-one.json"), personaJson("b-two"));

    await expect(loadPersonaFiles(directory)).rejects.toThrow(
      "Persona id b-two does not match the file name a-one.json",
    );
  });

  it("rejects an invalid persona", async () => {
    await writeFile(
      join(directory, "a-one.json"),
      JSON.stringify({ id: "a-one" }),
    );

    await expect(loadPersonaFiles(directory)).rejects.toThrow(
      /^Invalid persona file/,
    );
  });

  it("rejects an empty folder", async () => {
    await mkdir(join(directory, "empty"));

    await expect(loadPersonaFiles(join(directory, "empty"))).rejects.toThrow(
      "There are no persona files",
    );
  });

  it("loads the personas committed in the repository", async () => {
    const files = await loadPersonaFiles(EVAL_PATHS.personas);

    expect(files.map((file) => file.persona.id)).toEqual([
      "a-junior-backend",
      "b-mid-frontend",
      "c-senior-data",
    ]);
  });
});

describe("EVAL_PATHS", () => {
  it("keeps the generated local files apart from the committed ones", () => {
    expect(EVAL_PATHS.snapshot).toMatch(/snapshot\.local\.json$/);
    expect(EVAL_PATHS.labelingPage).toMatch(/\.local\.html$/);
    expect(EVAL_PATHS.retestPage).toMatch(/\.local\.html$/);
    expect(EVAL_PATHS.labels).toMatch(/[\\/]eval[\\/]labels\.json$/);
    expect(EVAL_PATHS.retestLabels).toMatch(
      /[\\/]eval[\\/]labels-retest\.json$/,
    );
  });
});
    