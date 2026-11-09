import { buildProfile, type Profile } from "../domain/profile";
import { profileTextHash } from "../domain/profile-text-hash";
import { redactPersonalData } from "../domain/redact-personal-data";
import type { DailyQuota } from "./ports/daily-quota";
import type { ProfileExtractor } from "./ports/profile-extractor";
import type { ProfileStore } from "./ports/profile-store";

export const MAX_PROFILE_TEXT_LENGTH = 12_000;

export interface ExtractProfileDeps {
  readonly extractor: ProfileExtractor;
  readonly profiles: ProfileStore;
  readonly quota: DailyQuota;
  readonly now: () => Date;
}

export type ExtractProfileFailure =
  | "empty"
  | "too_long"
  | "no_skills"
  | "quota_exhausted";

export type ExtractProfileResult =
  | {
      readonly ok: true;
      readonly profile: Profile;
      readonly fromCache: boolean;
    }
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

  const redacted = redactPersonalData(trimmed);
  const key = {
    textHash: profileTextHash(redacted),
    extractorId: deps.extractor.id,
  };

  const cached = await deps.profiles.find(key, deps.now());
  if (cached !== null) {
    return { ok: true, profile: cached, fromCache: true };
  }

  if (!(await deps.quota.tryConsume(1))) {
    return { ok: false, reason: "quota_exhausted" };
  }

  const profile = buildProfile(await deps.extractor.extract(redacted));
  if (profile.skills.length === 0) {
    return { ok: false, reason: "no_skills" };
  }

  await deps.profiles.save(key, profile, deps.now());
  return { ok: true, profile, fromCache: false };
}
