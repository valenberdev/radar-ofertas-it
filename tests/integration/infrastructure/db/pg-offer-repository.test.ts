import { fileURLToPath } from "node:url";
import { Client, Pool } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { migrate } from "../../../../scripts/migrate/migrator.mts";
import type { SourceOffer } from "../../../../src/domain/source-offer";
import { createPgOfferRepository } from "../../../../src/infrastructure/db/pg-offer-repository";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../support/test-database";
import { dedupKey } from "../../../../src/domain/dedup-key";

const MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL("../../../../db/migrations", import.meta.url),
);

const FIRST_RUN = new Date("2026-10-30T09:00:00Z");
const SECOND_RUN = new Date("2026-10-31T09:00:00Z");

function makeOffer(
  sourceId: string,
  overrides: Partial<SourceOffer> = {},
): SourceOffer {
  return {
    source: "himalayas",
    sourceId,
    title: `Engineer ${sourceId}`,
    company: "Acme",
    url: `https://example.com/${sourceId}`,
    description: "We build things.",
    postedAt: new Date("2026-10-30T08:00:00Z"),
    expiresAt: new Date("2026-12-01T08:00:00Z"),
    region: { kind: "countries", countries: ["Argentina", "Chile"] },
    raw: { id: sourceId },
    ...overrides,
  };
}

