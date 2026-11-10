import type { Pool } from "pg";
import type { OfferScore } from "../../application/ports/offer-scorer";
import type {
  ScoreCacheKey,
  ScoreEntry,
  ScoreStore,
} from "../../application/ports/score-store";

const FIND_SQL = `
select offer_hash, score, reason_es, reason_en
from scores
where profile_hash = $1 and scorer_id = $2 and offer_hash = any($3::text[])
`;

const SAVE_SQL = `
insert into scores (profile_hash, offer_hash, scorer_id, score, reason_es, reason_en, created_at)
select $1::text, input.offer_hash, $2::text, input.score, input.reason_es, input.reason_en, $3::timestamptz
from unnest($4::text[], $5::int[], $6::text[], $7::text[]) as input(offer_hash, score, reason_es, reason_en)
on conflict (profile_hash, offer_hash, scorer_id) do update
set score = excluded.score,
    reason_es = excluded.reason_es,
    reason_en = excluded.reason_en,
    created_at = excluded.created_at
`;

interface ScoreRow {
  readonly offer_hash: string;
  readonly score: number;
  readonly reason_es: string;
  readonly reason_en: string;
}

export function createPgScoreStore(db: Pick<Pool, "query">): ScoreStore {
  return {
    async findMany(
      key: ScoreCacheKey,
      offerHashes: readonly string[],
    ): Promise<ReadonlyMap<string, OfferScore>> {
      const found = new Map<string, OfferScore>();
      if (offerHashes.length === 0) {
        return found;
      }
      const result = await db.query<ScoreRow>(FIND_SQL, [
        key.profileHash,
        key.scorerId,
        offerHashes,
      ]);
      for (const row of result.rows) {
        found.set(row.offer_hash, {
          score: row.score,
          reasonEs: row.reason_es,
          reasonEn: row.reason_en,
        });
      }
      return found;
    },

    async saveMany(
      key: ScoreCacheKey,
      entries: readonly ScoreEntry[],
      at: Date,
    ): Promise<void> {
      const latest = new Map(
        entries.map((entry) => [entry.offerHash, entry.score]),
      );
      if (latest.size === 0) {
        return;
      }
      const rows = [...latest];
      await db.query(SAVE_SQL, [
        key.profileHash,
        key.scorerId,
        at.toISOString(),
        rows.map(([offerHash]) => offerHash),
        rows.map(([, score]) => score.score),
        rows.map(([, score]) => score.reasonEs),
        rows.map(([, score]) => score.reasonEn),
      ]);
    },
  };
}
