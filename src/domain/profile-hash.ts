import { createHash } from "node:crypto";
import type { Profile } from "./profile";

function compare(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort(compare);
}

export function profileHash(profile: Profile): string {
  const canonical = [
    profile.seniority,
    profile.yearsOfExperience,
    [...profile.skills]
      .map((skill) => [skill.name, sorted(skill.aliases)] as const)
      .sort((first, second) => compare(first[0], second[0])),
    sorted(profile.targetRoles),
    sorted(profile.languages),
    profile.summary,
  ];
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
