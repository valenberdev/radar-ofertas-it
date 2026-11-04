import { fileURLToPath } from "node:url";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../../../../scripts/migrate/migrator.mts";
import type { Country } from "../../../../src/domain/countries";
import type { Region } from "../../../../src/domain/region";
import type { SourceOffer } from "../../../../src/domain/source-offer";
import { createPgOfferReader } from "../../../../src/infrastructure/db/pg-offer-reader";
import { createPgOfferRepository } from "../../../../src/infrastructure/db/pg-offer-repository";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../support/test-database";

const MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL("../../../../db/migrations", import.meta.url),
);

const NOW = new Date("2026-11-04T12:00:00Z");
const INGESTED_AT = new Date("2026-11-04T06:00:00Z");

const WORLDWIDE: Region = { kind: "worldwide" };
const UNKNOWN: Region = { kind: "unknown" };

function countries(...names: string[]): Region {
  return { kind: "countries", countries: names };
}

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 3_600_000);
}

function makeOffer(
  sourceId: string,
  overrides: Partial<SourceOffer> = {},
): SourceOffer {
  return {
    source: "himalayas",
    sourceId,
    title: `Engineer ${sourceId}`,
    company: `Company ${sourceId}`,
    url: `https://example.com/${sourceId}`,
    description: `Description ${sourceId}`,
    postedAt: hoursAgo(1),
    expiresAt: new Date("2026-12-31T00:00:00Z"),
    region: WORLDWIDE,
    raw: { id: sourceId },
    ...overrides,
  };
}

