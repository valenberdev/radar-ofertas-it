import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { assertDirectConnection } from "./connection.mts";
import { migrate } from "./migrator.mts";

const MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL("../../db/migrations", import.meta.url),
);

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) {
    throw new Error("DATABASE_URL_UNPOOLED is not set.");
  }

  assertDirectConnection(connectionString);

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const applied = await migrate(client, MIGRATIONS_DIRECTORY);
    if (applied.length === 0) {
      console.log("Database is up to date.");
    } else {
      console.log(`Applied ${applied.length} migration(s):`);
      for (const fileName of applied) {
        console.log(`  ${fileName}`);
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
