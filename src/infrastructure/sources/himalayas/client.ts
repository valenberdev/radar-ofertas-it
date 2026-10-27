import { z } from "zod";
import type { JsonValue } from "../../../domain/source-offer";

const BASE_URL = "https://himalayas.app/jobs/api";
const PAGE_SIZE = 20;

const pageSchema = z.object({
  jobs: z.array(z.custom<JsonValue>()),
  nextCursor: z.string().min(1).nullish(),
});

export interface HimalayasPage {
  readonly jobs: readonly JsonValue[];
  readonly nextCursor: string | null;
}

export interface HimalayasClientOptions {
  readonly fetch: typeof fetch;
  readonly userAgent: string;
  readonly timeoutMs: number;
}

export interface HimalayasClient {
  fetchPage(cursor: string | null): Promise<HimalayasPage>;
}

export function createHimalayasClient(
  options: HimalayasClientOptions,
): HimalayasClient {
  async function request(url: URL): Promise<Response> {
    try {
      return await options.fetch(url, {
        headers: {
          "User-Agent": options.userAgent,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      throw new Error(`Himalayas request failed: ${reason}`, { cause: error });
    }
  }

  async function readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new Error("Himalayas returned a response that is not valid JSON");
    }
  }

  return {
    async fetchPage(cursor) {
      const url = new URL(BASE_URL);
      url.searchParams.set("limit", String(PAGE_SIZE));
      if (cursor !== null) {
        url.searchParams.set("cursor", cursor);
      }

      const response = await request(url);
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(
          `Himalayas request failed with status ${response.status}`,
        );
      }

      const parsed = pageSchema.safeParse(await readJson(response));
      if (!parsed.success) {
        throw new Error("Himalayas returned a page with an unexpected shape");
      }
      return {
        jobs: parsed.data.jobs,
        nextCursor: parsed.data.nextCursor ?? null,
      };
    },
  };
}
