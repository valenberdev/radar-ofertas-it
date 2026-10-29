import { describe, expect, it, vi } from "vitest";
import type { OfferBatch } from "../../../../src/application/ports/offer-source";
import type {
  JsonValue,
  SourceOffer,
} from "../../../../src/domain/source-offer";
import type { HackerNewsClient } from "../../../../src/infrastructure/sources/hackernews/client";
import { createHackerNewsSource } from "../../../../src/infrastructure/sources/hackernews/hackernews-source";

type JsonObject = { [key: string]: JsonValue };

const POSTED = 1790000000;
const DAY = 86400;

function makeThread(id: number, title: string, kids: number[]): JsonObject {
  return { id, by: "whoishiring", type: "story", title, kids };
}

function makeComment(id: number, overrides: JsonObject = {}): JsonObject {
  return {
    id,
    by: "someone",
    time: POSTED,
    type: "comment",
    text: `Acme${id} | Engineer | Remote | Full-time<p>We build things.`,
    ...overrides,
  };
}

interface FakeWorld {
  readonly submitted?: readonly number[];
  readonly items: ReadonlyMap<number, JsonValue>;
  readonly failing?: ReadonlySet<number>;
}

function makeClient(world: FakeWorld) {
  const fetchItem = vi.fn<HackerNewsClient["fetchItem"]>(async (id) => {
    if (world.failing?.has(id)) {
      throw new Error(`Hacker News request failed with status 500`);
    }
    return world.items.get(id) ?? null;
  });
  const fetchUserSubmitted = vi.fn<HackerNewsClient["fetchUserSubmitted"]>(
    async () => world.submitted ?? [],
  );
  const client: HackerNewsClient = { fetchItem, fetchUserSubmitted };
  return { client, fetchItem, fetchUserSubmitted };
}

function worldOf(
  entries: readonly [number, JsonValue][],
  submitted: readonly number[],
  failing?: ReadonlySet<number>,
): FakeWorld {
  return { submitted, items: new Map(entries), failing };
}

async function collect(
  iterable: AsyncIterable<OfferBatch>,
): Promise<OfferBatch[]> {
  const batches: OfferBatch[] = [];
  for await (const batch of iterable) {
    batches.push(batch);
  }
  return batches;
}

function allOffers(batches: readonly OfferBatch[]): SourceOffer[] {
  return batches.flatMap((batch) => [...batch.offers]);
}

function totalRejected(batches: readonly OfferBatch[]): number {
  return batches.reduce((sum, batch) => sum + batch.rejected, 0);
}

const OPTIONS = { since: null, maxRequests: 1000 } as const;

