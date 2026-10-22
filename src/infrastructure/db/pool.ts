import { Pool } from "pg";
import { env } from "@/infrastructure/env";

const globalForPool = globalThis as unknown as { pgPool?: Pool };

function createPool(): Pool {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on("error", (error) => {
    console.error(
      "Unexpected error on an idle database client:",
      error.message,
    );
  });

  return pool;
}

export const pool = globalForPool.pgPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForPool.pgPool = pool;
}
