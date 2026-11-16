import { describe, expect, it, vi } from "vitest";
import type { SearchOffersResult } from "../../../src/application/search-offers";
import {
  runSearch,
  type RunSearchDeps,
} from "../../../src/app/_search/run-search";
import { buildProfile } from "../../../src/domain/profile";

const DONE: SearchOffersResult = {
  ok: true,
  profile: buildProfile({ skills: [{ name: "Docker", aliases: [] }] }),
  profileFromCache: false,
  match: {
    eligibleCount: 0,
    candidateCount: 0,
    matches: [],
    unscored: [],
    unscoredCount: 0,
    stoppedBy: null,
  },
};

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }
  return data;
}

function setup(overrides: Partial<RunSearchDeps> = {}) {
  const isOwner = vi.fn<RunSearchDeps["isOwner"]>(async () => false);
  const search = vi.fn<RunSearchDeps["search"]>(async () => DONE);
  const log = vi.fn<RunSearchDeps["log"]>();
  const deps: RunSearchDeps = {
    enabled: true,
    isOwner,
    search,
    log,
    ...overrides,
  };
  return { deps, isOwner, search, log };
}

describe("runSearch", () => {
  it("searches in demo mode for a visitor", async () => {
    const { deps, search } = setup();

    const state = await runSearch(
      deps,
      form({ profile: "I use Docker", country: "Argentina" }),
    );

    expect(state.status).toBe("done");
    expect(search).toHaveBeenCalledExactlyOnceWith("demo", {
      text: "I use Docker",
      country: "Argentina",
    });
  });

  it("searches in owner mode for the owner", async () => {
    const { deps, search } = setup({ isOwner: async () => true });

    await runSearch(
      deps,
      form({ profile: "I use Docker", country: "Uruguay" }),
    );

    expect(search).toHaveBeenCalledExactlyOnceWith("owner", {
      text: "I use Docker",
      country: "Uruguay",
    });
  });

  it("returns the view of a finished search", async () => {
    const { deps } = setup();

    const state = await runSearch(
      deps,
      form({ profile: "I use Docker", country: "Argentina" }),
    );

    expect(state).toMatchObject({
      status: "done",
      view: { profile: { skills: ["Docker"] }, offers: [] },
    });
  });

  it("sends an empty text when the field is missing, so the search reports it as empty", async () => {
    const { deps, search } = setup();

    await runSearch(deps, form({ country: "Argentina" }));

    expect(search).toHaveBeenCalledWith("demo", {
      text: "",
      country: "Argentina",
    });
  });

  it.each([
    ["a missing country", {}],
    ["an unknown country", { country: "Atlantis" }],
    ["a country in lower case", { country: "argentina" }],
  ])("rejects %s without searching", async (_name, fields) => {
    const { deps, search } = setup();

    expect(
      await runSearch(deps, form({ profile: "I use Docker", ...fields })),
    ).toEqual({ status: "error", reason: "invalid_country" });
    expect(search).not.toHaveBeenCalled();
  });

  it("says the search is disabled when Gemini is not configured", async () => {
    const { deps, search, isOwner } = setup({ enabled: false });

    expect(
      await runSearch(
        deps,
        form({ profile: "I use Docker", country: "Argentina" }),
      ),
    ).toEqual({ status: "error", reason: "disabled" });
    expect(search).not.toHaveBeenCalled();
    expect(isOwner).not.toHaveBeenCalled();
  });

  it.each([
    "empty",
    "too_long",
    "no_skills",
    "quota_exhausted",
    "unavailable",
  ] as const)("passes on the failure %s", async (reason) => {
    const { deps } = setup({ search: async () => ({ ok: false, reason }) });

    expect(
      await runSearch(deps, form({ profile: "x", country: "Argentina" })),
    ).toEqual({ status: "error", reason });
  });

  it("turns an unexpected error into a generic one and logs only its message", async () => {
    const { deps, log } = setup({
      search: async () => {
        throw new Error("database down");
      },
    });

    expect(
      await runSearch(
        deps,
        form({ profile: "I use Docker", country: "Argentina" }),
      ),
    ).toEqual({ status: "error", reason: "unexpected" });
    expect(log).toHaveBeenCalledExactlyOnceWith("Search failed: database down");
  });

  it("also covers a failure while reading the owner session", async () => {
    const { deps } = setup({
      isOwner: async () => {
        throw new Error("cookies unavailable");
      },
    });

    expect(
      await runSearch(
        deps,
        form({ profile: "I use Docker", country: "Argentina" }),
      ),
    ).toEqual({ status: "error", reason: "unexpected" });
  });

  it("does not log anything when the search works", async () => {
    const { deps, log } = setup();

    await runSearch(
      deps,
      form({ profile: "I use Docker", country: "Argentina" }),
    );

    expect(log).not.toHaveBeenCalled();
  });
});
