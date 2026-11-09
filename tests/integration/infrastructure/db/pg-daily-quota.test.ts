import { fileURLToPath } from "node:url";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../../../../scripts/migrate/migrator.mts";
import { createPgDailyQuota } from "../../../../src/infrastructure/db/pg-daily-quota";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../support/test-database";

const MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL("../../../../db/migrations", import.meta.url),
);

const RESOURCE = "gemini:model-a";
const MONDAY_NOON = new Date("2026-11-09T20:00:00Z");

describe("createPgDailyQuota", () => {
  let database: TestDatabase;
  let pool: Pool;
  let now: Date;

  function quota(limit: number, resource = RESOURCE) {
    return createPgDailyQuota(pool, { resource, limit, now: () => now });
  }

  async function usedOn(
    day: string,
    resource = RESOURCE,
  ): Promise<number | null> {
    const { rows } = await pool.query<{ used: number }>(
      "select used from usage_counters where day = $1::date and resource = $2",
      [day, resource],
    );
    return rows[0]?.used ?? null;
  }

  beforeAll(async () => {
    database = await createTestDatabase();
    const client = new Client({ connectionString: database.connectionString });
    await client.connect();
    try {
      await migrate(client, MIGRATIONS_DIRECTORY);
    } finally {
      await client.end();
    }
    pool = new Pool({ connectionString: database.connectionString, max: 10 });
  });

  afterAll(async () => {
    await pool.end();
    await database.drop();
  });

  beforeEach(async () => {
    await pool.query("truncate usage_counters");
    now = MONDAY_NOON;
  });

  describe("tryConsume", () => {
    it("allows consumption up to the limit and then refuses", async () => {
      const gate = quota(3);

      const results = [
        await gate.tryConsume(1),
        await gate.tryConsume(1),
        await gate.tryConsume(1),
        await gate.tryConsume(1),
      ];

      expect(results).toEqual([true, true, true, false]);
      expect(await usedOn("2026-11-09")).toBe(3);
    });

    it("counts the units consumed", async () => {
      const gate = quota(10);

      await gate.tryConsume(4);
      await gate.tryConsume(3);

      expect(await usedOn("2026-11-09")).toBe(7);
    });

    it("refuses a request that does not fit and leaves the counter as it was", async () => {
      const gate = quota(10);
      await gate.tryConsume(8);

      expect(await gate.tryConsume(3)).toBe(false);
      expect(await usedOn("2026-11-09")).toBe(8);
    });

    it("still allows a smaller request after refusing a bigger one", async () => {
      const gate = quota(10);
      await gate.tryConsume(8);
      await gate.tryConsume(3);

      expect(await gate.tryConsume(2)).toBe(true);
      expect(await usedOn("2026-11-09")).toBe(10);
    });

    it("allows consuming exactly the limit in one request", async () => {
      expect(await quota(5).tryConsume(5)).toBe(true);
      expect(await usedOn("2026-11-09")).toBe(5);
    });

    it("refuses a first request that is bigger than the limit without creating a row", async () => {
      expect(await quota(5).tryConsume(6)).toBe(false);
      expect(await usedOn("2026-11-09")).toBeNull();
    });

    it("refuses everything when the limit is zero", async () => {
      expect(await quota(0).tryConsume(1)).toBe(false);
      expect(await usedOn("2026-11-09")).toBeNull();
    });

    it("keeps a separate counter per resource", async () => {
      await quota(1, "model-a").tryConsume(1);

      expect(await quota(1, "model-b").tryConsume(1)).toBe(true);
      expect(await quota(1, "model-a").tryConsume(1)).toBe(false);
    });

    it("starts a new counter when the day changes in Pacific time", async () => {
      const gate = quota(1);
      now = new Date("2026-11-10T07:59:59Z");
      expect(await gate.tryConsume(1)).toBe(true);
      expect(await gate.tryConsume(1)).toBe(false);

      now = new Date("2026-11-10T08:00:00Z");

      expect(await gate.tryConsume(1)).toBe(true);
      expect(await usedOn("2026-11-09")).toBe(1);
      expect(await usedOn("2026-11-10")).toBe(1);
    });

    it("does not reset at midnight UTC", async () => {
      const gate = quota(1);
      now = new Date("2026-11-09T23:59:00Z");
      await gate.tryConsume(1);

      now = new Date("2026-11-10T00:01:00Z");

      expect(await gate.tryConsume(1)).toBe(false);
    });

    it("never goes over the limit under concurrent requests", async () => {
      const gate = quota(5);

      const results = await Promise.all(
        Array.from({ length: 40 }, () => gate.tryConsume(1)),
      );

      expect(results.filter(Boolean)).toHaveLength(5);
      expect(await usedOn("2026-11-09")).toBe(5);
    });

    it("never goes over the limit under concurrent requests of different sizes", async () => {
      const gate = quota(10);
      const requests = [3, 4, 5, 2, 6, 1, 3, 4];

      const results = await Promise.all(
        requests.map((units) => gate.tryConsume(units)),
      );

      const granted = requests
        .filter((_units, index) => results[index])
        .reduce((sum, units) => sum + units, 0);
      expect(granted).toBeGreaterThan(0);
      expect(granted).toBeLessThanOrEqual(10);
      expect(await usedOn("2026-11-09")).toBe(granted);
    });

    it.each([0, -1, 1.5, Number.NaN])("rejects %s units", async (units) => {
      await expect(quota(5).tryConsume(units)).rejects.toThrow(RangeError);
    });
  });

  describe("construction", () => {
    it.each(["", "   "])("rejects the empty resource %j", (resource) => {
      expect(() =>
        createPgDailyQuota(pool, { resource, limit: 1, now: () => now }),
      ).toThrow("Quota resource is required");
    });

    it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
      "rejects the limit %s",
      (limit) => {
        expect(() =>
          createPgDailyQuota(pool, {
            resource: RESOURCE,
            limit,
            now: () => now,
          }),
        ).toThrow(RangeError);
      },
    );
  });

  describe("schema", () => {
    it("rejects a negative counter", async () => {
      await expect(
        pool.query(
          "insert into usage_counters (day, resource, used) values ('2026-11-09', 'x', -1)",
        ),
      ).rejects.toThrow();
    });

    it("rejects a blank resource", async () => {
      await expect(
        pool.query(
          "insert into usage_counters (day, resource, used) values ('2026-11-09', '  ', 0)",
        ),
      ).rejects.toThrow();
    });
  });
});
