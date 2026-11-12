import type { Country } from "../domain/countries";
import type { Profile } from "../domain/profile";
import {
  extractProfile,
  type ExtractProfileDeps,
  type ExtractProfileFailure,
  type ExtractProfileResult,
} from "./extract-profile";
import {
  matchOffers,
  type MatchOffersDeps,
  type MatchOffersResult,
} from "./match-offers";
import { LlmError } from "./ports/llm-error";

export interface SearchOffersDeps {
  readonly extract: ExtractProfileDeps;
  readonly match: MatchOffersDeps;
}

export interface SearchOffersInput {
  readonly text: string;
  readonly country: Country;
}

export type SearchOffersFailure = ExtractProfileFailure | "unavailable";

export type SearchOffersResult =
  | {
      readonly ok: true;
      readonly profile: Profile;
      readonly profileFromCache: boolean;
      readonly match: MatchOffersResult;
    }
  | { readonly ok: false; readonly reason: SearchOffersFailure };

export async function searchOffers(
  deps: SearchOffersDeps,
  input: SearchOffersInput,
): Promise<SearchOffersResult> {
  let extracted: ExtractProfileResult;
  try {
    extracted = await extractProfile(deps.extract, input.text);
  } catch (error) {
    if (error instanceof LlmError && error.kind !== "rejected") {
      return {
        ok: false,
        reason: error.kind === "quota" ? "quota_exhausted" : "unavailable",
      };
    }
    throw error;
  }
  if (!extracted.ok) {
    return extracted;
  }
  const match = await matchOffers(deps.match, {
    profile: extracted.profile,
    country: input.country,
  });
  return {
    ok: true,
    profile: extracted.profile,
    profileFromCache: extracted.fromCache,
    match,
  };
}
