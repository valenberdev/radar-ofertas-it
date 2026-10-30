import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_OVERLAP_MS,
  ingestOffers,
  type IngestOffersOptions,
} from "../../src/application/ingest-offers";
import type { IngestRunRepository } from "../../src/application/ports/ingest-run-repository";
import type { OfferRepository } from "../../src/application/ports/offer-repository";
import type {
  OfferBatch,
  OfferSource,
} from "../../src/application/ports/offer-source";
import type { SourceName, SourceOffer } from "../../src/domain/source-offer";

const T0 = new Date("2026-10-30T09:00:00.000Z").getTime();
const SECOND = 1000;
const HOUR = 60 * 60 * 1000;
const NUL = String.fromCharCode(0);

function at(step: number): Date {
  return new Date(T0 + step * SECOND);
}

function makeOffer(
  sourceId: string,
  overrides: Partial<SourceOffer> = {},
): SourceOffer {
  return {
    source: "himalayas",
    sourceId,
    title: `Engineer ${sourceId}`,
    company: "Acme",
    url: `https://example.com/${sourceId}`,
    description: "We build things.",
    postedAt: new Date("2026-10-30T08:00:00Z"),
    expiresAt: new Date("2026-12-01T08:00:00Z"),
    raw: { id: sourceId },
    ...overrides,
  };
}

function batchOf(ids: readonly string[], rejected = 0): OfferBatch {
  return { offers: ids.map((id) => makeOffer(id)), rejected };
}

interface World {
  readonly events: string[];
  readonly closed: { value: boolean };
  readonly pulled: { value: number };
  readonly clockCalls: { value: number };
}

interface WorldOptions {
  readonly name?: SourceName;
  readonly batches?: readonly OfferBatch[];
  readonly sourceFailure?: unknown;
  readonly lastSuccess?: Date | null;
  readonly findFailure?: Error;
  readonly startFailure?: Error;
  readonly finishFailure?: Error;
  readonly upsertFailureOnCall?: number;
  readonly upsertFailure?: unknown;
  readonly upsertResult?: (offers: readonly SourceOffer[]) => {
    inserted: number;
    updated: number;
  };
}

function build(options: WorldOptions = {}) {
  const world: World = {
    events: [],
    closed: { value: false },
    pulled: { value: 0 },
    clockCalls: { value: 0 },
  };
  const batches = options.batches ?? [];
  const name = options.name ?? "himalayas";

  async function* generate(): AsyncGenerator<OfferBatch> {
    try {
      for (const batch of batches) {
        world.pulled.value += 1;
        world.events.push("pull");
        yield batch;
      }
      if (options.sourceFailure !== undefined) {
        throw options.sourceFailure;
      }
    } finally {
      world.closed.value = true;
    }
  }

  const fetchOffers = vi.fn<OfferSource["fetchOffers"]>(() => generate());
  const source: OfferSource = { name, fetchOffers };

  let upsertCalls = 0;
  const upsertMany = vi.fn<OfferRepository["upsertMany"]>(async (offers) => {
    upsertCalls += 1;
    world.events.push("upsert");
    if (options.upsertFailureOnCall === upsertCalls) {
      throw options.upsertFailure ?? new Error("database is down");
    }
    return options.upsertResult
      ? options.upsertResult(offers)
      : { inserted: offers.length, updated: 0 };
  });
  const deleteExpired = vi.fn<OfferRepository["deleteExpired"]>(async () => 0);
  const offers: OfferRepository = { upsertMany, deleteExpired };

  const findLastSucceededStart = vi.fn<
    IngestRunRepository["findLastSucceededStart"]
  >(async () => {
    world.events.push("find");
    if (options.findFailure) {
      throw options.findFailure;
    }
    return options.lastSuccess ?? null;
  });
  const start = vi.fn<IngestRunRepository["start"]>(async () => {
    world.events.push("start");
    if (options.startFailure) {
      throw options.startFailure;
    }
    return "run-1";
  });
  const finish = vi.fn<IngestRunRepository["finish"]>(async () => {
    world.events.push("finish");
    if (options.finishFailure) {
      throw options.finishFailure;
    }
  });
  const runs: IngestRunRepository = { start, finish, findLastSucceededStart };

  let step = 0;
  const now = () => {
    world.clockCalls.value += 1;
    const value = at(step);
    step += 1;
    return value;
  };

  return {
    world,
    deps: { source, offers, runs, now },
    fetchOffers,
    upsertMany,
    start,
    finish,
    findLastSucceededStart,
  };
}

const BASE: IngestOffersOptions = {
  incremental: true,
  maxRequests: 100,
  deadline: null,
};

