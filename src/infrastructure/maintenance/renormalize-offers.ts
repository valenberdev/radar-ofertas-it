import type { Pool } from "pg";
import { dedupKey } from "../../domain/dedup-key";
import { UNKNOWN_REGION, type Region } from "../../domain/region";
import type { JsonValue, SourceName } from "../../domain/source-offer";
import { parseHackerNewsComment } from "../sources/hackernews/parse-comment";
import { mapHimalayasJob } from "../sources/himalayas/map-job";

export const RENORMALIZE_BATCH_SIZE = 500;

const SELECT_PENDING_SQL = `
select id, source, company, title, description, raw
from offers
where dedup_key is null and id > $1
order by id
limit $2
`;

const UPDATE_SQL = `
update offers as target
set
  region_status = fresh.region_status,
  allowed_countries = array(
    select country
    from jsonb_array_elements_text(fresh.allowed_countries) with ordinality as listed(country, position)
    order by position
  ),
  dedup_key = fresh.dedup_key
from unnest($1::bigint[], $2::text[], $3::jsonb[], $4::text[])
  as fresh(id, region_status, allowed_countries, dedup_key)
where target.id = fresh.id and target.dedup_key is null
`;

interface PendingRow {
  readonly id: string;
  readonly source: SourceName;
  readonly company: string | null;
  readonly title: string;
  readonly description: string;
  readonly raw: JsonValue;
}

export interface RenormalizeReport {
  readonly scanned: number;
  readonly updated: number;
  readonly unreadable: number;
  readonly worldwide: number;
  readonly countries: number;
  readonly unknown: number;
}

export function regionFromRaw(
  source: SourceName,
  raw: JsonValue,
): Region | null {
  try {
    if (source === "himalayas") {
      return mapHimalayasJob(raw).region;
    }
    const parsed = parseHackerNewsComment(raw);
    return parsed.kind === "offer" ? parsed.offer.region : null;
  } catch {
    return null;
  }
}

export async function renormalizeOffers(
  db: Pick<Pool, "query">,
  batchSize: number = RENORMALIZE_BATCH_SIZE,
): Promise<RenormalizeReport> {
  let lastId = "0";
  let scanned = 0;
  let updated = 0;
  let unreadable = 0;
  let worldwide = 0;
  let countries = 0;
  let unknown = 0;

  for (;;) {
    const { rows } = await db.query<PendingRow>(SELECT_PENDING_SQL, [
      lastId,
      batchSize,
    ]);
    const last = rows[rows.length - 1];
    if (last === undefined) {
      break;
    }
    lastId = last.id;
    scanned += rows.length;

    const regions = rows.map((row) => {
      const region = regionFromRaw(row.source, row.raw);
      if (region === null) {
        unreadable += 1;
      }
      return region ?? UNKNOWN_REGION;
    });
    for (const region of regions) {
      if (region.kind === "worldwide") worldwide += 1;
      else if (region.kind === "countries") countries += 1;
      else unknown += 1;
    }

    const result = await db.query(UPDATE_SQL, [
      rows.map((row) => row.id),
      regions.map((region) => region.kind),
      regions.map((region) =>
        JSON.stringify(region.kind === "countries" ? region.countries : []),
      ),
      rows.map((row) => dedupKey(row)),
    ]);
    updated += result.rowCount ?? 0;
  }

  return { scanned, updated, unreadable, worldwide, countries, unknown };
}
