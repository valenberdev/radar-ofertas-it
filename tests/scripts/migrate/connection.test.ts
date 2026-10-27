import { describe, expect, it } from "vitest";
import { assertDirectConnection } from "../../../scripts/migrate/connection.mts";

describe("assertDirectConnection", () => {
  it.each([
    "postgres://radar:radar@127.0.0.1:5435/radar",
    "postgresql://radar:radar@localhost:5432/radar",
    "postgresql://owner:secret@ep-cool-darkness-123456.us-east-2.aws.neon.tech/neondb?sslmode=require",
  ])("accepts the direct connection %s", (connectionString) => {
    expect(() => assertDirectConnection(connectionString)).not.toThrow();
  });

  it("rejects a pooled host", () => {
    expect(() =>
      assertDirectConnection(
        "postgresql://owner:secret@ep-cool-darkness-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require",
      ),
    ).toThrow(/points to a pooled connection/);
  });

  it("does not leak the password when rejecting a pooled host", () => {
    try {
      assertDirectConnection(
        "postgresql://owner:topsecret@ep-x-pooler.us-east-2.aws.neon.tech/neondb",
      );
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain("topsecret");
    }
  });

  it("rejects a string that is not a URL without echoing it", () => {
    try {
      assertDirectConnection("not-a-url-topsecret");
      expect.unreachable();
    } catch (error) {
      expect(String(error)).toMatch(/not a valid URL/);
      expect(String(error)).not.toContain("topsecret");
    }
  });
});
