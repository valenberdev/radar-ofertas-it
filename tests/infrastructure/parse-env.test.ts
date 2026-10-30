import { describe, expect, it } from "vitest";
import { EnvError, parseEnv } from "../../src/infrastructure/parse-env";

const valid = {
  DATABASE_URL:
    "postgresql://app_user:s3cret-pooled@pooler.example.com/radar?sslmode=require",
  DATABASE_URL_UNPOOLED:
    "postgresql://app_user:s3cret-direct@direct.example.com/radar?sslmode=require",
};

function without(name: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(valid).filter(([key]) => key !== name),
  );
}

function messageOf(act: () => unknown): string {
  try {
    act();
  } catch (error) {
    return error instanceof Error ? error.message : "";
  }
  return "";
}

describe("parseEnv", () => {
  it("returns the parsed variables when everything is valid", () => {
    expect(parseEnv(valid)).toEqual(valid);
  });

  it("accepts the postgres:// scheme as well as postgresql://", () => {
    const input = {
      ...valid,
      DATABASE_URL: "postgres://app_user:pw@localhost:5433/radar",
    };
    expect(parseEnv(input).DATABASE_URL).toBe(input.DATABASE_URL);
  });

  it("drops variables that are not part of the schema", () => {
    expect(parseEnv({ ...valid, PATH: "/usr/bin" })).toEqual(valid);
  });

  it.each(["DATABASE_URL", "DATABASE_URL_UNPOOLED"])(
    "throws an EnvError naming %s when it is missing",
    (name) => {
      const act = () => parseEnv(without(name));
      expect(act).toThrow(EnvError);
      expect(messageOf(act)).toContain(name);
    },
  );

  it("rejects an empty value and names the variable", () => {
    const act = () => parseEnv({ ...valid, DATABASE_URL: "" });
    expect(act).toThrow(EnvError);
    expect(messageOf(act)).toMatch(/DATABASE_URL$/m);
  });

  it("rejects a URL that is not a PostgreSQL connection string", () => {
    const act = () =>
      parseEnv({ ...valid, DATABASE_URL_UNPOOLED: "mysql://u:p@host/db" });
    expect(act).toThrow(EnvError);
    expect(messageOf(act)).toMatch(/DATABASE_URL_UNPOOLED$/m);
  });

  it("reports every problem at once", () => {
    const message = messageOf(() => parseEnv({}));
    expect(message).toMatch(/DATABASE_URL$/m);
    expect(message).toMatch(/DATABASE_URL_UNPOOLED$/m);
  });

  it("never echoes the rejected value in the error message", () => {
    const message = messageOf(() =>
      parseEnv({ ...valid, DATABASE_URL: "mysql://u:hunter2@host/db" }),
    );
    expect(message).not.toBe("");
    expect(message).not.toContain("hunter2");
  });

  describe("optional ingestion variables", () => {
    const secret = "0123456789abcdef";

    it("leaves them undefined when they are missing", () => {
      const parsed = parseEnv(valid);

      expect(parsed.CRON_SECRET).toBeUndefined();
      expect(parsed.HIMALAYAS_API_KEY).toBeUndefined();
    });

    it("returns them when they are present", () => {
      const parsed = parseEnv({
        ...valid,
        CRON_SECRET: secret,
        HIMALAYAS_API_KEY: "hml_example",
      });

      expect(parsed.CRON_SECRET).toBe(secret);
      expect(parsed.HIMALAYAS_API_KEY).toBe("hml_example");
    });

    it.each(["CRON_SECRET", "HIMALAYAS_API_KEY"])(
      "treats an empty %s as missing",
      (name) => {
        expect(
          parseEnv({ ...valid, [name]: "" })[name as "CRON_SECRET"],
        ).toBeUndefined();
      },
    );

    it.each(["CRON_SECRET", "HIMALAYAS_API_KEY"])(
      "treats a blank %s as missing",
      (name) => {
        expect(
          parseEnv({ ...valid, [name]: "   \r\n" })[name as "CRON_SECRET"],
        ).toBeUndefined();
      },
    );

    it("trims surrounding whitespace from the values", () => {
      const parsed = parseEnv({
        ...valid,
        CRON_SECRET: ` ${secret}\r\n`,
        HIMALAYAS_API_KEY: " hml_example \n",
      });

      expect(parsed.CRON_SECRET).toBe(secret);
      expect(parsed.HIMALAYAS_API_KEY).toBe("hml_example");
    });

    it("accepts a cron secret of exactly sixteen characters", () => {
      expect(parseEnv({ ...valid, CRON_SECRET: secret }).CRON_SECRET).toBe(
        secret,
      );
    });

    it("rejects a cron secret shorter than sixteen characters without echoing it", () => {
      const act = () => parseEnv({ ...valid, CRON_SECRET: "hunter2-short" });

      expect(act).toThrow(EnvError);
      expect(messageOf(act)).toMatch(/CRON_SECRET$/m);
      expect(messageOf(act)).not.toContain("hunter2-short");
    });

    it("measures the cron secret length after trimming it", () => {
      const act = () =>
        parseEnv({ ...valid, CRON_SECRET: `  ${secret.slice(0, 15)}  ` });

      expect(act).toThrow(EnvError);
    });
  });
});
