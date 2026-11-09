import { describe, expect, it, vi } from "vitest";
import {
  extractProfile,
  MAX_PROFILE_TEXT_LENGTH,
} from "../../src/application/extract-profile";
import type { DailyQuota } from "../../src/application/ports/daily-quota";
import { LlmError } from "../../src/application/ports/llm-error";
import type { ProfileExtractor } from "../../src/application/ports/profile-extractor";
import type {
  ProfileCacheKey,
  ProfileStore,
} from "../../src/application/ports/profile-store";
import type { Profile, ProfileInput } from "../../src/domain/profile";

const NOW = new Date("2026-11-09T15:00:00Z");

const VALID_INPUT: ProfileInput = {
  seniority: "junior",
  yearsOfExperience: 1,
  skills: [{ name: "TypeScript", aliases: ["ts"] }],
  targetRoles: ["Backend Developer"],
  languages: ["Spanish (native)"],
  summary: "Junior backend developer.",
};

const VALID_PROFILE: Profile = {
  seniority: "junior",
  yearsOfExperience: 1,
  skills: [{ name: "TypeScript", aliases: ["ts"] }],
  targetRoles: ["Backend Developer"],
  languages: ["Spanish (native)"],
  summary: "Junior backend developer.",
};

interface Setup {
  readonly input?: ProfileInput;
  readonly extractorId?: string;
  readonly quotaAllows?: boolean;
  readonly stored?: Map<string, Profile>;
}

function storageKey(key: ProfileCacheKey): string {
  return `${key.textHash}|${key.extractorId}`;
}

function setup(options: Setup = {}) {
  const stored = options.stored ?? new Map<string, Profile>();
  const extract = vi.fn<ProfileExtractor["extract"]>(
    async () => options.input ?? VALID_INPUT,
  );
  const find = vi.fn<ProfileStore["find"]>(
    async (key) => stored.get(storageKey(key)) ?? null,
  );
  const save = vi.fn<ProfileStore["save"]>(async (key, profile) => {
    stored.set(storageKey(key), profile);
  });
  const tryConsume = vi.fn<DailyQuota["tryConsume"]>(
    async () => options.quotaAllows ?? true,
  );
  const deps = {
    extractor: {
      id: options.extractorId ?? "extractor-a",
      extract,
    } satisfies ProfileExtractor,
    profiles: { find, save } satisfies ProfileStore,
    quota: { tryConsume } satisfies DailyQuota,
    now: () => NOW,
  };
  return { deps, extract, find, save, tryConsume, stored };
}

describe("MAX_PROFILE_TEXT_LENGTH", () => {
  it("is 12000 characters", () => {
    expect(MAX_PROFILE_TEXT_LENGTH).toBe(12_000);
  });
});

