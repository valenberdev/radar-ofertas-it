export const SENIORITIES = [
  "intern",
  "junior",
  "mid",
  "senior",
  "lead",
] as const;

export type Seniority = (typeof SENIORITIES)[number];

export const PROFILE_LIMITS = {
  maxSkills: 40,
  maxAliases: 6,
  maxSkillLength: 60,
  maxRoles: 5,
  maxRoleLength: 80,
  maxLanguages: 6,
  maxLanguageLength: 40,
  maxSummaryLength: 600,
  maxYears: 60,
} as const;

export interface ProfileSkill {
  readonly name: string;
  readonly aliases: readonly string[];
}

export interface Profile {
  readonly seniority: Seniority | null;
  readonly yearsOfExperience: number | null;
  readonly skills: readonly ProfileSkill[];
  readonly targetRoles: readonly string[];
  readonly languages: readonly string[];
  readonly summary: string;
}

export interface ProfileInput {
  readonly seniority?: string | null;
  readonly yearsOfExperience?: number | null;
  readonly skills?: readonly {
    readonly name: string;
    readonly aliases?: readonly string[];
  }[];
  readonly targetRoles?: readonly string[];
  readonly languages?: readonly string[];
  readonly summary?: string;
}

export function isSeniority(value: string): value is Seniority {
  return (SENIORITIES as readonly string[]).includes(value);
}

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function uniqueTexts(
  values: readonly string[],
  maxCount: number,
  maxLength: number,
  exclude: readonly string[] = [],
): string[] {
  const seen = new Set(exclude.map((text) => clean(text).toLowerCase()));
  const result: string[] = [];
  for (const value of values) {
    const text = clean(value);
    const key = text.toLowerCase();
    if (text === "" || text.length > maxLength || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(text);
    if (result.length === maxCount) {
      break;
    }
  }
  return result;
}

function buildSkills(
  input: NonNullable<ProfileInput["skills"]>,
): ProfileSkill[] {
  const grouped = new Map<string, { name: string; aliases: string[] }>();
  for (const skill of input) {
    const name = clean(skill.name);
    if (name === "" || name.length > PROFILE_LIMITS.maxSkillLength) {
      continue;
    }
    const key = name.toLowerCase();
    const entry = grouped.get(key);
    if (entry === undefined) {
      if (grouped.size < PROFILE_LIMITS.maxSkills) {
        grouped.set(key, { name, aliases: [...(skill.aliases ?? [])] });
      }
    } else {
      entry.aliases.push(...(skill.aliases ?? []));
    }
  }
  return [...grouped.values()].map(({ name, aliases }) => ({
    name,
    aliases: uniqueTexts(
      aliases,
      PROFILE_LIMITS.maxAliases,
      PROFILE_LIMITS.maxSkillLength,
      [name],
    ),
  }));
}

function cleanSeniority(value: string | null | undefined): Seniority | null {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return isSeniority(normalized) ? normalized : null;
}

function cleanYears(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  if (value < 0 || value > PROFILE_LIMITS.maxYears) {
    return null;
  }
  return Math.round(value * 10) / 10;
}

export function buildProfile(input: ProfileInput): Profile {
  return {
    seniority: cleanSeniority(input.seniority),
    yearsOfExperience: cleanYears(input.yearsOfExperience),
    skills: buildSkills(input.skills ?? []),
    targetRoles: uniqueTexts(
      input.targetRoles ?? [],
      PROFILE_LIMITS.maxRoles,
      PROFILE_LIMITS.maxRoleLength,
    ),
    languages: uniqueTexts(
      input.languages ?? [],
      PROFILE_LIMITS.maxLanguages,
      PROFILE_LIMITS.maxLanguageLength,
    ),
    summary: clean(input.summary ?? "")
      .slice(0, PROFILE_LIMITS.maxSummaryLength)
      .trimEnd(),
  };
}
