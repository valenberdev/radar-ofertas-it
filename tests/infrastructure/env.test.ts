import { afterEach, describe, expect, it, vi } from "vitest";

const pooled =
  "postgresql://app_user:pw@pooler.example.com/radar?sslmode=require";
const direct =
  "postgresql://app_user:pw@direct.example.com/radar?sslmode=require";

async function importEnv() {
  return import("@/infrastructure/env");
}

describe("env module", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("exposes the validated variables when the environment is valid", async () => {
    vi.stubEnv("DATABASE_URL", pooled);
    vi.stubEnv("DATABASE_URL_UNPOOLED", direct);

    const { env } = await importEnv();

    expect(env.DATABASE_URL).toBe(pooled);
    expect(env.DATABASE_URL_UNPOOLED).toBe(direct);
  });

  it("fails on import and names the missing variable", async () => {
    vi.stubEnv("DATABASE_URL", pooled);
    vi.stubEnv("DATABASE_URL_UNPOOLED", undefined);

    await expect(importEnv()).rejects.toMatchObject({
      name: "EnvError",
      message: expect.stringContaining("DATABASE_URL_UNPOOLED"),
    });
  });
});