describe("extractProfile", () => {
  describe("with the extractor", () => {
    it("returns the profile built from the extractor output", async () => {
      const { deps } = setup();

      expect(await extractProfile(deps, "I know TypeScript")).toEqual({
        ok: true,
        profile: VALID_PROFILE,
        fromCache: false,
      });
    });

    it("normalizes what the extractor returns", async () => {
      const { deps } = setup({
        input: {
          seniority: "  Senior ",
          yearsOfExperience: 200,
          skills: [
            { name: "Node.js", aliases: ["node"] },
            { name: "node.js", aliases: ["nodejs"] },
            { name: "  " },
          ],
        },
      });

      expect(await extractProfile(deps, "text")).toMatchObject({
        ok: true,
        profile: {
          seniority: "senior",
          yearsOfExperience: null,
          skills: [{ name: "Node.js", aliases: ["node", "nodejs"] }],
        },
      });
    });

    it("sends the trimmed text to the extractor", async () => {
      const { deps, extract } = setup();

      await extractProfile(deps, "\n  I know TypeScript  \n");

      expect(extract).toHaveBeenCalledWith("I know TypeScript");
    });

    it("redacts personal data before the text reaches the extractor", async () => {
      const { deps, extract } = setup();
      const text =
        "Valen valen@gmail.com +54 9 291 456-7890 https://github.com/valenberdev linkedin.com/in/valenberdini";

      await extractProfile(deps, text);

      expect(extract).toHaveBeenCalledWith("Valen [EMAIL] [PHONE] [URL] [URL]");
    });

    it("lets extractor errors through unchanged and saves nothing", async () => {
      const error = new LlmError("unavailable", "Gemini is unavailable (503)");
      const { deps, save } = setup();
      const failing: ProfileExtractor = {
        id: "extractor-a",
        extract: async () => {
          throw error;
        },
      };

      await expect(
        extractProfile({ ...deps, extractor: failing }, "some text"),
      ).rejects.toBe(error);
      expect(save).not.toHaveBeenCalled();
    });
  });

  describe("input validation", () => {
    it.each(["", "   ", "\n\t \n"])(
      "rejects the empty text %j without touching anything",
      async (text) => {
        const { deps, extract, find, tryConsume } = setup();

        expect(await extractProfile(deps, text)).toEqual({
          ok: false,
          reason: "empty",
        });
        expect(extract).not.toHaveBeenCalled();
        expect(find).not.toHaveBeenCalled();
        expect(tryConsume).not.toHaveBeenCalled();
      },
    );

    it("rejects a text longer than the limit without touching anything", async () => {
      const { deps, extract, find, tryConsume } = setup();

      const result = await extractProfile(
        deps,
        "a".repeat(MAX_PROFILE_TEXT_LENGTH + 1),
      );

      expect(result).toEqual({ ok: false, reason: "too_long" });
      expect(extract).not.toHaveBeenCalled();
      expect(find).not.toHaveBeenCalled();
      expect(tryConsume).not.toHaveBeenCalled();
    });

    it("accepts a text of exactly the limit", async () => {
      const { deps, extract } = setup();

      const result = await extractProfile(
        deps,
        "a".repeat(MAX_PROFILE_TEXT_LENGTH),
      );

      expect(result.ok).toBe(true);
      expect(extract).toHaveBeenCalledOnce();
    });

    it("measures the limit after trimming", async () => {
      const { deps } = setup();

      const result = await extractProfile(
        deps,
        `  ${"a".repeat(MAX_PROFILE_TEXT_LENGTH)}  \n`,
      );

      expect(result.ok).toBe(true);
    });

    it("applies the length limit to the text as received, not as redacted", async () => {
      const { deps, extract } = setup();
      const text = "valen@gmail.com ".repeat(
        Math.ceil(MAX_PROFILE_TEXT_LENGTH / 16) + 1,
      );

      expect(await extractProfile(deps, text)).toEqual({
        ok: false,
        reason: "too_long",
      });
      expect(extract).not.toHaveBeenCalled();
    });

    it.each([
      { skills: [] },
      {},
      { skills: [{ name: "" }, { name: "x".repeat(100) }] },
    ])(
      "reports no_skills when nothing usable comes back (%j), and does not save it",
      async (input) => {
        const { deps, save } = setup({ input });

        expect(await extractProfile(deps, "some text")).toEqual({
          ok: false,
          reason: "no_skills",
        });
        expect(save).not.toHaveBeenCalled();
      },
    );
  });

  describe("cache", () => {
    it("saves a new profile under the hash of the redacted text and the extractor id", async () => {
      const { deps, save } = setup({ extractorId: "extractor-a" });

      await extractProfile(deps, "I know TypeScript");

      expect(save).toHaveBeenCalledOnce();
      const [key, profile, at] = save.mock.calls[0] ?? [];
      expect(key?.textHash).toMatch(/^[0-9a-f]{64}$/);
      expect(key?.extractorId).toBe("extractor-a");
      expect(profile).toEqual(VALID_PROFILE);
      expect(at).toBe(NOW);
    });

    it("looks the profile up with the clock of the use case", async () => {
      const { deps, find } = setup();

      await extractProfile(deps, "I know TypeScript");

      expect(find).toHaveBeenCalledOnce();
      expect(find.mock.calls[0]?.[1]).toBe(NOW);
    });

    it("returns a cached profile without calling the extractor or using quota", async () => {
      const { deps, extract, tryConsume, save } = setup();
      await extractProfile(deps, "I know TypeScript");
      extract.mockClear();
      tryConsume.mockClear();
      save.mockClear();

      const second = await extractProfile(deps, "I know TypeScript");

      expect(second).toEqual({
        ok: true,
        profile: VALID_PROFILE,
        fromCache: true,
      });
      expect(extract).not.toHaveBeenCalled();
      expect(tryConsume).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });

    it("returns the cached profile even when the quota is exhausted", async () => {
      const stored = new Map<string, Profile>();
      const first = setup({ stored });
      await extractProfile(first.deps, "I know TypeScript");

      const exhausted = setup({ stored, quotaAllows: false });
      const result = await extractProfile(exhausted.deps, "I know TypeScript");

      expect(result).toEqual({
        ok: true,
        profile: VALID_PROFILE,
        fromCache: true,
      });
      expect(exhausted.tryConsume).not.toHaveBeenCalled();
    });

    it("hits the cache when only the whitespace changes", async () => {
      const { deps, extract } = setup();
      await extractProfile(deps, "I know TypeScript");

      const result = await extractProfile(deps, "  I know\n  TypeScript\n");

      expect(result).toMatchObject({ ok: true, fromCache: true });
      expect(extract).toHaveBeenCalledOnce();
    });

    it("ignores the contact data of the text when looking for a cached profile", async () => {
      const { deps, extract } = setup();
      await extractProfile(
        deps,
        "I know TypeScript. Contact: a@b.com +54 9 291 456-7890",
      );

      const result = await extractProfile(
        deps,
        "I know TypeScript. Contact: z@y.org +54 9 11 5555-1234",
      );

      expect(result).toMatchObject({ ok: true, fromCache: true });
      expect(extract).toHaveBeenCalledOnce();
    });

    it("misses the cache when the text changes", async () => {
      const { deps, extract } = setup();
      await extractProfile(deps, "I know TypeScript");

      const result = await extractProfile(deps, "I know TypeScript and Docker");

      expect(result).toMatchObject({ ok: true, fromCache: false });
      expect(extract).toHaveBeenCalledTimes(2);
    });

    it("does not share profiles between extractors", async () => {
      const stored = new Map<string, Profile>();
      const first = setup({ stored, extractorId: "extractor-a" });
      const second = setup({ stored, extractorId: "extractor-b" });
      await extractProfile(first.deps, "I know TypeScript");

      const result = await extractProfile(second.deps, "I know TypeScript");

      expect(result).toMatchObject({ ok: true, fromCache: false });
      expect(second.extract).toHaveBeenCalledOnce();
      expect(stored.size).toBe(2);
    });

    it("lets store errors through", async () => {
      const error = new Error("database is down");
      const { deps } = setup();
      const failing = {
        ...deps,
        profiles: {
          find: async () => {
            throw error;
          },
          save: deps.profiles.save,
        },
      };

      await expect(extractProfile(failing, "some text")).rejects.toBe(error);
    });
  });

  describe("quota", () => {
    it("spends one unit before calling the extractor", async () => {
      const { deps, tryConsume, extract } = setup();
      const order: string[] = [];
      tryConsume.mockImplementation(async () => {
        order.push("quota");
        return true;
      });
      extract.mockImplementation(async () => {
        order.push("extract");
        return VALID_INPUT;
      });

      await extractProfile(deps, "some text");

      expect(tryConsume).toHaveBeenCalledWith(1);
      expect(order).toEqual(["quota", "extract"]);
    });

    it("stops with quota_exhausted without calling the extractor or saving", async () => {
      const { deps, extract, save } = setup({ quotaAllows: false });

      expect(await extractProfile(deps, "some text")).toEqual({
        ok: false,
        reason: "quota_exhausted",
      });
      expect(extract).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });

    it("keeps the unit spent when no skills come back", async () => {
      const { deps, tryConsume } = setup({ input: { skills: [] } });

      await extractProfile(deps, "some text");

      expect(tryConsume).toHaveBeenCalledOnce();
    });

    it("keeps the unit spent when the extractor fails", async () => {
      const { deps, tryConsume } = setup();
      const failing: ProfileExtractor = {
        id: "extractor-a",
        extract: async () => {
          throw new LlmError("quota", "Gemini quota exceeded (429)");
        },
      };

      await expect(
        extractProfile({ ...deps, extractor: failing }, "some text"),
      ).rejects.toThrow();
      expect(tryConsume).toHaveBeenCalledOnce();
    });
  });
});