describe("createHackerNewsSource", () => {
  it("is named hackernews", () => {
    const { client } = makeClient(worldOf([], []));

    expect(createHackerNewsSource({ client }).name).toBe("hackernews");
  });

  describe("thread discovery", () => {
    it("asks for the submissions of whoishiring", async () => {
      const { client, fetchUserSubmitted } = makeClient(
        worldOf(
          [[1, makeThread(1, "Ask HN: Who is hiring? (October 2026)", [])]],
          [1],
        ),
      );

      await collect(createHackerNewsSource({ client }).fetchOffers(OPTIONS));

      expect(fetchUserSubmitted).toHaveBeenCalledWith("whoishiring");
    });

    it("skips other posts of the same user until it finds hiring threads", async () => {
      const entries: [number, JsonValue][] = [
        [
          10,
          makeThread(
            10,
            "Ask HN: Freelancer? Seeking freelancer? (October 2026)",
            [900],
          ),
        ],
        [
          11,
          makeThread(
            11,
            "Ask HN: Who wants to be hired? (October 2026)",
            [901],
          ),
        ],
        [12, makeThread(12, "Ask HN: Who is hiring? (October 2026)", [100])],
        [100, makeComment(100)],
        [900, makeComment(900)],
        [901, makeComment(901)],
      ];
      const { client } = makeClient(worldOf(entries, [10, 11, 12]));

      const offers = allOffers(
        await collect(createHackerNewsSource({ client }).fetchOffers(OPTIONS)),
      );

      expect(offers.map((offer) => offer.sourceId)).toEqual(["100"]);
    });

    it("reads the two most recent hiring threads", async () => {
      const entries: [number, JsonValue][] = [
        [10, makeThread(10, "Ask HN: Who is hiring? (October 2026)", [100])],
        [11, makeThread(11, "Ask HN: Who is hiring? (September 2026)", [200])],
        [12, makeThread(12, "Ask HN: Who is hiring? (August 2026)", [300])],
        [100, makeComment(100)],
        [200, makeComment(200)],
        [300, makeComment(300)],
      ];
      const { client } = makeClient(worldOf(entries, [10, 11, 12]));

      const offers = allOffers(
        await collect(createHackerNewsSource({ client }).fetchOffers(OPTIONS)),
      );

      expect(offers.map((offer) => offer.sourceId)).toEqual(["100", "200"]);
    });

    it("works with a single hiring thread", async () => {
      const entries: [number, JsonValue][] = [
        [10, makeThread(10, "Ask HN: Who is hiring? (October 2026)", [100])],
        [100, makeComment(100)],
      ];
      const { client } = makeClient(worldOf(entries, [10]));

      const offers = allOffers(
        await collect(createHackerNewsSource({ client }).fetchOffers(OPTIONS)),
      );

      expect(offers.map((offer) => offer.sourceId)).toEqual(["100"]);
    });

    it("tolerates a deleted thread among the candidates", async () => {
      const entries: [number, JsonValue][] = [
        [11, makeThread(11, "Ask HN: Who is hiring? (September 2026)", [200])],
        [200, makeComment(200)],
      ];
      const { client } = makeClient(worldOf(entries, [10, 11]));

      const offers = allOffers(
        await collect(createHackerNewsSource({ client }).fetchOffers(OPTIONS)),
      );

      expect(offers.map((offer) => offer.sourceId)).toEqual(["200"]);
    });

    it("fails when no hiring thread is among the latest posts", async () => {
      const entries: [number, JsonValue][] = [
        [
          10,
          makeThread(10, "Ask HN: Who wants to be hired? (October 2026)", []),
        ],
      ];
      const { client } = makeClient(worldOf(entries, [10]));

      await expect(
        collect(createHackerNewsSource({ client }).fetchOffers(OPTIONS)),
      ).rejects.toThrow(
        "Hacker News ingestion failed: no Who is hiring thread found",
      );
    });

    it("fails when whoishiring has no submissions", async () => {
      const { client } = makeClient(worldOf([], []));

      await expect(
        collect(createHackerNewsSource({ client }).fetchOffers(OPTIONS)),
      ).rejects.toThrow("no Who is hiring thread found");
    });

    it("does not look further than twelve candidates", async () => {
      const submitted = Array.from({ length: 30 }, (_, i) => i + 1);
      const { client, fetchItem } = makeClient(worldOf([], submitted));

      await expect(
        collect(createHackerNewsSource({ client }).fetchOffers(OPTIONS)),
      ).rejects.toThrow();

      expect(fetchItem).toHaveBeenCalledTimes(12);
    });

    it("does not read threads that are not hiring threads for their comments", async () => {
      const entries: [number, JsonValue][] = [
        [
          10,
          makeThread(
            10,
            "Ask HN: Who wants to be hired? (October 2026)",
            [900],
          ),
        ],
        [11, makeThread(11, "Ask HN: Who is hiring? (October 2026)", [100])],
        [100, makeComment(100)],
        [900, makeComment(900)],
      ];
      const { client, fetchItem } = makeClient(worldOf(entries, [10, 11]));

      await collect(createHackerNewsSource({ client }).fetchOffers(OPTIONS));

      expect(fetchItem).not.toHaveBeenCalledWith(900);
    });
  });

  describe("comments", () => {
    function threadWith(
      comments: readonly [number, JsonValue][],
    ): HackerNewsClient {
      const entries: [number, JsonValue][] = [
        [
          1,
          makeThread(
            1,
            "Ask HN: Who is hiring? (October 2026)",
            comments.map(([id]) => id),
          ),
        ],
        ...comments,
      ];
      return makeClient(worldOf(entries, [1])).client;
    }

    it("returns offers parsed from the comments", async () => {
      const client = threadWith([[100, makeComment(100)]]);

      const [offer] = allOffers(
        await collect(createHackerNewsSource({ client }).fetchOffers(OPTIONS)),
      );

      expect(offer?.source).toBe("hackernews");
      expect(offer?.sourceId).toBe("100");
      expect(offer?.company).toBe("Acme100");
    });

    it("keeps the order of the thread", async () => {
      const ids = [105, 101, 109, 103, 107, 102];
      const client = threadWith(
        ids.map((id): [number, JsonValue] => [id, makeComment(id)]),
      );

      const offers = allOffers(
        await collect(
          createHackerNewsSource({ client, concurrency: 4 }).fetchOffers(
            OPTIONS,
          ),
        ),
      );

      expect(offers.map((offer) => offer.sourceId)).toEqual(ids.map(String));
    });

    it("does not count deleted, dead, empty or non remote comments as rejected", async () => {
      const client = threadWith([
        [100, makeComment(100)],
        [101, { id: 101, deleted: true, time: POSTED, type: "comment" }],
        [102, makeComment(102, { dead: true })],
        [103, makeComment(103, { text: "" })],
        [104, makeComment(104, { text: "Acme | Engineer | On-site | Berlin" })],
        [105, { id: 105, by: "x", time: POSTED, type: "comment" }],
      ]);

      const batches = await collect(
        createHackerNewsSource({ client }).fetchOffers(OPTIONS),
      );

      expect(allOffers(batches).map((offer) => offer.sourceId)).toEqual([
        "100",
      ]);
      expect(totalRejected(batches)).toBe(0);
    });

    it("treats a missing item as skipped", async () => {
      const entries: [number, JsonValue][] = [
        [1, makeThread(1, "Ask HN: Who is hiring? (October 2026)", [100, 101])],
        [100, makeComment(100)],
      ];
      const { client } = makeClient(worldOf(entries, [1]));

      const batches = await collect(
        createHackerNewsSource({ client }).fetchOffers(OPTIONS),
      );

      expect(allOffers(batches).map((offer) => offer.sourceId)).toEqual([
        "100",
      ]);
      expect(totalRejected(batches)).toBe(0);
    });

    it("counts malformed comments as rejected and reports the reason", async () => {
      const onRejected = vi.fn<(reason: string) => void>();
      const client = threadWith([
        [100, makeComment(100)],
        [101, makeComment(101, { time: "yesterday" })],
      ]);

      const batches = await collect(
        createHackerNewsSource({ client, onRejected }).fetchOffers(OPTIONS),
      );

      expect(allOffers(batches)).toHaveLength(1);
      expect(totalRejected(batches)).toBe(1);
      expect(onRejected).toHaveBeenCalledTimes(1);
    });

    it("counts a failed item request as rejected and keeps going", async () => {
      const entries: [number, JsonValue][] = [
        [
          1,
          makeThread(
            1,
            "Ask HN: Who is hiring? (October 2026)",
            [100, 101, 102],
          ),
        ],
        [100, makeComment(100)],
        [101, makeComment(101)],
        [102, makeComment(102)],
      ];
      const onRejected = vi.fn<(reason: string) => void>();
      const { client } = makeClient(worldOf(entries, [1], new Set([101])));

      const batches = await collect(
        createHackerNewsSource({ client, onRejected }).fetchOffers(OPTIONS),
      );

      expect(allOffers(batches).map((offer) => offer.sourceId)).toEqual([
        "100",
        "102",
      ]);
      expect(totalRejected(batches)).toBe(1);
      expect(onRejected).toHaveBeenCalledWith(
        "Hacker News request failed with status 500",
      );
    });

    it("yields one batch per chunk of comments", async () => {
      const ids = Array.from({ length: 25 }, (_, i) => 100 + i);
      const client = threadWith(
        ids.map((id): [number, JsonValue] => [id, makeComment(id)]),
      );

      const batches = await collect(
        createHackerNewsSource({ client, concurrency: 10 }).fetchOffers(
          OPTIONS,
        ),
      );

      expect(batches.map((batch) => batch.offers.length)).toEqual([10, 10, 5]);
    });

    it("never has more requests in flight than the concurrency", async () => {
      const ids = Array.from({ length: 30 }, (_, i) => 100 + i);
      const entries: [number, JsonValue][] = [
        [1, makeThread(1, "Ask HN: Who is hiring? (October 2026)", ids)],
        ...ids.map((id): [number, JsonValue] => [id, makeComment(id)]),
      ];
      const world = worldOf(entries, [1]);
      let inFlight = 0;
      let peak = 0;
      const client: HackerNewsClient = {
        fetchUserSubmitted: async () => world.submitted ?? [],
        fetchItem: async (id) => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 1));
          inFlight -= 1;
          return world.items.get(id) ?? null;
        },
      };

      await collect(
        createHackerNewsSource({ client, concurrency: 4 }).fetchOffers(OPTIONS),
      );

      expect(peak).toBeLessThanOrEqual(4);
      expect(peak).toBeGreaterThan(1);
    });

    it("treats a concurrency below one as one", async () => {
      const client = threadWith([
        [100, makeComment(100)],
        [101, makeComment(101)],
      ]);

      const batches = await collect(
        createHackerNewsSource({ client, concurrency: 0 }).fetchOffers(OPTIONS),
      );

      expect(batches.map((batch) => batch.offers.length)).toEqual([1, 1]);
    });
  });

  describe("since", () => {
    it("drops offers posted before the cutoff and keeps the rest", async () => {
      const since = new Date((POSTED + DAY) * 1000);
      const client = makeClient(
        worldOf(
          [
            [
              1,
              makeThread(
                1,
                "Ask HN: Who is hiring? (October 2026)",
                [100, 101, 102],
              ),
            ],
            [100, makeComment(100, { time: POSTED })],
            [101, makeComment(101, { time: POSTED + DAY })],
            [102, makeComment(102, { time: POSTED + 2 * DAY })],
          ],
          [1],
        ),
      ).client;

      const offers = allOffers(
        await collect(
          createHackerNewsSource({ client }).fetchOffers({
            since,
            maxRequests: 100,
          }),
        ),
      );

      expect(offers.map((offer) => offer.sourceId)).toEqual(["101", "102"]);
    });

    it("does not count offers dropped by since as rejected", async () => {
      const since = new Date((POSTED + DAY) * 1000);
      const client = makeClient(
        worldOf(
          [
            [1, makeThread(1, "Ask HN: Who is hiring? (October 2026)", [100])],
            [100, makeComment(100, { time: POSTED })],
          ],
          [1],
        ),
      ).client;

      const batches = await collect(
        createHackerNewsSource({ client }).fetchOffers({
          since,
          maxRequests: 100,
        }),
      );

      expect(totalRejected(batches)).toBe(0);
    });

    it("keeps reading old comments because the thread is not chronological", async () => {
      const since = new Date((POSTED + DAY) * 1000);
      const { client, fetchItem } = makeClient(
        worldOf(
          [
            [
              1,
              makeThread(
                1,
                "Ask HN: Who is hiring? (October 2026)",
                [100, 101, 102],
              ),
            ],
            [100, makeComment(100, { time: POSTED })],
            [101, makeComment(101, { time: POSTED })],
            [102, makeComment(102, { time: POSTED + 3 * DAY })],
          ],
          [1],
        ),
      );

      const offers = allOffers(
        await collect(
          createHackerNewsSource({ client, concurrency: 1 }).fetchOffers({
            since,
            maxRequests: 100,
          }),
        ),
      );

      expect(offers.map((offer) => offer.sourceId)).toEqual(["102"]);
      expect(fetchItem).toHaveBeenCalledWith(102);
    });
  });

  describe("maxRequests", () => {
    it("counts the user request, the thread requests and the comment requests", async () => {
      const ids = Array.from({ length: 20 }, (_, i) => 100 + i);
      const entries: [number, JsonValue][] = [
        [1, makeThread(1, "Ask HN: Who is hiring? (October 2026)", ids)],
        ...ids.map((id): [number, JsonValue] => [id, makeComment(id)]),
      ];
      const { client, fetchItem, fetchUserSubmitted } = makeClient(
        worldOf(entries, [1]),
      );

      await collect(
        createHackerNewsSource({ client, concurrency: 5 }).fetchOffers({
          since: null,
          maxRequests: 8,
        }),
      );

      expect(fetchUserSubmitted).toHaveBeenCalledTimes(1);
      expect(
        fetchItem.mock.calls.length + fetchUserSubmitted.mock.calls.length,
      ).toBe(8);
    });

    it("stops after exactly the allowed comments", async () => {
      const ids = Array.from({ length: 20 }, (_, i) => 100 + i);
      const entries: [number, JsonValue][] = [
        [1, makeThread(1, "Ask HN: Who is hiring? (October 2026)", ids)],
        ...ids.map((id): [number, JsonValue] => [id, makeComment(id)]),
      ];
      const { client } = makeClient(worldOf(entries, [1]));

      const offers = allOffers(
        await collect(
          createHackerNewsSource({ client, concurrency: 5 }).fetchOffers({
            since: null,
            maxRequests: 8,
          }),
        ),
      );

      expect(offers.map((offer) => offer.sourceId)).toEqual([
        "100",
        "101",
        "102",
        "103",
        "104",
        "105",
      ]);
    });

    it("does nothing when no requests are allowed", async () => {
      const { client, fetchItem, fetchUserSubmitted } = makeClient(
        worldOf([], [1]),
      );

      const batches = await collect(
        createHackerNewsSource({ client }).fetchOffers({
          since: null,
          maxRequests: 0,
        }),
      );

      expect(batches).toEqual([]);
      expect(fetchUserSubmitted).not.toHaveBeenCalled();
      expect(fetchItem).not.toHaveBeenCalled();
    });

    it("stops quietly when the budget runs out before a thread is found", async () => {
      const { client, fetchItem } = makeClient(
        worldOf(
          [
            [
              1,
              makeThread(
                1,
                "Ask HN: Who wants to be hired? (October 2026)",
                [],
              ),
            ],
          ],
          [1, 2, 3],
        ),
      );

      const batches = await collect(
        createHackerNewsSource({ client }).fetchOffers({
          since: null,
          maxRequests: 2,
        }),
      );

      expect(batches).toEqual([]);
      expect(fetchItem).toHaveBeenCalledTimes(1);
    });
  });

  describe("abort rule", () => {
    function manyComments(
      count: number,
      make: (id: number) => JsonObject,
    ): HackerNewsClient {
      const ids = Array.from({ length: count }, (_, i) => 1000 + i);
      const entries: [number, JsonValue][] = [
        [1, makeThread(1, "Ask HN: Who is hiring? (October 2026)", ids)],
        ...ids.map((id): [number, JsonValue] => [id, make(id)]),
      ];
      return makeClient(worldOf(entries, [1])).client;
    }

    it("aborts after yielding the batch when too many relevant comments are rejected", async () => {
      const client = manyComments(40, (id) => makeComment(id, { time: "bad" }));
      const batches: OfferBatch[] = [];

      const run = async () => {
        for await (const batch of createHackerNewsSource({
          client,
          concurrency: 10,
        }).fetchOffers(OPTIONS)) {
          batches.push(batch);
        }
      };

      await expect(run()).rejects.toThrow(
        "Hacker News ingestion aborted: 20 of 20 relevant comments were rejected",
      );
      expect(batches).toHaveLength(2);
      expect(totalRejected(batches)).toBe(20);
    });

    it("does not abort before enough comments were attempted", async () => {
      const client = manyComments(10, (id) => makeComment(id, { time: "bad" }));

      const batches = await collect(
        createHackerNewsSource({ client, concurrency: 10 }).fetchOffers(
          OPTIONS,
        ),
      );

      expect(totalRejected(batches)).toBe(10);
    });

    it("tolerates up to a quarter of rejected comments", async () => {
      const client = manyComments(40, (id) =>
        id % 5 === 0 ? makeComment(id, { time: "bad" }) : makeComment(id),
      );

      const batches = await collect(
        createHackerNewsSource({ client, concurrency: 10 }).fetchOffers(
          OPTIONS,
        ),
      );

      expect(totalRejected(batches)).toBe(8);
      expect(allOffers(batches)).toHaveLength(32);
    });

    it("aborts when a third of the relevant comments are rejected", async () => {
      const client = manyComments(40, (id) =>
        id % 3 === 0 ? makeComment(id, { time: "bad" }) : makeComment(id),
      );

      await expect(
        collect(
          createHackerNewsSource({ client, concurrency: 10 }).fetchOffers(
            OPTIONS,
          ),
        ),
      ).rejects.toThrow("Hacker News ingestion aborted");
    });

    it("does not count skipped comments as attempted", async () => {
      const client = manyComments(100, (id) =>
        id % 5 === 0
          ? makeComment(id, { time: "bad" })
          : makeComment(id, { deleted: true }),
      );

      await expect(
        collect(
          createHackerNewsSource({ client, concurrency: 10 }).fetchOffers(
            OPTIONS,
          ),
        ),
      ).rejects.toThrow(
        "Hacker News ingestion aborted: 20 of 20 relevant comments were rejected",
      );
    });

    it("aborts when item requests keep failing", async () => {
      const ids = Array.from({ length: 30 }, (_, i) => 1000 + i);
      const entries: [number, JsonValue][] = [
        [1, makeThread(1, "Ask HN: Who is hiring? (October 2026)", ids)],
        ...ids.map((id): [number, JsonValue] => [id, makeComment(id)]),
      ];
      const { client } = makeClient(worldOf(entries, [1], new Set(ids)));

      await expect(
        collect(
          createHackerNewsSource({ client, concurrency: 10 }).fetchOffers(
            OPTIONS,
          ),
        ),
      ).rejects.toThrow("Hacker News ingestion aborted");
    });

    it("fails when a large thread yields no offers at all", async () => {
      const client = manyComments(60, (id) =>
        makeComment(id, { text: "Acme | Engineer | On-site | Berlin" }),
      );

      await expect(
        collect(
          createHackerNewsSource({ client, concurrency: 10 }).fetchOffers(
            OPTIONS,
          ),
        ),
      ).rejects.toThrow("found no offers in 60 comments");
    });

    it("accepts an empty small thread", async () => {
      const client = manyComments(10, (id) =>
        makeComment(id, { text: "Acme | Engineer | On-site | Berlin" }),
      );

      const batches = await collect(
        createHackerNewsSource({ client, concurrency: 10 }).fetchOffers(
          OPTIONS,
        ),
      );

      expect(allOffers(batches)).toEqual([]);
    });

    it("does not complain about no offers when since drops them all", async () => {
      const client = manyComments(60, (id) => makeComment(id));

      const batches = await collect(
        createHackerNewsSource({ client, concurrency: 10 }).fetchOffers({
          since: new Date((POSTED + DAY) * 1000),
          maxRequests: 1000,
        }),
      );

      expect(allOffers(batches)).toEqual([]);
    });
  });

  describe("errors", () => {
    it("propagates a failure of the submissions request", async () => {
      const client: HackerNewsClient = {
        fetchUserSubmitted: async () => {
          throw new Error("Hacker News request failed: timeout");
        },
        fetchItem: async () => null,
      };

      await expect(
        collect(createHackerNewsSource({ client }).fetchOffers(OPTIONS)),
      ).rejects.toThrow("Hacker News request failed: timeout");
    });

    it("propagates a failure of a thread request", async () => {
      const client: HackerNewsClient = {
        fetchUserSubmitted: async () => [1],
        fetchItem: async () => {
          throw new Error("Hacker News request failed with status 503");
        },
      };

      await expect(
        collect(createHackerNewsSource({ client }).fetchOffers(OPTIONS)),
      ).rejects.toThrow("Hacker News request failed with status 503");
    });
  });
});
