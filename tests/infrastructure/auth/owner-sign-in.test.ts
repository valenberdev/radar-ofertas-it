import { describe, expect, it } from "vitest";
import {
  OWNER_SESSION_COOKIE,
  verifyOwnerSessionToken,
} from "../../../src/infrastructure/auth/owner-session";
import {
  checkOwnerSignIn,
  MAX_SECRET_INPUT_LENGTH,
} from "../../../src/infrastructure/auth/owner-sign-in";

const SECRET = "a".repeat(32);
const NOW = new Date("2026-11-11T20:00:00.000Z");

describe("checkOwnerSignIn", () => {
  it("gives a session cookie for the right secret", () => {
    const result = checkOwnerSignIn(SECRET, SECRET, NOW, true);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cookie.name).toBe(OWNER_SESSION_COOKIE);
      expect(verifyOwnerSessionToken(SECRET, result.cookie.value, NOW)).toBe(
        true,
      );
    }
  });

  it("makes the cookie unreachable from scripts, same-site only and valid for thirty days", () => {
    const result = checkOwnerSignIn(SECRET, SECRET, NOW, true);

    expect(result.ok && result.cookie.options).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
  });

  it("lets the caller turn off the secure flag for local http", () => {
    const result = checkOwnerSignIn(SECRET, SECRET, NOW, false);

    expect(result.ok && result.cookie.options.secure).toBe(false);
  });

  it("accepts the secret with spaces or a line break around it", () => {
    expect(checkOwnerSignIn(SECRET, ` ${SECRET}\n`, NOW, true).ok).toBe(true);
  });

  it("is disabled when there is no owner secret", () => {
    expect(checkOwnerSignIn(undefined, SECRET, NOW, true)).toEqual({
      ok: false,
      reason: "disabled",
    });
  });

  it.each([
    ["a wrong secret", "b".repeat(32)],
    ["an empty text", ""],
    ["a missing field", null],
    ["something that is not text", new Blob(["x"])],
    [
      "a text that is too long",
      SECRET.padEnd(MAX_SECRET_INPUT_LENGTH + 1, " "),
    ],
  ])("rejects %s", (_name, candidate) => {
    expect(checkOwnerSignIn(SECRET, candidate, NOW, true)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("accepts a text at the maximum length", () => {
    expect(
      checkOwnerSignIn(
        SECRET,
        SECRET.padEnd(MAX_SECRET_INPUT_LENGTH, " "),
        NOW,
        true,
      ).ok,
    ).toBe(true);
  });

  it("never puts the secret in the cookie", () => {
    const result = checkOwnerSignIn(SECRET, SECRET, NOW, true);

    expect(JSON.stringify(result)).not.toContain(SECRET);
  });
});
