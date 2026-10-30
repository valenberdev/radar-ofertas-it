import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function isAuthorizedCronRequest(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (authorization === null || secret === undefined || secret === "") {
    return false;
  }
  return timingSafeEqual(digest(`Bearer ${secret}`), digest(authorization));
}
