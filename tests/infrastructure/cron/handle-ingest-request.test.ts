import { describe, expect, it, vi } from "vitest";
import type { IngestOffersResult } from "../../../src/application/ingest-offers";
import {
  handleIngestRequest,
  type IngestRequestDeps,
} from "../../../src/infrastructure/cron/handle-ingest-request";
import type {
  IngestionReport,
  IngestionRunner,
} from "../../../src/infrastructure/ingestion/create-ingestion-runner";

const SECRET = "a-very-long-cron-secret-value";
const URL_BASE = "https://radar.example/api/cron/ingest";

function runResult(
  overrides: Partial<IngestOffersResult> = {},
): IngestOffersResult {
  return {
    runId: "42",
    status: "succeeded",
    counts: { fetched: 10, inserted: 6, updated: 4, rejected: 1 },
    error: null,
    ...overrides,
  };
}

function report(overrides: Partial<IngestionReport> = {}): IngestionReport {
  return { run: runResult(), purged: 3, purgeError: null, ...overrides };
}

function setup(
  options: {
    report?: IngestionReport;
    failWith?: unknown;
    allowBackfill?: boolean;
    secret?: string | undefined;
  } = {},
) {
  const run = vi.fn<IngestionRunner["run"]>(async () => {
    if (options.failWith !== undefined) {
      throw options.failWith;
    }
    return options.report ?? report();
  });
  const log = vi.fn<(message: string) => void>();
  const deps: IngestRequestDeps = {
    secret: "secret" in options ? options.secret : SECRET,
    allowBackfill: options.allowBackfill ?? true,
    runner: { run },
    log,
  };
  return { deps, run, log };
}

function request(
  path: string,
  authorization: string | null = `Bearer ${SECRET}`,
): Request {
  const headers = new Headers();
  if (authorization !== null) {
    headers.set("authorization", authorization);
  }
  return new Request(`${URL_BASE}/${path}`, { headers });
}

