import { redactPersonalData } from "../../src/domain/redact-personal-data";
import { buildProfile } from "../../src/domain/profile";
import { createGeminiClient } from "../../src/infrastructure/llm/gemini-client";
import { createGeminiProfileExtractor } from "../../src/infrastructure/llm/gemini-profile-extractor";
import { EVAL_PATHS, loadPersonaFiles, writeJsonFile } from "./files.mts";

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey || !model) {
    throw new Error("GEMINI_API_KEY and GEMINI_MODEL must be set.");
  }
  const force = process.argv.includes("--force");
  const extractor = createGeminiProfileExtractor(
    createGeminiClient({ fetch, apiKey, model, timeoutMs: 60_000 }),
    model,
  );

  for (const { path, persona } of await loadPersonaFiles(EVAL_PATHS.personas)) {
    if (persona.profile !== null && !force) {
      console.log(
        `${persona.id}: already has a profile (use --force to extract again).`,
      );
      continue;
    }
    const profile = buildProfile(
      await extractor.extract(redactPersonalData(persona.cvText)),
    );
    if (profile.skills.length === 0) {
      throw new Error(`${persona.id}: the extractor returned no skills.`);
    }
    await writeJsonFile(path, {
      id: persona.id,
      label: persona.label,
      cvText: persona.cvText,
      profile,
    });
    console.log(
      `${persona.id}: ${profile.seniority ?? "no seniority"}, ${profile.yearsOfExperience ?? "no"} years`,
    );
    console.log(
      `  skills: ${profile.skills.map((skill) => [skill.name, ...skill.aliases].join(" / ")).join("; ")}`,
    );
    console.log(`  roles: ${profile.targetRoles.join("; ")}`);
    console.log(`  languages: ${profile.languages.join("; ")}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
