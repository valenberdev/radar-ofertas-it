import { createHash } from "node:crypto";
import { z } from "zod";
import { buildProfile, type Profile } from "../../src/domain/profile";

export const BANDS = [0, 1, 2, 3] as const;

export type Band = (typeof BANDS)[number];

export const PERSONA_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SNAPSHOT_ID = /^\d{4}-\d{2}-\d{2}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export function offerKey(source: string, sourceId: string): string {
  return `${source}:${sourceId}`;
}

export function contentHash(offer: {
  title: string;
  company: string | null;
  description: string;
}): string {
  return createHash("sha256")
    .update(JSON.stringify([offer.title, offer.company, offer.description]))
    .digest("hex");
}

const profileShape = z.object({
  seniority: z.string().nullable(),
  yearsOfExperience: z.number().nullable(),
  skills: z.array(z.object({ name: z.string(), aliases: z.array(z.string()) })),
  targetRoles: z.array(z.string()),
  languages: z.array(z.string()),
  summary: z.string(),
});

const personaSchema = z.object({
  id: z.string().regex(PERSONA_ID),
  label: z.string().min(1),
  cvText: z.string().min(1),
  profile: profileShape.nullable(),
});

const snapshotOfferSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  source: z.string().min(1),
  sourceId: z.string().min(1),
  title: z.string(),
  company: z.string().nullable(),
  url: z.string().min(1),
  description: z.string(),
  postedAt: z.iso.datetime().nullable(),
  contentHash: z.string().regex(SHA256),
});

const snapshotSchema = z
  .object({
    snapshotId: z.string().regex(SNAPSHOT_ID),
    country: z.string().min(1),
    capturedAt: z.iso.datetime(),
    offers: z.array(snapshotOfferSchema),
  })
  .superRefine((snapshot, context) => {
    const seen = new Set<string>();
    snapshot.offers.forEach((offer, index) => {
      if (seen.has(offer.key)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate offer key",
          path: ["offers", index, "key"],
        });
      }
      seen.add(offer.key);
    });
  });

const labelSchema = z.object({
  persona: z.string().regex(PERSONA_ID),
  offerKey: z.string().min(1),
  contentHash: z.string().regex(SHA256),
  title: z.string(),
  company: z.string().nullable(),
  url: z.string().min(1),
  band: z.literal([0, 1, 2, 3]),
});

const labelsFileSchema = z
  .object({
    snapshotId: z.string().regex(SNAPSHOT_ID),
    labels: z.array(labelSchema),
  })
  .superRefine((file, context) => {
    const seen = new Set<string>();
    file.labels.forEach((label, index) => {
      const id = `${label.persona}|${label.offerKey}`;
      if (seen.has(id)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate label",
          path: ["labels", index],
        });
      }
      seen.add(id);
    });
  });

export interface Persona {
  readonly id: string;
  readonly label: string;
  readonly cvText: string;
  readonly profile: Profile | null;
}

export type SnapshotOffer = z.infer<typeof snapshotOfferSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Label = z.infer<typeof labelSchema>;
export type LabelsFile = z.infer<typeof labelsFileSchema>;

export function failure(what: string, error: z.ZodError): Error {
  const issue = error.issues[0];
  const location =
    issue === undefined || issue.path.length === 0
      ? ""
      : ` at ${issue.path.map(String).join(".")}`;
  return new Error(
    `Invalid ${what}${location}: ${issue?.message ?? "unknown problem"}`,
  );
}

export function parsePersona(value: unknown): Persona {
  const result = personaSchema.safeParse(value);
  if (!result.success) {
    throw failure("persona file", result.error);
  }
  const { id, label, cvText, profile } = result.data;
  return {
    id,
    label,
    cvText,
    profile: profile === null ? null : buildProfile(profile),
  };
}

export function parseSnapshot(value: unknown): Snapshot {
  const result = snapshotSchema.safeParse(value);
  if (!result.success) {
    throw failure("snapshot", result.error);
  }
  return result.data;
}

export function parseLabels(value: unknown): LabelsFile {
  const result = labelsFileSchema.safeParse(value);
  if (!result.success) {
    throw failure("labels file", result.error);
  }
  return result.data;
}
