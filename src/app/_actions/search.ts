"use server";

import { headers } from "next/headers";
import { isOwnerRequest } from "@/app/_auth/owner-access";
import { runSearch, type SearchState } from "@/app/_search/run-search";
import { searchOffers } from "@/application/search-offers";
import { pool } from "@/infrastructure/db/pool";
import { env } from "@/infrastructure/env";
import { geminiConfig } from "@/infrastructure/parse-env";
import { clientIp } from "@/infrastructure/rate-limit/client-key";
import { createVisitorSearchLimit } from "@/infrastructure/rate-limit/visitor-search-limit";
import { createSearchDeps } from "@/infrastructure/search/create-search-deps";

export async function searchAction(
  _previous: SearchState,
  formData: FormData,
): Promise<SearchState> {
  const gemini = geminiConfig(env);
  const secret = env.IP_HASH_SECRET;
  return runSearch(
    {
      enabled: gemini !== null && secret !== undefined,
      isOwner: isOwnerRequest,
      allowVisitorSearch: async () => {
        if (secret === undefined) {
          throw new Error("IP_HASH_SECRET is not configured");
        }
        const ip = clientIp(await headers());
        return createVisitorSearchLimit(pool, {
          secret,
          ip,
          now: () => new Date(),
        })();
      },
      search: (mode, input) => {
        if (gemini === null) {
          throw new Error("Gemini is not configured");
        }
        return searchOffers(
          createSearchDeps({ pool, fetch, gemini, mode }),
          input,
        );
      },
      log: (message) => console.error(message),
    },
    formData,
  );
}
