import { describe, expect, it, vi } from "vitest";
import { createHimalayasClient } from "../../../../src/infrastructure/sources/himalayas/client";

const USER_AGENT =
  "radar-ofertas-it/1.0 (+https://github.com/valenberdev/radar-ofertas-it)";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clientWith(
  fetchImpl: typeof fetch,
  timeoutMs = 1000,
  apiKey?: string,
) {
  return createHimalayasClient({
    fetch: fetchImpl,
    userAgent: USER_AGENT,
    timeoutMs,
    apiKey,
  });
}

function requestedUrl(fetchMock: ReturnType<typeof vi.fn>, call = 0): URL {
  return new URL(String(fetchMock.mock.calls[call]?.[0]));
}

describe("createHimalayasClient", () => {
  it("requests the first page without a cursor", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ jobs: [] }));

    await clientWith(fetchMock as unknown as typeof fetch).fetchPage(null);

    const url = requestedUrl(fetchMock);
    expect(url.origin + url.pathname).toBe("https://himalayas.app/jobs/api");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.has("cursor")).toBe(false);
  });

  it("sends the cursor, escaped, when there is one", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ jobs: [] }));
    const cursor = "a b&c=d/e+f";

    await clientWith(fetchMock as unknown as typeof fetch).fetchPage(cursor);

    const url = requestedUrl(fetchMock);
    expect(url.searchParams.get("cursor")).toBe(cursor);
    expect([...url.searchParams.keys()].sort()).toEqual(["cursor", "limit"]);
  });

  it("identifies the app and asks for JSON", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({ jobs: [] }),
    );

    await clientWith(fetchMock).fetchPage(null);

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.headers).toEqual({
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends the API key as a bearer token when there is one", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({ jobs: [] }),
    );

    await clientWith(fetchMock, 1000, "hml_test_key").fetchPage(null);

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      Authorization: "Bearer hml_test_key",
    });
  });

  it.each([[undefined], [""]])(
    "sends no Authorization header when the API key is %j",
    async (apiKey) => {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        jsonResponse({ jobs: [] }),
      );

      await clientWith(fetchMock, 1000, apiKey).fetchPage(null);

      expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty(
        "Authorization",
      );
    },
  );

  it("never puts the API key in an error message", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response("denied", { status: 401 }),
    );

    const call = clientWith(fetchMock, 1000, "hml_test_key").fetchPage(null);

    await expect(call).rejects.toThrow(
      "Himalayas request failed with status 401",
    );
    await expect(call).rejects.not.toThrow(/hml_test_key/);
  });

  it("returns the jobs and the next cursor", async () => {
    const jobs = [{ guid: "a" }, { guid: "b" }];
    const fetchMock = vi.fn(async () =>
      jsonResponse({ jobs, nextCursor: "next-1", totalCount: 5 }),
    );

    const page = await clientWith(
      fetchMock as unknown as typeof fetch,
    ).fetchPage(null);

    expect(page).toEqual({ jobs, nextCursor: "next-1" });
  });

  it.each([
    ["absent", {}],
    ["null", { nextCursor: null }],
  ])("returns a null cursor when nextCursor is %s", async (_label, extra) => {
    const fetchMock = vi.fn(async () => jsonResponse({ jobs: [], ...extra }));

    const page = await clientWith(
      fetchMock as unknown as typeof fetch,
    ).fetchPage("x");

    expect(page.nextCursor).toBeNull();
  });

  it.each([[429], [500], [503], [403]])(
    "throws with the status when the response is %i",
    async (status) => {
      const fetchMock = vi.fn(
        async () => new Response("secret body text", { status }),
      );

      const call = clientWith(fetchMock as unknown as typeof fetch).fetchPage(
        null,
      );

      await expect(call).rejects.toThrow(
        `Himalayas request failed with status ${status}`,
      );
      await expect(call).rejects.not.toThrow(/secret body text/);
    },
  );

  it("throws a clear error when the body is not JSON", async () => {
    const fetchMock = vi.fn(
      async () => new Response("<html>maintenance</html>", { status: 200 }),
    );

    const call = clientWith(fetchMock as unknown as typeof fetch).fetchPage(
      null,
    );

    await expect(call).rejects.toThrow(
      "Himalayas returned a response that is not valid JSON",
    );
    await expect(call).rejects.not.toThrow(/maintenance/);
  });

  it.each([
    ["no jobs key", {}],
    ["jobs is not an array", { jobs: "nope" }],
    ["empty nextCursor", { jobs: [], nextCursor: "" }],
    ["numeric nextCursor", { jobs: [], nextCursor: 7 }],
    ["not an object", [1, 2]],
  ])(
    "throws when the page has an unexpected shape: %s",
    async (_label, body) => {
      const fetchMock = vi.fn(async () => jsonResponse(body));

      await expect(
        clientWith(fetchMock as unknown as typeof fetch).fetchPage(null),
      ).rejects.toThrow("Himalayas returned a page with an unexpected shape");
    },
  );

  it("wraps network failures", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    await expect(
      clientWith(fetchMock as unknown as typeof fetch).fetchPage(null),
    ).rejects.toThrow("Himalayas request failed: fetch failed");
  });

  it("gives up when the server takes longer than the timeout", async () => {
    const hangingFetch = (_url: URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        );
      });

    const call = clientWith(
      hangingFetch as unknown as typeof fetch,
      20,
    ).fetchPage(null);

    await expect(call).rejects.toThrow(/^Himalayas request failed: /);
  });
});
