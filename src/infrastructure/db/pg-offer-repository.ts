import type { Pool } from "pg";
import type {
  OfferRepository,
  UpsertResult,
} from "../../application/ports/offer-repository";
import { dedupKey } from "../../domain/dedup-key";
import type { Region } from "../../domain/region";
import type { SourceOffer } from "../../domain/source-offer";

const UPSERT_SQL = `
insert into offers (
  source, source_id, title, company, url, description,
  posted_at, expires_at, raw, region_status, allowed_countries, dedup_key,
  first_ingested_at, last_ingested_at
)
select
  incoming.source, incoming.source_id, incoming.title, incoming.company, incoming.url, incoming.description,
  incoming.posted_at, incoming.expires_at, incoming.raw, incoming.region_status,
  array(
    select country
    from jsonb_array_elements_text(incoming.allowed_countries) with ordinality as listed(country, position)
    order by position
  ),
  incoming.dedup_key, $13::timestamptz, $13::timestamptz
from unnest(
  $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
  $7::timestamptz[], $8::timestamptz[], $9::jsonb[], $10::text[], $11::jsonb[], $12::text[]
) as incoming(
  source, source_id, title, company, url, description,
  posted_at, expires_at, raw, region_status, allowed_countries, dedup_key
)
on conflict (source, source_id) do update set
  title = excluded.title,
  company = excluded.company,
  url = excluded.url,
  description = excluded.description,
  posted_at = excluded.posted_at,
  expires_at = excluded.expires_at,
  raw = excluded.raw,
  region_status = excluded.region_status,
  allowed_countries = excluded.allowed_countries,
  dedup_key = excluded.dedup_key,
  last_ingested_at = excluded.last_ingested_at
returning (xmax = 0) as inserted
`;

const DELETE_EXPIRED_SQL = "delete from offers where expires_at < $1";

function countriesOf(region: Region): readonly string[] {
  return region.kind === "countries" ? region.countries : [];
}

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
        offers.map((offer) => offer.region.kind),
        offers.map((offer) => JSON.stringify(countriesOf(offer.region))),
        offers.map((offer) => dedupKey(offer)),
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
