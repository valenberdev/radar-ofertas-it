import { existsSync } from "node:fs";
import { Pool } from "pg";
import { COUNTRIES, isCountry } from "../../src/domain/countries";
import { createPgOfferReader } from "../../src/infrastructure/db/pg-offer-reader";
import { contentHash, offerKey, type Snapshot } from "./dataset.mts";
import { EVAL_PATHS, writeJsonFile } from "./files.mts";

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) {
    throw new Error("DATABASE_URL_UNPOOLED is not set.");
  }
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const country = args.find((arg) => !arg.startsWith("--")) ?? "Argentina";
  if (!isCountry(country)) {
    throw new Error(
      `Unknown country ${country}. Valid names are the ones in src/domain/countries.ts (${COUNTRIES.length} entries).`,
    );
  }
  if (existsSync(EVAL_PATHS.snapshot) && !force) {
    throw new Error(
      "eval/snapshot.local.json already exists. Replacing it changes the pools you label, so pass --force only before labeling.",
    );
  }

  const pool = new Pool({ connectionString, max: 1 });
  try {
    const now = new Date();
    const offers = await createPgOfferReader(pool).listEligible({
      country,
      now,
    });
    const snapshot: Snapshot = {
      snapshotId: now.toISOString().slice(0, 10),
      country,
      capturedAt: now.toISOString(),
      offers: offers.map((offer) => ({
        id: offer.id,
        key: offerKey(offer.source, offer.sourceId),
        source: offer.source,
        sourceId: offer.sourceId,
        title: offer.title,
        company: offer.company,
        url: offer.url,
        description: offer.description,
        postedAt: offer.postedAt === null ? null : offer.postedAt.toISOString(),
        contentHash: contentHash(offer),
      })),
    };
    await writeJsonFile(EVAL_PATHS.snapshot, snapshot);
    console.log(
      `Saved ${snapshot.offers.length} eligible offer(s) for ${country} (snapshot ${snapshot.snapshotId}).`,
    );
    if (snapshot.offers.length < 200) {
      console.log(
        "That is a small snapshot. If this database is not the one with the full ingestion, use the production variant.",
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
