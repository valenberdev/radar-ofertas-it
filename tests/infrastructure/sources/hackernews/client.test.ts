import { describe, expect, it, vi } from "vitest";
import { createHackerNewsClient } from "../../../../src/infrastructure/sources/hackernews/client";

const USER_AGENT =
  "radar-ofertas-it/1.0 (+https://github.com/valenberdev/radar-ofertas-it)";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clientWith(fetchImpl: typeof fetch, timeoutMs = 1000) {
  return createHackerNewsClient({
    fetch: fetchImpl,
    userAgent: USER_AGENT,
    timeoutMs,
  });
}

describe("createHackerNewsClient", () => {
  describe("fetchUserSubmitted", () => {
    it("requests the user and returns the submitted ids", async () => {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        jsonResponse({ id: "whoishiring", karma: 5, submitted: [30, 20, 10] }),
      );

      const ids = await clientWith(fetchMock).fetchUserSubmitted("whoishiring");

      expect(ids).toEqual([30, 20, 10]);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        "https://hacker-news.firebaseio.com/v0/user/whoishiring.json",
      );
    });

    it("returns an empty list when the user has no submissions", async () => {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        jsonResponse({ id: "whoishiring" }),
      );

      expect(
        await clientWith(fetchMock).fetchUserSubmitted("whoishiring"),
      ).toEqual([]);
    });

    it("identifies the app and asks for JSON", async () => {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        jsonResponse({ submitted: [] }),
      );

      await clientWith(fetchMock).fetchUserSubmitted("whoishiring");

      const init = fetchMock.mock.calls[0]?.[1];
      expect(init?.headers).toEqual({
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    });

    it.each([
      [""],
      ["../item/1"],
      ["a/b"],
      ["with space"],
      ["a?b=c"],
      ["x".repeat(65)],
      ["caf\u00e9"],
    ])(
      "refuses the user name %j without making a request",
      async (userName) => {
        const fetchMock = vi.fn<typeof fetch>(async () =>
          jsonResponse({ submitted: [] }),
        );

        await expect(
          clientWith(fetchMock).fetchUserSubmitted(userName),
        ).rejects.toThrow("Invalid Hacker News user name");
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );

    it.each([
      ["null", null],
      ["an array", [1, 2]],
      ["submitted is not a list", { submitted: "nope" }],
      ["submitted holds text", { submitted: [1, "2"] }],
      ["submitted holds a negative id", { submitted: [-1] }],
    ])(
      "throws when the user has an unexpected shape: %s",
      async (_label, body) => {
        const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(body));

        await expect(
          clientWith(fetchMock).fetchUserSubmitted("whoishiring"),
        ).rejects.toThrow(
          "Hacker News returned a user with an unexpected shape",
        );
      },
    );
  });

  describe("fetchItem", () => {
    it("requests the item and returns it untouched", async () => {
      const item = {
        id: 42,
        by: "someone",
        time: 1790000000,
        text: "Acme | Remote",
        kids: [1, 2],
      };
      const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(item));

      const result = await clientWith(fetchMock).fetchItem(42);

      expect(result).toEqual(item);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        "https://hacker-news.firebaseio.com/v0/item/42.json",
      );
    });

    it("returns null when the item does not exist", async () => {
      const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(null));

      expect(await clientWith(fetchMock).fetchItem(42)).toBeNull();
    });

    it.each([
      [0],
      [-1],
      [1.5],
      [Number.NaN],
      [Number.POSITIVE_INFINITY],
      [Number.MAX_SAFE_INTEGER + 1],
    ])("refuses the item id %s without making a request", async (id) => {
      const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({}));

      await expect(clientWith(fetchMock).fetchItem(id)).rejects.toThrow(
        "Invalid Hacker News item id",
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("failures", () => {
    it.each([[403], [429], [500], [503]])(
      "throws with the status when the response is %i",
      async (status) => {
        const fetchMock = vi.fn<typeof fetch>(
          async () => new Response("secret body text", { status }),
        );

        const call = clientWith(fetchMock).fetchItem(1);

        await expect(call).rejects.toThrow(
          `Hacker News request failed with status ${status}`,
        );
        await expect(call).rejects.not.toThrow(/secret body text/);
      },
    );

    it("throws a clear error when the body is not JSON", async () => {
      const fetchMock = vi.fn<typeof fetch>(
        async () => new Response("<html>maintenance</html>", { status: 200 }),
      );

      const call = clientWith(fetchMock).fetchItem(1);

      await expect(call).rejects.toThrow(
        "Hacker News returned a response that is not valid JSON",
      );
      await expect(call).rejects.not.toThrow(/maintenance/);
    });

    it("wraps network failures", async () => {
      const fetchMock = vi.fn<typeof fetch>(async () => {
        throw new TypeError("fetch failed");
      });

      await expect(clientWith(fetchMock).fetchItem(1)).rejects.toThrow(
        "Hacker News request failed: fetch failed",
      );
    });

    it("gives up when the server takes longer than the timeout", async () => {
      const hangingFetch = vi.fn<typeof fetch>(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason),
            );
          }),
      );

      await expect(clientWith(hangingFetch, 20).fetchItem(1)).rejects.toThrow(
        /^Hacker News request failed: /,
      );
    });
  });
});