describe("ingestOffers", () => {
  describe("since", () => {
    it("starts two hours before the last successful run", async () => {
      const { deps, fetchOffers } = build({
        lastSuccess: new Date(T0 - 24 * HOUR),
      });

      await ingestOffers(deps, BASE);

      expect(fetchOffers.mock.calls[0]?.[0].since?.toISOString()).toBe(
        new Date(T0 - 26 * HOUR).toISOString(),
      );
      expect(DEFAULT_OVERLAP_MS).toBe(2 * HOUR);
    });

    it("uses the overlap it is given", async () => {
      const { deps, fetchOffers } = build({
        lastSuccess: new Date(T0 - 24 * HOUR),
      });

      await ingestOffers(deps, { ...BASE, overlapMs: 30 * 60 * 1000 });

      expect(fetchOffers.mock.calls[0]?.[0].since?.toISOString()).toBe(
        new Date(T0 - 24.5 * HOUR).toISOString(),
      );
    });

    it("reads everything when there was no successful run", async () => {
      const { deps, fetchOffers } = build({ lastSuccess: null });

      await ingestOffers(deps, BASE);

      expect(fetchOffers.mock.calls[0]?.[0].since).toBeNull();
    });

    it("reads everything when the source is not incremental", async () => {
      const { deps, fetchOffers, findLastSucceededStart } = build({
        lastSuccess: new Date(T0 - 24 * HOUR),
      });

      await ingestOffers(deps, { ...BASE, incremental: false });

      expect(fetchOffers.mock.calls[0]?.[0].since).toBeNull();
      expect(findLastSucceededStart).not.toHaveBeenCalled();
    });

    it("looks up the last run of its own source", async () => {
      const { deps, findLastSucceededStart } = build({ name: "hackernews" });

      await ingestOffers(deps, BASE);

      expect(findLastSucceededStart).toHaveBeenCalledWith("hackernews");
    });

    it("passes the request budget to the source", async () => {
      const { deps, fetchOffers } = build();

      await ingestOffers(deps, { ...BASE, maxRequests: 123 });

      expect(fetchOffers.mock.calls[0]?.[0].maxRequests).toBe(123);
    });
  });

  describe("run bookkeeping", () => {
    it("records the start with the source name and the first clock reading", async () => {
      const { deps, start } = build({ name: "hackernews" });

      await ingestOffers(deps, BASE);

      expect(start).toHaveBeenCalledWith("hackernews", at(0));
    });

    it("looks up the last run, starts the run, then reads the source, then finishes", async () => {
      const { deps, world } = build({ batches: [batchOf(["a"])] });

      await ingestOffers(deps, BASE);

      expect(world.events).toEqual([
        "find",
        "start",
        "pull",
        "upsert",
        "finish",
      ]);
    });

    it("finishes a successful run with its counts and no error", async () => {
      const { deps, finish } = build({
        batches: [batchOf(["a", "b"], 1), batchOf(["c"], 2)],
      });

      const result = await ingestOffers(deps, BASE);

      expect(finish).toHaveBeenCalledTimes(1);
      expect(finish).toHaveBeenCalledWith("run-1", {
        status: "succeeded",
        finishedAt: at(3),
        counts: { fetched: 3, inserted: 3, updated: 0, rejected: 3 },
        error: null,
      });
      expect(result).toEqual({
        runId: "run-1",
        status: "succeeded",
        counts: { fetched: 3, inserted: 3, updated: 0, rejected: 3 },
        error: null,
      });
    });

    it("succeeds with zero counts when the source has nothing", async () => {
      const { deps, upsertMany } = build({ batches: [] });

      const result = await ingestOffers(deps, BASE);

      expect(result.status).toBe("succeeded");
      expect(result.counts).toEqual({
        fetched: 0,
        inserted: 0,
        updated: 0,
        rejected: 0,
      });
      expect(upsertMany).not.toHaveBeenCalled();
    });
  });

  describe("persisting", () => {
    it("upserts each batch with the time it arrived", async () => {
      const { deps, upsertMany } = build({
        batches: [batchOf(["a"]), batchOf(["b"])],
      });

      await ingestOffers(deps, BASE);

      expect(upsertMany).toHaveBeenCalledTimes(2);
      expect(
        upsertMany.mock.calls[0]?.[0].map((offer) => offer.sourceId),
      ).toEqual(["a"]);
      expect(upsertMany.mock.calls[0]?.[1]).toEqual(at(1));
      expect(
        upsertMany.mock.calls[1]?.[0].map((offer) => offer.sourceId),
      ).toEqual(["b"]);
      expect(upsertMany.mock.calls[1]?.[1]).toEqual(at(2));
    });

    it("sanitizes offers before saving them", async () => {
      const dirty = makeOffer("a", {
        title: `Back${NUL}end`,
        raw: { note: `x${NUL}` },
      });
      const { deps, upsertMany } = build({
        batches: [{ offers: [dirty], rejected: 0 }],
      });

      await ingestOffers(deps, BASE);

      const saved = upsertMany.mock.calls[0]?.[0][0];
      expect(saved?.title).toBe("Backend");
      expect(saved?.raw).toEqual({ note: "x" });
    });

    it("keeps the last of two offers with the same id in a batch", async () => {
      const first = makeOffer("a", { title: "First" });
      const second = makeOffer("a", { title: "Second" });
      const other = makeOffer("b");
      const { deps, upsertMany } = build({
        batches: [{ offers: [first, other, second], rejected: 0 }],
      });

      await ingestOffers(deps, BASE);

      const saved = upsertMany.mock.calls[0]?.[0] ?? [];
      expect(saved.map((offer) => offer.sourceId)).toEqual(["a", "b"]);
      expect(saved[0]?.title).toBe("Second");
    });

    it("treats ids that only differ by a NUL character as the same offer", async () => {
      const first = makeOffer(`a${NUL}`, { title: "First" });
      const second = makeOffer("a", { title: "Second" });
      const { deps, upsertMany } = build({
        batches: [{ offers: [first, second], rejected: 0 }],
      });

      await ingestOffers(deps, BASE);

      const saved = upsertMany.mock.calls[0]?.[0] ?? [];
      expect(saved).toHaveLength(1);
      expect(saved[0]?.title).toBe("Second");
    });

    it("does not deduplicate across batches", async () => {
      const { deps, upsertMany } = build({
        batches: [batchOf(["a"]), batchOf(["a"])],
      });

      await ingestOffers(deps, BASE);

      expect(upsertMany).toHaveBeenCalledTimes(2);
    });

    it("counts the offers received, not the deduplicated ones", async () => {
      const { deps } = build({
        batches: [
          {
            offers: [makeOffer("a"), makeOffer("a"), makeOffer("b")],
            rejected: 0,
          },
        ],
      });

      const result = await ingestOffers(deps, BASE);

      expect(result.counts.fetched).toBe(3);
    });

    it("does not call the repository for an empty batch but counts its rejections", async () => {
      const { deps, upsertMany } = build({
        batches: [{ offers: [], rejected: 4 }, batchOf(["a"])],
      });

      const result = await ingestOffers(deps, BASE);

      expect(upsertMany).toHaveBeenCalledTimes(1);
      expect(result.counts.rejected).toBe(4);
    });

    it("adds up inserted and updated counts reported by the repository", async () => {
      const { deps } = build({
        batches: [batchOf(["a", "b", "c"]), batchOf(["d", "e"])],
        upsertResult: (offers) => ({ inserted: offers.length - 1, updated: 1 }),
      });

      const result = await ingestOffers(deps, BASE);

      expect(result.counts).toEqual({
        fetched: 5,
        inserted: 3,
        updated: 2,
        rejected: 0,
      });
    });
  });

  describe("failures", () => {
    it("fails the run with the message of an error thrown by the source and keeps what was saved", async () => {
      const { deps, finish, upsertMany } = build({
        batches: [batchOf(["a", "b"], 1), batchOf(["c"])],
        sourceFailure: new Error(
          "Himalayas ingestion aborted: 6 of 20 relevant jobs were rejected",
        ),
      });

      const result = await ingestOffers(deps, BASE);

      expect(upsertMany).toHaveBeenCalledTimes(2);
      expect(finish).toHaveBeenCalledTimes(1);
      expect(result.status).toBe("failed");
      expect(result.error).toBe(
        "Himalayas ingestion aborted: 6 of 20 relevant jobs were rejected",
      );
      expect(result.counts).toEqual({
        fetched: 3,
        inserted: 3,
        updated: 0,
        rejected: 1,
      });
      expect(finish.mock.calls[0]?.[1].status).toBe("failed");
    });

    it("fails the run when the source throws before any batch", async () => {
      const { deps, upsertMany } = build({
        batches: [],
        sourceFailure: new Error("Himalayas request failed with status 503"),
      });

      const result = await ingestOffers(deps, BASE);

      expect(upsertMany).not.toHaveBeenCalled();
      expect(result.status).toBe("failed");
      expect(result.error).toBe("Himalayas request failed with status 503");
      expect(result.counts).toEqual({
        fetched: 0,
        inserted: 0,
        updated: 0,
        rejected: 0,
      });
    });

    it("fails the run when saving a batch fails and stops reading the source", async () => {
      const { deps, world } = build({
        batches: [batchOf(["a"]), batchOf(["b"]), batchOf(["c"])],
        upsertFailureOnCall: 2,
        upsertFailure: new Error("connection terminated"),
      });

      const result = await ingestOffers(deps, BASE);

      expect(result.status).toBe("failed");
      expect(result.error).toBe("connection terminated");
      expect(world.pulled.value).toBe(2);
      expect(world.closed.value).toBe(true);
      expect(result.counts.inserted).toBe(1);
    });

    it("describes a thrown value that is not an error", async () => {
      const { deps } = build({ batches: [], sourceFailure: "boom" });

      const result = await ingestOffers(deps, BASE);

      expect(result.status).toBe("failed");
      expect(result.error).toBe("Unknown error");
    });

    it("describes an error without a message", async () => {
      const { deps } = build({ batches: [], sourceFailure: new Error("") });

      const result = await ingestOffers(deps, BASE);

      expect(result.error).toBe("Unknown error");
    });

    it("does not leak anything but the message of the error", async () => {
      const failure = Object.assign(new Error("query failed"), {
        detail: "Key (source_id)=(secret) already exists",
      });
      const { deps } = build({ batches: [], sourceFailure: failure });

      const result = await ingestOffers(deps, BASE);

      expect(result.error).toBe("query failed");
    });

    it("rejects without reading the source when the run cannot be started", async () => {
      const { deps, fetchOffers, finish } = build({
        startFailure: new Error("cannot start"),
      });

      await expect(ingestOffers(deps, BASE)).rejects.toThrow("cannot start");

      expect(fetchOffers).not.toHaveBeenCalled();
      expect(finish).not.toHaveBeenCalled();
    });

    it("rejects without starting a run when the last run cannot be found", async () => {
      const { deps, start } = build({ findFailure: new Error("cannot query") });

      await expect(ingestOffers(deps, BASE)).rejects.toThrow("cannot query");

      expect(start).not.toHaveBeenCalled();
    });

    it("rejects when the run cannot be finished", async () => {
      const { deps } = build({
        batches: [batchOf(["a"])],
        finishFailure: new Error("cannot finish"),
      });

      await expect(ingestOffers(deps, BASE)).rejects.toThrow("cannot finish");
    });
  });

  describe("deadline", () => {
    it("stops after the batch that reaches the deadline and fails the run", async () => {
      const { deps, world, upsertMany } = build({
        batches: [batchOf(["a"]), batchOf(["b"]), batchOf(["c"])],
      });

      const result = await ingestOffers(deps, { ...BASE, deadline: at(2) });

      expect(upsertMany).toHaveBeenCalledTimes(2);
      expect(world.pulled.value).toBe(2);
      expect(world.closed.value).toBe(true);
      expect(result.status).toBe("failed");
      expect(result.error).toBe("Deadline reached after 2 offers");
      expect(result.counts).toEqual({
        fetched: 2,
        inserted: 2,
        updated: 0,
        rejected: 0,
      });
    });

    it("saves the batch that reaches the deadline before stopping", async () => {
      const { deps, world } = build({
        batches: [batchOf(["a"]), batchOf(["b"])],
      });

      await ingestOffers(deps, { ...BASE, deadline: at(1) });

      expect(world.events).toEqual([
        "find",
        "start",
        "pull",
        "upsert",
        "finish",
      ]);
    });

    it("stops when the deadline has already passed", async () => {
      const { deps, world } = build({
        batches: [batchOf(["a"]), batchOf(["b"])],
      });

      const result = await ingestOffers(deps, { ...BASE, deadline: at(-10) });

      expect(world.pulled.value).toBe(1);
      expect(result.error).toBe("Deadline reached after 1 offers");
    });

    it("keeps reading while the deadline has not been reached", async () => {
      const { deps, world } = build({
        batches: [batchOf(["a"]), batchOf(["b"]), batchOf(["c"])],
      });

      const result = await ingestOffers(deps, { ...BASE, deadline: at(10) });

      expect(world.pulled.value).toBe(3);
      expect(result.status).toBe("succeeded");
      expect(result.error).toBeNull();
    });

    it("never stops without a deadline", async () => {
      const batches = Array.from({ length: 50 }, (_, i) =>
        batchOf([`id-${i}`]),
      );
      const { deps, world } = build({ batches });

      const result = await ingestOffers(deps, { ...BASE, deadline: null });

      expect(world.pulled.value).toBe(50);
      expect(result.status).toBe("succeeded");
    });

    it("gives the source error priority when it fails before the deadline", async () => {
      const { deps } = build({
        batches: [batchOf(["a"])],
        sourceFailure: new Error("source broke"),
      });

      const result = await ingestOffers(deps, { ...BASE, deadline: at(10) });

      expect(result.error).toBe("source broke");
    });
  });

  it("closes the source when it finishes normally", async () => {
    const { deps, world } = build({ batches: [batchOf(["a"])] });

    await ingestOffers(deps, BASE);

    expect(world.closed.value).toBe(true);
  });
});
