import { handlePurgeRequest } from "@/infrastructure/cron/handle-purge-request";
import { purgeExpiredData } from "@/infrastructure/db/pg-retention";
import { pool } from "@/infrastructure/db/pool";
import { env } from "@/infrastructure/env";

export async function GET(request: Request) {
  return handlePurgeRequest(request, {
    secret: env.CRON_SECRET,
    purge: () => purgeExpiredData(pool, new Date()),
    log: (message) => console.log(message),
  });
}
