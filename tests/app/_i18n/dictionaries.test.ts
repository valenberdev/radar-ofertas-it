import { describe, expect, it } from "vitest";
import { defaultLocale, locales } from "@/app/_i18n/config";
import { getDictionary } from "@/app/_i18n/dictionaries";

function leaves(value: object, prefix = ""): [path: string, text: unknown][] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === "object" && child !== null
      ? leaves(child, path)
      : [[path, child]];
  });
}

const referencePaths = leaves(getDictionary(defaultLocale)).map(
  ([path]) => path,
);

describe.each(locales)("dictionary %s", (locale) => {
  const entries = leaves(getDictionary(locale));

  it(`has exactly the same keys as the default locale (${defaultLocale})`, () => {
    expect(entries.map(([path]) => path).sort()).toEqual(
      [...referencePaths].sort(),
    );
  });

  it("has no empty or non-string values", () => {
    const invalid = entries.filter(
      ([, text]) => typeof text !== "string" || text.trim() === "",
    );
    expect(invalid).toEqual([]);
  });
});
