import { randomBytes } from "node:crypto";
import { Client } from "pg";

const DEFAULT_ADMIN_URL = "postgres://radar:radar@127.0.0.1:5435/radar";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export type TestDatabase = {
  connectionString: string;
  drop: () => Promise<void>;
};

function readAdminUrl(): URL {
  const url = new URL(process.env.TEST_DATABASE_ADMIN_URL ?? DEFAULT_ADMIN_URL);

  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(
      `Refusing to run integration tests against "${url.hostname}": only localhost is allowed.`,
    );
  }

  return url;
}

async function withAdminClient<T>(
  adminUrl: URL,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const adminUrl = readAdminUrl();
  const name = `radar_test_${randomBytes(6).toString("hex")}`;

  await withAdminClient(adminUrl, (client) =>
    client.query(`create database ${name}`),
  );

  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${name}`;

  return {
    connectionString: databaseUrl.toString(),
    drop: () =>
      withAdminClient(adminUrl, (client) =>
        client.query(`drop database if exists ${name} with (force)`),
      ).then(() => undefined),
  };
}
