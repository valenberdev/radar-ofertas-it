import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { rateLimitResource } from "../../../src/infrastructure/rate-limit/client-key";
import {
  createVisitorSearchLimit,
  VISITOR_SEARCHES_PER_DAY,
} from "../../../src/infrastructure/rate-limit/visitor-search-limit";

const SECRET = "h".repeat(32);
const NOW = new Date("2026-11-17T16:00:00Z");

function fakePool(rowCount: number) {
  const query = vi.fn(async () => ({
    rowCount,
    rows: rowCount === 1 ? [{ used: 1 }] : [],
  }));
  return { pool: { query } as unknown as Pick<Pool, "query">, query };
}

describe("createVisitorSearchLimit", () => {
  it("allows five searches per day", () => {
    expect(VISITOR_SEARCHES_PER_DAY).toBe(5);
  });

  it("counts one search on the counter of this client and day", async () => {
    const { pool, query } = fakePool(1);

    await createVisitorSearchLimit(pool, {
      secret: SECRET,
      ip: "203.0.113.7",
      now: () => NOW,
    })();

    expect((query.mock.calls[0] as unknown[] | undefined)?.[1]).toEqual([
      "2026-11-17",
      rateLimitResource("search-ip", SECRET, "203.0.113.7", NOW),
      1,
      VISITOR_SEARCHES_PER_DAY,
    ]);
  });

  it("lets the search go on while the counter has room", async () => {
    const { pool } = fakePool(1);

    expect(
      await createVisitorSearchLimit(pool, {
        secret: SECRET,
        ip: "203.0.113.7",
        now: () => NOW,
      })(),
    ).toBe(true);
  });

  it("stops the search when the counter is full", async () => {
    const { pool } = fakePool(0);

    expect(
      await createVisitorSearchLimit(pool, {
        secret: SECRET,
        ip: "203.0.113.7",
        now: () => NOW,
      })(),
    ).toBe(false);
  });

  it("reads the clock when the search happens, not when the limit is created", async () => {
    const { pool, query } = fakePool(1);
    let now = NOW;
    const allow = createVisitorSearchLimit(pool, {
      secret: SECRET,
      ip: "203.0.113.7",
      now: () => now,
    });

    now = new Date("2026-11-18T16:00:00Z");
    await allow();

    expect((query.mock.calls[0] as unknown[] | undefined)?.[1]).toEqual([
      "2026-11-18",
      rateLimitResource("search-ip", SECRET, "203.0.113.7", now),
      1,
      VISITOR_SEARCHES_PER_DAY,
    ]);
  });

  it("does not send the address to the database", async () => {
    const { pool, query } = fakePool(1);

    await createVisitorSearchLimit(pool, {
      secret: SECRET,
      ip: "203.0.113.7",
      now: () => NOW,
    })();

    expect(JSON.stringify(query.mock.calls)).not.toContain("203.0.113.7");
  });
});
