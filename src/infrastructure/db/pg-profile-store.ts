import type { Pool } from "pg";
import { z } from "zod";
import type {
  ProfileCacheKey,
  ProfileStore,
} from "../../application/ports/profile-store";
import { buildProfile, type Profile } from "../../domain/profile";

const FIND_SQL = `
update profiles
set last_used_at = $3
where text_hash = $1 and extractor_id = $2
returning profile
`;

const SAVE_SQL = `
insert into profiles (text_hash, extractor_id, profile, created_at, last_used_at)
values ($1, $2, $3::jsonb, $4, $4)
on conflict (text_hash, extractor_id) do update
set profile = excluded.profile, last_used_at = excluded.last_used_at
`;

const storedProfileSchema = z.object({
  seniority: z.string().nullable(),
  yearsOfExperience: z.number().nullable(),
  skills: z.array(z.object({ name: z.string(), aliases: z.array(z.string()) })),
  targetRoles: z.array(z.string()),
  languages: z.array(z.string()),
  summary: z.string(),
});

export function createPgProfileStore(db: Pick<Pool, "query">): ProfileStore {
  return {
    async find(key: ProfileCacheKey, at: Date): Promise<Profile | null> {
      const result = await db.query<{ profile: unknown }>(FIND_SQL, [
        key.textHash,
        key.extractorId,
        at.toISOString(),
      ]);
      const row = result.rows[0];
      if (row === undefined) {
        return null;
      }
      const stored = storedProfileSchema.safeParse(row.profile);
      return stored.success ? buildProfile(stored.data) : null;
    },

    async save(
      key: ProfileCacheKey,
      profile: Profile,
      at: Date,
    ): Promise<void> {
      await db.query(SAVE_SQL, [
        key.textHash,
        key.extractorId,
        JSON.stringify(profile),
        at.toISOString(),
      ]);
    },
  };
}
