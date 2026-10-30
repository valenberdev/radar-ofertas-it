import type { Pool } from "pg";
import type {
  IngestRunId,
  IngestRunOutcome,
  IngestRunRepository,
} from "../../application/ports/ingest-run-repository";
import type { SourceName } from "../../domain/source-offer";

const START_SQL = `
insert into ingest_runs (source, started_at)
values ($1, $2)
returning id::text as id
`;

const FINISH_SQL = `
update ingest_runs
set
  status = $2,
  finished_at = $3,
  fetched_count = $4,
  inserted_count = $5,
  updated_count = $6,
  rejected_count = $7,
  error_message = $8
where id = $1::bigint and status = 'running'
`;

const LAST_SUCCEEDED_START_SQL = `
select started_at
from ingest_runs
where source = $1 and status = 'succeeded'
order by started_at desc
limit 1
`;

export function createPgIngestRunRepository(
  db: Pick<Pool, "query">,
): IngestRunRepository {
  return {
    async start(source: SourceName, startedAt: Date): Promise<IngestRunId> {
      const result = await db.query<{ id: string }>(START_SQL, [
        source,
        startedAt.toISOString(),
      ]);
      const row = result.rows[0];
      if (row === undefined) {
        throw new Error("Ingest run was not created");
      }
      return row.id;
    },

    async finish(runId: IngestRunId, outcome: IngestRunOutcome): Promise<void> {
      const result = await db.query(FINISH_SQL, [
        runId,
        outcome.status,
        outcome.finishedAt.toISOString(),
        outcome.counts.fetched,
        outcome.counts.inserted,
        outcome.counts.updated,
        outcome.counts.rejected,
        outcome.error,
      ]);
      if (result.rowCount !== 1) {
        throw new Error(
          `Ingest run ${runId} was not found or is already finished`,
        );
      }
    },

    async findLastSucceededStart(source: SourceName): Promise<Date | null> {
      const result = await db.query<{ started_at: Date }>(
        LAST_SUCCEEDED_START_SQL,
        [source],
      );
      return result.rows[0]?.started_at ?? null;
    },
  };
}
