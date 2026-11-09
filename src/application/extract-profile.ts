import { buildProfile, type Profile } from "../domain/profile";
import { redactPersonalData } from "../domain/redact-personal-data";
import type { ProfileExtractor } from "./ports/profile-extractor";

export const MAX_PROFILE_TEXT_LENGTH = 12_000;

export interface ExtractProfileDeps {
  readonly extractor: ProfileExtractor;
}

export type ExtractProfileFailure = "empty" | "too_long" | "no_skills";

export type ExtractProfileResult =
  | { readonly ok: true; readonly profile: Profile }
  | { readonly ok: false; readonly reason: ExtractProfileFailure };

export async function extractProfile(
  deps: ExtractProfileDeps,
  text: string,
): Promise<ExtractProfileResult> {
  const trimmed = text.trim();
  if (trimmed === "") {
    return { ok: false, reason: "empty" };
  }
  if (trimmed.length > MAX_PROFILE_TEXT_LENGTH) {
    return { ok: false, reason: "too_long" };
  }

  const profile = buildProfile(
    await deps.extractor.extract(redactPersonalData(trimmed)),
  );
  if (profile.skills.length === 0) {
    return { ok: false, reason: "no_skills" };
  }
  return { ok: true, profile };
}
