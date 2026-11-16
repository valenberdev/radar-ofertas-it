"use server";

import { isOwnerRequest } from "@/app/_auth/owner-access";
import { runSearch, type SearchState } from "@/app/_search/run-search";
import { searchOffers } from "@/application/search-offers";
import { pool } from "@/infrastructure/db/pool";
import { env } from "@/infrastructure/env";
import { geminiConfig } from "@/infrastructure/parse-env";
import { createSearchDeps } from "@/infrastructure/search/create-search-deps";

export async function searchAction(
  _previous: SearchState,
  formData: FormData,
): Promise<SearchState> {
  const gemini = geminiConfig(env);
  return runSearch(
    {
      enabled: gemini !== null,
      isOwner: isOwnerRequest,
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
