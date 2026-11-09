import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  LlmError,
  type LlmErrorKind,
} from "../../../src/application/ports/llm-error";
import { createGeminiClient } from "../../../src/infrastructure/llm/gemini-client";

const API_KEY = "test-key-123";
const MODEL = "gemini-test-model";
const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/interactions";

const schema = z.object({
  name: z.string(),
  level: z.enum(["low", "high"]).nullable(),
});

function interaction(text: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "interaction-1",
    status: "completed",
    steps: [{ type: "model_output", content: [{ type: "text", text }] }],
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clientWith(fetchImpl: typeof fetch, timeoutMs = 1000) {
  return createGeminiClient({
    fetch: fetchImpl,
    apiKey: API_KEY,
    model: MODEL,
    timeoutMs,
  });
}

function okFetch(text = '{"name":"x","level":null}') {
  return vi.fn<typeof fetch>(async () => jsonResponse(interaction(text)));
}

function sentBody(
  fetchMock: ReturnType<typeof okFetch>,
): Record<string, unknown> {
  return JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<
    string,
    unknown
  >;
}

async function failureOf(promise: Promise<unknown>): Promise<LlmError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof LlmError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected the call to fail");
}

describe("createGeminiClient", () => {
  describe("request", () => {
    it("posts to the interactions endpoint", async () => {
      const fetchMock = okFetch();

      await clientWith(fetchMock).generateJson("prompt", schema);

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock.mock.calls[0]?.[0]).toBe(ENDPOINT);
      expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    });

    it("authenticates with a header and never puts the key in the url", async () => {
      const fetchMock = okFetch();

      await clientWith(fetchMock).generateJson("prompt", schema);

      const init = fetchMock.mock.calls[0]?.[1];
      expect(init?.headers).toEqual({
        "x-goog-api-key": API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      });
      expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain(API_KEY);
    });

    it("sends the model, the prompt and asks not to store the interaction", async () => {
      const fetchMock = okFetch();

      await clientWith(fetchMock).generateJson("my prompt", schema);

      expect(sentBody(fetchMock)).toMatchObject({
        model: MODEL,
        input: "my prompt",
        store: false,
      });
    });

    it("asks for JSON output described by the schema", async () => {
      const fetchMock = okFetch();

      await clientWith(fetchMock).generateJson("prompt", schema);

      expect(sentBody(fetchMock).response_format).toEqual({
        type: "text",
        mime_type: "application/json",
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            level: {
              anyOf: [
                { type: "string", enum: ["low", "high"] },
                { type: "null" },
              ],
            },
          },
          required: ["name", "level"],
          additionalProperties: false,
        },
      });
    });

    it("does not send the $schema keyword", async () => {
      const fetchMock = okFetch();

      await clientWith(fetchMock).generateJson("prompt", schema);

      const format = sentBody(fetchMock).response_format as {
        schema: Record<string, unknown>;
      };
      expect(format.schema).not.toHaveProperty("$schema");
    });

    it("sends only the documented fields", async () => {
      const fetchMock = okFetch();

      await clientWith(fetchMock).generateJson("prompt", schema);

      expect(Object.keys(sentBody(fetchMock)).sort()).toEqual([
        "input",
        "model",
        "response_format",
        "store",
      ]);
    });

    it("sets a timeout", async () => {
      const fetchMock = okFetch();

      await clientWith(fetchMock).generateJson("prompt", schema);

      expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe("response", () => {
    it("returns the parsed and validated output", async () => {
      const fetchMock = okFetch('{"name":"Valen","level":"high"}');

      expect(
        await clientWith(fetchMock).generateJson("prompt", schema),
      ).toEqual({ name: "Valen", level: "high" });
    });

    it("joins the text pieces of a model output", async () => {
      const body = interaction("", {
        steps: [
          {
            type: "model_output",
            content: [
              { type: "text", text: '{"name":"Va' },
              { type: "text", text: 'len","level":null}' },
            ],
          },
        ],
      });
      const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(body));

      expect(
        await clientWith(fetchMock).generateJson("prompt", schema),
      ).toEqual({ name: "Valen", level: null });
    });

    it("ignores steps that are not model output and content that is not text", async () => {
      const body = interaction("", {
        steps: [
          {
            type: "thought",
            content: [{ type: "text", text: "not json at all" }],
          },
          { type: "user_input", content: [{ type: "text", text: "nope" }] },
          {
            type: "model_output",
            content: [
              { type: "image", data: "abc" },
              { type: "refusal", text: "must be ignored" },
              { type: "text", text: '{"name":"ok","level":null}' },
            ],
          },
          "not an object",
        ],
      });
      const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(body));

      expect(
        await clientWith(fetchMock).generateJson("prompt", schema),
      ).toEqual({ name: "ok", level: null });
    });

    it.each([
      [
        "a status other than completed",
        interaction('{"name":"x","level":null}', { status: "incomplete" }),
      ],
      [
        "a failed status",
        interaction('{"name":"x","level":null}', { status: "failed" }),
      ],
      ["no status", { steps: [] }],
      ["no steps", { status: "completed" }],
      ["steps that are not a list", { status: "completed", steps: "x" }],
      [
        "no model output",
        { status: "completed", steps: [{ type: "thought", content: [] }] },
      ],
      ["an empty text", interaction("")],
      ["text that is not JSON", interaction("here is your JSON: {")],
      [
        "JSON that does not match the schema",
        interaction('{"name":"x","level":"medium"}'),
      ],
      ["JSON of the wrong type", interaction("[1,2,3]")],
      ["a body that is not an object", "just text"],
    ])("fails with invalid_response on %s", async (_name, body) => {
      const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(body));

      const error = await failureOf(
        clientWith(fetchMock).generateJson("prompt", schema),
      );

      expect(error.kind).toBe("invalid_response");
    });

    it.each([
      ["an empty text", interaction("")],
      [
        "no model output",
        { status: "completed", steps: [{ type: "thought", content: [] }] },
      ],
    ])("says that there is no text on %s", async (_name, body) => {
      const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(body));

      const error = await failureOf(
        clientWith(fetchMock).generateJson("prompt", schema),
      );

      expect(error.message).toBe("Gemini returned no text output");
    });

    it("mentions the status when the interaction did not complete", async () => {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        jsonResponse(interaction("{}", { status: "incomplete" })),
      );

      const error = await failureOf(
        clientWith(fetchMock).generateJson("prompt", schema),
      );

      expect(error.message).toContain("incomplete");
    });

    it("fails with invalid_response when the body is not JSON", async () => {
      const fetchMock = vi.fn<typeof fetch>(
        async () => new Response("<html>oops</html>", { status: 200 }),
      );

      const error = await failureOf(
        clientWith(fetchMock).generateJson("prompt", schema),
      );

      expect(error.kind).toBe("invalid_response");
    });
  });

  describe("failures", () => {
    it.each<[number, LlmErrorKind]>([
      [429, "quota"],
      [408, "unavailable"],
      [500, "unavailable"],
      [502, "unavailable"],
      [503, "unavailable"],
      [504, "unavailable"],
      [400, "rejected"],
      [401, "rejected"],
      [402, "rejected"],
      [403, "rejected"],
      [404, "rejected"],
      [409, "rejected"],
    ])("maps HTTP %s to %s", async (status, kind) => {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        jsonResponse({ error: { code: "x", message: "y" } }, status),
      );

      const error = await failureOf(
        clientWith(fetchMock).generateJson("prompt", schema),
      );

      expect(error.kind).toBe(kind);
      expect(error.message).toContain(String(status));
    });

    it("releases the body of a failed response", async () => {
      let cancelled = false;
      const body = new ReadableStream({
        cancel() {
          cancelled = true;
        },
      });
      const fetchMock = vi.fn<typeof fetch>(
        async () => new Response(body, { status: 503 }),
      );

      await failureOf(clientWith(fetchMock).generateJson("prompt", schema));

      expect(cancelled).toBe(true);
    });

    it("never repeats the key, the prompt or the response body in an error", async () => {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        jsonResponse(
          {
            error: {
              code: "x",
              message: `bad key ${API_KEY} and secret prompt`,
            },
          },
          403,
        ),
      );

      const error = await failureOf(
        clientWith(fetchMock).generateJson("secret prompt", schema),
      );

      expect(error.message).not.toContain(API_KEY);
      expect(error.message).not.toContain("secret prompt");
    });

    it("maps a network failure to unavailable and keeps the cause", async () => {
      const cause = new TypeError("fetch failed");
      const fetchMock = vi.fn<typeof fetch>(async () => {
        throw cause;
      });

      const error = await failureOf(
        clientWith(fetchMock).generateJson("prompt", schema),
      );

      expect(error.kind).toBe("unavailable");
      expect(error.message).toBe("Gemini request failed: fetch failed");
      expect(error.cause).toBe(cause);
    });

    it("maps a timeout to unavailable", async () => {
      const fetchMock = vi.fn<typeof fetch>(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason),
            );
          }),
      );

      const error = await failureOf(
        clientWith(fetchMock, 20).generateJson("prompt", schema),
      );

      expect(error.kind).toBe("unavailable");
    });

    it("describes a non-Error failure generically", async () => {
      const fetchMock = vi.fn<typeof fetch>(async () => {
        throw "boom";
      });

      const error = await failureOf(
        clientWith(fetchMock).generateJson("prompt", schema),
      );

      expect(error.message).toBe("Gemini request failed: unknown error");
    });
  });

  describe("construction", () => {
    it.each(["", "   "])("rejects the empty api key %j", (apiKey) => {
      expect(() =>
        createGeminiClient({ fetch, apiKey, model: MODEL, timeoutMs: 1000 }),
      ).toThrow("Gemini API key is required");
    });

    it.each(["", "   "])("rejects the empty model %j", (model) => {
      expect(() =>
        createGeminiClient({ fetch, apiKey: API_KEY, model, timeoutMs: 1000 }),
      ).toThrow("Gemini model is required");
    });
  });
});
