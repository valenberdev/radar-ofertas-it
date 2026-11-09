import { createHash } from "node:crypto";

export function profileTextHash(redactedText: string): string {
  const normalized = redactedText.replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalized).digest("hex");
}
