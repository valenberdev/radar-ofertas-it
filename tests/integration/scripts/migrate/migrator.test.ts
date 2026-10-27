import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checksum } from "../../../../scripts/migrate/checksum.mts";
import {
  MIGRATION_LOCK_KEY,
  migrate,
} from "../../../../scripts/migrate/migrator.mts";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../support/test-database";

async function writeMigrations(
  directory: string,
  files: Record<string, string>,
) {
  for (const [name, sql] of Object.entries(files)) {
    await writeFile(path.join(directory, name), sql);
  }
}

describe("migrate", () => {
  let database: TestDatabase;
  let client: Client;
  let directory: string;

  beforeEach(async () => {
    database = await createTestDatabase();
    client = new Client({ connectionString: database.connectionString });
    await client.connect();
    directory = await mkdtemp(path.join(tmpdir(), "migrations-"));
  });

  afterEach(async () => {
    await client.end();
    await database.drop();
    await rm(directory, { recursive: true, force: true });
  });

  async function tableExists(name: string): Promise<boolean> {
    const result = await client.query<{ exists: boolean }>(
      "select to_regclass($1) is not null as exists",
      [name],
    );
    return result.rows[0]?.exists === true;
  }

  it("applies pending migrations in order and records them", async () => {
    await writeMigrations(directory, {
      "0002_create_b.sql": "create table b (a_id integer references a (id));",
      "0001_create_a.sql": "create table a (id integer primary key);",
    });

    const applied = await migrate(client, directory);

    expect(applied).toEqual(["0001_create_a.sql", "0002_create_b.sql"]);
    expect(await tableExists("a")).toBe(true);
    expect(await tableExists("b")).toBe(true);

    const rows = await client.query(
      "select version, name, checksum from schema_migrations order by version",
    );
    expect(rows.rows).toEqual([
      {
        version: 1,
        name: "create_a",
        checksum: checksum("create table a (id integer primary key);"),
      },
      {
        version: 2,
        name: "create_b",
        checksum: checksum("create table b (a_id integer references a (id));"),
      },
    ]);
  });

  it("does nothing on a second run", async () => {
    await writeMigrations(directory, {
      "0001_create_a.sql": "create table a (id integer);",
    });

    await migrate(client, directory);
    expect(await migrate(client, directory)).toEqual([]);
  });

  it("applies only the migrations added since the last run", async () => {
    await writeMigrations(directory, {
      "0001_create_a.sql": "create table a (id integer);",
    });
    await migrate(client, directory);

    await writeMigrations(directory, {
      "0002_create_b.sql": "create table b (id integer);",
    });

    expect(await migrate(client, directory)).toEqual(["0002_create_b.sql"]);
  });

  it("rolls back a failing migration completely and keeps earlier ones", async () => {
    await writeMigrations(directory, {
      "0001_create_a.sql": "create table a (id integer);",
      "0002_broken.sql":
        "create table b (id integer); select * from missing_table;",
    });

    await expect(migrate(client, directory)).rejects.toThrow(
      /Migration "0002_broken.sql" failed: .*missing_table/,
    );

    expect(await tableExists("a")).toBe(true);
    expect(await tableExists("b")).toBe(false);
    const rows = await client.query("select version from schema_migrations");
    expect(rows.rows).toEqual([{ version: 1 }]);
  });

  it("rejects a migration edited after it was applied", async () => {
    await writeMigrations(directory, {
      "0001_create_a.sql": "create table a (id integer);",
    });
    await migrate(client, directory);

    await writeMigrations(directory, {
      "0001_create_a.sql": "create table a (id integer, extra text);",
      "0002_create_b.sql": "create table b (id integer);",
    });

    await expect(migrate(client, directory)).rejects.toThrow(
      /was modified after being applied/,
    );
    expect(await tableExists("b")).toBe(false);
  });

  it("rejects when an applied migration file is gone", async () => {
    await writeMigrations(directory, {
      "0001_create_a.sql": "create table a (id integer);",
      "0002_create_b.sql": "create table b (id integer);",
    });
    await migrate(client, directory);
    await rm(path.join(directory, "0002_create_b.sql"));

    await expect(migrate(client, directory)).rejects.toThrow(
      /0002_create_b was applied but its file is missing/,
    );
  });

  it("refuses to run while another run holds the lock", async () => {
    await writeMigrations(directory, {
      "0001_create_a.sql": "create table a (id integer);",
    });

    const other = new Client({ connectionString: database.connectionString });
    await other.connect();
    try {
      await other.query("select pg_advisory_lock($1::bigint)", [
        MIGRATION_LOCK_KEY,
      ]);

      await expect(migrate(client, directory)).rejects.toThrow(
        /Another migration run is in progress/,
      );
      expect(await tableExists("a")).toBe(false);
    } finally {
      await other.end();
    }
  });

  it("releases the lock after finishing, even when a migration fails", async () => {
    await writeMigrations(directory, {
      "0001_broken.sql": "select * from missing_table;",
    });
    await expect(migrate(client, directory)).rejects.toThrow(/failed/);

    const lock = await client.query<{ locked: boolean }>(
      "select pg_try_advisory_lock($1::bigint) as locked",
      [MIGRATION_LOCK_KEY],
    );
    expect(lock.rows[0]?.locked).toBe(true);
  });

  it("fails on an invalid file name before touching the database", async () => {
    await writeMigrations(directory, { "readme.md": "notes" });

    await expect(migrate(client, directory)).rejects.toThrow(
      /Invalid migration file name/,
    );
    expect(await tableExists("schema_migrations")).toBe(false);
  });
});
