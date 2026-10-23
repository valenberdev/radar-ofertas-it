import { defaultLocale, isLocale, type Locale } from "./config";

export type NegotiationInput = {
  cookie?: string | null | undefined;
  acceptLanguage?: string | null | undefined;
};

type Candidate = { locale: Locale; quality: number; position: number };

export function negotiateLocale({
  cookie,
  acceptLanguage,
}: NegotiationInput): Locale {
  if (cookie && isLocale(cookie)) {
    return cookie;
  }
  return fromAcceptLanguage(acceptLanguage ?? "") ?? defaultLocale;
}

function fromAcceptLanguage(header: string): Locale | undefined {
  const candidates: Candidate[] = [];

  header.split(",").forEach((entry, position) => {
    const [rawTag = "", ...params] = entry.split(";");
    const primary = rawTag.trim().toLowerCase().split("-")[0] ?? "";
    if (!isLocale(primary)) {
      return;
    }
    const quality = parseQuality(params);
    if (quality === undefined || quality === 0) {
      return;
    }
    candidates.push({ locale: primary, quality, position });
  });

  candidates.sort((a, b) => b.quality - a.quality || a.position - b.position);
  return candidates[0]?.locale;
}

const QVALUE = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/;

function parseQuality(params: string[]): number | undefined {
  for (const param of params) {
    const [name, value = ""] = param.split("=").map((part) => part.trim());
    if (name?.toLowerCase() !== "q") {
      continue;
    }
    return QVALUE.test(value) ? Number(value) : undefined;
  }
  return 1;
}
