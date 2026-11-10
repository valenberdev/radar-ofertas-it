import type { Persona, SnapshotOffer } from "./dataset.mts";
import { shuffled, type Random } from "./random.mts";

export interface LabelingItem {
  readonly persona: string;
  readonly offerKey: string;
  readonly contentHash: string;
  readonly title: string;
  readonly company: string | null;
  readonly url: string;
  readonly description: string;
  readonly postedAt: string | null;
}

export interface LabelingPersona {
  readonly id: string;
  readonly label: string;
  readonly seniority: string | null;
  readonly yearsOfExperience: number | null;
  readonly skills: readonly string[];
  readonly targetRoles: readonly string[];
  readonly cvText: string;
}

export function toLabelingItem(
  persona: string,
  offer: SnapshotOffer,
): LabelingItem {
  return {
    persona,
    offerKey: offer.key,
    contentHash: offer.contentHash,
    title: offer.title,
    company: offer.company,
    url: offer.url,
    description: offer.description,
    postedAt: offer.postedAt,
  };
}

export function toLabelingPersona(persona: Persona): LabelingPersona {
  if (persona.profile === null) {
    throw new Error(
      `Persona ${persona.id} has no extracted profile yet. Run npm run eval:personas first.`,
    );
  }
  return {
    id: persona.id,
    label: persona.label,
    seniority: persona.profile.seniority,
    yearsOfExperience: persona.profile.yearsOfExperience,
    skills: persona.profile.skills.map((skill) => skill.name),
    targetRoles: persona.profile.targetRoles,
    cvText: persona.cvText,
  };
}

export function orderItems(
  items: readonly LabelingItem[],
  personaIds: readonly string[],
  random: Random,
): LabelingItem[] {
  const known = new Set(personaIds);
  for (const item of items) {
    if (!known.has(item.persona)) {
      throw new Error(`Unknown persona ${item.persona}`);
    }
  }
  return personaIds.flatMap((id) =>
    shuffled(
      items.filter((item) => item.persona === id),
      random,
    ),
  );
}
