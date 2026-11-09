import type { ProfileInput } from "../../domain/profile";

export interface ProfileExtractor {
  extract(text: string): Promise<ProfileInput>;
}
