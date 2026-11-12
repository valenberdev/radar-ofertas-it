import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const OWNER_SESSION_COOKIE = "radar_owner";
export const OWNER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const VERSION = "v1";
const TOKEN_PATTERN = /^v1\.(\d{1,15})\.([A-Za-z0-9_-]{43})$/;

function sign(secret: string, expiresAt: number): string {
  return createHmac("sha256", secret)
    .update(`owner-session:${VERSION}:${expiresAt}`)
    .digest("base64url");
}

function digest(text: string): Buffer {
  return createHash("sha256").update(text).digest();
}

export function isOwnerSecret(secret: string, candidate: string): boolean {
  return timingSafeEqual(digest(secret), digest(candidate));
}

export function createOwnerSessionToken(secret: string, now: Date): string {
  const expiresAt = now.getTime() + OWNER_SESSION_TTL_MS;
  return `${VERSION}.${expiresAt}.${sign(secret, expiresAt)}`;
}

export function verifyOwnerSessionToken(
  secret: string,
  token: string | undefined,
  now: Date,
): boolean {
  const match = token === undefined ? null : TOKEN_PATTERN.exec(token);
  if (match === null) {
    return false;
  }
  const expiresAt = Number(match[1]);
  if (expiresAt <= now.getTime()) {
    return false;
  }
  const expected = Buffer.from(sign(secret, expiresAt));
  const received = Buffer.from(match[2] as string);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}
