import type { SourceName } from "../../domain/source-offer";
import type {
  IngestionReport,
  IngestionRunner,
} from "../ingestion/create-ingestion-runner";
import { isAuthorizedCronRequest } from "./is-authorized-cron-request";

const KNOWN_SOURCES: Record<SourceName, true> = {
  himalayas: true,
  hackernews: true,
};

export interface IngestRequestDeps {
  readonly secret: string | undefined;
  readonly allowBackfill: boolean;
  readonly runner: IngestionRunner;
  readonly log: (message: string) => void;
}

function isSourceName(value: string): value is SourceName {
  return Object.hasOwn(KNOWN_SOURCES, value);
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

function parseBackfill(value: string | null): boolean | null {
  if (value === null) {
    return false;
  }
  return value === "1" ? true : null;
}

function describeError(cause: unknown): string {
  return cause instanceof Error && cause.message !== ""
    ? cause.message
    : "Unknown error";
}

function summarize(source: SourceName, report: IngestionReport): string {
  const { status, counts, error } = report.run;
  const parts = [
    `ingest ${source} ${status}`,
    `fetched=${counts.fetched}`,
    `inserted=${counts.inserted}`,
    `updated=${counts.updated}`,
    `rejected=${counts.rejected}`,
    `purged=${report.purged ?? "failed"}`,
  ];
  if (error !== null) {
    parts.push(`error=${JSON.stringify(error)}`);
  }
  if (report.purgeError !== null) {
    parts.push(`purgeError=${JSON.stringify(report.purgeError)}`);
  }
  return parts.join(" ");
}

export async function handleIngestRequest(
  request: Request,
  sourceParam: string,
  deps: IngestRequestDeps,
): Promise<Response> {
  if (
    !isAuthorizedCronRequest(request.headers.get("authorization"), deps.secret)
  ) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!isSourceName(sourceParam)) {
    return json({ error: "Unknown source" }, 404);
  }

  const backfill = parseBackfill(
    new URL(request.url).searchParams.get("backfill"),
  );
  if (backfill === null) {
    return json({ error: "Invalid backfill value" }, 400);
  }
  if (backfill && !deps.allowBackfill) {
    return json({ error: "Backfill is not allowed here" }, 403);
  }

  let report: IngestionReport;
  try {
    report = await deps.runner.run(sourceParam, { backfill });
  } catch (cause) {
    deps.log(`ingest ${sourceParam} crashed: ${describeError(cause)}`);
    return json({ error: "Ingestion crashed" }, 500);
  }

  deps.log(summarize(sourceParam, report));
  return json(
    {
      source: sourceParam,
      backfill,
      runId: report.run.runId,
      status: report.run.status,
      counts: report.run.counts,
      error: report.run.error,
      purged: report.purged,
      purgeError: report.purgeError,
    },
    report.run.status === "succeeded" ? 200 : 500,
  );
}
