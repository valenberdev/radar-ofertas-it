import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Client } from "pg";
import { checksum } from "./checksum.mts";
import { orderMigrations } from "./migration-files.mts";
import {
  planMigrations,
  type AppliedMigration,
  type LocalMigration,
} from "./plan.mts";

export const MIGRATION_LOCK_KEY = 727_274_001;

async function loadLocalMigrations(
  directory: string,
): Promise<LocalMigration[]> {
  const migrations = orderMigrations(await readdir(directory));

  return Promise.all(
    migrations.map(async (migration) => {
      const sql = await readFile(
        path.join(directory, migration.fileName),
        "utf8",
      );
      return { ...migration, sql, checksum: checksum(sql) };
    }),
  );
}

async function readApplied(client: Client): Promise<AppliedMigration[]> {
  const result = await client.query<AppliedMigration>(
    "select version, name, checksum from schema_migrations order by version",
  );
  return result.rows;
}

async function applyMigration(
  client: Client,
  migration: LocalMigration,
): Promise<void> {
  await client.query("begin");
  try {
    await client.query(migration.sql);
    await client.query(
      "insert into schema_migrations (version, name, checksum) values ($1, $2, $3)",
      [migration.version, migration.name, migration.checksum],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Migration "${migration.fileName}" failed: ${reason}`, {
      cause: error,
    });
  }
}

export async function migrate(
  client: Client,
  directory: string,
): Promise<string[]> {
  const local = await loadLocalMigrations(directory);

  const lock = await client.query<{ locked: boolean }>(
    "select pg_try_advisory_lock($1::bigint) as locked",
    [MIGRATION_LOCK_KEY],
  );
  if (lock.rows[0]?.locked !== true) {
    throw new Error("Another migration run is in progress.");
  }

  try {
    await client.query(`
      create table if not exists schema_migrations (
        version integer primary key,
        name text not null,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `);

    const pending = planMigrations(local, await readApplied(client));
    for (const migration of pending) {
      await applyMigration(client, migration);
    }
    return pending.map((migration) => migration.fileName);
  } finally {
    await client.query("select pg_advisory_unlock($1::bigint)", [
      MIGRATION_LOCK_KEY,
    ]);
  }
}
