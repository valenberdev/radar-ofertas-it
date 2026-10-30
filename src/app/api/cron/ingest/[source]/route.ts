import { handleIngestRequest } from "@/infrastructure/cron/handle-ingest-request";
import { pool } from "@/infrastructure/db/pool";
import { env } from "@/infrastructure/env";
import { createIngestionRunner } from "@/infrastructure/ingestion/create-ingestion-runner";

export const maxDuration = 300;

export async function GET(request: Request, context: RouteContext<"/api/cron/ingest/[source]">) {
  const { source } = await context.params;
  return handleIngestRequest(request, source, {
    secret: env.CRON_SECRET,
    allowBackfill: process.env.NODE_ENV !== "production",
    runner: createIngestionRunner({
      pool,
      fetch,
      himalayasApiKey: env.HIMALAYAS_API_KEY,
      onRejected: (name, reason) => console.warn(`ingest ${name} rejected an item: ${reason}`),
    }),
    log: (message) => console.log(message),
  });
}