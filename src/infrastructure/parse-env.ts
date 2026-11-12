import { z } from "zod";

const postgresUrl = z
  .string()
  .regex(
    /^postgres(ql)?:\/\/.+/,
    "must be a PostgreSQL connection string starting with postgres:// or postgresql://",
  );

function blankToUndefined(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

function optionalText(minLength: number) {
  return z.preprocess(
    blankToUndefined,
    z.string().trim().min(minLength).optional(),
  );
}

function optionalPositiveInteger() {
  return z.preprocess(
    blankToUndefined,
    z
      .string()
      .trim()
      .regex(/^[1-9]\d*$/, "must be a positive whole number")
      .transform(Number)
      .optional(),
  );
}

const GEMINI_SETTINGS = [
  "GEMINI_MODEL",
  "GEMINI_DAILY_LIMIT",
  "DEMO_DAILY_LIMIT",
] as const;

const envSchema = z
  .object({
    DATABASE_URL: postgresUrl,
    DATABASE_URL_UNPOOLED: postgresUrl,
    CRON_SECRET: optionalText(16),
    HIMALAYAS_API_KEY: optionalText(1),
    GEMINI_API_KEY: optionalText(1),
    GEMINI_MODEL: optionalText(1),
    GEMINI_DAILY_LIMIT: optionalPositiveInteger(),
    DEMO_DAILY_LIMIT: optionalPositiveInteger(),
    OWNER_SECRET: optionalText(32),
  })
  .superRefine((env, context) => {
    if (env.GEMINI_API_KEY !== undefined) {
      for (const name of GEMINI_SETTINGS) {
        if (env[name] === undefined) {
          context.addIssue({
            code: "custom",
            path: [name],
            message: "is required when GEMINI_API_KEY is set",
          });
        }
      }
    }
    if (
      env.GEMINI_DAILY_LIMIT !== undefined &&
      env.DEMO_DAILY_LIMIT !== undefined &&
      env.DEMO_DAILY_LIMIT > env.GEMINI_DAILY_LIMIT
    ) {
      context.addIssue({
        code: "custom",
        path: ["DEMO_DAILY_LIMIT"],
        message: "must not be greater than GEMINI_DAILY_LIMIT",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export interface GeminiConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly dailyLimit: number;
  readonly demoDailyLimit: number;
}

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

export function geminiConfig(env: Env): GeminiConfig | null {
  const { GEMINI_API_KEY, GEMINI_MODEL, GEMINI_DAILY_LIMIT, DEMO_DAILY_LIMIT } =
    env;
  if (
    GEMINI_API_KEY === undefined ||
    GEMINI_MODEL === undefined ||
    GEMINI_DAILY_LIMIT === undefined ||
    DEMO_DAILY_LIMIT === undefined
  ) {
    return null;
  }
  return {
    apiKey: GEMINI_API_KEY,
    model: GEMINI_MODEL,
    dailyLimit: GEMINI_DAILY_LIMIT,
    demoDailyLimit: DEMO_DAILY_LIMIT,
  };
}
