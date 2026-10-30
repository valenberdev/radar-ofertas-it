import { fileURLToPath } from "node:url";
import { Client, Pool } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { migrate } from "../../../../scripts/migrate/migrator.mts";
import {
  createIngestionRunner,
  SCHEDULED_DEADLINE_MS,
} from "../../../../src/infrastructure/ingestion/create-ingestion-runner";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../support/test-database";

const MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL("../../../../db/migrations", import.meta.url),
);

const EXPECTED_USER_AGENT =
  "radar-ofertas-it/1.0 (+https://github.com/valenberdev/radar-ofertas-it)";
const T0 = new Date("2026-10-30T09:00:00Z");
const HOUR_S = 3600;
const DAY_S = 86400;
const T0_S = T0.getTime() / 1000;

type Json = Record<string, unknown>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function himalayasJob(n: number, pubDate: number, overrides: Json = {}): Json {
  return {
    guid: `https://himalayas.app/job/${n}`,
    title: `Backend Engineer ${n}`,
    companyName: "Acme",
    applicationLink: `https://example.com/apply/${n}`,
    description: `<p>Job ${n}</p>`,
    pubDate,
    expiryDate: pubDate + 30 * DAY_S,
    parentCategories: ["Developer"],
    ...overrides,
  };
}

function urlOf(input: Parameters<typeof fetch>[0]): URL {
  if (typeof input === "string") {
    return new URL(input);
  }
  return input instanceof URL ? input : new URL(input.url);
}

function himalayasFetch(
  pages: readonly (readonly Json[])[],
  failWithStatus?: number,
) {
  return vi.fn<typeof fetch>(async (input) => {
    if (failWithStatus !== undefined) {
      return jsonResponse({ error: "boom" }, failWithStatus);
    }
    const cursor = urlOf(input).searchParams.get("cursor");
    const index = cursor === null ? 0 : Number(cursor.replace("p", ""));
    const jobs = pages[index] ?? [];
    return jsonResponse({
      jobs,
      nextCursor: index + 1 < pages.length ? `p${index + 1}` : undefined,
    });
  });
}

function hackerNewsComment(id: number, time: number, text: string): Json {
  return { id, by: "someone", time, type: "comment", parent: 1, text };
}

function hackerNewsFetch(options: {
  submitted?: number[];
  items: Record<number, Json | null>;
  failUser?: boolean;
}) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = urlOf(input);
    if (url.pathname === "/v0/user/whoishiring.json") {
      return options.failUser
        ? jsonResponse({}, 503)
        : jsonResponse({ submitted: options.submitted ?? [] });
    }
    const match = /\/v0\/item\/(\d+)\.json$/.exec(url.pathname);
    const id = match ? Number(match[1]) : -1;
    return jsonResponse(options.items[id] ?? null);
  });
}

const instantSleep = async () => undefined;

