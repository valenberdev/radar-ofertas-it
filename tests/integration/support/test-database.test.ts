import { Client } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "./test-database";

describe("createTestDatabase", () => {
  let database: TestDatabase | undefined;

  afterEach(async () => {
    await database?.drop();
    database = undefined;
  });

  it("provides a fresh, empty database that accepts connections", async () => {
    database = await createTestDatabase();

    const client = new Client({ connectionString: database.connectionString });
    await client.connect();
    try {
      const result = await client.query<{ count: string }>(
        "select count(*) from information_schema.tables where table_schema = 'public'",
      );
      expect(result.rows[0]?.count).toBe("0");
    } finally {
      await client.end();
    }
  });

  it("gives every call its own database", async () => {
    database = await createTestDatabase();
    const other = await createTestDatabase();
    try {
      expect(other.connectionString).not.toBe(database.connectionString);
    } finally {
      await other.drop();
    }
  });

  it("refuses to point at a non-local server", async () => {
    const previous = process.env.TEST_DATABASE_ADMIN_URL;
    process.env.TEST_DATABASE_ADMIN_URL =
      "postgres://u:p@db.example.com:5432/x";
    try {
      await expect(createTestDatabase()).rejects.toThrow(/only localhost/);
    } finally {
      if (previous === undefined) {
        delete process.env.TEST_DATABASE_ADMIN_URL;
      } else {
        process.env.TEST_DATABASE_ADMIN_URL = previous;
      }
    }
  });
});