describe("createPgOfferReader", () => {
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

  async function store(...offers: SourceOffer[]): Promise<void> {
    for (const offer of offers) {
      await createPgOfferRepository(pool).upsertMany([offer], INGESTED_AT);
    }
  }

  async function sourceIdsFor(
    country: Country = "Argentina",
  ): Promise<string[]> {
    const offers = await createPgOfferReader(pool).listEligible({
      country,
      now: NOW,
    });
    return offers.map((offer) => offer.sourceId);
  }

  describe("eligibility", () => {
    it("returns worldwide offers and offers that list the country", async () => {
      await store(
        makeOffer("worldwide", { region: WORLDWIDE }),
        makeOffer("listed", { region: countries("Brazil", "Argentina") }),
        makeOffer("only-listed", { region: countries("Argentina") }),
      );

      expect((await sourceIdsFor()).sort()).toEqual([
        "listed",
        "only-listed",
        "worldwide",
      ]);
    });

    it("leaves out offers for other countries and offers with unknown region", async () => {
      await store(
        makeOffer("other", { region: countries("Chile", "Brazil") }),
        makeOffer("unknown", { region: UNKNOWN }),
        makeOffer("ok", { region: WORLDWIDE }),
      );

      expect(await sourceIdsFor()).toEqual(["ok"]);
    });

    it("does not match a country name that is only part of another name", async () => {
      await store(
        makeOffer("niger", { region: countries("Nigeria") }),
        makeOffer("guinea", { region: countries("Papua New Guinea") }),
      );

      expect(await sourceIdsFor()).toEqual([]);
    });

    it("answers for the country that is asked", async () => {
      await store(
        makeOffer("a", { region: countries("Argentina") }),
        makeOffer("c", { region: countries("Chile") }),
      );

      expect(await sourceIdsFor("Chile")).toEqual(["c"]);
      expect(await sourceIdsFor("Argentina")).toEqual(["a"]);
    });

    it("finds a country whose name has a comma", async () => {
      const name = "Congo, The Democratic Republic of the";
      await store(makeOffer("congo", { region: countries("Chile", name) }));

      expect(await sourceIdsFor(name)).toEqual(["congo"]);
    });
  });

  describe("expiry", () => {
    it("leaves out offers that expired before now and keeps the rest", async () => {
      await store(
        makeOffer("expired", { expiresAt: new Date(NOW.getTime() - 1) }),
        makeOffer("edge", { expiresAt: NOW }),
        makeOffer("alive", { expiresAt: new Date(NOW.getTime() + 1) }),
        makeOffer("forever", { expiresAt: null }),
      );

      expect((await sourceIdsFor()).sort()).toEqual([
        "alive",
        "edge",
        "forever",
      ]);
    });
  });

  describe("duplicates", () => {
    const shared = {
      company: "Acme",
      title: "Backend Engineer",
      description: "Same text",
    };

    it("keeps one row per key: the newest", async () => {
      await store(
        makeOffer("old", { ...shared, postedAt: hoursAgo(30) }),
        makeOffer("new", { ...shared, postedAt: hoursAgo(2) }),
        makeOffer("mid", { ...shared, postedAt: hoursAgo(10) }),
      );

      expect(await sourceIdsFor()).toEqual(["new"]);
    });

    it("prefers a row with a date over one without", async () => {
      await store(
        makeOffer("undated", { ...shared, postedAt: null }),
        makeOffer("dated", { ...shared, postedAt: hoursAgo(500) }),
      );

      expect(await sourceIdsFor()).toEqual(["dated"]);
    });

    it("breaks a tie on the date with the highest id", async () => {
      const when = hoursAgo(5);
      await store(
        makeOffer("first", { ...shared, postedAt: when }),
        makeOffer("second", { ...shared, postedAt: when }),
      );

      expect(await sourceIdsFor()).toEqual(["second"]);
    });

    it("breaks a tie between rows without a date with the highest id", async () => {
      await store(
        makeOffer("first", { ...shared, postedAt: null }),
        makeOffer("second", { ...shared, postedAt: null }),
      );

      expect(await sourceIdsFor()).toEqual(["second"]);
    });

    it("filters by eligibility before choosing the newest", async () => {
      await store(
        makeOffer("eligible-old", {
          ...shared,
          postedAt: hoursAgo(40),
          region: WORLDWIDE,
        }),
        makeOffer("not-eligible-new", {
          ...shared,
          postedAt: hoursAgo(1),
          region: countries("Chile"),
        }),
      );

      expect(await sourceIdsFor()).toEqual(["eligible-old"]);
    });

    it("filters by expiry before choosing the newest", async () => {
      await store(
        makeOffer("alive-old", {
          ...shared,
          postedAt: hoursAgo(40),
          expiresAt: null,
        }),
        makeOffer("expired-new", {
          ...shared,
          postedAt: hoursAgo(1),
          expiresAt: hoursAgo(0.5),
        }),
      );

      expect(await sourceIdsFor()).toEqual(["alive-old"]);
    });

    it("keeps offers that differ in title, company or description", async () => {
      await store(
        makeOffer("a", { ...shared }),
        makeOffer("b", { ...shared, title: "Frontend Engineer" }),
        makeOffer("c", { ...shared, company: "Other" }),
        makeOffer("d", { ...shared, description: "Different text" }),
      );

      expect((await sourceIdsFor()).sort()).toEqual(["a", "b", "c", "d"]);
    });

    it("does not merge the same listing across sources", async () => {
      await store(
        makeOffer("h", { ...shared, source: "himalayas" }),
        makeOffer("n", {
          ...shared,
          source: "hackernews",
          description: "Same text",
        }),
      );

      expect((await sourceIdsFor()).sort()).toEqual(["h", "n"]);
    });
  });

  describe("result", () => {
    it("orders by date, newest first, undated last", async () => {
      await store(
        makeOffer("undated", { postedAt: null }),
        makeOffer("oldest", { postedAt: hoursAgo(50) }),
        makeOffer("newest", { postedAt: hoursAgo(1) }),
        makeOffer("middle", { postedAt: hoursAgo(20) }),
      );

      expect(await sourceIdsFor()).toEqual([
        "newest",
        "middle",
        "oldest",
        "undated",
      ]);
    });

    it("returns every field with its own type", async () => {
      const offer = makeOffer("full", {
        company: null,
        postedAt: hoursAgo(3),
        expiresAt: new Date("2026-12-01T00:00:00Z"),
        region: countries("Argentina", "Chile"),
      });
      await store(offer);

      const [found] = await createPgOfferReader(pool).listEligible({
        country: "Argentina",
        now: NOW,
      });

      expect(found).toEqual({
        id: expect.stringMatching(/^\d+$/),
        source: "himalayas",
        sourceId: "full",
        title: offer.title,
        company: null,
        url: offer.url,
        description: offer.description,
        postedAt: offer.postedAt,
        expiresAt: offer.expiresAt,
        region: countries("Argentina", "Chile"),
      });
    });

    it("rebuilds the region of a worldwide offer", async () => {
      await store(makeOffer("w", { region: WORLDWIDE }));

      const [found] = await createPgOfferReader(pool).listEligible({
        country: "Argentina",
        now: NOW,
      });

      expect(found?.region).toEqual({ kind: "worldwide" });
    });

    it("returns an empty list when nothing matches", async () => {
      expect(await sourceIdsFor()).toEqual([]);
    });
  });
});
