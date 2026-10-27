import { createHash } from "node:crypto";

export function checksum(sql: string): string {
  const normalized = sql.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
