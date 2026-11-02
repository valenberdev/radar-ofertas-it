import { describe, expect, it } from "vitest";
import { COUNTRIES, isCountry } from "../../src/domain/countries";

describe("COUNTRIES", () => {
  it("has no duplicates", () => {
    expect(new Set(COUNTRIES).size).toBe(COUNTRIES.length);
  });

  it("holds the 249 names used by the Himalayas feed", () => {
    expect(COUNTRIES).toHaveLength(249);
  });

  it("has no name with surrounding whitespace", () => {
    for (const name of COUNTRIES) {
      expect(name).toBe(name.trim());
    }
  });
});

describe("isCountry", () => {
  it.each([
    "Argentina",
    "United States",
    "United Kingdom",
    "Côte d'Ivoire",
    "Åland Islands",
    "Holy See (Vatican City State)",
    "Congo, The Democratic Republic of the",
    "Virgin Islands, U.S.",
  ])("accepts %j exactly as the feed spells it", (name) => {
    expect(isCountry(name)).toBe(true);
  });

  it.each([
    "argentina",
    "ARGENTINA",
    " Argentina",
    "Argentina ",
    "USA",
    "US",
    "UK",
    "Narnia",
    "",
    "toString",
    "__proto__",
    "constructor",
  ])("rejects %j", (value) => {
    expect(isCountry(value)).toBe(false);
  });
});
