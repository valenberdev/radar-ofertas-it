import { fileURLToPath } from "node:url";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { IngestRunOutcome } from "../../../../src/application/ports/ingest-run-repository";
import { migrate } from "../../../../scripts/migrate/migrator.mts";
import { createPgIngestRunRepository } from "../../../../src/infrastructure/db/pg-ingest-run-repository";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../support/test-database";

const MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL("../../../../db/migrations", import.meta.url),
);

const STARTED = new Date("2026-10-30T09:00:00Z");
const FINISHED = new Date("2026-10-30T09:04:30Z");

function outcome(overrides: Partial<IngestRunOutcome> = {}): IngestRunOutcome {
  return {
    status: "succeeded",
    finishedAt: FINISHED,
    counts: { fetched: 10, inserted: 6, updated: 4, rejected: 2 },
    error: null,
    ...overrides,
  };
}

describe("createPgIngestRunRepository", () => {
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
    await pool.query("truncate ingest_runs restart identity");
  });

  describe("start", () => {
    it("creates a running run with zero counts and returns its id as text", async () => {
      const repo = createPgIngestRunRepository(pool);

      const id = await repo.start("himalayas", STARTED);

      expect(id).toMatch(/^\d+$/);
      const { rows } = await pool.query("select * from ingest_runs");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        source: "himalayas",
        status: "running",
        finished_at: null,
        fetched_count: 0,
        inserted_count: 0,
        updated_count: 0,
        rejected_count: 0,
        error_message: null,
      });
      expect(String(rows[0].id)).toBe(id);
      expect(rows[0].started_at.toISOString()).toBe(STARTED.toISOString());
    });

    it("gives each run its own id", async () => {
      const repo = createPgIngestRunRepository(pool);

      const first = await repo.start("himalayas", STARTED);
      const second = await repo.start("himalayas", STARTED);

      expect(second).not.toBe(first);
    });
  });

  describe("finish", () => {
    it("records a successful run", async () => {
      const repo = createPgIngestRunRepository(pool);
      const id = await repo.start("himalayas", STARTED);

      await repo.finish(id, outcome());

      const { rows } = await pool.query(
        "select * from ingest_runs where id = $1",
        [id],
      );
      expect(rows[0]).toMatchObject({
        status: "succeeded",
        fetched_count: 10,
        inserted_count: 6,
        updated_count: 4,
        rejected_count: 2,
        error_message: null,
      });
      expect(rows[0].finished_at.toISOString()).toBe(FINISHED.toISOString());
      expect(rows[0].started_at.toISOString()).toBe(STARTED.toISOString());
    });

    it("records a failed run with its error message", async () => {
      const repo = createPgIngestRunRepository(pool);
      const id = await repo.start("hackernews", STARTED);

      await repo.finish(
        id,
        outcome({
          status: "failed",
          error:
            "Hacker News ingestion aborted: 6 of 20 relevant comments were rejected",
        }),
      );

      const { rows } = await pool.query(
        "select status, error_message from ingest_runs where id = $1",
        [id],
      );
      expect(rows[0]).toEqual({
        status: "failed",
        error_message:
          "Hacker News ingestion aborted: 6 of 20 relevant comments were rejected",
      });
    });

    it("only touches the run it was given", async () => {
      const repo = createPgIngestRunRepository(pool);
      const first = await repo.start("himalayas", STARTED);
      const second = await repo.start("himalayas", STARTED);

      await repo.finish(first, outcome());

      const { rows } = await pool.query(
        "select id::text as id, status from ingest_runs order by id",
      );
      expect(rows).toEqual([
        { id: first, status: "succeeded" },
        { id: second, status: "running" },
      ]);
    });

    it("rejects an id that does not exist", async () => {
      const repo = createPgIngestRunRepository(pool);

      await expect(repo.finish("999999", outcome())).rejects.toThrow(
        "Ingest run 999999 was not found or is already finished",
      );
    });

    it("rejects finishing a run twice and keeps the first result", async () => {
      const repo = createPgIngestRunRepository(pool);
      const id = await repo.start("himalayas", STARTED);
      await repo.finish(id, outcome());

      await expect(
        repo.finish(id, outcome({ status: "failed", error: "late" })),
      ).rejects.toThrow(
        `Ingest run ${id} was not found or is already finished`,
      );

      const { rows } = await pool.query(
        "select status, error_message from ingest_runs where id = $1",
        [id],
      );
      expect(rows[0]).toEqual({ status: "succeeded", error_message: null });
    });

    it("rejects an id that is not a number", async () => {
      const repo = createPgIngestRunRepository(pool);

      await expect(repo.finish("not-a-number", outcome())).rejects.toThrow();
    });
  });

  describe("findLastSucceededStart", () => {
    it("returns null when the source never succeeded", async () => {
      const repo = createPgIngestRunRepository(pool);

      expect(await repo.findLastSucceededStart("himalayas")).toBeNull();
    });

    it("ignores failed and running runs", async () => {
      const repo = createPgIngestRunRepository(pool);
      const failed = await repo.start(
        "himalayas",
        new Date("2026-10-28T09:00:00Z"),
      );
      await repo.finish(failed, outcome({ status: "failed", error: "boom" }));
      await repo.start("himalayas", new Date("2026-10-29T09:00:00Z"));

      expect(await repo.findLastSucceededStart("himalayas")).toBeNull();
    });

    it("returns the start of the most recent successful run", async () => {
      const repo = createPgIngestRunRepository(pool);
      const older = await repo.start(
        "himalayas",
        new Date("2026-10-27T09:00:00Z"),
      );
      await repo.finish(older, outcome());
      const newer = await repo.start(
        "himalayas",
        new Date("2026-10-29T09:00:00Z"),
      );
      await repo.finish(newer, outcome());
      const failedLater = await repo.start(
        "himalayas",
        new Date("2026-10-30T09:00:00Z"),
      );
      await repo.finish(
        failedLater,
        outcome({ status: "failed", error: "boom" }),
      );

      const found = await repo.findLastSucceededStart("himalayas");

      expect(found?.toISOString()).toBe("2026-10-29T09:00:00.000Z");
    });

    it("looks only at the source it is asked about", async () => {
      const repo = createPgIngestRunRepository(pool);
      const other = await repo.start(
        "hackernews",
        new Date("2026-10-29T09:00:00Z"),
      );
      await repo.finish(other, outcome());
      const mine = await repo.start(
        "himalayas",
        new Date("2026-10-20T09:00:00Z"),
      );
      await repo.finish(mine, outcome());

      expect(
        (await repo.findLastSucceededStart("himalayas"))?.toISOString(),
      ).toBe("2026-10-20T09:00:00.000Z");
      expect(
        (await repo.findLastSucceededStart("hackernews"))?.toISOString(),
      ).toBe("2026-10-29T09:00:00.000Z");
    });

    it("returns a Date", async () => {
      const repo = createPgIngestRunRepository(pool);
      const id = await repo.start("himalayas", STARTED);
      await repo.finish(id, outcome());

      expect(await repo.findLastSucceededStart("himalayas")).toBeInstanceOf(
        Date,
      );
    });
  });
});
