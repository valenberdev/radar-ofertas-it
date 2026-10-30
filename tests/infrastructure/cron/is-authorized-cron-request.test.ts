import { timingSafeEqual } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { isAuthorizedCronRequest } from "../../../src/infrastructure/cron/is-authorized-cron-request";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

const SECRET = "0123456789abcdef0123456789abcdef";

describe("isAuthorizedCronRequest", () => {
  it("accepts the bearer token that matches the secret", () => {
    expect(isAuthorizedCronRequest(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("rejects a request without an authorization header", () => {
    expect(isAuthorizedCronRequest(null, SECRET)).toBe(false);
  });

  it("rejects an empty authorization header", () => {
    expect(isAuthorizedCronRequest("", SECRET)).toBe(false);
  });

  it("rejects a different token of the same length", () => {
    const other = "f".repeat(SECRET.length);

    expect(isAuthorizedCronRequest(`Bearer ${other}`, SECRET)).toBe(false);
  });

  it("rejects a token that differs only in the last character", () => {
    expect(
      isAuthorizedCronRequest(`Bearer ${SECRET.slice(0, -1)}0`, SECRET),
    ).toBe(false);
  });

  it("rejects a token that is a prefix of the secret", () => {
    expect(
      isAuthorizedCronRequest(`Bearer ${SECRET.slice(0, 16)}`, SECRET),
    ).toBe(false);
  });

  it("rejects a token that extends the secret", () => {
    expect(isAuthorizedCronRequest(`Bearer ${SECRET}x`, SECRET)).toBe(false);
  });

  it("rejects the secret without the Bearer scheme", () => {
    expect(isAuthorizedCronRequest(SECRET, SECRET)).toBe(false);
  });

  it("rejects another scheme", () => {
    expect(isAuthorizedCronRequest(`Basic ${SECRET}`, SECRET)).toBe(false);
  });

  it("rejects a lowercase scheme", () => {
    expect(isAuthorizedCronRequest(`bearer ${SECRET}`, SECRET)).toBe(false);
  });

  it("rejects surrounding whitespace", () => {
    expect(isAuthorizedCronRequest(` Bearer ${SECRET}`, SECRET)).toBe(false);
    expect(isAuthorizedCronRequest(`Bearer ${SECRET} `, SECRET)).toBe(false);
    expect(isAuthorizedCronRequest(`Bearer  ${SECRET}`, SECRET)).toBe(false);
  });

  it("rejects non-ASCII input without throwing", () => {
    expect(
      isAuthorizedCronRequest("Bearer \u00e9\u00e8\u4e2d\u6587", SECRET),
    ).toBe(false);
  });

  it("rejects a very long header without throwing", () => {
    expect(
      isAuthorizedCronRequest(`Bearer ${"a".repeat(100_000)}`, SECRET),
    ).toBe(false);
  });

  describe("when no secret is configured", () => {
    it("rejects every request", () => {
      expect(isAuthorizedCronRequest(`Bearer ${SECRET}`, undefined)).toBe(
        false,
      );
      expect(isAuthorizedCronRequest(null, undefined)).toBe(false);
    });

    it("rejects the header that a naive comparison would build from undefined", () => {
      expect(isAuthorizedCronRequest("Bearer undefined", undefined)).toBe(
        false,
      );
    });

    it("rejects an empty secret even when the header is just the scheme", () => {
      expect(isAuthorizedCronRequest("Bearer ", "")).toBe(false);
      expect(isAuthorizedCronRequest("Bearer", "")).toBe(false);
      expect(isAuthorizedCronRequest("", "")).toBe(false);
    });
  });

  it("compares digests of equal length with timingSafeEqual", () => {
    const spy = vi.mocked(timingSafeEqual);
    spy.mockClear();

    isAuthorizedCronRequest("Bearer short", SECRET);
    isAuthorizedCronRequest(`Bearer ${SECRET}`, SECRET);

    expect(spy).toHaveBeenCalledTimes(2);
    for (const call of spy.mock.calls) {
      expect(Buffer.isBuffer(call[0])).toBe(true);
      expect(Buffer.isBuffer(call[1])).toBe(true);
      expect(call[0].byteLength).toBe(32);
      expect(call[1].byteLength).toBe(32);
    }
  });

  it("does not call timingSafeEqual when there is nothing to compare", () => {
    const spy = vi.mocked(timingSafeEqual);
    spy.mockClear();

    isAuthorizedCronRequest(null, SECRET);
    isAuthorizedCronRequest(`Bearer ${SECRET}`, undefined);

    expect(spy).not.toHaveBeenCalled();
  });
});
