import type { JsonValue, SourceOffer } from "../domain/source-offer";

const NUL = String.fromCharCode(0);
const REPLACEMENT = String.fromCharCode(0xfffd);
const LONE_SURROGATE = new RegExp(
  "[\\ud800-\\udbff](?![\\udc00-\\udfff])|(?<![\\ud800-\\udbff])[\\udc00-\\udfff]",
  "g",
);

function cleanString(value: string): string {
  return value.replaceAll(NUL, "").replace(LONE_SURROGATE, REPLACEMENT);
}

function cleanJson(value: JsonValue): JsonValue {
  if (typeof value === "string") {
    return cleanString(value);
  }
  if (Array.isArray(value)) {
    return value.map(cleanJson);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        cleanString(key),
        cleanJson(entry),
      ]),
    );
  }
  return value;
}

export function sanitizeOffer(offer: SourceOffer): SourceOffer {
  return {
    ...offer,
    sourceId: cleanString(offer.sourceId),
    title: cleanString(offer.title),
    company: offer.company === null ? null : cleanString(offer.company),
    url: cleanString(offer.url),
    description: cleanString(offer.description),
    raw: cleanJson(offer.raw),
  };
}
