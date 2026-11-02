import { describe, expect, it } from "vitest";
import {
  regionOfCountries,
  UNKNOWN_REGION,
  WORLDWIDE,
} from "../../src/domain/region";

describe("regionOfCountries", () => {
  it("keeps the names as given and in order", () => {
    expect(
      regionOfCountries([
        "Poland",
        "Argentina",
        "Holy See (Vatican City State)",
      ]),
    ).toEqual({
      kind: "countries",
      countries: ["Poland", "Argentina", "Holy See (Vatican City State)"],
    });
  });

  it("removes repeated names keeping the first occurrence", () => {
    expect(regionOfCountries(["Spain", "Poland", "Spain"])).toEqual({
      kind: "countries",
      countries: ["Spain", "Poland"],
    });
  });

  it("trims names and drops blank ones", () => {
    expect(regionOfCountries([" Spain ", "", "   ", "Poland"])).toEqual({
      kind: "countries",
      countries: ["Spain", "Poland"],
    });
  });

  it("is unknown when there is nothing to hold", () => {
    expect(regionOfCountries([])).toEqual(UNKNOWN_REGION);
    expect(regionOfCountries(["", "  "])).toEqual(UNKNOWN_REGION);
  });

  it("does not modify the list it receives", () => {
    const input = ["Spain", "Spain"];
    regionOfCountries(input);
    expect(input).toEqual(["Spain", "Spain"]);
  });
});

describe("constants", () => {
  it("describe the two regions without countries", () => {
    expect(WORLDWIDE).toEqual({ kind: "worldwide" });
    expect(UNKNOWN_REGION).toEqual({ kind: "unknown" });
  });
});
