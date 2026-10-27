import { describe, expect, it } from "vitest";
import {
  hasLocalePrefix,
  prefixWithLocale,
  switchLocalePath,
} from "@/app/_i18n/locale-path";

describe("hasLocalePrefix", () => {
  it.each(["/en", "/es", "/en/", "/es/jobs", "/en/jobs/42"])(
    "returns true for %s",
    (pathname) => {
      expect(hasLocalePrefix(pathname)).toBe(true);
    },
  );

  it.each(["/", "", "/jobs", "/english", "/espanol", "/fr", "/jobs/en", "/EN"])(
    "returns false for %s",
    (pathname) => {
      expect(hasLocalePrefix(pathname)).toBe(false);
    },
  );
});

describe("prefixWithLocale", () => {
  it("maps the root to the bare locale path", () => {
    expect(prefixWithLocale("/", "es")).toBe("/es");
  });

  it("prepends the locale to nested paths", () => {
    expect(prefixWithLocale("/jobs", "en")).toBe("/en/jobs");
    expect(prefixWithLocale("/jobs/42", "es")).toBe("/es/jobs/42");
  });
});

describe("switchLocalePath", () => {
  it.each([
    ["/en", "es", "/es"],
    ["/es", "en", "/en"],
    ["/en/", "es", "/es/"],
    ["/en/jobs", "es", "/es/jobs"],
    ["/es/jobs/42", "en", "/en/jobs/42"],
  ] as const)("switches %s to %s -> %s", (pathname, locale, expected) => {
    expect(switchLocalePath(pathname, locale)).toBe(expected);
  });

  it("keeps the path when the target is the current locale", () => {
    expect(switchLocalePath("/es/jobs", "es")).toBe("/es/jobs");
  });

  it("adds a prefix when the path has none", () => {
    expect(switchLocalePath("/", "es")).toBe("/es");
    expect(switchLocalePath("/jobs", "en")).toBe("/en/jobs");
  });

  it("does not treat a longer segment as a locale", () => {
    expect(switchLocalePath("/english", "es")).toBe("/es/english");
  });
});
