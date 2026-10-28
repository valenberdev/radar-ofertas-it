import { describe, expect, it, vi } from "vitest";
import type {
  FetchOffersOptions,
  OfferBatch,
  OfferSource,
} from "../../../../src/application/ports/offer-source";
import type { JsonValue } from "../../../../src/domain/source-offer";
import type {
  HimalayasClient,
  HimalayasPage,
} from "../../../../src/infrastructure/sources/himalayas/client";
import { createHimalayasSource } from "../../../../src/infrastructure/sources/himalayas/himalayas-source";

type JsonObject = { [key: string]: JsonValue };

const PUBLISHED = 1793117001;
const NO_LIMIT: FetchOffersOptions = { since: null, maxRequests: 50 };

function makeJob(id: string, overrides: JsonObject = {}): JsonObject {
  return {
    title: `Engineer ${id}`,
    companyName: "Acme Corp",
    parentCategories: ["Developer"],
    description: "<p>Hiring.</p>",
    pubDate: PUBLISHED,
    expiryDate: PUBLISHED + 2_592_000,
    applicationLink: `https://himalayas.app/jobs/${id}?utm_source=api`,
    guid: `https://himalayas.app/jobs/${id}`,
    ...overrides,
  };
}

function withoutKey(job: JsonObject, key: string): JsonObject {
  const copy = { ...job };
  delete copy[key];
  return copy;
}

function page(jobs: JsonValue[], nextCursor: string | null): HimalayasPage {
  return { jobs, nextCursor };
}

function fakeClient(pages: HimalayasPage[], beforeEach?: () => void) {
  const queue = [...pages];
  const fetchPage = vi.fn<HimalayasClient["fetchPage"]>(async () => {
    beforeEach?.();
    const next = queue.shift();
    if (next === undefined) {
      throw new Error("the test asked for more pages than it prepared");
    }
    return next;
  });
  return { fetchPage };
}

function sourceWith(
  client: HimalayasClient,
  extra: Partial<Parameters<typeof createHimalayasSource>[0]> = {},
) {
  return createHimalayasSource({ client, sleep: async () => {}, ...extra });
}

async function collect(
  source: OfferSource,
  options: FetchOffersOptions = NO_LIMIT,
): Promise<OfferBatch[]> {
  const batches: OfferBatch[] = [];
  for await (const batch of source.fetchOffers(options)) {
    batches.push(batch);
  }
  return batches;
}

function requestedCursors(client: {
  fetchPage: ReturnType<typeof vi.fn>;
}): unknown[] {
  return client.fetchPage.mock.calls.map((call) => call[0]);
}

