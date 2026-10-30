import { z } from "zod";

const postgresUrl = z
  .string()
  .regex(
    /^postgres(ql)?:\/\/.+/,
    "must be a PostgreSQL connection string starting with postgres:// or postgresql://",
  );

function optionalText(minLength: number) {
  return z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(minLength).optional(),
  );
}

const envSchema = z.object({
  DATABASE_URL: postgresUrl,
  DATABASE_URL_UNPOOLED: postgresUrl,
  CRON_SECRET: optionalText(16),
  HIMALAYAS_API_KEY: optionalText(1),
});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(details: string) {
    super(`Invalid environment variables:\n${details}`);
    this.name = "EnvError";
  }
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvError(z.prettifyError(result.error));
  }
  return result.data;
}
