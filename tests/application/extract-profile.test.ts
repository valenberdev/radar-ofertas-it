import { describe, expect, it, vi } from "vitest";
import {
  extractProfile,
  MAX_PROFILE_TEXT_LENGTH,
} from "../../src/application/extract-profile";
import { LlmError } from "../../src/application/ports/llm-error";
import type { ProfileExtractor } from "../../src/application/ports/profile-extractor";
import type { ProfileInput } from "../../src/domain/profile";

const VALID_INPUT: ProfileInput = {
  seniority: "junior",
  yearsOfExperience: 1,
  skills: [{ name: "TypeScript", aliases: ["ts"] }],
  targetRoles: ["Backend Developer"],
  languages: ["Spanish (native)"],
  summary: "Junior backend developer.",
};

function extractorReturning(input: ProfileInput) {
  const extract = vi.fn<ProfileExtractor["extract"]>(async () => input);
  return { extractor: { extract } satisfies ProfileExtractor, extract };
}

describe("MAX_PROFILE_TEXT_LENGTH", () => {
  it("is 12000 characters", () => {
    expect(MAX_PROFILE_TEXT_LENGTH).toBe(12_000);
  });
});

describe("extractProfile", () => {
  it("returns the profile built from the extractor output", async () => {
    const { extractor } = extractorReturning(VALID_INPUT);

    const result = await extractProfile({ extractor }, "I know TypeScript");

    expect(result).toEqual({
      ok: true,
      profile: {
        seniority: "junior",
        yearsOfExperience: 1,
        skills: [{ name: "TypeScript", aliases: ["ts"] }],
        targetRoles: ["Backend Developer"],
        languages: ["Spanish (native)"],
        summary: "Junior backend developer.",
      },
    });
  });

  it("normalizes what the extractor returns", async () => {
    const { extractor } = extractorReturning({
      seniority: "  Senior ",
      yearsOfExperience: 200,
      skills: [
        { name: "Node.js", aliases: ["node"] },
        { name: "node.js", aliases: ["nodejs"] },
        { name: "  " },
      ],
    });

    const result = await extractProfile({ extractor }, "text");

    expect(result).toMatchObject({
      ok: true,
      profile: {
        seniority: "senior",
        yearsOfExperience: null,
        skills: [{ name: "Node.js", aliases: ["node", "nodejs"] }],
      },
    });
  });

  it.each(["", "   ", "\n\t \n"])(
    "rejects the empty text %j without calling the extractor",
    async (text) => {
      const { extractor, extract } = extractorReturning(VALID_INPUT);

      expect(await extractProfile({ extractor }, text)).toEqual({
        ok: false,
        reason: "empty",
      });
      expect(extract).not.toHaveBeenCalled();
    },
  );

  it("rejects a text longer than the limit without calling the extractor", async () => {
    const { extractor, extract } = extractorReturning(VALID_INPUT);

    const result = await extractProfile(
      { extractor },
      "a".repeat(MAX_PROFILE_TEXT_LENGTH + 1),
    );

    expect(result).toEqual({ ok: false, reason: "too_long" });
    expect(extract).not.toHaveBeenCalled();
  });

  it("accepts a text of exactly the limit", async () => {
    const { extractor, extract } = extractorReturning(VALID_INPUT);

    const result = await extractProfile(
      { extractor },
      "a".repeat(MAX_PROFILE_TEXT_LENGTH),
    );

    expect(result.ok).toBe(true);
    expect(extract).toHaveBeenCalledOnce();
  });

  it("measures the limit after trimming", async () => {
    const { extractor } = extractorReturning(VALID_INPUT);

    const result = await extractProfile(
      { extractor },
      `  ${"a".repeat(MAX_PROFILE_TEXT_LENGTH)}  \n`,
    );

    expect(result.ok).toBe(true);
  });

  it("sends the trimmed text to the extractor", async () => {
    const { extractor, extract } = extractorReturning(VALID_INPUT);

    await extractProfile({ extractor }, "\n  I know TypeScript  \n");

    expect(extract).toHaveBeenCalledWith("I know TypeScript");
  });

  it("redacts personal data before the text reaches the extractor", async () => {
    const { extractor, extract } = extractorReturning(VALID_INPUT);
    const text =
      "Valen valen@gmail.com +54 9 291 456-7890 https://github.com/valenberdev linkedin.com/in/valenberdini";

    await extractProfile({ extractor }, text);

    expect(extract).toHaveBeenCalledWith("Valen [EMAIL] [PHONE] [URL] [URL]");
  });

  it("applies the length limit to the text as received, not as redacted", async () => {
    const { extractor, extract } = extractorReturning(VALID_INPUT);
    const text = "valen@gmail.com ".repeat(
      Math.ceil(MAX_PROFILE_TEXT_LENGTH / 16) + 1,
    );

    expect(await extractProfile({ extractor }, text)).toEqual({
      ok: false,
      reason: "too_long",
    });
    expect(extract).not.toHaveBeenCalled();
  });

  it.each([
    { skills: [] },
    {},
    { skills: [{ name: "" }, { name: "x".repeat(100) }] },
  ])("reports no_skills when nothing usable comes back (%j)", async (input) => {
    const { extractor } = extractorReturning(input);

    expect(await extractProfile({ extractor }, "some text")).toEqual({
      ok: false,
      reason: "no_skills",
    });
  });

  it("lets extractor errors through unchanged", async () => {
    const error = new LlmError("quota", "Gemini quota exceeded (429)");
    const extractor: ProfileExtractor = {
      extract: async () => {
        throw error;
      },
    };

    await expect(extractProfile({ extractor }, "some text")).rejects.toBe(
      error,
    );
  });
});
