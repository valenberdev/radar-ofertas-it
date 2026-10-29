import { z } from "zod";
import type { JsonValue } from "../../../domain/source-offer";

const BASE_URL = "https://hacker-news.firebaseio.com/v0";
const USER_NAME = /^[A-Za-z0-9_-]{1,64}$/;

const userSchema = z.object({
  submitted: z.array(z.number().int().positive()).optional(),
});

const itemSchema = z.custom<JsonValue>();

export interface HackerNewsClientOptions {
  readonly fetch: typeof fetch;
  readonly userAgent: string;
  readonly timeoutMs: number;
}

export interface HackerNewsClient {
  fetchUserSubmitted(userName: string): Promise<readonly number[]>;
  fetchItem(id: number): Promise<JsonValue>;
}

export function createHackerNewsClient(
  options: HackerNewsClientOptions,
): HackerNewsClient {
  async function request(path: string): Promise<unknown> {
    let response: Response;
    try {
      response = await options.fetch(`${BASE_URL}/${path}.json`, {
        headers: {
          "User-Agent": options.userAgent,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      throw new Error(`Hacker News request failed: ${reason}`, {
        cause: error,
      });
    }

    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        `Hacker News request failed with status ${response.status}`,
      );
    }

    try {
      return await response.json();
    } catch {
      throw new Error("Hacker News returned a response that is not valid JSON");
    }
  }

  return {
    async fetchUserSubmitted(userName) {
      if (!USER_NAME.test(userName)) {
        throw new Error("Invalid Hacker News user name");
      }
      const parsed = userSchema.safeParse(await request(`user/${userName}`));
      if (!parsed.success) {
        throw new Error("Hacker News returned a user with an unexpected shape");
      }
      return parsed.data.submitted ?? [];
    },

    async fetchItem(id) {
      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error("Invalid Hacker News item id");
      }
      return itemSchema.parse(await request(`item/${id}`));
    },
  };
}
