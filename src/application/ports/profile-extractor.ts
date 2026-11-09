import type { ProfileInput } from "../../domain/profile";

export interface ProfileExtractor {
  readonly id: string;
  extract(text: string): Promise<ProfileInput>;
}
