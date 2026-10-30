import type { Pool } from "pg";
import type {
  OfferRepository,
  UpsertResult,
} from "../../application/ports/offer-repository";
import type { SourceOffer } from "../../domain/source-offer";

const UPSERT_SQL = `
insert into offers (
  source, source_id, title, company, url, description,
  posted_at, expires_at, raw, first_ingested_at, last_ingested_at
)
select
  incoming.source, incoming.source_id, incoming.title, incoming.company, incoming.url, incoming.description,
  incoming.posted_at, incoming.expires_at, incoming.raw, $10::timestamptz, $10::timestamptz
from unnest(
  $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
  $7::timestamptz[], $8::timestamptz[], $9::jsonb[]
) as incoming(source, source_id, title, company, url, description, posted_at, expires_at, raw)
on conflict (source, source_id) do update set
  title = excluded.title,
  company = excluded.company,
  url = excluded.url,
  description = excluded.description,
  posted_at = excluded.posted_at,
  expires_at = excluded.expires_at,
  raw = excluded.raw,
  last_ingested_at = excluded.last_ingested_at
returning (xmax = 0) as inserted
`;

const DELETE_EXPIRED_SQL = "delete from offers where expires_at < $1";

export function createPgOfferRepository(
  db: Pick<Pool, "query">,
): OfferRepository {
  return {
    async upsertMany(
      offers: readonly SourceOffer[],
      ingestedAt: Date,
    ): Promise<UpsertResult> {
      if (offers.length === 0) {
        return { inserted: 0, updated: 0 };
      }
      const result = await db.query<{ inserted: boolean }>(UPSERT_SQL, [
        offers.map((offer) => offer.source),
        offers.map((offer) => offer.sourceId),
        offers.map((offer) => offer.title),
        offers.map((offer) => offer.company),
        offers.map((offer) => offer.url),
        offers.map((offer) => offer.description),
        offers.map((offer) => offer.postedAt?.toISOString() ?? null),
        offers.map((offer) => offer.expiresAt?.toISOString() ?? null),
        offers.map((offer) => JSON.stringify(offer.raw)),
        ingestedAt.toISOString(),
      ]);
      const inserted = result.rows.filter((row) => row.inserted).length;
      return { inserted, updated: result.rows.length - inserted };
    },

    async deleteExpired(now: Date): Promise<number> {
      const result = await db.query(DELETE_EXPIRED_SQL, [now.toISOString()]);
      return result.rowCount ?? 0;
    },
  };
}
