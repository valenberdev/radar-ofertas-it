import { describe, expect, it } from "vitest";
import {
  orderMigrations,
  parseMigrationFileName,
} from "../../../scripts/migrate/migration-files.mts";

describe("parseMigrationFileName", () => {
  it("extracts version and name from a valid file name", () => {
    expect(parseMigrationFileName("0001_create_offers.sql")).toEqual({
      version: 1,
      name: "create_offers",
      fileName: "0001_create_offers.sql",
    });
  });

  it("accepts digits inside the name", () => {
    expect(parseMigrationFileName("0012_add_index_v2.sql").version).toBe(12);
  });

  it.each([
    "1_create.sql",
    "00001_create.sql",
    "0001_Create.sql",
    "0001-create.sql",
    "0001_create",
    "0001_create.SQL",
    "0001__create.sql",
    "0001_create_.sql",
    "0001_.sql",
    "0001_create.sql.bak",
    "notes.txt",
    "",
  ])("rejects %j", (fileName) => {
    expect(() => parseMigrationFileName(fileName)).toThrow(
      /Invalid migration file name/,
    );
  });
});

describe("orderMigrations", () => {
  it("returns an empty list when there are no files", () => {
    expect(orderMigrations([])).toEqual([]);
  });

  it("sorts by numeric version regardless of input order", () => {
    const ordered = orderMigrations(["0003_c.sql", "0001_a.sql", "0002_b.sql"]);
    expect(ordered.map((m) => m.fileName)).toEqual([
      "0001_a.sql",
      "0002_b.sql",
      "0003_c.sql",
    ]);
  });

  it("orders 0010 after 0009", () => {
    const names = Array.from(
      { length: 10 },
      (_, i) => `${String(i + 1).padStart(4, "0")}_step.sql`,
    ).reverse();
    expect(orderMigrations(names).map((m) => m.version)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("rejects a gap in the versions", () => {
    expect(() => orderMigrations(["0001_a.sql", "0003_c.sql"])).toThrow(
      /expected 0002 but found "0003_c.sql"/,
    );
  });

  it("rejects a sequence that does not start at 0001", () => {
    expect(() => orderMigrations(["0002_b.sql"])).toThrow(
      /expected 0001 but found "0002_b.sql"/,
    );
  });

  it("rejects duplicate versions and names both files", () => {
    expect(() =>
      orderMigrations(["0001_a.sql", "0002_b.sql", "0002_other.sql"]),
    ).toThrow(
      /Duplicate migration version 0002: "0002_b.sql" and "0002_other.sql"/,
    );
  });

  it("propagates invalid names", () => {
    expect(() => orderMigrations(["0001_a.sql", "readme.md"])).toThrow(
      /Invalid migration file name "readme.md"/,
    );
  });
});
