import { describe, expect, it } from "vitest";
import {
  clientIp,
  normalizeIp,
  rateLimitResource,
  type HeaderReader,
} from "../../../src/infrastructure/rate-limit/client-key";

function headers(values: Record<string, string>): HeaderReader {
  return { get: (name) => values[name] ?? null };
}

describe("normalizeIp", () => {
  it.each(["203.0.113.7", "0.0.0.0", "255.255.255.255"])(
    "keeps the IPv4 address %s",
    (ip) => {
      expect(normalizeIp(ip)).toBe(ip);
    },
  );

  it("trims spaces", () => {
    expect(normalizeIp("  203.0.113.7 ")).toBe("203.0.113.7");
  });

  it.each([
    ["2001:db8:85a3:8d3:1319:8a2e:370:7348", "2001:db8:85a3:8d3::/64"],
    ["2001:0DB8:85A3:08D3:1319:8A2E:0370:7348", "2001:db8:85a3:8d3::/64"],
    ["2001:db8::1", "2001:db8:0:0::/64"],
    ["::1", "0:0:0:0::/64"],
    ["fe80::1%eth0", "fe80:0:0:0::/64"],
    ["[2001:db8::1]", "2001:db8:0:0::/64"],
  ])("reduces the IPv6 address %s to its /64 block", (ip, expected) => {
    expect(normalizeIp(ip)).toBe(expected);
  });

  it("puts two addresses of the same /64 block in the same bucket", () => {
    expect(normalizeIp("2001:db8:1:2:aaaa::1")).toBe(
      normalizeIp("2001:db8:1:2:bbbb:cccc:dddd:eeee"),
    );
  });

  it("keeps two /64 blocks apart", () => {
    expect(normalizeIp("2001:db8:1:2::1")).not.toBe(
      normalizeIp("2001:db8:1:3::1"),
    );
  });

  it.each([
    ["::ffff:203.0.113.7", "203.0.113.7"],
    ["::FFFF:203.0.113.7", "203.0.113.7"],
    ["::ffff:cb00:7107", "203.0.113.7"],
    ["::ffff:203.0.113.7%eth0", "203.0.113.7"],
  ])("turns the IPv4-mapped address %s back into IPv4", (ip, expected) => {
    expect(normalizeIp(ip)).toBe(expected);
  });

  it("does not mistake an address with embedded IPv4 for a mapped one", () => {
    expect(normalizeIp("64:ff9b::203.0.113.7")).toBe("64:ff9b:0:0::/64");
  });

  it.each([
    "",
    "unknown",
    "203.0.113.7:8080",
    "203.0.113",
    "256.1.1.1",
    "2001:db8::1::2",
    "not an ip",
  ])("rejects %j", (raw) => {
    expect(normalizeIp(raw)).toBeNull();
  });
});

describe("clientIp", () => {
  it("prefers the header that only Vercel writes", () => {
    expect(
      clientIp(
        headers({
          "x-vercel-forwarded-for": "203.0.113.7",
          "x-forwarded-for": "198.51.100.1",
          "x-real-ip": "192.0.2.1",
        }),
      ),
    ).toBe("203.0.113.7");
  });

  it("falls back to x-forwarded-for and then to x-real-ip", () => {
    expect(
      clientIp(
        headers({
          "x-forwarded-for": "198.51.100.1",
          "x-real-ip": "192.0.2.1",
        }),
      ),
    ).toBe("198.51.100.1");
    expect(clientIp(headers({ "x-real-ip": "192.0.2.1" }))).toBe("192.0.2.1");
  });

  it("takes the first address of a list", () => {
    expect(
      clientIp(
        headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" }),
      ),
    ).toBe("203.0.113.7");
  });

  it("skips a header with a value that is not an address", () => {
    expect(
      clientIp(
        headers({
          "x-vercel-forwarded-for": "garbage",
          "x-forwarded-for": "198.51.100.1",
        }),
      ),
    ).toBe("198.51.100.1");
  });

  it("normalizes what it finds", () => {
    expect(
      clientIp(headers({ "x-vercel-forwarded-for": "2001:db8:1:2::99" })),
    ).toBe("2001:db8:1:2::/64");
  });

  it("returns null without any address", () => {
    expect(clientIp(headers({}))).toBeNull();
    expect(clientIp(headers({ "x-forwarded-for": "" }))).toBeNull();
  });
});

describe("rateLimitResource", () => {
  const SECRET = "s".repeat(32);
  const AT = new Date("2026-11-17T15:00:00Z");

  it("names the counter after the kind and a hash", () => {
    expect(rateLimitResource("search-ip", SECRET, "203.0.113.7", AT)).toMatch(
      /^search-ip:[0-9a-f]{32}$/,
    );
  });

  it("never contains the address", () => {
    expect(
      rateLimitResource("search-ip", SECRET, "203.0.113.7", AT),
    ).not.toContain("203.0.113.7");
  });

  it("is the same for the same address on the same day", () => {
    expect(rateLimitResource("search-ip", SECRET, "203.0.113.7", AT)).toBe(
      rateLimitResource(
        "search-ip",
        SECRET,
        "203.0.113.7",
        new Date("2026-11-17T23:00:00Z"),
      ),
    );
  });

  it("changes from one Pacific day to the next, so days cannot be linked", () => {
    expect(rateLimitResource("search-ip", SECRET, "203.0.113.7", AT)).not.toBe(
      rateLimitResource(
        "search-ip",
        SECRET,
        "203.0.113.7",
        new Date("2026-11-18T09:00:00Z"),
      ),
    );
  });

  it("changes with the address, the secret and the kind", () => {
    const base = rateLimitResource("search-ip", SECRET, "203.0.113.7", AT);

    expect(rateLimitResource("search-ip", SECRET, "203.0.113.8", AT)).not.toBe(
      base,
    );
    expect(
      rateLimitResource("search-ip", "t".repeat(32), "203.0.113.7", AT),
    ).not.toBe(base);
    expect(
      rateLimitResource("sign-in-ip", SECRET, "203.0.113.7", AT).split(":")[1],
    ).toBe(base.split(":")[1]);
    expect(rateLimitResource("sign-in-ip", SECRET, "203.0.113.7", AT)).not.toBe(
      base,
    );
  });

  it("puts requests without an address in one shared bucket", () => {
    expect(rateLimitResource("search-ip", SECRET, null, AT)).toBe(
      rateLimitResource("search-ip", SECRET, null, AT),
    );
    expect(rateLimitResource("search-ip", SECRET, null, AT)).not.toBe(
      rateLimitResource("search-ip", SECRET, "203.0.113.7", AT),
    );
  });
});