describe("createIngestionRunner", () => {
  let database: TestDatabase;
  let pool: Pool;

  beforeAll(async () => {
    database = await createTestDatabase();
    const client = new Client({ connectionString: database.connectionString });
    await client.connect();
    try {
      await migrate(client, MIGRATIONS_DIRECTORY);
    } finally {
      await client.end();
    }
    pool = new Pool({ connectionString: database.connectionString, max: 2 });
  });

  afterAll(async () => {
    await pool.end();
    await database.drop();
  });

  beforeEach(async () => {
    await pool.query("truncate offers, ingest_runs restart identity");
  });

  function runnerWith(
    fetchImpl: typeof fetch,
    extra: {
      now?: () => Date;
      apiKey?: string;
      onRejected?: (source: "himalayas" | "hackernews", reason: string) => void;
    } = {},
  ) {
    return createIngestionRunner({
      pool,
      fetch: fetchImpl,
      himalayasApiKey: extra.apiKey,
      now: extra.now ?? (() => T0),
      sleep: instantSleep,
      onRejected: extra.onRejected,
    });
  }

  function laterClock(start: Date) {
    return () => start;
  }

  describe("himalayas", () => {
    it("ingests the relevant jobs of every page and records a successful run", async () => {
      const fetchImpl = himalayasFetch([
        [
          himalayasJob(1, T0_S - HOUR_S),
          himalayasJob(2, T0_S - 2 * HOUR_S, { parentCategories: ["Sales"] }),
        ],
        [
          himalayasJob(3, T0_S - 3 * HOUR_S, {
            parentCategories: ["Data Science"],
          }),
        ],
      ]);

      const { run } = await runnerWith(fetchImpl).run("himalayas", {
        backfill: false,
      });

      expect(run.status).toBe("succeeded");
      expect(run.error).toBeNull();
      expect(run.counts).toEqual({
        fetched: 2,
        inserted: 2,
        updated: 0,
        rejected: 0,
      });
      const { rows } = await pool.query(
        "select source, source_id, title, company, url, expires_at from offers order by source_id",
      );
      expect(rows.map((row) => row.source_id)).toEqual([
        "https://himalayas.app/job/1",
        "https://himalayas.app/job/3",
      ]);
      expect(rows[0]).toMatchObject({
        source: "himalayas",
        company: "Acme",
        url: "https://example.com/apply/1",
      });
      expect(rows[0].expires_at.toISOString()).toBe(
        new Date((T0_S - HOUR_S + 30 * DAY_S) * 1000).toISOString(),
      );
      const runs = await pool.query(
        "select source, status, fetched_count, inserted_count, updated_count, rejected_count, error_message from ingest_runs",
      );
      expect(runs.rows).toEqual([
        {
          source: "himalayas",
          status: "succeeded",
          fetched_count: 2,
          inserted_count: 2,
          updated_count: 0,
          rejected_count: 0,
          error_message: null,
        },
      ]);
    });

    it("updates instead of duplicating when the same feed is ingested twice", async () => {
      const pages = [
        [himalayasJob(1, T0_S - HOUR_S), himalayasJob(2, T0_S - 2 * HOUR_S)],
      ];
      await runnerWith(himalayasFetch(pages)).run("himalayas", {
        backfill: false,
      });
      const first = await pool.query(
        "select source_id, first_ingested_at from offers order by source_id",
      );

      const second = runnerWith(himalayasFetch(pages), {
        now: laterClock(new Date(T0.getTime() + DAY_S * 1000)),
      });
      const { run } = await second.run("himalayas", { backfill: false });

      expect(run.counts).toMatchObject({ inserted: 0, updated: 2 });
      const after = await pool.query(
        "select source_id, first_ingested_at from offers order by source_id",
      );
      expect(after.rows).toEqual(first.rows);
    });

    it("stops at the jobs that the previous successful run already covered", async () => {
      const oldPages = [
        [
          himalayasJob(1, T0_S - 10 * HOUR_S),
          himalayasJob(2, T0_S - 11 * HOUR_S),
        ],
        [
          himalayasJob(3, T0_S - 12 * HOUR_S),
          himalayasJob(4, T0_S - 13 * HOUR_S),
        ],
        [
          himalayasJob(5, T0_S - 14 * HOUR_S),
          himalayasJob(6, T0_S - 15 * HOUR_S),
        ],
      ];
      await runnerWith(himalayasFetch(oldPages)).run("himalayas", {
        backfill: false,
      });

      const nextRunAt = new Date(T0.getTime() + DAY_S * 1000);
      const fresh = [
        himalayasJob(7, T0_S + 10 * HOUR_S),
        himalayasJob(8, T0_S + 11 * HOUR_S),
      ];
      const fetchImpl = himalayasFetch([fresh, ...oldPages]);
      const { run } = await runnerWith(fetchImpl, {
        now: laterClock(nextRunAt),
      }).run("himalayas", { backfill: false });

      expect(run.status).toBe("succeeded");
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(run.counts.inserted).toBe(2);
      const { rows } = await pool.query(
        "select count(*)::int as n from offers",
      );
      expect(rows[0].n).toBe(8);
    });

    it("includes the overlap of two hours before the last run", async () => {
      await runnerWith(
        himalayasFetch([[himalayasJob(1, T0_S - 20 * HOUR_S)]]),
      ).run("himalayas", { backfill: false });
      const nextRunAt = new Date(T0.getTime() + DAY_S * 1000);
      const justInsideOverlap = himalayasJob(2, T0_S - HOUR_S);
      const justOutside = himalayasJob(3, T0_S - 3 * HOUR_S);
      const fetchImpl = himalayasFetch([[justInsideOverlap, justOutside]]);

      await runnerWith(fetchImpl, { now: laterClock(nextRunAt) }).run(
        "himalayas",
        { backfill: false },
      );

      const { rows } = await pool.query(
        "select source_id from offers order by source_id",
      );
      expect(rows.map((row) => row.source_id)).toEqual([
        "https://himalayas.app/job/1",
        "https://himalayas.app/job/2",
      ]);
    });

    it("fails the run when the API fails and reads everything on the next run", async () => {
      const failing = runnerWith(himalayasFetch([], 503));
      const failed = await failing.run("himalayas", { backfill: false });

      expect(failed.run.status).toBe("failed");
      expect(failed.run.error).toBe("Himalayas request failed with status 503");
      const count = await pool.query("select count(*)::int as n from offers");
      expect(count.rows[0].n).toBe(0);

      const pages = [
        [himalayasJob(1, T0_S - 30 * DAY_S)],
        [himalayasJob(2, T0_S - 31 * DAY_S)],
      ];
      const fetchImpl = himalayasFetch(pages);
      const recovered = await runnerWith(fetchImpl).run("himalayas", {
        backfill: false,
      });

      expect(recovered.run.status).toBe("succeeded");
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(recovered.run.counts.inserted).toBe(2);
    });

    it("fails the run at the deadline and keeps what it saved", async () => {
      let calls = 0;
      const clock = () => new Date(T0.getTime() + 100_000 * calls++);
      const pages = Array.from({ length: 6 }, (_, page) => [
        himalayasJob(page + 1, T0_S - (page + 1) * HOUR_S),
      ]);
      const fetchImpl = himalayasFetch(pages);

      const { run } = await runnerWith(fetchImpl, { now: clock }).run(
        "himalayas",
        { backfill: false },
      );

      expect(run.status).toBe("failed");
      expect(run.error).toBe("Deadline reached after 2 offers");
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      const { rows } = await pool.query(
        "select count(*)::int as n from offers",
      );
      expect(rows[0].n).toBe(2);
      expect(SCHEDULED_DEADLINE_MS).toBe(270_000);
    });

    it("does not apply the deadline to a backfill", async () => {
      let calls = 0;
      const clock = () => new Date(T0.getTime() + 100_000 * calls++);
      const pages = Array.from({ length: 6 }, (_, page) => [
        himalayasJob(page + 1, T0_S - (page + 1) * HOUR_S),
      ]);
      const fetchImpl = himalayasFetch(pages);

      const { run } = await runnerWith(fetchImpl, { now: clock }).run(
        "himalayas",
        { backfill: true },
      );

      expect(run.status).toBe("succeeded");
      expect(fetchImpl).toHaveBeenCalledTimes(6);
    });

    it("keeps reading well past the backfill cap when it runs on schedule", async () => {
      const pages = Array.from({ length: 1_000 }, (_, n) => [
        himalayasJob(n + 1, T0_S - (n + 1) * 60),
      ]);
      const fetchImpl = himalayasFetch(pages);

      const { run } = await runnerWith(fetchImpl).run("himalayas", {
        backfill: false,
      });

      expect(run.status).toBe("succeeded");
      expect(fetchImpl).toHaveBeenCalledTimes(1_000);
    });

    it("limits a backfill to 800 requests", async () => {
      const page = (n: number) => [himalayasJob(n, T0_S - n * 60)];
      const pages = Array.from({ length: 900 }, (_, n) => page(n + 1));
      const fetchImpl = himalayasFetch(pages);

      const { run } = await runnerWith(fetchImpl).run("himalayas", {
        backfill: true,
      });

      expect(run.status).toBe("succeeded");
      expect(fetchImpl).toHaveBeenCalledTimes(800);
    });

    it("identifies itself with the user agent and no authorization without an API key", async () => {
      const fetchImpl = himalayasFetch([[himalayasJob(1, T0_S - HOUR_S)]]);

      await runnerWith(fetchImpl).run("himalayas", { backfill: false });

      const init = fetchImpl.mock.calls[0]?.[1];
      const headers = init?.headers as Record<string, string>;
      expect(headers["User-Agent"]).toBe(EXPECTED_USER_AGENT);
      expect(headers.Authorization).toBeUndefined();
    });

    it("sends the API key as a bearer token when there is one", async () => {
      const fetchImpl = himalayasFetch([[himalayasJob(1, T0_S - HOUR_S)]]);

      await runnerWith(fetchImpl, { apiKey: "hml_example" }).run("himalayas", {
        backfill: false,
      });

      const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Record<
        string,
        string
      >;
      expect(headers.Authorization).toBe("Bearer hml_example");
    });

    it("reports rejected jobs with the source name and never their content", async () => {
      const onRejected =
        vi.fn<(source: "himalayas" | "hackernews", reason: string) => void>();
      const broken = himalayasJob(2, T0_S - 2 * HOUR_S, {
        applicationLink: "ftp://secret-host/private",
      });
      const fetchImpl = himalayasFetch([
        [himalayasJob(1, T0_S - HOUR_S), broken],
      ]);

      const { run } = await runnerWith(fetchImpl, { onRejected }).run(
        "himalayas",
        { backfill: false },
      );

      expect(run.counts.rejected).toBe(1);
      expect(onRejected).toHaveBeenCalledTimes(1);
      expect(onRejected.mock.calls[0]?.[0]).toBe("himalayas");
      expect(onRejected.mock.calls[0]?.[1]).not.toContain("secret-host");
    });
  });

  describe("hackernews", () => {
    const THREAD_NEW = 1000;
    const THREAD_OLD = 900;
    const postedAt = T0_S - 2 * DAY_S;

    function world() {
      return hackerNewsFetch({
        submitted: [THREAD_NEW, THREAD_OLD],
        items: {
          [THREAD_NEW]: {
            id: THREAD_NEW,
            type: "story",
            title: "Ask HN: Who is hiring? (October 2026)",
            kids: [1001, 1002, 1003],
          },
          [THREAD_OLD]: {
            id: THREAD_OLD,
            type: "story",
            title: "Ask HN: Who is hiring? (September 2026)",
            kids: [901],
          },
          1001: hackerNewsComment(
            1001,
            postedAt,
            "Acme | Backend Engineer | Remote | Full-time<p>We build things.",
          ),
          1002: hackerNewsComment(
            1002,
            postedAt,
            "Globex | Designer | Berlin | On-site<p>Office five days a week.",
          ),
          1003: { id: 1003, deleted: true, time: postedAt, type: "comment" },
          901: hackerNewsComment(
            901,
            postedAt - 20 * DAY_S,
            "Initech | SRE | REMOTE (Worldwide)<p>Pager included.",
          ),
        },
      });
    }

    it("ingests the remote comments of the latest two threads", async () => {
      const { run } = await runnerWith(world()).run("hackernews", {
        backfill: false,
      });

      expect(run.status).toBe("succeeded");
      expect(run.counts).toEqual({
        fetched: 2,
        inserted: 2,
        updated: 0,
        rejected: 0,
      });
      const { rows } = await pool.query(
        "select source, source_id, company, url, expires_at from offers order by source_id",
      );
      expect(rows.map((row) => row.source_id)).toEqual(["1001", "901"]);
      expect(rows[0]).toMatchObject({
        source: "hackernews",
        company: "Acme",
        url: "https://news.ycombinator.com/item?id=1001",
      });
      expect(rows[0].expires_at.toISOString()).toBe(
        new Date((postedAt + 45 * DAY_S) * 1000).toISOString(),
      );
    });

    it("reads the whole thread again on the next run and updates what it already had", async () => {
      const first = world();
      await runnerWith(first).run("hackernews", { backfill: false });
      const second = world();

      const { run } = await runnerWith(second, {
        now: laterClock(new Date(T0.getTime() + DAY_S * 1000)),
      }).run("hackernews", { backfill: false });

      expect(run.counts).toMatchObject({ inserted: 0, updated: 2 });
      expect(second.mock.calls.length).toBe(first.mock.calls.length);
    });

    it("identifies itself with the user agent", async () => {
      const fetchImpl = world();

      await runnerWith(fetchImpl).run("hackernews", { backfill: false });

      const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Record<
        string,
        string
      >;
      expect(headers["User-Agent"]).toBe(EXPECTED_USER_AGENT);
    });

    it("fails the run when Hacker News is down", async () => {
      const fetchImpl = hackerNewsFetch({ items: {}, failUser: true });

      const { run } = await runnerWith(fetchImpl).run("hackernews", {
        backfill: false,
      });

      expect(run.status).toBe("failed");
      expect(run.error).toBe("Hacker News request failed with status 503");
    });
  });

  describe("purging expired offers", () => {
    async function insertOffer(sourceId: string, expiresAt: Date | null) {
      await pool.query(
        "insert into offers (source, source_id, title, url, description, raw, expires_at) values ('himalayas', $1, 'T', 'https://x.test', 'D', '{}', $2)",
        [sourceId, expiresAt],
      );
    }

    it("deletes offers that expired before the run and reports how many", async () => {
      await insertOffer("expired-1", new Date(T0.getTime() - 1000));
      await insertOffer("expired-2", new Date(T0.getTime() - 5 * DAY_S * 1000));
      await insertOffer("alive", new Date(T0.getTime() + DAY_S * 1000));
      await insertOffer("forever", null);

      const report = await runnerWith(
        himalayasFetch([[himalayasJob(1, T0_S - HOUR_S)]]),
      ).run("himalayas", { backfill: false });

      expect(report.purged).toBe(2);
      expect(report.purgeError).toBeNull();
      const { rows } = await pool.query(
        "select source_id from offers order by source_id",
      );
      expect(rows.map((row) => row.source_id)).toEqual([
        "alive",
        "forever",
        "https://himalayas.app/job/1",
      ]);
    });

    it("purges even when the ingestion failed", async () => {
      await insertOffer("expired", new Date(T0.getTime() - 1000));

      const report = await runnerWith(himalayasFetch([], 503)).run(
        "himalayas",
        { backfill: false },
      );

      expect(report.run.status).toBe("failed");
      expect(report.purged).toBe(1);
    });

    it("does not fail the report when purging fails", async () => {
      const failingPool = {
        query: vi.fn(async (text: string, values?: unknown[]) => {
          if (text.startsWith("delete from offers")) {
            throw new Error("purge exploded");
          }
          return pool.query(text, values);
        }),
      } as unknown as Pool;
      const runner = createIngestionRunner({
        pool: failingPool,
        fetch: himalayasFetch([[himalayasJob(1, T0_S - HOUR_S)]]),
        himalayasApiKey: undefined,
        now: () => T0,
        sleep: instantSleep,
      });

      const report = await runner.run("himalayas", { backfill: false });

      expect(report.run.status).toBe("succeeded");
      expect(report.purged).toBeNull();
      expect(report.purgeError).toBe("purge exploded");
    });
  });
});
