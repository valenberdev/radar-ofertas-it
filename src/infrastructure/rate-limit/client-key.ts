import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { pacificDay } from "../../domain/pacific-day";

export interface HeaderReader {
  get(name: string): string | null;
}

const IP_HEADERS = [
  "x-vercel-forwarded-for",
  "x-forwarded-for",
  "x-real-ip",
] as const;

function expandIpv6(ip: string): number[] {
  let text = ip;
  const lastColon = text.lastIndexOf(":");
  const last = text.slice(lastColon + 1);
  if (last.includes(".")) {
    const [a = 0, b = 0, c = 0, d = 0] = last.split(".").map(Number);
    text = `${text.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head = "", tail] = text.split("::");
  const headParts = head === "" ? [] : head.split(":");
  const tailParts = tail === undefined || tail === "" ? [] : tail.split(":");
  const filler =
    tail === undefined
      ? []
      : Array.from(
          { length: 8 - headParts.length - tailParts.length },
          () => "0",
        );
  return [...headParts, ...filler, ...tailParts].map((part) =>
    Number.parseInt(part, 16),
  );
}

export function normalizeIp(raw: string): string | null {
  const unbracketed = raw.trim().replace(/^\[(.*)\]$/, "$1");
  const ip = unbracketed.split("%")[0] ?? "";
  const version = isIP(ip);
  if (version === 4) {
    return ip;
  }
  if (version !== 6) {
    return null;
  }
  const groups = expandIpv6(ip);
  const [g0, g1, g2, g3, g4, g5, g6 = 0, g7 = 0] = groups;
  if (
    g0 === 0 &&
    g1 === 0 &&
    g2 === 0 &&
    g3 === 0 &&
    g4 === 0 &&
    g5 === 0xffff
  ) {
    return `${g6 >> 8}.${g6 & 255}.${g7 >> 8}.${g7 & 255}`;
  }
  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(":")}::/64`;
}

export function clientIp(headers: HeaderReader): string | null {
  for (const name of IP_HEADERS) {
    const first = headers.get(name)?.split(",")[0];
    const ip = first === undefined ? null : normalizeIp(first);
    if (ip !== null) {
      return ip;
    }
  }
  return null;
}

export function rateLimitResource(
  kind: string,
  secret: string,
  ip: string | null,
  at: Date,
): string {
  const digest = createHmac("sha256", secret)
    .update(`${pacificDay(at)}|${ip ?? "unknown"}`)
    .digest("hex");
  return `${kind}:${digest.slice(0, 32)}`;
}
