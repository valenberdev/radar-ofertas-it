import { Client } from "pg";
import { renormalizeOffers } from "../src/infrastructure/maintenance/renormalize-offers";

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) {
    throw new Error("DATABASE_URL_UNPOOLED is not set.");
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const report = await renormalizeOffers(client);
    console.log(
      `Scanned ${report.scanned} offer(s), updated ${report.updated}.`,
    );
    console.log(
      `Worldwide: ${report.worldwide}, countries: ${report.countries}, unknown: ${report.unknown}.`,
    );
    console.log(`Unreadable raw (stored as unknown): ${report.unreadable}.`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
