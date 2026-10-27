import { z } from "zod";
import type { JsonValue, SourceOffer } from "../../../domain/source-offer";

const MAX_UNIX_SECONDS = 4_102_444_800;

const unixSeconds = z.number().int().positive().max(MAX_UNIX_SECONDS);

const himalayasJobSchema = z.object({
  guid: z.string().min(1),
  title: z.string().trim().min(1),
  companyName: z.string().nullish(),
  applicationLink: z.string().regex(/^https?:\/\//i),
  description: z.string().min(1),
  pubDate: unixSeconds.nullish(),
  expiryDate: unixSeconds.nullish(),
});

function fromUnixSeconds(seconds: number | null | undefined): Date | null {
  return seconds === null || seconds === undefined
    ? null
    : new Date(seconds * 1000);
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map(
      (issue) =>
        `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`,
    )
    .join("; ");
}

export function mapHimalayasJob(raw: JsonValue): SourceOffer {
  const parsed = himalayasJobSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid Himalayas job: ${describeIssues(parsed.error)}`);
  }
  const job = parsed.data;
  return {
    source: "himalayas",
    sourceId: job.guid,
    title: job.title,
    company: job.companyName?.trim() || null,
    url: job.applicationLink,
    description: job.description,
    postedAt: fromUnixSeconds(job.pubDate),
    expiresAt: fromUnixSeconds(job.expiryDate),
    raw,
  };
}
