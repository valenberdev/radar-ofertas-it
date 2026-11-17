import { z } from "zod";
import { LlmError } from "../../application/ports/llm-error";
import type { JsonGenerator } from "./json-generator";

const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/interactions";

export interface GeminiClientOptions {
  readonly fetch: typeof fetch;
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs: number;
}

const interactionSchema = z.object({
  status: z.string(),
  steps: z.array(z.unknown()),
});

const modelOutputStepSchema = z.object({
  type: z.literal("model_output"),
  content: z.array(z.unknown()),
});

const textItemSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

function readText(steps: readonly unknown[]): string {
  let text = "";
  for (const step of steps) {
    const output = modelOutputStepSchema.safeParse(step);
    if (!output.success) {
      continue;
    }
    for (const item of output.data.content) {
      const part = textItemSchema.safeParse(item);
      if (part.success) {
        text += part.data.text;
      }
    }
  }
  return text;
}

const ERROR_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

const googleErrorSchema = z.object({
  error: z.object({
    status: z.string().optional(),
    details: z.array(z.object({ reason: z.string().optional() })).optional(),
  }),
});

function errorCodes(body: unknown): string {
  const parsed = googleErrorSchema.safeParse(
    Array.isArray(body) ? body[0] : body,
  );
  if (!parsed.success) {
    return "";
  }
  const { status, details = [] } = parsed.data.error;
  const codes = [status, ...details.map((detail) => detail.reason)].filter(
    (code): code is string => code !== undefined && ERROR_CODE.test(code),
  );
  return [...new Set(codes)].join(" ");
}

async function readErrorCodes(response: Response): Promise<string> {
  try {
    return errorCodes(await response.json());
  } catch {
    return "";
  }
}

function statusError(status: number, codes: string): LlmError {
  const detail = codes === "" ? String(status) : `${status} ${codes}`;
  if (status === 429) {
    return new LlmError("quota", `Gemini quota exceeded (${detail})`);
  }
  if (status === 408 || status >= 500) {
    return new LlmError("unavailable", `Gemini is unavailable (${detail})`);
  }
  return new LlmError("rejected", `Gemini rejected the request (${detail})`);
}

export function createGeminiClient(
  options: GeminiClientOptions,
): JsonGenerator {
  if (options.apiKey.trim() === "") {
    throw new Error("Gemini API key is required");
  }
  if (options.model.trim() === "") {
    throw new Error("Gemini model is required");
  }

  async function post(body: unknown): Promise<Response> {
    try {
      return await options.fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "x-goog-api-key": options.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      throw new LlmError("unavailable", `Gemini request failed: ${reason}`, {
        cause: error,
      });
    }
  }

  async function readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new LlmError(
        "invalid_response",
        "Gemini returned a response that is not valid JSON",
      );
    }
  }

  return {
    async generateJson<T>(prompt: string, schema: z.ZodType<T>): Promise<T> {
      const jsonSchema: Record<string, unknown> = { ...z.toJSONSchema(schema) };
      delete jsonSchema.$schema;

      const response = await post({
        model: options.model,
        input: prompt,
        store: false,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: jsonSchema,
        },
      });
      if (!response.ok) {
        throw statusError(response.status, await readErrorCodes(response));
      }

      const interaction = interactionSchema.safeParse(await readJson(response));
      if (!interaction.success) {
        throw new LlmError(
          "invalid_response",
          "Gemini returned an interaction with an unexpected shape",
        );
      }
      if (interaction.data.status !== "completed") {
        throw new LlmError(
          "invalid_response",
          `Gemini interaction ended with status ${interaction.data.status}`,
        );
      }

      const text = readText(interaction.data.steps);
      if (text === "") {
        throw new LlmError(
          "invalid_response",
          "Gemini returned no text output",
        );
      }

      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        throw new LlmError(
          "invalid_response",
          "Gemini output is not valid JSON",
        );
      }

      const parsed = schema.safeParse(value);
      if (!parsed.success) {
        throw new LlmError(
          "invalid_response",
          "Gemini output does not match the expected schema",
        );
      }
      return parsed.data;
    },
  };
}