describe("createPgOfferRepository", () => {
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

  it("inserts new offers and reports them as inserted", async () => {
    const repo = createPgOfferRepository(pool);

    const result = await repo.upsertMany(
      [makeOffer("a"), makeOffer("b")],
      FIRST_RUN,
    );

    expect(result).toEqual({ inserted: 2, updated: 0 });
    const { rows } = await pool.query(
      "select * from offers order by source_id",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      source: "himalayas",
      source_id: "a",
      title: "Engineer a",
      company: "Acme",
      url: "https://example.com/a",
      description: "We build things.",
      raw: { id: "a" },
    });
    expect(rows[0].posted_at.toISOString()).toBe("2026-10-30T08:00:00.000Z");
    expect(rows[0].expires_at.toISOString()).toBe("2026-12-01T08:00:00.000Z");
    expect(rows[0].first_ingested_at.toISOString()).toBe(
      FIRST_RUN.toISOString(),
    );
    expect(rows[0].last_ingested_at.toISOString()).toBe(
      FIRST_RUN.toISOString(),
    );
  });

  it("updates an existing offer, keeps first_ingested_at and moves last_ingested_at", async () => {
    const repo = createPgOfferRepository(pool);
    await repo.upsertMany([makeOffer("a")], FIRST_RUN);

    const changed = makeOffer("a", {
      title: "New title",
      company: null,
      url: "https://example.com/changed",
      description: "Changed",
      raw: { version: 2 },
      postedAt: null,
      expiresAt: null,
    });
    const result = await repo.upsertMany([changed], SECOND_RUN);

    expect(result).toEqual({ inserted: 0, updated: 1 });
    const { rows } = await pool.query("select * from offers");
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.title).toBe("New title");
    expect(row.company).toBeNull();
    expect(row.url).toBe("https://example.com/changed");
    expect(row.description).toBe("Changed");
    expect(row.raw).toEqual({ version: 2 });
    expect(row.posted_at).toBeNull();
    expect(row.expires_at).toBeNull();
    expect(row.first_ingested_at.toISOString()).toBe(FIRST_RUN.toISOString());
    expect(row.last_ingested_at.toISOString()).toBe(SECOND_RUN.toISOString());
  });

  it("reports a mix of new and existing offers", async () => {
    const repo = createPgOfferRepository(pool);
    await repo.upsertMany([makeOffer("a")], FIRST_RUN);

    const result = await repo.upsertMany(
      [makeOffer("a"), makeOffer("b"), makeOffer("c")],
      SECOND_RUN,
    );

    expect(result).toEqual({ inserted: 2, updated: 1 });
  });

  it("treats the same source id from another source as a different offer", async () => {
    const repo = createPgOfferRepository(pool);

    const result = await repo.upsertMany(
      [makeOffer("a"), makeOffer("a", { source: "hackernews" })],
      FIRST_RUN,
    );

    expect(result).toEqual({ inserted: 2, updated: 0 });
  });

  it("does nothing for an empty list and does not touch the database", async () => {
    const spy = vi.spyOn(pool, "query");
    const repo = createPgOfferRepository(pool);

    expect(await repo.upsertMany([], FIRST_RUN)).toEqual({
      inserted: 0,
      updated: 0,
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("stores awkward text exactly", async () => {
    const repo = createPgOfferRepository(pool);
    const awkward =
      "He said \"hi\", {braces}, \\backslash, comma, NULL, 'quote', newline\nand tab\t.";
    const emoji = String.fromCodePoint(0x1f680);
    const raw = {
      text: awkward,
      list: [awkward, null, 1, true],
      nested: { 'k"ey': awkward },
    };

    await repo.upsertMany(
      [
        makeOffer("x", {
          title: awkward,
          company: `${emoji} Co`,
          description: awkward,
          raw,
        }),
      ],
      FIRST_RUN,
    );

    const { rows } = await pool.query(
      "select title, company, description, raw from offers",
    );
    expect(rows[0].title).toBe(awkward);
    expect(rows[0].company).toBe(`${emoji} Co`);
    expect(rows[0].description).toBe(awkward);
    expect(rows[0].raw).toEqual(raw);
  });

  it("stores a raw value that is JSON null as a JSON null", async () => {
    const repo = createPgOfferRepository(pool);

    await repo.upsertMany([makeOffer("n", { raw: null })], FIRST_RUN);

    const { rows } = await pool.query(
      "select raw is null as sql_null, jsonb_typeof(raw) as kind from offers",
    );
    expect(rows[0]).toEqual({ sql_null: false, kind: "null" });
  });

  it("stores a null company and null dates", async () => {
    const repo = createPgOfferRepository(pool);

    await repo.upsertMany(
      [makeOffer("n", { company: null, postedAt: null, expiresAt: null })],
      FIRST_RUN,
    );

    const { rows } = await pool.query(
      "select company, posted_at, expires_at from offers",
    );
    expect(rows[0]).toEqual({
      company: null,
      posted_at: null,
      expires_at: null,
    });
  });

  it("handles a large batch", async () => {
    const repo = createPgOfferRepository(pool);
    const offers = Array.from({ length: 2000 }, (_, i) =>
      makeOffer(`id-${i}`, { description: "x".repeat(6000) }),
    );

    const result = await repo.upsertMany(offers, FIRST_RUN);

    expect(result).toEqual({ inserted: 2000, updated: 0 });
    const { rows } = await pool.query("select count(*)::int as n from offers");
    expect(rows[0].n).toBe(2000);
  });

  it("saves nothing when one offer in the batch breaks a constraint", async () => {
    const repo = createPgOfferRepository(pool);

    await expect(
      repo.upsertMany(
        [makeOffer("ok"), makeOffer("bad", { title: "   " })],
        FIRST_RUN,
      ),
    ).rejects.toThrow();

    const { rows } = await pool.query("select count(*)::int as n from offers");
    expect(rows[0].n).toBe(0);
  });

  it("fails when a batch contains the same offer twice", async () => {
    const repo = createPgOfferRepository(pool);

    await expect(
      repo.upsertMany([makeOffer("a"), makeOffer("a")], FIRST_RUN),
    ).rejects.toThrow();
  });

  describe("region and dedup key", () => {
    it("stores a countries region with its list in order", async () => {
      const repo = createPgOfferRepository(pool);

      await repo.upsertMany(
        [
          makeOffer("a", {
            region: {
              kind: "countries",
              countries: ["Chile", "Argentina", "Brazil"],
            },
          }),
        ],
        FIRST_RUN,
      );

      const { rows } = await pool.query(
        "select region_status, allowed_countries from offers",
      );
      expect(rows[0]).toEqual({
        region_status: "countries",
        allowed_countries: ["Chile", "Argentina", "Brazil"],
      });
    });

    it("stores worldwide and unknown with an empty list", async () => {
      const repo = createPgOfferRepository(pool);

      await repo.upsertMany(
        [
          makeOffer("w", { region: { kind: "worldwide" } }),
          makeOffer("u", { region: { kind: "unknown" } }),
        ],
        FIRST_RUN,
      );

      const { rows } = await pool.query(
        "select source_id, region_status, allowed_countries from offers order by source_id",
      );
      expect(rows).toEqual([
        { source_id: "u", region_status: "unknown", allowed_countries: [] },
        { source_id: "w", region_status: "worldwide", allowed_countries: [] },
      ]);
    });

    it("keeps country names with commas, quotes and braces intact", async () => {
      const repo = createPgOfferRepository(pool);
      const countries = [
        "Congo, Democratic Republic of the",
        'Say "hi"',
        "{braces}",
        "Côte d'Ivoire",
      ];

      await repo.upsertMany(
        [makeOffer("a", { region: { kind: "countries", countries } })],
        FIRST_RUN,
      );

      const { rows } = await pool.query("select allowed_countries from offers");
      expect(rows[0].allowed_countries).toEqual(countries);
    });

    it("keeps each offer's own list when the batch has different lengths", async () => {
      const repo = createPgOfferRepository(pool);

      await repo.upsertMany(
        [
          makeOffer("one", {
            region: { kind: "countries", countries: ["Argentina"] },
          }),
          makeOffer("three", {
            region: {
              kind: "countries",
              countries: ["Chile", "Peru", "Brazil"],
            },
          }),
          makeOffer("none", { region: { kind: "worldwide" } }),
        ],
        FIRST_RUN,
      );

      const { rows } = await pool.query(
        "select source_id, allowed_countries from offers order by source_id",
      );
      expect(rows).toEqual([
        { source_id: "none", allowed_countries: [] },
        { source_id: "one", allowed_countries: ["Argentina"] },
        { source_id: "three", allowed_countries: ["Chile", "Peru", "Brazil"] },
      ]);
    });

    it("stores the dedup key computed by the domain function", async () => {
      const repo = createPgOfferRepository(pool);
      const offer = makeOffer("a");

      await repo.upsertMany([offer], FIRST_RUN);

      const { rows } = await pool.query("select dedup_key from offers");
      expect(rows[0].dedup_key).toBe(dedupKey(offer));
    });

    it("gives the same key to the same listing under different source ids", async () => {
      const repo = createPgOfferRepository(pool);

      await repo.upsertMany(
        [makeOffer("a"), makeOffer("b", { title: "Engineer a" })],
        FIRST_RUN,
      );

      const { rows } = await pool.query(
        "select count(distinct dedup_key)::int as keys from offers",
      );
      expect(rows[0].keys).toBe(1);
    });

    it("updates region and dedup key when an existing offer changes", async () => {
      const repo = createPgOfferRepository(pool);
      await repo.upsertMany([makeOffer("a")], FIRST_RUN);

      const changed = makeOffer("a", {
        title: "Staff Engineer",
        region: { kind: "worldwide" },
      });
      await repo.upsertMany([changed], SECOND_RUN);

      const { rows } = await pool.query(
        "select region_status, allowed_countries, dedup_key from offers",
      );
      expect(rows).toEqual([
        {
          region_status: "worldwide",
          allowed_countries: [],
          dedup_key: dedupKey(changed),
        },
      ]);
    });

    it("rejects a row without a dedup key", async () => {
      await expect(
        pool.query(
          "insert into offers (source, source_id, title, url, description, raw) values ('himalayas', 'k', 'T', 'https://x.test', 'D', '{}')",
        ),
      ).rejects.toThrow(/dedup_key/);
    });

    it("rejects a dedup key that is not a lowercase sha-256 hex digest", async () => {
      for (const key of [
        "",
        "abc",
        "A".repeat(64),
        "g".repeat(64),
        "a".repeat(63),
        "a".repeat(65),
      ]) {
        await expect(
          pool.query(
            "insert into offers (source, source_id, title, url, description, raw, dedup_key) values ('himalayas', 'k', 'T', 'https://x.test', 'D', '{}', $1)",
            [key],
          ),
        ).rejects.toThrow(/dedup_key/);
      }
    });
  });

  describe("deleteExpired", () => {
    it("deletes offers whose expiry is before now and reports how many", async () => {
      const repo = createPgOfferRepository(pool);
      await repo.upsertMany(
        [
          makeOffer("old", { expiresAt: new Date("2026-10-01T00:00:00Z") }),
          makeOffer("older", { expiresAt: new Date("2026-09-01T00:00:00Z") }),
          makeOffer("live", { expiresAt: new Date("2026-12-01T00:00:00Z") }),
        ],
        FIRST_RUN,
      );

      const deleted = await repo.deleteExpired(
        new Date("2026-10-30T00:00:00Z"),
      );

      expect(deleted).toBe(2);
      const { rows } = await pool.query("select source_id from offers");
      expect(rows).toEqual([{ source_id: "live" }]);
    });

    it("keeps offers that expire exactly now", async () => {
      const repo = createPgOfferRepository(pool);
      await repo.upsertMany(
        [makeOffer("edge", { expiresAt: new Date("2026-10-30T00:00:00Z") })],
        FIRST_RUN,
      );

      expect(await repo.deleteExpired(new Date("2026-10-30T00:00:00Z"))).toBe(
        0,
      );
    });

    it("never deletes offers without an expiry", async () => {
      const repo = createPgOfferRepository(pool);
      await repo.upsertMany(
        [makeOffer("forever", { expiresAt: null })],
        FIRST_RUN,
      );

      expect(await repo.deleteExpired(new Date("2099-01-01T00:00:00Z"))).toBe(
        0,
      );
    });

    it("returns zero when nothing expired", async () => {
      const repo = createPgOfferRepository(pool);

      expect(await repo.deleteExpired(new Date("2099-01-01T00:00:00Z"))).toBe(
        0,
      );
    });
  });
});
