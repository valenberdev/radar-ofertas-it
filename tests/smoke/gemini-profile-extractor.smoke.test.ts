import { describe, expect, it } from "vitest";
import { extractProfile } from "../../src/application/extract-profile";
import { createGeminiClient } from "../../src/infrastructure/llm/gemini-client";
import { createGeminiProfileExtractor } from "../../src/infrastructure/llm/gemini-profile-extractor";

const apiKey = process.env.GEMINI_API_KEY ?? "";
const model = process.env.GEMINI_MODEL ?? "";

const SYNTHETIC_CV = [
  "Alex Example - Backend Developer",
  "alex.example@example.com | +54 9 11 5555-1234 | github.com/alex-example",
  "",
  "Junior backend developer with one year of experience building REST APIs.",
  "Stack: Node.js, TypeScript, PostgreSQL, Docker, Vitest, Git.",
  "Looking for remote backend roles.",
  "Languages: Spanish (native), English (B2).",
].join("\n");

describe.skipIf(apiKey === "" || model === "")("Gemini live smoke test", () => {
  it("extracts a profile from a synthetic CV", async () => {
    const client = createGeminiClient({
      fetch,
      apiKey,
      model,
      timeoutMs: 60_000,
    });
    const extractor = createGeminiProfileExtractor(client, model);
    const deps = {
      extractor,
      profiles: { find: async () => null, save: async () => undefined },
      quota: { tryConsume: async () => true },
      now: () => new Date(),
    };

    const result = await extractProfile(deps, SYNTHETIC_CV);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const names = result.profile.skills.map((skill) =>
      skill.name.toLowerCase(),
    );
    expect(names.some((name) => name.includes("typescript"))).toBe(true);
    expect(names.some((name) => name.includes("postgres"))).toBe(true);
    expect(result.profile.languages.length).toBeGreaterThan(0);
    expect(JSON.stringify(result.profile)).not.toContain(
      "alex.example@example.com",
    );
  });
});
