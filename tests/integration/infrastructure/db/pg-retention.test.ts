import { fileURLToPath } from "node:url";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../../../../scripts/migrate/migrator.mts";
import {
  purgeExpiredData,
  RETENTION,
} from "../../../../src/infrastructure/db/pg-retention";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../support/test-database";

const MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL("../../../../db/migrations", import.meta.url),
);

const NOW = new Date("2026-11-17T20:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const HASH = (character: string) => character.repeat(64);

function daysAgo(days: number, extraMs = 0): Date {
  return new Date(NOW.getTime() - days * DAY_MS - extraMs);
}

describe("purgeExpiredData", () => {
  let database: TestDatabase;
  let pool: Pool;

  async function addCounter(day: string, resource = "gemini"): Promise<void> {
    await pool.query(
      "insert into usage_counters (day, resource, used) values ($1::date, $2, 1)",
      [day, resource],
    );
  }

  async function addProfile(
    hash: string,
    lastUsedAt: Date,
    createdAt = lastUsedAt,
  ): Promise<void> {
    await pool.query(
      "insert into profiles (text_hash, extractor_id, profile, created_at, last_used_at) values ($1, 'x', '{}'::jsonb, $2, $3)",
      [hash, createdAt.toISOString(), lastUsedAt.toISOString()],
    );
  }

  async function addScore(offerHash: string, createdAt: Date): Promise<void> {
    await pool.query(
      "insert into scores (profile_hash, offer_hash, scorer_id, score, reason_es, reason_en, created_at) values ($1, $2, 's', 50, 'a', 'b', $3)",
      [HASH("f"), offerHash, createdAt.toISOString()],
    );
  }

  async function remaining(sql: string): Promise<string[]> {
    const { rows } = await pool.query<{ key: string }>(sql);
    return rows.map((row) => row.key).sort();
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
    pool = new Pool({ connectionString: database.connectionString, max: 4 });
  });

  afterAll(async () => {
    await pool?.end();
    await database?.drop();
  });

  beforeEach(async () => {
    await pool.query("truncate usage_counters, profiles, scores");
  });

  it("keeps two days of counters before the current Pacific day", async () => {
    for (const day of [
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
      "2026-11-16",
      "2026-11-17",
    ]) {
      await addCounter(day);
    }

    const counts = await purgeExpiredData(pool, NOW);

    expect(
      await remaining(
        "select to_char(day, 'YYYY-MM-DD') as key from usage_counters",
      ),
    ).toEqual(["2026-11-15", "2026-11-16", "2026-11-17"]);
    expect(counts.usageCounters).toBe(2);
  });

  it("counts the days in Pacific time, like the quota does", async () => {
    await addCounter("2026-11-14");
    await addCounter("2026-11-15");

    await purgeExpiredData(pool, new Date("2026-11-18T07:00:00Z"));

    expect(
      await remaining(
        "select to_char(day, 'YYYY-MM-DD') as key from usage_counters",
      ),
    ).toEqual(["2026-11-15"]);
  });

  it("removes every kind of counter, including the hashed client counters", async () => {
    await addCounter("2026-11-01", "gemini");
    await addCounter("2026-11-01", "search-ip:abc");

    expect((await purgeExpiredData(pool, NOW)).usageCounters).toBe(2);
  });

  it("removes profiles not used for thirty days and keeps the rest", async () => {
    await addProfile(HASH("a"), daysAgo(RETENTION.profileDays, 1));
    await addProfile(HASH("b"), daysAgo(RETENTION.profileDays));
    await addProfile(HASH("c"), daysAgo(1));

    const counts = await purgeExpiredData(pool, NOW);

    expect(
      await remaining("select left(text_hash, 1) as key from profiles"),
    ).toEqual(["b", "c"]);
    expect(counts.profiles).toBe(1);
  });

  it("keeps an old profile that is still being used", async () => {
    await addProfile(HASH("a"), daysAgo(1), daysAgo(200));

    await purgeExpiredData(pool, NOW);

    expect(
      await remaining("select left(text_hash, 1) as key from profiles"),
    ).toEqual(["a"]);
  });

  it("removes a recent profile that has not been used since it was created long ago", async () => {
    await addProfile(HASH("a"), daysAgo(45), daysAgo(45));

    expect((await purgeExpiredData(pool, NOW)).profiles).toBe(1);
  });

  it("removes scores older than thirty days and keeps the rest", async () => {
    await addScore(HASH("a"), daysAgo(RETENTION.scoreDays, 1));
    await addScore(HASH("b"), daysAgo(RETENTION.scoreDays));
    await addScore(HASH("c"), NOW);

    const counts = await purgeExpiredData(pool, NOW);

    expect(
      await remaining("select left(offer_hash, 1) as key from scores"),
    ).toEqual(["b", "c"]);
    expect(counts.scores).toBe(1);
  });

  it("reports zero when there is nothing to remove", async () => {
    expect(await purgeExpiredData(pool, NOW)).toEqual({
      usageCounters: 0,
      profiles: 0,
      scores: 0,
    });
  });

  it("can run twice in a row", async () => {
    await addProfile(HASH("a"), daysAgo(90));

    await purgeExpiredData(pool, NOW);

    expect(await purgeExpiredData(pool, NOW)).toEqual({
      usageCounters: 0,
      profiles: 0,
      scores: 0,
    });
  });

  it("uses the retention it documents", () => {
    expect(RETENTION).toEqual({
      usageCounterDays: 2,
      profileDays: 30,
      scoreDays: 30,
    });
  });
});
