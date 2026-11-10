import { createHash } from "node:crypto";
import { clipText } from "./clip-text";
import { redactPersonalData } from "./redact-personal-data";

export const MAX_OFFER_DESCRIPTION_LENGTH = 1500;

export interface ScorableOffer {
  readonly title: string;
  readonly company: string | null;
  readonly description: string;
}

function clean(text: string): string {
  return redactPersonalData(text).replace(/\s+/g, " ").trim();
}

export function toScorableOffer(offer: ScorableOffer): ScorableOffer {
  const company = offer.company === null ? "" : clean(offer.company);
  return {
    title: clean(offer.title),
    company: company === "" ? null : company,
    description: clipText(
      clean(offer.description),
      MAX_OFFER_DESCRIPTION_LENGTH,
    ),
  };
}

export function scorableOfferHash(offer: ScorableOffer): string {
  return createHash("sha256")
    .update(JSON.stringify([offer.title, offer.company, offer.description]))
    .digest("hex");
}
