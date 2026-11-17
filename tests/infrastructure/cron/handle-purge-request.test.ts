import { describe, expect, it, vi } from "vitest";
import {
  handlePurgeRequest,
  type PurgeRequestDeps,
} from "../../../src/infrastructure/cron/handle-purge-request";
import type { PurgeCounts } from "../../../src/infrastructure/db/pg-retention";

const SECRET = "a-very-long-cron-secret-value";
const COUNTS: PurgeCounts = { usageCounters: 4, profiles: 2, scores: 30 };

function setup(
  options: { failWith?: unknown; secret?: string | undefined } = {},
) {
  const purge = vi.fn<PurgeRequestDeps["purge"]>(async () => {
    if (options.failWith !== undefined) {
      throw options.failWith;
    }
    return COUNTS;
  });
  const log = vi.fn<(message: string) => void>();
  const deps: PurgeRequestDeps = {
    secret: "secret" in options ? options.secret : SECRET,
    purge,
    log,
  };
  return { deps, purge, log };
}

function request(authorization: string | null = `Bearer ${SECRET}`): Request {
  return new Request("https://radar.example/api/cron/purge", {
    headers: authorization === null ? {} : { authorization },
  });
}

describe("handlePurgeRequest", () => {
  it("purges and reports what it deleted", async () => {
    const { deps, purge } = setup();

    const response = await handlePurgeRequest(request(), deps);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ purged: COUNTS });
    expect(purge).toHaveBeenCalledOnce();
  });

  it("logs the counts", async () => {
    const { deps, log } = setup();

    await handlePurgeRequest(request(), deps);

    expect(log).toHaveBeenCalledExactlyOnceWith(
      "purge usage_counters=4 profiles=2 scores=30",
    );
  });

  it.each([
    ["without a header", null],
    ["with the wrong secret", "Bearer not-the-secret"],
    ["without the Bearer prefix", SECRET],
  ])("rejects a request %s without purging", async (_name, authorization) => {
    const { deps, purge } = setup();

    const response = await handlePurgeRequest(request(authorization), deps);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(purge).not.toHaveBeenCalled();
  });

  it("rejects every request when no secret is configured", async () => {
    const { deps, purge } = setup({ secret: undefined });

    expect((await handlePurgeRequest(request("Bearer "), deps)).status).toBe(
      401,
    );
    expect(purge).not.toHaveBeenCalled();
  });

  it("answers 500 and logs only the message when the purge fails", async () => {
    const { deps, log } = setup({ failWith: new Error("database down") });

    const response = await handlePurgeRequest(request(), deps);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Purge crashed" });
    expect(log).toHaveBeenCalledExactlyOnceWith("purge crashed: database down");
  });

  it("describes a failure without a message", async () => {
    const { deps, log } = setup({ failWith: "boom" });

    await handlePurgeRequest(request(), deps);

    expect(log).toHaveBeenCalledWith("purge crashed: Unknown error");
  });
});
