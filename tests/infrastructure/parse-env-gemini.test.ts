import { describe, expect, it } from "vitest";
import {
  EnvError,
  geminiConfig,
  parseEnv,
} from "../../src/infrastructure/parse-env";

const BASE = {
  DATABASE_URL: "postgres://user:pass@localhost:5435/radar",
  DATABASE_URL_UNPOOLED: "postgres://user:pass@localhost:5435/radar",
};

const GEMINI = {
  GEMINI_API_KEY: "test-key",
  GEMINI_MODEL: "gemini-test",
  GEMINI_DAILY_LIMIT: "500",
  DEMO_DAILY_LIMIT: "300",
};

const SECRET = "s".repeat(32);

function errorMessage(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("Expected the action to throw");
}

describe("parseEnv with the Gemini settings", () => {
  it("accepts an environment without Gemini", () => {
    const env = parseEnv(BASE);

    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(geminiConfig(env)).toBeNull();
  });

  it("reads the complete Gemini settings", () => {
    expect(geminiConfig(parseEnv({ ...BASE, ...GEMINI }))).toEqual({
      apiKey: "test-key",
      model: "gemini-test",
      dailyLimit: 500,
      demoDailyLimit: 300,
    });
  });

  it("trims the values", () => {
    const env = parseEnv({
      ...BASE,
      ...GEMINI,
      GEMINI_MODEL: "  gemini-test  ",
      GEMINI_DAILY_LIMIT: " 500 ",
    });

    expect(geminiConfig(env)).toMatchObject({
      model: "gemini-test",
      dailyLimit: 500,
    });
  });

  it("treats blank values as missing", () => {
    const env = parseEnv({
      ...BASE,
      GEMINI_API_KEY: "  ",
      GEMINI_MODEL: "",
      GEMINI_DAILY_LIMIT: " ",
      DEMO_DAILY_LIMIT: "",
    });

    expect(geminiConfig(env)).toBeNull();
  });

  it.each(["GEMINI_MODEL", "GEMINI_DAILY_LIMIT", "DEMO_DAILY_LIMIT"])(
    "requires %s when the key is set",
    (name) => {
      expect(() => parseEnv({ ...BASE, ...GEMINI, [name]: undefined })).toThrow(
        `is required when GEMINI_API_KEY is set\n  → at ${name}`,
      );
    },
  );

  it("names every missing setting at once", () => {
    const message = errorMessage(() =>
      parseEnv({ ...BASE, GEMINI_API_KEY: "test-key" }),
    );

    expect(message).toContain("GEMINI_MODEL");
    expect(message).toContain("GEMINI_DAILY_LIMIT");
    expect(message).toContain("DEMO_DAILY_LIMIT");
  });

  it("does not require the other settings without the key", () => {
    expect(
      geminiConfig(parseEnv({ ...BASE, GEMINI_MODEL: "gemini-test" })),
    ).toBeNull();
  });

  it.each(["0", "-1", "1.5", "abc", "1e3", "007"])(
    "rejects the limit %j",
    (value) => {
      expect(() =>
        parseEnv({ ...BASE, ...GEMINI, DEMO_DAILY_LIMIT: value }),
      ).toThrow("must be a positive whole number\n  → at DEMO_DAILY_LIMIT");
      expect(() =>
        parseEnv({ ...BASE, ...GEMINI, GEMINI_DAILY_LIMIT: value }),
      ).toThrow(EnvError);
    },
  );

  it("accepts a demo limit equal to the total", () => {
    expect(
      geminiConfig(parseEnv({ ...BASE, ...GEMINI, DEMO_DAILY_LIMIT: "500" }))
        ?.demoDailyLimit,
    ).toBe(500);
  });

  it("rejects a demo limit above the total", () => {
    expect(() =>
      parseEnv({ ...BASE, ...GEMINI, DEMO_DAILY_LIMIT: "501" }),
    ).toThrow(
      "must not be greater than GEMINI_DAILY_LIMIT\n  → at DEMO_DAILY_LIMIT",
    );
  });

  it("does not show the key in the error", () => {
    const message = errorMessage(() =>
      parseEnv({
        ...BASE,
        ...GEMINI,
        GEMINI_API_KEY: "super-secret-key",
        GEMINI_MODEL: "",
      }),
    );

    expect(message).toContain("GEMINI_MODEL");
    expect(message).not.toContain("super-secret-key");
  });
});

describe("parseEnv with the owner secret", () => {
  it("accepts a secret of 32 characters", () => {
    expect(parseEnv({ ...BASE, OWNER_SECRET: SECRET }).OWNER_SECRET).toBe(
      SECRET,
    );
  });

  it("rejects a secret shorter than 32 characters", () => {
    expect(() => parseEnv({ ...BASE, OWNER_SECRET: "s".repeat(31) })).toThrow(
      /OWNER_SECRET/,
    );
  });

  it("treats a blank secret as missing", () => {
    expect(
      parseEnv({ ...BASE, OWNER_SECRET: " " }).OWNER_SECRET,
    ).toBeUndefined();
  });

  it("does not need Gemini", () => {
    expect(() => parseEnv({ ...BASE, OWNER_SECRET: SECRET })).not.toThrow();
  });
});
