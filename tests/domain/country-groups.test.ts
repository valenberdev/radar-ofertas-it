import { describe, expect, it } from "vitest";
import { COUNTRIES } from "../../src/domain/countries";
import {
  COUNTRY_GROUPS,
  type CountryGroup,
} from "../../src/domain/country-groups";

const GROUPS = Object.keys(COUNTRY_GROUPS) as CountryGroup[];

function members(group: CountryGroup): readonly string[] {
  return COUNTRY_GROUPS[group];
}

describe("COUNTRY_GROUPS", () => {
  it.each(GROUPS)("%s has no duplicates", (group) => {
    expect(new Set(members(group)).size).toBe(members(group).length);
  });

  it.each(GROUPS)("%s only holds names of the country list", (group) => {
    const known = new Set<string>(COUNTRIES);
    expect(members(group).filter((name) => !known.has(name))).toEqual([]);
  });

  it.each([
    ["europeanUnion", 27],
    ["europe", 44],
    ["northAmerica", 2],
    ["latinAmerica", 20],
    ["americas", 35],
  ] as const)("%s has %i members", (group, size) => {
    expect(members(group)).toHaveLength(size);
  });

  it("keeps the European Union inside Europe", () => {
    const europe = new Set(members("europe"));
    expect(
      members("europeanUnion").filter((name) => !europe.has(name)),
    ).toEqual([]);
  });

  it("keeps North America and Latin America inside the Americas", () => {
    const americas = new Set(members("americas"));
    const outside = [
      ...members("northAmerica"),
      ...members("latinAmerica"),
    ].filter((name) => !americas.has(name));
    expect(outside).toEqual([]);
  });

  it("places Argentina in Latin America and the Americas only", () => {
    expect(members("latinAmerica")).toContain("Argentina");
    expect(members("americas")).toContain("Argentina");
    expect(members("northAmerica")).not.toContain("Argentina");
    expect(members("europe")).not.toContain("Argentina");
    expect(members("europeanUnion")).not.toContain("Argentina");
  });

  it("places the United Kingdom in Europe but not in the European Union", () => {
    expect(members("europe")).toContain("United Kingdom");
    expect(members("europeanUnion")).not.toContain("United Kingdom");
  });

  it("keeps Mexico in Latin America and out of North America", () => {
    expect(members("latinAmerica")).toContain("Mexico");
    expect(members("northAmerica")).not.toContain("Mexico");
  });
});
