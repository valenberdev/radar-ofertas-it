import type { Pool } from "pg";
import type { DailyQuota } from "../../application/ports/daily-quota";
import { pacificDay } from "../../domain/pacific-day";

const CONSUME_SQL = `
insert into usage_counters (day, resource, used)
select $1::date, $2::text, $3::integer
where $3::integer <= $4::integer
on conflict (day, resource) do update
set used = usage_counters.used + excluded.used
where usage_counters.used + excluded.used <= $4::integer
returning used
`;

export interface PgDailyQuotaOptions {
  readonly resource: string;
  readonly limit: number;
  readonly now: () => Date;
}

export function createPgDailyQuota(
  db: Pick<Pool, "query">,
  options: PgDailyQuotaOptions,
): DailyQuota {
  if (options.resource.trim() === "") {
    throw new Error("Quota resource is required");
  }
  if (!Number.isInteger(options.limit) || options.limit < 0) {
    throw new RangeError("Quota limit must be a non-negative integer");
  }

  return {
    async tryConsume(units: number): Promise<boolean> {
      if (!Number.isInteger(units) || units < 1) {
        throw new RangeError("Units to consume must be a positive integer");
      }
      const result = await db.query(CONSUME_SQL, [
        pacificDay(options.now()),
        options.resource,
        units,
        options.limit,
      ]);
      return result.rowCount === 1;
    },
  };
}