describe("handleIngestRequest", () => {
  describe("authorization", () => {
    it("rejects a request without credentials and does not run anything", async () => {
      const { deps, run } = setup();

      const response = await handleIngestRequest(
        request("himalayas", null),
        "himalayas",
        deps,
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
      expect(run).not.toHaveBeenCalled();
    });

    it("rejects a wrong secret", async () => {
      const { deps, run } = setup();

      const response = await handleIngestRequest(
        request("himalayas", "Bearer nope"),
        "himalayas",
        deps,
      );

      expect(response.status).toBe(401);
      expect(run).not.toHaveBeenCalled();
    });

    it("rejects everything when the secret is not configured", async () => {
      const { deps, run } = setup({ secret: undefined });

      const response = await handleIngestRequest(
        request("himalayas", "Bearer undefined"),
        "himalayas",
        deps,
      );

      expect(response.status).toBe(401);
      expect(run).not.toHaveBeenCalled();
    });

    it("answers 401 before 404, so unauthenticated callers learn nothing about sources", async () => {
      const { deps } = setup();

      const response = await handleIngestRequest(
        request("secret-source", null),
        "secret-source",
        deps,
      );

      expect(response.status).toBe(401);
    });

    it("answers 401 before validating the backfill flag", async () => {
      const { deps } = setup({ allowBackfill: false });

      const response = await handleIngestRequest(
        request("himalayas?backfill=1", null),
        "himalayas",
        deps,
      );

      expect(response.status).toBe(401);
    });
  });

  describe("source", () => {
    it.each(["himalayas", "hackernews"] as const)("runs %s", async (source) => {
      const { deps, run } = setup();

      const response = await handleIngestRequest(request(source), source, deps);

      expect(response.status).toBe(200);
      expect(run).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledWith(source, { backfill: false });
    });

    it.each([
      "linkedin",
      "",
      "Himalayas",
      "himalayas ",
      "__proto__",
      "constructor",
      "toString",
      "hasOwnProperty",
    ])("answers 404 for the unknown source %j", async (source) => {
      const { deps, run } = setup();

      const response = await handleIngestRequest(request("x"), source, deps);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Unknown source" });
      expect(run).not.toHaveBeenCalled();
    });
  });

  describe("backfill", () => {
    it("runs a backfill when it is requested and allowed", async () => {
      const { deps, run } = setup({ allowBackfill: true });

      const response = await handleIngestRequest(
        request("himalayas?backfill=1"),
        "himalayas",
        deps,
      );

      expect(response.status).toBe(200);
      expect(run).toHaveBeenCalledWith("himalayas", { backfill: true });
      expect((await response.json()).backfill).toBe(true);
    });

    it("refuses a backfill where it is not allowed", async () => {
      const { deps, run } = setup({ allowBackfill: false });

      const response = await handleIngestRequest(
        request("himalayas?backfill=1"),
        "himalayas",
        deps,
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: "Backfill is not allowed here",
      });
      expect(run).not.toHaveBeenCalled();
    });

    it.each(["true", "0", "", "2", "yes", "1 "])(
      "rejects the backfill value %j",
      async (value) => {
        const { deps, run } = setup();

        const response = await handleIngestRequest(
          request(`himalayas?backfill=${encodeURIComponent(value)}`),
          "himalayas",
          deps,
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
          error: "Invalid backfill value",
        });
        expect(run).not.toHaveBeenCalled();
      },
    );

    it("still allows a normal run in an environment where backfill is not allowed", async () => {
      const { deps, run } = setup({ allowBackfill: false });

      const response = await handleIngestRequest(
        request("himalayas"),
        "himalayas",
        deps,
      );

      expect(response.status).toBe(200);
      expect(run).toHaveBeenCalledWith("himalayas", { backfill: false });
    });
  });

  describe("response", () => {
    it("returns the report of a successful run", async () => {
      const { deps } = setup();

      const response = await handleIngestRequest(
        request("himalayas"),
        "himalayas",
        deps,
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "application/json",
      );
      expect(await response.json()).toEqual({
        source: "himalayas",
        backfill: false,
        runId: "42",
        status: "succeeded",
        counts: { fetched: 10, inserted: 6, updated: 4, rejected: 1 },
        error: null,
        purged: 3,
        purgeError: null,
      });
    });

    it("answers 500 when the run failed so the cron invocation shows as failed", async () => {
      const failed = report({
        run: runResult({
          status: "failed",
          error: "Deadline reached after 120 offers",
        }),
      });
      const { deps } = setup({ report: failed });

      const response = await handleIngestRequest(
        request("himalayas"),
        "himalayas",
        deps,
      );

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.status).toBe("failed");
      expect(body.error).toBe("Deadline reached after 120 offers");
    });

    it("keeps a successful status when only the purge failed", async () => {
      const { deps } = setup({
        report: report({ purged: null, purgeError: "purge exploded" }),
      });

      const response = await handleIngestRequest(
        request("himalayas"),
        "himalayas",
        deps,
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.purged).toBeNull();
      expect(body.purgeError).toBe("purge exploded");
    });
  });

  describe("crashes", () => {
    it("answers a generic 500 and logs the message without leaking it", async () => {
      const { deps, log } = setup({
        failWith: new Error("password authentication failed for user radar"),
      });

      const response = await handleIngestRequest(
        request("himalayas"),
        "himalayas",
        deps,
      );

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "Ingestion crashed" });
      expect(log).toHaveBeenCalledWith(
        "ingest himalayas crashed: password authentication failed for user radar",
      );
    });

    it.each([
      ["a string", "boom"],
      ["an error without message", new Error("")],
    ])(
      "logs Unknown error when the failure is %s",
      async (_label, failWith) => {
        const { deps, log } = setup({ failWith });

        const response = await handleIngestRequest(
          request("hackernews"),
          "hackernews",
          deps,
        );

        expect(response.status).toBe(500);
        expect(log).toHaveBeenCalledWith(
          "ingest hackernews crashed: Unknown error",
        );
      },
    );
  });

  describe("logging", () => {
    it("logs a one-line summary of a successful run", async () => {
      const { deps, log } = setup();

      await handleIngestRequest(request("himalayas"), "himalayas", deps);

      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith(
        "ingest himalayas succeeded fetched=10 inserted=6 updated=4 rejected=1 purged=3",
      );
    });

    it("includes the errors of a failed run and a failed purge", async () => {
      const failed = report({
        run: runResult({
          status: "failed",
          error: "Himalayas request failed with status 503",
        }),
        purged: null,
        purgeError: "purge exploded",
      });
      const { deps, log } = setup({ report: failed });

      await handleIngestRequest(request("himalayas"), "himalayas", deps);

      expect(log).toHaveBeenCalledWith(
        'ingest himalayas failed fetched=10 inserted=6 updated=4 rejected=1 purged=failed error="Himalayas request failed with status 503" purgeError="purge exploded"',
      );
    });

    it("does not log anything for rejected requests", async () => {
      const { deps, log } = setup();

      await handleIngestRequest(request("himalayas", null), "himalayas", deps);
      await handleIngestRequest(request("nope"), "nope", deps);

      expect(log).not.toHaveBeenCalled();
    });
  });
});
