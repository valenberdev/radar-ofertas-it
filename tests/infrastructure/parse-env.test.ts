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
});
