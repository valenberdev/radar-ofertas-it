import { describe, expect, it } from "vitest";
import {
  isNewSince,
  LAST_SEARCH_KEY,
  readLastSearch,
  writeLastSearch,
  type SearchStorage,
} from "../../../src/app/_search/new-since";

function memoryStorage(
  initial: Record<string, string> = {},
): SearchStorage & { readonly values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

const brokenStorage: SearchStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("readLastSearch", () => {
  it("reads the stored time", () => {
    expect(
      readLastSearch(
        memoryStorage({ [LAST_SEARCH_KEY]: "2026-11-12T15:00:00.000Z" }),
      ),
    ).toBe("2026-11-12T15:00:00.000Z");
  });

  it("returns null on the first search", () => {
    expect(readLastSearch(memoryStorage())).toBeNull();
  });

  it("ignores a value that is not a date", () => {
    expect(
      readLastSearch(memoryStorage({ [LAST_SEARCH_KEY]: "yesterday" })),
    ).toBeNull();
  });

  it("returns null when there is no storage", () => {
    expect(readLastSearch(null)).toBeNull();
  });

  it("returns null when the browser blocks the storage", () => {
    expect(readLastSearch(brokenStorage)).toBeNull();
  });
});

describe("writeLastSearch", () => {
  it("stores the time in ISO format under its own key", () => {
    const storage = memoryStorage();

    writeLastSearch(storage, new Date("2026-11-16T16:00:00.000Z"));

    expect(storage.values.get(LAST_SEARCH_KEY)).toBe(
      "2026-11-16T16:00:00.000Z",
    );
  });

  it("can be read back", () => {
    const storage = memoryStorage();

    writeLastSearch(storage, new Date("2026-11-16T16:00:00.000Z"));

    expect(readLastSearch(storage)).toBe("2026-11-16T16:00:00.000Z");
  });

  it("does nothing without storage or when the browser blocks it", () => {
    expect(() => writeLastSearch(null, new Date())).not.toThrow();
    expect(() => writeLastSearch(brokenStorage, new Date())).not.toThrow();
  });

  it("uses a key of this app", () => {
    expect(LAST_SEARCH_KEY).toBe("radar:last-search-at");
  });
});

describe("isNewSince", () => {
  const previous = "2026-11-12T15:00:00.000Z";

  it("marks an offer first seen after the previous search", () => {
    expect(isNewSince("2026-11-12T15:00:00.001Z", previous)).toBe(true);
  });

  it("does not mark an offer first seen at the same time", () => {
    expect(isNewSince(previous, previous)).toBe(false);
  });

  it("does not mark an offer first seen before the previous search", () => {
    expect(isNewSince("2026-11-01T00:00:00.000Z", previous)).toBe(false);
  });

  it("marks nothing on the first search", () => {
    expect(isNewSince("2026-11-16T00:00:00.000Z", null)).toBe(false);
  });

  it("compares instants, not text", () => {
    expect(
      isNewSince("2026-11-12T13:00:00.000-03:00", "2026-11-12T15:30:00.000Z"),
    ).toBe(true);
  });
});
