export type MigrationFile = {
  version: number;
  name: string;
  fileName: string;
};

const FILE_NAME_PATTERN = /^(\d{4})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;

export function formatVersion(version: number): string {
  return String(version).padStart(4, "0");
}

export function parseMigrationFileName(fileName: string): MigrationFile {
  const match = FILE_NAME_PATTERN.exec(fileName);
  const rawVersion = match?.[1];
  const name = match?.[2];

  if (rawVersion === undefined || name === undefined) {
    throw new Error(
      `Invalid migration file name "${fileName}". Expected NNNN_snake_case_name.sql.`,
    );
  }

  return { version: Number(rawVersion), name, fileName };
}

export function orderMigrations(fileNames: readonly string[]): MigrationFile[] {
  const migrations = fileNames
    .map(parseMigrationFileName)
    .sort((a, b) => a.version - b.version);

  for (const [index, migration] of migrations.entries()) {
    const previous = migrations[index - 1];

    if (previous !== undefined && previous.version === migration.version) {
      throw new Error(
        `Duplicate migration version ${formatVersion(migration.version)}: "${previous.fileName}" and "${migration.fileName}".`,
      );
    }

    const expected = index + 1;
    if (migration.version !== expected) {
      throw new Error(
        `Migration versions must be consecutive starting at 0001: expected ${formatVersion(expected)} but found "${migration.fileName}".`,
      );
    }
  }

  return migrations;
}
