import { fileURLToPath } from "node:url";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../../../../scripts/migrate/migrator.mts";
import { dedupKey } from "../../../../src/domain/dedup-key";
import type {
  JsonValue,
  SourceName,
} from "../../../../src/domain/source-offer";
import { renormalizeOffers } from "../../../../src/infrastructure/maintenance/renormalize-offers";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../support/test-database";

const MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL("../../../../db/migrations", import.meta.url),
);

const INGESTED_AT = "2026-10-30T09:00:00Z";

function himalayasRaw(
  guid: string,
  extra: Record<string, JsonValue> = {},
): JsonValue {
  return {
    guid,
    title: `Engineer ${guid}`,
    companyName: "Acme",
    applicationLink: `https://example.com/${guid}`,
    description: "We build things.",
    ...extra,
  };
}

function hackerNewsRaw(id: number, header: string): JsonValue {
  return { id, time: 1_761_800_000, text: `${header}<p>We are hiring.` };
}

async function insertLegacy(
  pool: Pool,
  source: SourceName,
  sourceId: string,
  raw: JsonValue,
  columns: {
    title?: string;
    company?: string | null;
    description?: string;
  } = {},
): Promise<void> {
  await pool.query(
    `insert into offers (source, source_id, title, company, url, description, raw, first_ingested_at, last_ingested_at)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $8)`,
    [
      source,
      sourceId,
      columns.title ?? `Title ${sourceId}`,
      columns.company === undefined ? "Acme" : columns.company,
      `https://example.com/${sourceId}`,
      columns.description ?? "Description",
      JSON.stringify(raw),
      INGESTED_AT,
    ],
  );
}

