import type { Profile } from "./profile";

export const DEFAULT_TOP_K = 30;
export const TITLE_WEIGHT = 3;
export const DESCRIPTION_WEIGHT = 1;
const SHORT_TERM_LENGTH = 2;

export interface PrefilterOffer {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly postedAt: Date | null;
}

export interface PrefilterMatch<T extends PrefilterOffer> {
  readonly offer: T;
  readonly matchedSkills: readonly string[];
  readonly score: number;
}

interface Matcher {
  readonly exact: boolean;
  readonly pattern: RegExp;
}

interface CompiledSkill {
  readonly name: string;
  readonly matchers: readonly Matcher[];
}

interface SearchableText {
  readonly loose: string;
  readonly exact: string;
}

function simplify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[-_\s]+/g, " ")
    .trim();
}

function searchable(text: string): SearchableText {
  const exact = simplify(text);
  return { loose: exact.toLowerCase(), exact };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compile(term: string): Matcher | null {
  const simplified = simplify(term);
  if (simplified === "") {
    return null;
  }
  const exact = [...simplified].length <= SHORT_TERM_LENGTH;
  const body = escapeRegExp(exact ? simplified : simplified.toLowerCase());
  return {
    exact,
    pattern: new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}+#])`, "u"),
  };
}

function compileSkill(name: string, aliases: readonly string[]): CompiledSkill {
  const matchers = [name, ...aliases]
    .map(compile)
    .filter((matcher): matcher is Matcher => matcher !== null);
  return { name, matchers };
}

function mentions(skill: CompiledSkill, text: SearchableText): boolean {
  return skill.matchers.some((matcher) =>
    matcher.pattern.test(matcher.exact ? text.exact : text.loose),
  );
}

function compareIdsDescending(first: string, second: string): number {
  if (first.length !== second.length) {
    return second.length - first.length;
  }
  return first < second ? 1 : first > second ? -1 : 0;
}

function compareDatesDescending(
  first: Date | null,
  second: Date | null,
): number {
  if (first === null || second === null) {
    return first === second ? 0 : first === null ? 1 : -1;
  }
  return second.getTime() - first.getTime();
}

export function prefilterOffers<T extends PrefilterOffer>(
  profile: Profile,
  offers: readonly T[],
  limit: number = DEFAULT_TOP_K,
): PrefilterMatch<T>[] {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError("The limit must be a positive integer");
  }

  const skills = profile.skills.map((skill) =>
    compileSkill(skill.name, skill.aliases),
  );
  const matches: PrefilterMatch<T>[] = [];

  for (const offer of offers) {
    const title = searchable(offer.title);
    const description = searchable(offer.description);
    const matchedSkills: string[] = [];
    let score = 0;

    for (const skill of skills) {
      if (mentions(skill, title)) {
        score += TITLE_WEIGHT;
      } else if (mentions(skill, description)) {
        score += DESCRIPTION_WEIGHT;
      } else {
        continue;
      }
      matchedSkills.push(skill.name);
    }

    if (score > 0) {
      matches.push({ offer, matchedSkills, score });
    }
  }

  return matches
    .sort(
      (first, second) =>
        second.score - first.score ||
        compareDatesDescending(first.offer.postedAt, second.offer.postedAt) ||
        compareIdsDescending(first.offer.id, second.offer.id),
    )
    .slice(0, limit);
}