describe("createHimalayasSource", () => {
  it("is the himalayas source", () => {
    expect(sourceWith(fakeClient([])).name).toBe("himalayas");
  });

  describe("categories", () => {
    it("keeps Developer and Data Science jobs and ignores the rest without rejecting them", async () => {
      const client = fakeClient([
        page(
          [
            makeJob("dev"),
            makeJob("data", { parentCategories: ["Data Science"] }),
            makeJob("sales", { parentCategories: ["Sales"] }),
            makeJob("mixed", { parentCategories: ["Sales", "Developer"] }),
          ],
          null,
        ),
      ]);

      const [batch] = await collect(sourceWith(client));

      expect(batch?.offers.map((offer) => offer.title)).toEqual([
        "Engineer dev",
        "Engineer data",
        "Engineer mixed",
      ]);
      expect(batch?.rejected).toBe(0);
    });

    it("does not validate the jobs it ignores", async () => {
      const broken = makeJob("sales", { parentCategories: ["Sales"] });
      const client = fakeClient([
        page([withoutKey(withoutKey(broken, "guid"), "title")], null),
      ]);

      const [batch] = await collect(sourceWith(client));

      expect(batch).toEqual({ offers: [], rejected: 0 });
    });
  });

  describe("paging", () => {
    it("yields one batch per page and follows the cursors", async () => {
      const client = fakeClient([
        page([makeJob("a")], "c1"),
        page([makeJob("b"), makeJob("c")], "c2"),
        page([makeJob("d")], null),
      ]);

      const batches = await collect(sourceWith(client));

      expect(batches.map((batch) => batch.offers.length)).toEqual([1, 2, 1]);
      expect(requestedCursors(client)).toEqual([null, "c1", "c2"]);
    });

    it("stops at maxRequests", async () => {
      const client = fakeClient([
        page([makeJob("a")], "c1"),
        page([makeJob("b")], "c2"),
        page([makeJob("c")], "c3"),
      ]);

      const batches = await collect(sourceWith(client), {
        since: null,
        maxRequests: 2,
      });

      expect(batches).toHaveLength(2);
      expect(client.fetchPage).toHaveBeenCalledTimes(2);
    });

    it("makes no request when maxRequests is zero", async () => {
      const client = fakeClient([page([makeJob("a")], null)]);

      expect(
        await collect(sourceWith(client), { since: null, maxRequests: 0 }),
      ).toEqual([]);
      expect(client.fetchPage).not.toHaveBeenCalled();
    });

    it("stops on an empty page even if a cursor is offered", async () => {
      const client = fakeClient([page([], "c1"), page([makeJob("a")], null)]);

      const batches = await collect(sourceWith(client));

      expect(batches).toEqual([]);
      expect(client.fetchPage).toHaveBeenCalledTimes(1);
    });
  });

  describe("since", () => {
    const since = new Date(PUBLISHED * 1000);

    it("does not deliver jobs published before since, and keeps the ones at or after it", async () => {
      const client = fakeClient([
        page(
          [
            makeJob("newer", { pubDate: PUBLISHED + 10 }),
            makeJob("same", { pubDate: PUBLISHED }),
            makeJob("older", { pubDate: PUBLISHED - 10 }),
          ],
          null,
        ),
      ]);

      const [batch] = await collect(sourceWith(client), {
        since,
        maxRequests: 10,
      });

      expect(batch?.offers.map((offer) => offer.title)).toEqual([
        "Engineer newer",
        "Engineer same",
      ]);
      expect(batch?.rejected).toBe(0);
    });

    it("stops after the first page in which every job is older", async () => {
      const older = (id: string) => makeJob(id, { pubDate: PUBLISHED - 100 });
      const client = fakeClient([
        page([makeJob("a", { pubDate: PUBLISHED + 50 })], "c1"),
        page([makeJob("b", { pubDate: PUBLISHED + 5 }), older("c")], "c2"),
        page([older("d"), older("e")], "c3"),
        page([makeJob("never", { pubDate: PUBLISHED + 50 })], null),
      ]);

      const batches = await collect(sourceWith(client), {
        since,
        maxRequests: 10,
      });

      expect(batches.map((batch) => batch.offers.length)).toEqual([1, 1, 0]);
      expect(requestedCursors(client)).toEqual([null, "c1", "c2"]);
    });

    it("does not stop on a page whose jobs have no publication date", async () => {
      const client = fakeClient([
        page([withoutKey(makeJob("a"), "pubDate")], "c1"),
        page([withoutKey(makeJob("b"), "pubDate")], null),
      ]);

      const batches = await collect(sourceWith(client), {
        since,
        maxRequests: 10,
      });

      expect(batches.map((batch) => batch.offers.length)).toEqual([1, 1]);
    });

    it("reads every page when since is null", async () => {
      const old = (id: string) => makeJob(id, { pubDate: 1_000_000_000 });
      const client = fakeClient([
        page([old("a")], "c1"),
        page([old("b")], null),
      ]);

      const batches = await collect(sourceWith(client), NO_LIMIT);

      expect(batches.map((batch) => batch.offers.length)).toEqual([1, 1]);
    });
  });

  describe("rejected jobs", () => {
    it("counts a relevant job that fails validation and still delivers the others", async () => {
      const onRejected = vi.fn();
      const client = fakeClient([
        page(
          [
            makeJob("ok"),
            makeJob("bad", { applicationLink: "javascript:alert(1)" }),
            makeJob("ok2"),
          ],
          null,
        ),
      ]);

      const [batch] = await collect(sourceWith(client, { onRejected }));

      expect(batch?.offers).toHaveLength(2);
      expect(batch?.rejected).toBe(1);
      expect(onRejected).toHaveBeenCalledTimes(1);
      expect(onRejected.mock.calls[0]?.[0]).toMatch(/applicationLink/);
      expect(String(onRejected.mock.calls[0]?.[0])).not.toContain("alert");
    });

    it.each([
      ["missing", undefined],
      ["a string", "Developer"],
      ["a list with a number", ["Developer", 3]],
      ["null", null],
    ])("rejects a job whose parentCategories is %s", async (_label, value) => {
      const onRejected = vi.fn();
      const job =
        value === undefined
          ? withoutKey(makeJob("x"), "parentCategories")
          : makeJob("x", { parentCategories: value });
      const client = fakeClient([page([job], null)]);

      const [batch] = await collect(sourceWith(client, { onRejected }));

      expect(batch).toEqual({ offers: [], rejected: 1 });
      expect(onRejected.mock.calls[0]?.[0]).toMatch(/parentCategories/);
    });

    it("rejects an entry that is not an object", async () => {
      const client = fakeClient([page([5, null, "text"], null)]);

      const [batch] = await collect(sourceWith(client));

      expect(batch).toEqual({ offers: [], rejected: 3 });
    });
  });

  describe("aborting on bad data", () => {
    function jobsWith(valid: number, invalid: number): JsonValue[] {
      return [
        ...Array.from({ length: valid }, (_unused, index) =>
          makeJob(`ok${index}`),
        ),
        ...Array.from({ length: invalid }, (_unused, index) =>
          makeJob(`bad${index}`, { applicationLink: "nope" }),
        ),
      ];
    }

    it("delivers the page and then throws when more than a quarter of the relevant jobs are rejected", async () => {
      const client = fakeClient([
        page(jobsWith(10, 10), "c1"),
        page([makeJob("never")], null),
      ]);
      const iterator = sourceWith(client)
        .fetchOffers(NO_LIMIT)
        [Symbol.asyncIterator]();

      const first = await iterator.next();
      expect(first.done).toBe(false);
      expect(first.value).toMatchObject({ rejected: 10 });
      expect(first.value?.offers).toHaveLength(10);

      await expect(iterator.next()).rejects.toThrow(
        "Himalayas ingestion aborted: 10 of 20 relevant jobs were rejected",
      );
      expect(client.fetchPage).toHaveBeenCalledTimes(1);
    });

    it("does not abort at exactly a quarter", async () => {
      const client = fakeClient([page(jobsWith(15, 5), null)]);

      const [batch] = await collect(sourceWith(client));

      expect(batch?.rejected).toBe(5);
    });

    it("does not abort before enough jobs were attempted", async () => {
      const client = fakeClient([page(jobsWith(0, 19), null)]);

      const [batch] = await collect(sourceWith(client));

      expect(batch?.rejected).toBe(19);
    });

    it("counts rejections across pages", async () => {
      const client = fakeClient([
        page(jobsWith(0, 10), "c1"),
        page(jobsWith(0, 10), "c2"),
        page(jobsWith(1, 0), null),
      ]);

      const call = collect(sourceWith(client));

      await expect(call).rejects.toThrow("20 of 20");
      expect(client.fetchPage).toHaveBeenCalledTimes(2);
    });

    it("aborts when the category field disappears from every job", async () => {
      const jobs = Array.from({ length: 20 }, (_unused, index) =>
        withoutKey(makeJob(`j${index}`), "parentCategories"),
      );
      const client = fakeClient([page(jobs, "c1")]);

      await expect(collect(sourceWith(client))).rejects.toThrow("20 of 20");
    });
  });

  describe("pacing", () => {
    function clock() {
      const state = { now: 0 };
      const sleeps: number[] = [];
      return {
        state,
        sleeps,
        now: () => state.now,
        sleep: async (ms: number) => {
          sleeps.push(ms);
          state.now += ms;
        },
      };
    }

    it("waits the minimum interval between requests, and not before the first or after the last", async () => {
      const time = clock();
      const client = fakeClient([
        page([makeJob("a")], "c1"),
        page([makeJob("b")], "c2"),
        page([makeJob("c")], null),
      ]);

      await collect(
        createHimalayasSource({
          client,
          minIntervalMs: 1000,
          now: time.now,
          sleep: time.sleep,
        }),
      );

      expect(time.sleeps).toEqual([1000, 1000]);
    });

    it("does not wait when the request itself took longer than the interval", async () => {
      const time = clock();
      const client = fakeClient(
        [page([makeJob("a")], "c1"), page([makeJob("b")], null)],
        () => {
          time.state.now += 1500;
        },
      );

      await collect(
        createHimalayasSource({
          client,
          minIntervalMs: 1000,
          now: time.now,
          sleep: time.sleep,
        }),
      );

      expect(time.sleeps).toEqual([]);
    });

    it("counts the time the consumer spends between batches", async () => {
      const time = clock();
      const client = fakeClient([
        page([makeJob("a")], "c1"),
        page([makeJob("b")], null),
      ]);
      const source = createHimalayasSource({
        client,
        minIntervalMs: 1000,
        now: time.now,
        sleep: time.sleep,
      });

      const iterator = source.fetchOffers(NO_LIMIT)[Symbol.asyncIterator]();
      await iterator.next();
      time.state.now += 400;
      await iterator.next();
      await iterator.next();

      expect(time.sleeps).toEqual([600]);
    });
  });

  describe("errors", () => {
    it("delivers earlier batches and then propagates a client failure", async () => {
      const client = {
        fetchPage: vi
          .fn<HimalayasClient["fetchPage"]>()
          .mockResolvedValueOnce(page([makeJob("a")], "c1"))
          .mockRejectedValueOnce(
            new Error("Himalayas request failed with status 429"),
          ),
      };
      const iterator = sourceWith(client)
        .fetchOffers(NO_LIMIT)
        [Symbol.asyncIterator]();

      const first = await iterator.next();

      expect(first.value?.offers).toHaveLength(1);
      await expect(iterator.next()).rejects.toThrow(
        "Himalayas request failed with status 429",
      );
    });
  });
});
