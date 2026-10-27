import { describe, expect, it } from "vitest";
import { checksum } from "../../../scripts/migrate/checksum.mts";
import {
  planMigrations,
  type AppliedMigration,
  type LocalMigration,
} from "../../../scripts/migrate/plan.mts";

function local(
  version: number,
  name: string,
  sql = `select ${version};`,
): LocalMigration {
  return {
    version,
    name,
    fileName: `${String(version).padStart(4, "0")}_${name}.sql`,
    sql,
    checksum: checksum(sql),
  };
}

function applied(migration: LocalMigration): AppliedMigration {
  return {
    version: migration.version,
    name: migration.name,
    checksum: migration.checksum,
  };
}

describe("planMigrations", () => {
  const first = local(1, "create_offers");
  const second = local(2, "create_runs");
  const third = local(3, "add_index");

  it("returns every migration when none has been applied", () => {
    expect(planMigrations([first, second], [])).toEqual([first, second]);
  });

  it("returns only the migrations after the last applied one", () => {
    expect(planMigrations([first, second, third], [applied(first)])).toEqual([
      second,
      third,
    ]);
  });

  it("returns nothing when everything is applied", () => {
    expect(
      planMigrations([first, second], [applied(first), applied(second)]),
    ).toEqual([]);
  });

  it("returns nothing when there are no migrations at all", () => {
    expect(planMigrations([], [])).toEqual([]);
  });

  it("does not depend on the order of the applied rows", () => {
    expect(
      planMigrations([first, second, third], [applied(second), applied(first)]),
    ).toEqual([third]);
  });

  it("rejects an applied migration whose content changed", () => {
    const edited = local(1, "create_offers", "select 999;");
    expect(() => planMigrations([edited, second], [applied(first)])).toThrow(
      /"0001_create_offers.sql" was modified after being applied/,
    );
  });

  it("rejects an applied migration whose file was renamed", () => {
    const renamed = {
      ...first,
      name: "make_offers",
      fileName: "0001_make_offers.sql",
    };
    expect(() => planMigrations([renamed], [applied(first)])).toThrow(
      /renamed after being applied: "create_offers" is now "make_offers"/,
    );
  });

  it("rejects an applied migration whose file is missing", () => {
    expect(() =>
      planMigrations([first], [applied(first), applied(second)]),
    ).toThrow(/0002_create_runs was applied but its file is missing/);
  });

  it("rejects applied versions that skip a number", () => {
    expect(() =>
      planMigrations([first, second, third], [applied(first), applied(third)]),
    ).toThrow(/not contiguous: expected 0002 but found 0003/);
  });
});
