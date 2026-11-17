import type { Pool } from "pg";
import { pacificDay } from "../../domain/pacific-day";

export const RETENTION = {
  usageCounterDays: 2,
  profileDays: 30,
  scoreDays: 30,
} as const;

export interface PurgeCounts {
  readonly usageCounters: number;
  readonly profiles: number;
  readonly scores: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBefore(now: Date, days: number): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

export async function purgeExpiredData(
  db: Pick<Pool, "query">,
  now: Date,
): Promise<PurgeCounts> {
  const usageCounters = await db.query(
    "delete from usage_counters where day < $1::date - $2::integer",
    [pacificDay(now), RETENTION.usageCounterDays],
  );
  const profiles = await db.query(
    "delete from profiles where last_used_at < $1::timestamptz",
    [daysBefore(now, RETENTION.profileDays)],
  );
  const scores = await db.query(
    "delete from scores where created_at < $1::timestamptz",
    [daysBefore(now, RETENTION.scoreDays)],
  );
  return {
    usageCounters: usageCounters.rowCount ?? 0,
    profiles: profiles.rowCount ?? 0,
    scores: scores.rowCount ?? 0,
  };
}
