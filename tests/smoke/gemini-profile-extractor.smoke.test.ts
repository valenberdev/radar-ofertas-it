import { describe, expect, it } from "vitest";
import { extractProfile } from "../../src/application/extract-profile";
import { buildProfile } from "../../src/domain/profile";
import { toScorableOffer } from "../../src/domain/scorable-offer";
import { createGeminiClient } from "../../src/infrastructure/llm/gemini-client";
import { createGeminiOfferScorer } from "../../src/infrastructure/llm/gemini-offer-scorer";
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

  it("scores a matching offer above an unrelated one", async () => {
    const client = createGeminiClient({
      fetch,
      apiKey,
      model,
      timeoutMs: 60_000,
    });
    const scorer = createGeminiOfferScorer(client, model);
    const profile = buildProfile({
      seniority: "junior",
      yearsOfExperience: 1,
      skills: [
        { name: "Node.js", aliases: [] },
        { name: "TypeScript", aliases: [] },
        { name: "PostgreSQL", aliases: [] },
      ],
      targetRoles: ["Backend Developer"],
      languages: ["Spanish (native)", "English (B2)"],
      summary: "Junior backend developer building REST APIs.",
    });
    const offers = [
      {
        title: "Junior Backend Developer",
        company: "Acme",
        description:
          "Build REST APIs with Node.js, TypeScript and PostgreSQL. Remote.",
      },
      {
        title: "Senior iOS Engineer",
        company: "Pixel",
        description:
          "Lead our iOS app in Swift and SwiftUI. 8+ years of experience. Remote.",
      },
    ].map(toScorableOffer);

    const scores = await scorer.score(profile, offers);

    expect(scores).toHaveLength(2);
    const [match, unrelated] = scores;
    expect(match).not.toBeNull();
    expect(unrelated).not.toBeNull();
    expect(match?.score ?? 0).toBeGreaterThan(unrelated?.score ?? 100);
    expect(match?.reasonEs.length ?? 0).toBeGreaterThan(0);
    expect(match?.reasonEn.length ?? 0).toBeGreaterThan(0);
  });
});
