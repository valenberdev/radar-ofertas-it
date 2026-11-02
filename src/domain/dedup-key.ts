import { createHash } from "node:crypto";
import type { SourceName, SourceOffer } from "./source-offer";

export type DedupKeyInput = Pick<
  SourceOffer,
  "source" | "company" | "title" | "description"
>;

const KEY_USES_DESCRIPTION: Record<SourceName, boolean> = {
  himalayas: true,
  hackernews: false,
};

function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function dedupKey(offer: DedupKeyInput): string {
  const parts = [
    offer.source,
    normalizeText(offer.company ?? ""),
    normalizeText(offer.title),
  ];
  if (KEY_USES_DESCRIPTION[offer.source]) {
    parts.push(offer.description);
  }
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}
