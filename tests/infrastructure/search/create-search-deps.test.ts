import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { GeminiConfig } from "../../../src/infrastructure/parse-env";
import {
  createSearchDeps,
  GEMINI_QUOTA_RESOURCE,
  type SearchMode,
} from "../../../src/infrastructure/search/create-search-deps";

const GEMINI: GeminiConfig = {
  apiKey: "test-key",
  model: "gemini-test",
  dailyLimit: 500,
  demoDailyLimit: 300,
};
const NOW = new Date("2026-11-12T16:00:00Z");

function setup(mode: SearchMode) {
  const query = vi.fn(async () => ({ rowCount: 1, rows: [{ used: 1 }] }));
  const fetch = vi.fn<typeof globalThis.fetch>();
  const deps = createSearchDeps({
    pool: { query } as unknown as Pick<Pool, "query">,
    fetch,
    gemini: GEMINI,
    mode,
    now: () => NOW,
  });
  return { deps, query, fetch };
}

function quotaParams(query: ReturnType<typeof setup>["query"]): unknown[] {
  const call = query.mock.calls[0] as unknown[] | undefined;
  return (call?.[1] as unknown[] | undefined) ?? [];
}

describe("createSearchDeps", () => {
  it("lets the owner use the whole daily limit", async () => {
    const { deps, query } = setup("owner");

    await deps.extract.quota.tryConsume(1);

    expect(quotaParams(query)).toEqual([
      "2026-11-12",
      GEMINI_QUOTA_RESOURCE,
      1,
      500,
    ]);
  });

  it("keeps a visitor under the demo limit", async () => {
    const { deps, query } = setup("demo");

    await deps.extract.quota.tryConsume(1);

    expect(quotaParams(query)).toEqual([
      "2026-11-12",
      GEMINI_QUOTA_RESOURCE,
      1,
      300,
    ]);
  });

  it("counts both modes on the same counter", () => {
    expect(GEMINI_QUOTA_RESOURCE).toBe("gemini");
  });

  it("shares one quota between the profile and the scoring", () => {
    const { deps } = setup("demo");

    expect(deps.match.quota).toBe(deps.extract.quota);
  });

  it("names the extractor and the scorer after the model", () => {
    const { deps } = setup("owner");

    expect(deps.extract.extractor.id).toContain("gemini-test");
    expect(deps.match.scorer.id).toContain("gemini-test");
  });

  it("uses the clock it receives", () => {
    const { deps } = setup("owner");

    expect(deps.extract.now()).toBe(NOW);
    expect(deps.match.now()).toBe(NOW);
  });

  it("uses the real clock by default", () => {
    const deps = createSearchDeps({
      pool: { query: vi.fn() } as unknown as Pick<Pool, "query">,
      fetch: vi.fn<typeof globalThis.fetch>(),
      gemini: GEMINI,
      mode: "owner",
    });
    const before = Date.now();

    const now = deps.extract.now().getTime();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });

  it("does not call Gemini until a search runs", () => {
    const { fetch } = setup("owner");

    expect(fetch).not.toHaveBeenCalled();
  });
});
