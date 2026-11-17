import type { PurgeCounts } from "../db/pg-retention";
import { isAuthorizedCronRequest } from "./is-authorized-cron-request";

export interface PurgeRequestDeps {
  readonly secret: string | undefined;
  readonly purge: () => Promise<PurgeCounts>;
  readonly log: (message: string) => void;
}

function describeError(cause: unknown): string {
  return cause instanceof Error && cause.message !== ""
    ? cause.message
    : "Unknown error";
}

export async function handlePurgeRequest(
  request: Request,
  deps: PurgeRequestDeps,
): Promise<Response> {
  if (
    !isAuthorizedCronRequest(request.headers.get("authorization"), deps.secret)
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  let purged: PurgeCounts;
  try {
    purged = await deps.purge();
  } catch (cause) {
    deps.log(`purge crashed: ${describeError(cause)}`);
    return Response.json({ error: "Purge crashed" }, { status: 500 });
  }
  deps.log(
    `purge usage_counters=${purged.usageCounters} profiles=${purged.profiles} scores=${purged.scores}`,
  );
  return Response.json({ purged }, { status: 200 });
}
