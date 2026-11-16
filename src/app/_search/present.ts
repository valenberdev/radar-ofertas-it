import type { Locale } from "@/app/_i18n/config";
import type { SourceName } from "@/domain/source-offer";

export type ScoreBand = "excellent" | "good" | "partial" | "low";

export interface SourceInfo {
  readonly name: string;
  readonly url: string;
}

export const SOURCES: Readonly<Record<SourceName, SourceInfo>> = {
  himalayas: { name: "Himalayas", url: "https://himalayas.app" },
  hackernews: { name: "Hacker News", url: "https://news.ycombinator.com" },
};

export function scoreBand(score: number): ScoreBand {
  if (score >= 90) {
    return "excellent";
  }
  if (score >= 70) {
    return "good";
  }
  if (score >= 40) {
    return "partial";
  }
  return "low";
}

export function formatDate(
  iso: string,
  locale: Locale,
  timeZone?: string,
): string {
  return new Intl.DateTimeFormat(
    locale,
    timeZone === undefined
      ? { dateStyle: "medium" }
      : { dateStyle: "medium", timeZone },
  ).format(new Date(iso));
}

export function formatPostedDate(iso: string, locale: Locale): string {
  return formatDate(iso, locale, "UTC");
}
