import { z } from "zod";
import type { JsonValue, SourceOffer } from "../../../domain/source-offer";
import { htmlToText } from "./html-to-text";

const MAX_UNIX_SECONDS = 4_102_444_800;
const TITLE_MAX_LENGTH = 160;
const COMPANY_MAX_LENGTH = 60;
const OFFER_LIFETIME_DAYS = 45;
const MS_PER_DAY = 86_400_000;
const REMOTE = /remote/i;
const TRAILING_URL = /\s*\(\s*https?:\/\/[^)]*\)\s*$/i;

const identitySchema = z.object({
  id: z.number().int().positive(),
  time: z.number().int().positive().max(MAX_UNIX_SECONDS),
});

export type ParsedComment =
  | { readonly kind: "offer"; readonly offer: SourceOffer }
  | { readonly kind: "skipped" }
  | { readonly kind: "rejected"; readonly reason: string };

const SKIPPED: ParsedComment = { kind: "skipped" };

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map(
      (issue) =>
        `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`,
    )
    .join("; ");
}

function clip(text: string, maxLength: number): string {
  const characters = [...text];
  if (characters.length <= maxLength) {
    return text;
  }
  return `${characters
    .slice(0, maxLength - 1)
    .join("")
    .trimEnd()}…`;
}

function extractCompany(header: string): string | null {
  const segments = header.split("|").map((segment) => segment.trim());
  if (segments.length < 3) {
    return null;
  }
  const first = (segments[0] ?? "").replace(TRAILING_URL, "").trim();
  if (
    first === "" ||
    [...first].length > COMPANY_MAX_LENGTH ||
    /^https?:\/\//i.test(first)
  ) {
    return null;
  }
  return first;
}

export function parseHackerNewsComment(item: JsonValue): ParsedComment {
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    return { kind: "rejected", reason: "item is not an object" };
  }
  if (item.deleted === true || item.dead === true) {
    return SKIPPED;
  }
  const text = item.text;
  if (typeof text !== "string" || text.trim() === "") {
    return SKIPPED;
  }

  const identity = identitySchema.safeParse(item);
  if (!identity.success) {
    return { kind: "rejected", reason: describeIssues(identity.error) };
  }

  const description = htmlToText(text);
  if (!REMOTE.test(description)) {
    return SKIPPED;
  }

  const header = (description.split("\n")[0] ?? "").replace(/\s+/g, " ").trim();
  const postedAt = new Date(identity.data.time * 1000);
  return {
    kind: "offer",
    offer: {
      source: "hackernews",
      sourceId: String(identity.data.id),
      title: clip(header, TITLE_MAX_LENGTH),
      company: extractCompany(header),
      url: `https://news.ycombinator.com/item?id=${identity.data.id}`,
      description,
      postedAt,
      expiresAt: new Date(
        postedAt.getTime() + OFFER_LIFETIME_DAYS * MS_PER_DAY,
      ),
      raw: item,
    },
  };
}
