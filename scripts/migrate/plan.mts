import { formatVersion, type MigrationFile } from "./migration-files.mts";

export type LocalMigration = MigrationFile & {
  sql: string;
  checksum: string;
};

export type AppliedMigration = {
  version: number;
  name: string;
  checksum: string;
};

export function planMigrations(
  local: readonly LocalMigration[],
  applied: readonly AppliedMigration[],
): LocalMigration[] {
  const localByVersion = new Map(
    local.map((migration) => [migration.version, migration]),
  );
  const appliedInOrder = [...applied].sort((a, b) => a.version - b.version);

  for (const [index, row] of appliedInOrder.entries()) {
    const migration = localByVersion.get(row.version);

    if (migration === undefined) {
      throw new Error(
        `Migration ${formatVersion(row.version)}_${row.name} was applied but its file is missing.`,
      );
    }

    if (migration.name !== row.name) {
      throw new Error(
        `Migration ${formatVersion(row.version)} was renamed after being applied: "${row.name}" is now "${migration.name}".`,
      );
    }

    if (migration.checksum !== row.checksum) {
      throw new Error(
        `Migration "${migration.fileName}" was modified after being applied.`,
      );
    }

    const expected = index + 1;
    if (row.version !== expected) {
      throw new Error(
        `Applied migrations are not contiguous: expected ${formatVersion(expected)} but found ${formatVersion(row.version)}.`,
      );
    }
  }

  return local.filter((migration) => migration.version > appliedInOrder.length);
}