describe("renormalizeOffers", () => {
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
    await pool.query("truncate offers restart identity");
  });

  it("fills region and key from the stored raw for both sources", async () => {
    await insertLegacy(
      pool,
      "himalayas",
      "h-countries",
      himalayasRaw("h-countries", {
        locationRestrictions: ["Argentina", "Chile"],
      }),
    );
    await insertLegacy(
      pool,
      "himalayas",
      "h-worldwide",
      himalayasRaw("h-worldwide", {
        locationRestrictions: [],
        timezoneRestrictions: [],
      }),
    );
    await insertLegacy(
      pool,
      "himalayas",
      "h-unknown",
      himalayasRaw("h-unknown"),
    );
    await insertLegacy(
      pool,
      "hackernews",
      "1",
      hackerNewsRaw(
        1,
        "Acme | Backend Engineer | Remote (Argentina) | Full-time",
      ),
    );

    const report = await renormalizeOffers(pool);

    expect(report).toEqual({
      scanned: 4,
      updated: 4,
      unreadable: 0,
      worldwide: 1,
      countries: 2,
      unknown: 1,
    });
    const { rows } = await pool.query(
      "select source_id, region_status, allowed_countries from offers order by source_id",
    );
    expect(rows).toEqual([
      {
        source_id: "1",
        region_status: "countries",
        allowed_countries: ["Argentina"],
      },
      {
        source_id: "h-countries",
        region_status: "countries",
        allowed_countries: ["Argentina", "Chile"],
      },
      {
        source_id: "h-unknown",
        region_status: "unknown",
        allowed_countries: [],
      },
      {
        source_id: "h-worldwide",
        region_status: "worldwide",
        allowed_countries: [],
      },
    ]);
  });

  it("computes the key from the stored columns", async () => {
    await insertLegacy(pool, "himalayas", "a", himalayasRaw("a"), {
      title: "  Senior   Dev ",
      company: "ACME",
      description: "Stored text",
    });
    await insertLegacy(
      pool,
      "hackernews",
      "2",
      hackerNewsRaw(2, "Foo | Dev | Remote"),
      { title: "Stored header", company: null, description: "Other" },
    );

    await renormalizeOffers(pool);

    const { rows } = await pool.query(
      "select source, company, title, description, dedup_key from offers order by id",
    );
    for (const row of rows) {
      expect(row.dedup_key).toBe(
        dedupKey({
          source: row.source,
          company: row.company,
          title: row.title,
          description: row.description,
        }),
      );
    }
  });

  it("stores unknown and counts rows whose raw cannot be read", async () => {
    await insertLegacy(pool, "himalayas", "broken", { guid: "broken" });
    await insertLegacy(pool, "hackernews", "3", {
      id: 3,
      time: 1_761_800_000,
      deleted: true,
    });
    await insertLegacy(pool, "himalayas", "text", "just a string");

    const report = await renormalizeOffers(pool);

    expect(report).toMatchObject({
      scanned: 3,
      updated: 3,
      unreadable: 3,
      unknown: 3,
    });
    const { rows } = await pool.query(
      "select region_status, dedup_key from offers",
    );
    for (const row of rows) {
      expect(row.region_status).toBe("unknown");
      expect(row.dedup_key).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("is idempotent: a second run finds nothing to do", async () => {
    await insertLegacy(
      pool,
      "himalayas",
      "a",
      himalayasRaw("a", { locationRestrictions: ["Chile"] }),
    );
    await renormalizeOffers(pool);

    const second = await renormalizeOffers(pool);

    expect(second).toEqual({
      scanned: 0,
      updated: 0,
      unreadable: 0,
      worldwide: 0,
      countries: 0,
      unknown: 0,
    });
  });

  it("leaves rows that already have a key untouched", async () => {
    await insertLegacy(
      pool,
      "himalayas",
      "done",
      himalayasRaw("done", { locationRestrictions: ["Chile"] }),
    );
    const key = "a".repeat(64);
    await pool.query(
      "update offers set dedup_key = $1, region_status = 'worldwide'",
      [key],
    );
    await insertLegacy(
      pool,
      "himalayas",
      "todo",
      himalayasRaw("todo", { locationRestrictions: ["Peru"] }),
    );

    const report = await renormalizeOffers(pool);

    expect(report.scanned).toBe(1);
    const { rows } = await pool.query(
      "select source_id, region_status, dedup_key from offers order by source_id",
    );
    expect(rows[0]).toEqual({
      source_id: "done",
      region_status: "worldwide",
      dedup_key: key,
    });
    expect(rows[1]?.region_status).toBe("countries");
  });

  it("processes every row when there are more rows than the batch size", async () => {
    for (let i = 0; i < 7; i += 1) {
      await insertLegacy(
        pool,
        "himalayas",
        `b-${i}`,
        himalayasRaw(`b-${i}`, { locationRestrictions: ["Chile"] }),
      );
    }

    const report = await renormalizeOffers(pool, 3);

    expect(report).toMatchObject({ scanned: 7, updated: 7, countries: 7 });
    const { rows } = await pool.query(
      "select count(*)::int as pending from offers where dedup_key is null",
    );
    expect(rows[0].pending).toBe(0);
  });

  it("changes nothing but region and key", async () => {
    await insertLegacy(
      pool,
      "himalayas",
      "a",
      himalayasRaw("a", { locationRestrictions: ["Chile"] }),
    );
    const before = await pool.query(
      "select title, company, url, description, raw, posted_at, expires_at, first_ingested_at, last_ingested_at from offers",
    );

    await renormalizeOffers(pool);

    const after = await pool.query(
      "select title, company, url, description, raw, posted_at, expires_at, first_ingested_at, last_ingested_at from offers",
    );
    expect(after.rows).toEqual(before.rows);
  });

  it("stops even when the update changes no rows", async () => {
    for (let i = 0; i < 4; i += 1) {
      await insertLegacy(pool, "himalayas", `s-${i}`, himalayasRaw(`s-${i}`));
    }
    const skippingUpdates = {
      query: (text: string, values?: unknown[]) =>
        text.includes("update offers")
          ? Promise.resolve({ rowCount: 0, rows: [] })
          : pool.query(text, values),
    } as unknown as Pick<Pool, "query">;

    const report = await renormalizeOffers(skippingUpdates, 3);

    expect(report).toMatchObject({ scanned: 4, updated: 0 });
  });

  it("does nothing on an empty table", async () => {
    expect(await renormalizeOffers(pool)).toEqual({
      scanned: 0,
      updated: 0,
      unreadable: 0,
      worldwide: 0,
      countries: 0,
      unknown: 0,
    });
  });
});
