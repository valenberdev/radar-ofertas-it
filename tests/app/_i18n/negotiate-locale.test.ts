import { describe, expect, it } from "vitest";
import { negotiateLocale } from "@/app/_i18n/negotiate-locale";

describe("negotiateLocale", () => {
  describe("cookie", () => {
    it("wins over the Accept-Language header", () => {
      expect(
        negotiateLocale({ cookie: "es", acceptLanguage: "en-US,en;q=0.9" }),
      ).toBe("es");
      expect(
        negotiateLocale({ cookie: "en", acceptLanguage: "es-AR,es;q=0.9" }),
      ).toBe("en");
    });

    it.each(["pt", "xx", "ES", "", "es-AR"])(
      "is ignored when its value is %j",
      (cookie) => {
        expect(
          negotiateLocale({ cookie, acceptLanguage: "es-AR,es;q=0.9" }),
        ).toBe("es");
      },
    );
  });

  describe("Accept-Language", () => {
    it.each([
      ["es-AR,es;q=0.9", "es"],
      ["es-419", "es"],
      ["en-US,en;q=0.5", "en"],
      ["en-GB", "en"],
      ["ES-ar", "es"],
      [" es ; q=0.8 , en;q=0.5", "es"],
    ])("%j -> %s", (acceptLanguage, expected) => {
      expect(negotiateLocale({ acceptLanguage })).toBe(expected);
    });

    it("picks the supported language with the highest quality, whatever the order", () => {
      expect(negotiateLocale({ acceptLanguage: "en;q=0.3, es;q=0.8" })).toBe(
        "es",
      );
      expect(
        negotiateLocale({ acceptLanguage: "fr-FR,fr;q=0.9,es;q=0.5" }),
      ).toBe("es");
    });

    it("keeps the listed order when qualities tie", () => {
      expect(negotiateLocale({ acceptLanguage: "es, en" })).toBe("es");
      expect(negotiateLocale({ acceptLanguage: "en, es" })).toBe("en");
    });

    it("skips languages with q=0", () => {
      expect(negotiateLocale({ acceptLanguage: "es;q=0, en;q=0.1" })).toBe(
        "en",
      );
      expect(negotiateLocale({ acceptLanguage: "es;q=0" })).toBe("en");
    });

    it("falls back to English for Portuguese and other unsupported languages", () => {
      expect(negotiateLocale({ acceptLanguage: "pt-BR,pt;q=0.9" })).toBe("en");
      expect(negotiateLocale({ acceptLanguage: "fr-FR,de;q=0.8" })).toBe("en");
    });

    it("compares whole primary subtags, not prefixes", () => {
      expect(negotiateLocale({ acceptLanguage: "esperanto" })).toBe("en");
      expect(negotiateLocale({ acceptLanguage: "eo, ess;q=0.9" })).toBe("en");
      expect(negotiateLocale({ acceptLanguage: "entish, es;q=0.1" })).toBe(
        "es",
      );
    });

    it.each([
      "",
      ";;;",
      ",",
      "garbage",
      "*",
      "es;q=abc",
      "es;q=5",
      "es;q=-1",
      "es;q=",
    ])(
      "never throws on malformed input %j and returns the default",
      (acceptLanguage) => {
        expect(negotiateLocale({ acceptLanguage })).toBe("en");
      },
    );
  });

  it("returns the default locale when there is no information at all", () => {
    expect(negotiateLocale({})).toBe("en");
    expect(negotiateLocale({ cookie: null, acceptLanguage: null })).toBe("en");
    expect(
      negotiateLocale({ cookie: undefined, acceptLanguage: undefined }),
    ).toBe("en");
  });
});
