import type { Pool } from "pg";
import type {
  EligibleOffersQuery,
  OfferReader,
  StoredOffer,
} from "../../application/ports/offer-reader";
import {
  regionOfCountries,
  UNKNOWN_REGION,
  WORLDWIDE,
  type Region,
} from "../../domain/region";
import type { SourceName } from "../../domain/source-offer";

const LIST_ELIGIBLE_SQL = `
select *
from (
  select distinct on (dedup_key)
    id, source, source_id, title, company, url, description,
    posted_at, expires_at, region_status, allowed_countries
  from offers
  where (expires_at is null or expires_at >= $2::timestamptz)
    and (
      region_status = 'worldwide'
      or (region_status = 'countries' and $1::text = any(allowed_countries))
    )
  order by dedup_key, posted_at desc nulls last, id desc
) as latest
order by posted_at desc nulls last, id desc
`;

interface OfferRow {
  readonly id: string;
  readonly source: SourceName;
  readonly source_id: string;
  readonly title: string;
  readonly company: string | null;
  readonly url: string;
  readonly description: string;
  readonly posted_at: Date | null;
  readonly expires_at: Date | null;
  readonly region_status: "worldwide" | "countries" | "unknown";
  readonly allowed_countries: readonly string[];
}

function regionOfRow(row: OfferRow): Region {
  switch (row.region_status) {
    case "worldwide":
      return WORLDWIDE;
    case "countries":
      return regionOfCountries(row.allowed_countries);
    case "unknown":
      return UNKNOWN_REGION;
  }
}

function toStoredOffer(row: OfferRow): StoredOffer {
  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    title: row.title,
    company: row.company,
    url: row.url,
    description: row.description,
    postedAt: row.posted_at,
    expiresAt: row.expires_at,
    region: regionOfRow(row),
  };
}

export function createPgOfferReader(db: Pick<Pool, "query">): OfferReader {
  return {
    async listEligible(
      query: EligibleOffersQuery,
    ): Promise<readonly StoredOffer[]> {
      const result = await db.query<OfferRow>(LIST_ELIGIBLE_SQL, [
        query.country,
        query.now.toISOString(),
      ]);
      return result.rows.map(toStoredOffer);
    },
  };
}
