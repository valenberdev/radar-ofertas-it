import type { SourceName } from "../../domain/source-offer";

export type IngestRunId = string;

export interface IngestRunCounts {
  readonly fetched: number;
  readonly inserted: number;
  readonly updated: number;
  readonly rejected: number;
}

export interface IngestRunOutcome {
  readonly status: "succeeded" | "failed";
  readonly finishedAt: Date;
  readonly counts: IngestRunCounts;
  readonly error: string | null;
}

export interface IngestRunRepository {
  start(source: SourceName, startedAt: Date): Promise<IngestRunId>;
  finish(runId: IngestRunId, outcome: IngestRunOutcome): Promise<void>;
  findLastSucceededStart(source: SourceName): Promise<Date | null>;
}
