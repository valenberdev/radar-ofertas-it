import { describe, expect, it, vi } from "vitest";
import {
  CHECKS,
  parseBaseUrl,
  runCheck,
  runChecks,
  type Check,
} from "../../../scripts/check-production/checks.mts";

const BASE = new URL("https://radar.example");
const CHECK: Check = {
  name: "Home",
  path: "/es",
  status: 200,
  includes: ['lang="es"', "search"],
};

function respondWith(status: number, body: string) {
  return vi.fn<typeof fetch>(async () => new Response(body, { status }));
}

describe("parseBaseUrl", () => {
  it("keeps only the origin of the address", () => {
    expect(parseBaseUrl("https://radar.example/es/owner?x=1").href).toBe(
      "https://radar.example/",
    );
  });

  it("trims spaces and accepts http for local servers", () => {
    expect(parseBaseUrl("  http://localhost:3000  ").href).toBe(
      "http://localhost:3000/",
    );
  });

  it.each([undefined, "", "   "])(
    "asks for an address when it gets %j",
    (raw) => {
      expect(() => parseBaseUrl(raw)).toThrow(
        "Pass the address of the deployment",
      );
    },
  );

  it.each(["radar.example", "ftp://radar.example", "javascript:alert(1)"])(
    "rejects %j",
    (raw) => {
      expect(() => parseBaseUrl(raw)).toThrow(/address/);
    },
  );
});

describe("runCheck", () => {
  it("passes when the status and the texts match", async () => {
    const fetchFn = respondWith(200, '<html lang="es">search</html>');

    expect(await runCheck(BASE, CHECK, fetchFn)).toEqual({
      name: "Home",
      ok: true,
      detail: "status 200",
    });
  });

  it("asks for the right address without following redirects", async () => {
    const fetchFn = respondWith(200, '<html lang="es">search</html>');

    await runCheck(BASE, CHECK, fetchFn);

    expect(fetchFn).toHaveBeenCalledExactlyOnceWith(
      new URL("https://radar.example/es"),
      { redirect: "manual" },
    );
  });

  it("fails on another status", async () => {
    expect(await runCheck(BASE, CHECK, respondWith(500, ""))).toEqual({
      name: "Home",
      ok: false,
      detail: "expected status 200, got 500",
    });
  });

  it("fails on a redirect instead of following it", async () => {
    expect((await runCheck(BASE, CHECK, respondWith(307, ""))).detail).toBe(
      "expected status 200, got 307",
    );
  });

  it("names every missing text", async () => {
    expect(
      (await runCheck(BASE, CHECK, respondWith(200, "<html></html>"))).detail,
    ).toBe('the page does not contain "lang=\\"es\\"", "search"');
  });

  it("reports a request that fails", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    });

    expect(await runCheck(BASE, CHECK, fetchFn)).toEqual({
      name: "Home",
      ok: false,
      detail: "request failed: getaddrinfo ENOTFOUND",
    });
  });

  it("passes a status check that expects no text", async () => {
    const check: Check = {
      name: "Cron",
      path: "/api/cron/purge",
      status: 401,
      includes: [],
    };

    expect(
      (
        await runCheck(
          BASE,
          check,
          respondWith(401, '{"error":"Unauthorized"}'),
        )
      ).ok,
    ).toBe(true);
  });
});

describe("runChecks", () => {
  it("runs every check in order, one after the other", async () => {
    const order: string[] = [];
    const fetchFn = vi.fn<typeof fetch>(async (input) => {
      order.push(String(input));
      return new Response("", { status: 401 });
    });
    const checks: Check[] = [
      { name: "A", path: "/a", status: 401, includes: [] },
      { name: "B", path: "/b", status: 200, includes: [] },
    ];

    const results = await runChecks(BASE, fetchFn, checks);

    expect(order).toEqual([
      "https://radar.example/a",
      "https://radar.example/b",
    ]);
    expect(results.map((result) => [result.name, result.ok])).toEqual([
      ["A", true],
      ["B", false],
    ]);
  });

  it("keeps going after a failure", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => {
      throw new Error("down");
    });

    expect(await runChecks(BASE, fetchFn)).toHaveLength(CHECKS.length);
  });
});

describe("CHECKS", () => {
  it("never calls Gemini or spends quota: every check is a plain GET of a page or a refused cron", () => {
    expect(CHECKS.map((check) => check.path)).toEqual([
      "/api/health",
      "/es",
      "/en",
      "/es/this-page-does-not-exist",
      "/es/owner",
      "/api/cron/purge",
      "/api/cron/ingest/himalayas",
    ]);
  });

  it("expects the crons to refuse requests without the secret", () => {
    expect(
      CHECKS.filter((check) => check.path.startsWith("/api/cron/")).every(
        (check) => check.status === 401,
      ),
    ).toBe(true);
  });
});
