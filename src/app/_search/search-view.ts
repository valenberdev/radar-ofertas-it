import type { ScoringStop } from "@/application/match-offers";
import type { SearchOffersResult } from "@/application/search-offers";
import type { StoredOffer } from "@/application/ports/offer-reader";
import type { SourceName } from "@/domain/source-offer";

export interface OfferView {
  readonly id: string;
  readonly source: SourceName;
  readonly title: string;
  readonly company: string | null;
  readonly url: string | null;
  readonly postedAt: string | null;
  readonly firstSeenAt: string;
  readonly matchedSkills: readonly string[];
  readonly score: number | null;
  readonly reason: { readonly es: string; readonly en: string } | null;
}

export interface SearchView {
  readonly profile: {
    readonly seniority: string | null;
    readonly yearsOfExperience: number | null;
    readonly skills: readonly string[];
  };
  readonly profileFromCache: boolean;
  readonly eligibleCount: number;
  readonly offers: readonly OfferView[];
  readonly unscoredCount: number;
  readonly scoringStoppedBy: ScoringStop | null;
}

export function safeUrl(url: string): string | null {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function baseView(
  offer: StoredOffer,
  matchedSkills: readonly string[],
): Omit<OfferView, "score" | "reason"> {
  return {
    id: offer.id,
    source: offer.source,
    title: offer.title,
    company: offer.company,
    url: safeUrl(offer.url),
    postedAt: offer.postedAt === null ? null : offer.postedAt.toISOString(),
    firstSeenAt: offer.firstSeenAt.toISOString(),
    matchedSkills,
  };
}

export function toSearchView(
  result: Extract<SearchOffersResult, { ok: true }>,
): SearchView {
  const { profile, match } = result;
  return {
    profile: {
      seniority: profile.seniority,
      yearsOfExperience: profile.yearsOfExperience,
      skills: profile.skills.map((skill) => skill.name),
    },
    profileFromCache: result.profileFromCache,
    eligibleCount: match.eligibleCount,
    offers: [
      ...match.matches.map((entry) => ({
        ...baseView(entry.offer, entry.matchedSkills),
        score: entry.score,
        reason: { es: entry.reasonEs, en: entry.reasonEn },
      })),
      ...match.unscored.map((entry) => ({
        ...baseView(entry.offer, entry.matchedSkills),
        score: null,
        reason: null,
      })),
    ],
    unscoredCount: match.unscored.length,
    scoringStoppedBy: match.stoppedBy,
  };
}
