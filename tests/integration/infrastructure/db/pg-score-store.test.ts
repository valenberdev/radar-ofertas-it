import { fileURLToPath } from "node:url";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { OfferScore } from "../../../../src/application/ports/offer-scorer";
import type { ScoreCacheKey } from "../../../../src/application/ports/score-store";
import { migrate } from "../../../../scripts/migrate/migrator.mts";
import { createPgScoreStore } from "../../../../src/infrastructure/db/pg-score-store";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../support/test-database";

const MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL("../../../../db/migrations", import.meta.url),
);

const PROFILE_A = "a".repeat(64);
const PROFILE_B = "b".repeat(64);
const OFFER_1 = "1".repeat(64);
const OFFER_2 = "2".repeat(64);
const OFFER_3 = "3".repeat(64);
const FIRST = new Date("2026-11-09T15:00:00Z");
const SECOND = new Date("2026-11-10T09:30:00Z");

const KEY: ScoreCacheKey = {
  profileHash: PROFILE_A,
  scorerId: "gemini:model-a:score-v1",
};

const SCORE_1: OfferScore = {
  score: 85,
  reasonEs: "Coincide TypeScript.",
  reasonEn: "TypeScript matches.",
};
const SCORE_2: OfferScore = {
  score: 30,
  reasonEs: "Otro rubro.",
  reasonEn: "Another field.",
};

