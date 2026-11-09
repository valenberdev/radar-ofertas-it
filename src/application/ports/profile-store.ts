import type { Profile } from "../../domain/profile";

export interface ProfileCacheKey {
  readonly textHash: string;
  readonly extractorId: string;
}

export interface ProfileStore {
  find(key: ProfileCacheKey, at: Date): Promise<Profile | null>;
  save(key: ProfileCacheKey, profile: Profile, at: Date): Promise<void>;
}
