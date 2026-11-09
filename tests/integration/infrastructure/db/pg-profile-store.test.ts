import { fileURLToPath } from "node:url";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ProfileCacheKey } from "../../../../src/application/ports/profile-store";
import type { Profile } from "../../../../src/domain/profile";
import { migrate } from "../../../../scripts/migrate/migrator.mts";
import { createPgProfileStore } from "../../../../src/infrastructure/db/pg-profile-store";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../support/test-database";

const MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL("../../../../db/migrations", import.meta.url),
);

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const FIRST = new Date("2026-11-09T15:00:00Z");
const SECOND = new Date("2026-11-10T09:30:00Z");

const KEY: ProfileCacheKey = {
  textHash: HASH_A,
  extractorId: "gemini:model-a:profile-v1",
};

const PROFILE: Profile = {
  seniority: "junior",
  yearsOfExperience: 1.5,
  skills: [
    { name: "TypeScript", aliases: ["ts"] },
    { name: "PostgreSQL", aliases: ["postgres", "psql"] },
  ],
  targetRoles: ["Backend Developer"],
  languages: ["Spanish (native)", "English (B2)"],
  summary: "Junior backend developer.",
};

describe("createPgProfileStore", () => {
  let database: TestDatabase;
  let pool: Pool;

  beforeAll(async () => {
    database = await createTestDatabase();
    const client = new Client({ connectionString: database.connectionString });
    await client.connect();
    try {
      await migrate(client, MIGRATIONS_DIRECTORY);
    } finally {
      await client.end();
    }
    pool = new Pool({ connectionString: database.connectionString, max: 2 });
  });

  afterAll(async () => {
    await pool.end();
    await database.drop();
  });

  beforeEach(async () => {
    await pool.query("truncate profiles");
  });

  describe("find", () => {
    it("returns null when there is nothing stored", async () => {
      expect(await createPgProfileStore(pool).find(KEY, FIRST)).toBeNull();
    });

    it("returns the stored profile", async () => {
      const store = createPgProfileStore(pool);
      await store.save(KEY, PROFILE, FIRST);

      expect(await store.find(KEY, SECOND)).toEqual(PROFILE);
    });

    it("keeps null seniority and years", async () => {
      const store = createPgProfileStore(pool);
      const profile: Profile = {
        ...PROFILE,
        seniority: null,
        yearsOfExperience: null,
      };
      await store.save(KEY, profile, FIRST);

      expect(await store.find(KEY, SECOND)).toEqual(profile);
    });

    it("does not find a profile stored under another hash", async () => {
      const store = createPgProfileStore(pool);
      await store.save(KEY, PROFILE, FIRST);

      expect(await store.find({ ...KEY, textHash: HASH_B }, SECOND)).toBeNull();
    });

    it("does not find a profile stored under another extractor", async () => {
      const store = createPgProfileStore(pool);
      await store.save(KEY, PROFILE, FIRST);

      expect(
        await store.find(
          { ...KEY, extractorId: "gemini:model-b:profile-v1" },
          SECOND,
        ),
      ).toBeNull();
    });

    it("records when the profile was last used", async () => {
      const store = createPgProfileStore(pool);
      await store.save(KEY, PROFILE, FIRST);

      await store.find(KEY, SECOND);

      const { rows } = await pool.query(
        "select created_at, last_used_at from profiles",
      );
      expect(rows[0].created_at.toISOString()).toBe(FIRST.toISOString());
      expect(rows[0].last_used_at.toISOString()).toBe(SECOND.toISOString());
    });

    it("does not touch other profiles when it records the use", async () => {
      const store = createPgProfileStore(pool);
      await store.save(KEY, PROFILE, FIRST);
      await store.save({ ...KEY, textHash: HASH_B }, PROFILE, FIRST);

      await store.find(KEY, SECOND);

      const { rows } = await pool.query(
        "select text_hash, last_used_at from profiles order by text_hash",
      );
      expect(rows[0].last_used_at.toISOString()).toBe(SECOND.toISOString());
      expect(rows[1].last_used_at.toISOString()).toBe(FIRST.toISOString());
    });

    it("treats stored data with an unexpected shape as a miss", async () => {
      await pool.query(
        "insert into profiles (text_hash, extractor_id, profile) values ($1, $2, $3::jsonb)",
        [
          KEY.textHash,
          KEY.extractorId,
          JSON.stringify({ skills: "not a list" }),
        ],
      );

      expect(await createPgProfileStore(pool).find(KEY, SECOND)).toBeNull();
    });

    it("normalizes what it reads", async () => {
      await pool.query(
        "insert into profiles (text_hash, extractor_id, profile) values ($1, $2, $3::jsonb)",
        [
          KEY.textHash,
          KEY.extractorId,
          JSON.stringify({
            seniority: " Senior ",
            yearsOfExperience: 3,
            skills: [{ name: "  Go ", aliases: [] }],
            targetRoles: [],
            languages: [],
            summary: "  Hello   world ",
          }),
        ],
      );

      expect(await createPgProfileStore(pool).find(KEY, SECOND)).toEqual({
        seniority: "senior",
        yearsOfExperience: 3,
        skills: [{ name: "Go", aliases: [] }],
        targetRoles: [],
        languages: [],
        summary: "Hello world",
      });
    });
  });

  describe("save", () => {
    it("stores one row with the key and the dates", async () => {
      await createPgProfileStore(pool).save(KEY, PROFILE, FIRST);

      const { rows } = await pool.query("select * from profiles");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        text_hash: HASH_A,
        extractor_id: KEY.extractorId,
        profile: PROFILE,
      });
      expect(rows[0].created_at.toISOString()).toBe(FIRST.toISOString());
      expect(rows[0].last_used_at.toISOString()).toBe(FIRST.toISOString());
    });

    it("replaces the profile and keeps the creation date when the key already exists", async () => {
      const store = createPgProfileStore(pool);
      await store.save(KEY, PROFILE, FIRST);
      const updated: Profile = { ...PROFILE, summary: "Updated summary." };

      await store.save(KEY, updated, SECOND);

      const { rows } = await pool.query("select * from profiles");
      expect(rows).toHaveLength(1);
      expect(rows[0].profile).toEqual(updated);
      expect(rows[0].created_at.toISOString()).toBe(FIRST.toISOString());
      expect(rows[0].last_used_at.toISOString()).toBe(SECOND.toISOString());
    });

    it("keeps one row per hash and extractor", async () => {
      const store = createPgProfileStore(pool);
      await store.save(KEY, PROFILE, FIRST);
      await store.save({ ...KEY, textHash: HASH_B }, PROFILE, FIRST);
      await store.save(
        { ...KEY, extractorId: "gemini:model-b:profile-v1" },
        PROFILE,
        FIRST,
      );

      const { rows } = await pool.query(
        "select count(*)::int as total from profiles",
      );
      expect(rows[0].total).toBe(3);
    });

    it("survives concurrent saves of the same key", async () => {
      const store = createPgProfileStore(pool);

      await Promise.all(
        Array.from({ length: 10 }, () => store.save(KEY, PROFILE, FIRST)),
      );

      const { rows } = await pool.query(
        "select count(*)::int as total from profiles",
      );
      expect(rows[0].total).toBe(1);
    });

    it.each([
      ["a hash that is not sha-256 hex", { ...KEY, textHash: "xyz" }],
      ["an uppercase hash", { ...KEY, textHash: "A".repeat(64) }],
      ["an empty extractor id", { ...KEY, extractorId: "  " }],
    ])("rejects %s", async (_name, key) => {
      await expect(
        createPgProfileStore(pool).save(key, PROFILE, FIRST),
      ).rejects.toThrow();
    });
  });

  describe("schema", () => {
    it("rejects a profile that is not a JSON object", async () => {
      await expect(
        pool.query(
          "insert into profiles (text_hash, extractor_id, profile) values ($1, $2, '[]'::jsonb)",
          [HASH_A, KEY.extractorId],
        ),
      ).rejects.toThrow();
    });
  });
});