describe("createPgScoreStore", () => {
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
    await pool.query("truncate scores");
  });

  describe("findMany", () => {
    it("returns an empty map when nothing is stored", async () => {
      expect(
        (await createPgScoreStore(pool).findMany(KEY, [OFFER_1])).size,
      ).toBe(0);
    });

    it("returns an empty map for an empty list without failing", async () => {
      expect((await createPgScoreStore(pool).findMany(KEY, [])).size).toBe(0);
    });

    it("returns the stored scores by offer hash", async () => {
      const store = createPgScoreStore(pool);
      await store.saveMany(
        KEY,
        [
          { offerHash: OFFER_1, score: SCORE_1 },
          { offerHash: OFFER_2, score: SCORE_2 },
        ],
        FIRST,
      );

      const found = await store.findMany(KEY, [OFFER_1, OFFER_2]);

      expect(found.size).toBe(2);
      expect(found.get(OFFER_1)).toEqual(SCORE_1);
      expect(found.get(OFFER_2)).toEqual(SCORE_2);
    });

    it("returns only the requested hashes", async () => {
      const store = createPgScoreStore(pool);
      await store.saveMany(
        KEY,
        [
          { offerHash: OFFER_1, score: SCORE_1 },
          { offerHash: OFFER_2, score: SCORE_2 },
        ],
        FIRST,
      );

      const found = await store.findMany(KEY, [OFFER_2, OFFER_3]);

      expect([...found.keys()]).toEqual([OFFER_2]);
    });

    it("does not return the scores of another profile", async () => {
      const store = createPgScoreStore(pool);
      await store.saveMany(
        { ...KEY, profileHash: PROFILE_B },
        [{ offerHash: OFFER_1, score: SCORE_1 }],
        FIRST,
      );

      expect((await store.findMany(KEY, [OFFER_1])).size).toBe(0);
    });

    it("does not return the scores of another scorer", async () => {
      const store = createPgScoreStore(pool);
      await store.saveMany(
        { ...KEY, scorerId: "gemini:model-b:score-v1" },
        [{ offerHash: OFFER_1, score: SCORE_1 }],
        FIRST,
      );
      await store.saveMany(
        { ...KEY, scorerId: "gemini:model-a:score-v2" },
        [{ offerHash: OFFER_1, score: SCORE_1 }],
        FIRST,
      );

      expect((await store.findMany(KEY, [OFFER_1])).size).toBe(0);
    });

    it("finds many hashes at once", async () => {
      const store = createPgScoreStore(pool);
      const hashes = Array.from({ length: 200 }, (_, index) =>
        index.toString(16).padStart(64, "0"),
      );
      await store.saveMany(
        KEY,
        hashes.map((offerHash) => ({ offerHash, score: SCORE_1 })),
        FIRST,
      );

      expect((await store.findMany(KEY, hashes)).size).toBe(200);
    });
  });

  describe("saveMany", () => {
    it("does nothing for an empty list", async () => {
      await createPgScoreStore(pool).saveMany(KEY, [], FIRST);

      const count = await pool.query<{ count: string }>(
        "select count(*) from scores",
      );
      expect(count.rows[0]?.count).toBe("0");
    });

    it("stores the key, the score, the reasons and the time", async () => {
      await createPgScoreStore(pool).saveMany(
        KEY,
        [{ offerHash: OFFER_1, score: SCORE_1 }],
        FIRST,
      );

      const rows = await pool.query("select * from scores");
      expect(rows.rows).toEqual([
        {
          profile_hash: PROFILE_A,
          offer_hash: OFFER_1,
          scorer_id: KEY.scorerId,
          score: 85,
          reason_es: SCORE_1.reasonEs,
          reason_en: SCORE_1.reasonEn,
          created_at: FIRST,
        },
      ]);
    });

    it("keeps the same offer scored separately for each profile and scorer", async () => {
      const store = createPgScoreStore(pool);
      await store.saveMany(
        KEY,
        [{ offerHash: OFFER_1, score: SCORE_1 }],
        FIRST,
      );
      await store.saveMany(
        { ...KEY, profileHash: PROFILE_B },
        [{ offerHash: OFFER_1, score: SCORE_2 }],
        FIRST,
      );
      await store.saveMany(
        { ...KEY, scorerId: "other" },
        [{ offerHash: OFFER_1, score: SCORE_2 }],
        FIRST,
      );

      const count = await pool.query<{ count: string }>(
        "select count(*) from scores",
      );
      expect(count.rows[0]?.count).toBe("3");
      expect((await store.findMany(KEY, [OFFER_1])).get(OFFER_1)).toEqual(
        SCORE_1,
      );
    });

    it("replaces the score and the time of an offer that is saved again", async () => {
      const store = createPgScoreStore(pool);
      await store.saveMany(
        KEY,
        [{ offerHash: OFFER_1, score: SCORE_1 }],
        FIRST,
      );

      await store.saveMany(
        KEY,
        [{ offerHash: OFFER_1, score: SCORE_2 }],
        SECOND,
      );

      const rows = await pool.query(
        "select score, reason_es, reason_en, created_at from scores",
      );
      expect(rows.rows).toEqual([
        {
          score: 30,
          reason_es: SCORE_2.reasonEs,
          reason_en: SCORE_2.reasonEn,
          created_at: SECOND,
        },
      ]);
    });

    it("keeps the last score when the same offer comes twice in one call", async () => {
      const store = createPgScoreStore(pool);

      await store.saveMany(
        KEY,
        [
          { offerHash: OFFER_1, score: SCORE_1 },
          { offerHash: OFFER_1, score: SCORE_2 },
        ],
        FIRST,
      );

      expect((await store.findMany(KEY, [OFFER_1])).get(OFFER_1)).toEqual(
        SCORE_2,
      );
    });

    it("does not touch the scores that are not in the call", async () => {
      const store = createPgScoreStore(pool);
      await store.saveMany(
        KEY,
        [{ offerHash: OFFER_1, score: SCORE_1 }],
        FIRST,
      );

      await store.saveMany(
        KEY,
        [{ offerHash: OFFER_2, score: SCORE_2 }],
        SECOND,
      );

      expect((await store.findMany(KEY, [OFFER_1, OFFER_2])).size).toBe(2);
    });

    it("stores the limits of the score range", async () => {
      const store = createPgScoreStore(pool);

      await store.saveMany(
        KEY,
        [
          { offerHash: OFFER_1, score: { ...SCORE_1, score: 0 } },
          { offerHash: OFFER_2, score: { ...SCORE_1, score: 100 } },
        ],
        FIRST,
      );

      const found = await store.findMany(KEY, [OFFER_1, OFFER_2]);
      expect([found.get(OFFER_1)?.score, found.get(OFFER_2)?.score]).toEqual([
        0, 100,
      ]);
    });

    it("stores accents, quotes and emojis in the reasons", async () => {
      const store = createPgScoreStore(pool);
      const score = {
        score: 50,
        reasonEs: 'Exige "Node.js" y más 😀',
        reasonEn: "It's 'Node.js' + more 😀",
      };

      await store.saveMany(KEY, [{ offerHash: OFFER_1, score }], FIRST);

      expect((await store.findMany(KEY, [OFFER_1])).get(OFFER_1)).toEqual(
        score,
      );
    });

    it("saves many scores in one call", async () => {
      const store = createPgScoreStore(pool);
      const hashes = Array.from({ length: 200 }, (_, index) =>
        index.toString(16).padStart(64, "0"),
      );

      await store.saveMany(
        KEY,
        hashes.map((offerHash) => ({ offerHash, score: SCORE_1 })),
        FIRST,
      );

      const count = await pool.query<{ count: string }>(
        "select count(*) from scores",
      );
      expect(count.rows[0]?.count).toBe("200");
    });

    it.each([
      ["a hash that is not sha-256", { offerHash: "abc", score: SCORE_1 }],
      [
        "a score over 100",
        { offerHash: OFFER_1, score: { ...SCORE_1, score: 101 } },
      ],
      [
        "a negative score",
        { offerHash: OFFER_1, score: { ...SCORE_1, score: -1 } },
      ],
      [
        "a blank Spanish reason",
        { offerHash: OFFER_1, score: { ...SCORE_1, reasonEs: " " } },
      ],
      [
        "a blank English reason",
        { offerHash: OFFER_1, score: { ...SCORE_1, reasonEn: "" } },
      ],
    ])("rejects %s", async (_name, entry) => {
      await expect(
        createPgScoreStore(pool).saveMany(KEY, [entry], FIRST),
      ).rejects.toThrow();
    });

    it("rejects a blank scorer id and a profile hash that is not sha-256", async () => {
      const store = createPgScoreStore(pool);

      await expect(
        store.saveMany(
          { ...KEY, scorerId: "  " },
          [{ offerHash: OFFER_1, score: SCORE_1 }],
          FIRST,
        ),
      ).rejects.toThrow();
      await expect(
        store.saveMany(
          { ...KEY, profileHash: "xyz" },
          [{ offerHash: OFFER_1, score: SCORE_1 }],
          FIRST,
        ),
      ).rejects.toThrow();
    });

    it("saves nothing when one entry of the call is invalid", async () => {
      const store = createPgScoreStore(pool);

      await expect(
        store.saveMany(
          KEY,
          [
            { offerHash: OFFER_1, score: SCORE_1 },
            { offerHash: OFFER_2, score: { ...SCORE_2, score: 500 } },
          ],
          FIRST,
        ),
      ).rejects.toThrow();

      expect((await store.findMany(KEY, [OFFER_1, OFFER_2])).size).toBe(0);
    });
  });
});
