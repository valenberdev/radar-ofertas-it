import type {
  SearchOffersFailure,
  SearchOffersInput,
  SearchOffersResult,
} from "@/application/search-offers";
import { isCountry } from "@/domain/countries";
import type { SearchMode } from "@/infrastructure/search/create-search-deps";
import { toSearchView, type SearchView } from "./search-view";

export type SearchErrorReason =
  | SearchOffersFailure
  | "invalid_country"
  | "disabled"
  | "rate_limited"
  | "unexpected";

export type SearchState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly reason: SearchErrorReason }
  | { readonly status: "done"; readonly view: SearchView };

export interface RunSearchDeps {
  readonly enabled: boolean;
  readonly isOwner: () => Promise<boolean>;
  readonly allowVisitorSearch: () => Promise<boolean>;
  readonly search: (
    mode: SearchMode,
    input: SearchOffersInput,
  ) => Promise<SearchOffersResult>;
  readonly log: (message: string) => void;
}

export async function runSearch(
  deps: RunSearchDeps,
  formData: FormData,
): Promise<SearchState> {
  const text = formData.get("profile");
  const country = formData.get("country");
  if (typeof country !== "string" || !isCountry(country)) {
    return { status: "error", reason: "invalid_country" };
  }
  if (!deps.enabled) {
    return { status: "error", reason: "disabled" };
  }
  try {
    const mode: SearchMode = (await deps.isOwner()) ? "owner" : "demo";
    if (mode === "demo" && !(await deps.allowVisitorSearch())) {
      return { status: "error", reason: "rate_limited" };
    }
    const result = await deps.search(mode, {
      text: typeof text === "string" ? text : "",
      country,
    });
    return result.ok
      ? { status: "done", view: toSearchView(result) }
      : { status: "error", reason: result.reason };
  } catch (error) {
    deps.log(
      `Search failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { status: "error", reason: "unexpected" };
  }
}
