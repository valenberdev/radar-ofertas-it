import { describe, expect, it } from "vitest";
import {
  createOwnerSessionToken,
  isOwnerSecret,
  OWNER_SESSION_COOKIE,
  OWNER_SESSION_TTL_MS,
  verifyOwnerSessionToken,
} from "../../../src/infrastructure/auth/owner-session";

const SECRET = "a".repeat(32);
const OTHER_SECRET = "b".repeat(32);
const NOW = new Date("2026-11-11T20:00:00.000Z");

function later(ms: number): Date {
  return new Date(NOW.getTime() + ms);
}

function parts(token: string): [string, string, string] {
  const [version = "", expiresAt = "", signature = ""] = token.split(".");
  return [version, expiresAt, signature];
}

describe("isOwnerSecret", () => {
  it("accepts the same secret", () => {
    expect(isOwnerSecret(SECRET, SECRET)).toBe(true);
  });

  it.each([
    ["another secret of the same length", OTHER_SECRET],
    ["a shorter text", "a".repeat(31)],
    ["a longer text", "a".repeat(33)],
    ["an empty text", ""],
    ["the secret with spaces around it", ` ${SECRET} `],
  ])("rejects %s", (_name, candidate) => {
    expect(isOwnerSecret(SECRET, candidate)).toBe(false);
  });
});

describe("createOwnerSessionToken", () => {
  it("has a version, the expiry time and a signature", () => {
    const [version, expiresAt, signature] = parts(
      createOwnerSessionToken(SECRET, NOW),
    );

    expect(version).toBe("v1");
    expect(Number(expiresAt)).toBe(NOW.getTime() + OWNER_SESSION_TTL_MS);
    expect(signature).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("lasts thirty days", () => {
    expect(OWNER_SESSION_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("does not contain the secret", () => {
    expect(createOwnerSessionToken(SECRET, NOW)).not.toContain(SECRET);
  });

  it("is the same for the same secret and time", () => {
    expect(createOwnerSessionToken(SECRET, NOW)).toBe(
      createOwnerSessionToken(SECRET, NOW),
    );
  });

  it("changes with the secret", () => {
    expect(createOwnerSessionToken(SECRET, NOW)).not.toBe(
      createOwnerSessionToken(OTHER_SECRET, NOW),
    );
  });

  it("changes with the time", () => {
    expect(createOwnerSessionToken(SECRET, NOW)).not.toBe(
      createOwnerSessionToken(SECRET, later(1)),
    );
  });

  it("uses a cookie name of its own", () => {
    expect(OWNER_SESSION_COOKIE).toBe("radar_owner");
  });
});

describe("verifyOwnerSessionToken", () => {
  const token = createOwnerSessionToken(SECRET, NOW);

  it("accepts a token it created", () => {
    expect(verifyOwnerSessionToken(SECRET, token, NOW)).toBe(true);
  });

  it("accepts the token until just before it expires", () => {
    expect(
      verifyOwnerSessionToken(SECRET, token, later(OWNER_SESSION_TTL_MS - 1)),
    ).toBe(true);
  });

  it("rejects the token from the moment it expires", () => {
    expect(
      verifyOwnerSessionToken(SECRET, token, later(OWNER_SESSION_TTL_MS)),
    ).toBe(false);
  });

  it("rejects a token signed with another secret", () => {
    expect(verifyOwnerSessionToken(OTHER_SECRET, token, NOW)).toBe(false);
  });

  it("rejects a token whose expiry was pushed forward", () => {
    const [version, expiresAt, signature] = parts(token);
    const forged = `${version}.${Number(expiresAt) + OWNER_SESSION_TTL_MS}.${signature}`;

    expect(
      verifyOwnerSessionToken(SECRET, forged, later(OWNER_SESSION_TTL_MS)),
    ).toBe(false);
  });

  it("rejects a token with a changed signature", () => {
    const [version, expiresAt, signature] = parts(token);
    const changed = `${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`;

    expect(
      verifyOwnerSessionToken(
        SECRET,
        `${version}.${expiresAt}.${changed}`,
        NOW,
      ),
    ).toBe(false);
  });

  it("rejects another version", () => {
    const [, expiresAt, signature] = parts(token);

    expect(
      verifyOwnerSessionToken(SECRET, `v2.${expiresAt}.${signature}`, NOW),
    ).toBe(false);
  });

  it.each([
    ["no token", undefined],
    ["an empty token", ""],
    ["a token without parts", "v1.."],
    ["a token with an extra part", `${token}.extra`],
    ["a token with spaces", ` ${token}`],
    [
      "a token with a short signature",
      `${parts(token)[0]}.${parts(token)[1]}.abc`,
    ],
    ["a token with a negative expiry", `v1.-5.${parts(token)[2]}`],
    ["a token with a decimal expiry", `v1.1.5.${parts(token)[2]}`],
    ["the secret itself", SECRET],
  ])("rejects %s", (_name, value) => {
    expect(verifyOwnerSessionToken(SECRET, value, NOW)).toBe(false);
  });
});
