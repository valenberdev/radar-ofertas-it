import { describe, expect, it } from "vitest";
import { hasLocalePrefix, prefixWithLocale } from "@/app/_i18n/locale-path";

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
