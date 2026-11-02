import { describe, expect, it } from "vitest";
import { UNKNOWN_REGION, WORLDWIDE } from "../../../../src/domain/region";
import { regionOfHimalayasJob } from "../../../../src/infrastructure/sources/himalayas/map-region";

function offsets(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index - 12);
}

describe("regionOfHimalayasJob", () => {
  describe("with a list of countries", () => {
    it("keeps the countries as the feed names them", () => {
      expect(regionOfHimalayasJob(["Argentina", "Brazil"], [-3])).toEqual({
        kind: "countries",
        countries: ["Argentina", "Brazil"],
      });
    });

    it("ignores the time zones, which the feed derives from the countries", () => {
      const expected = { kind: "countries", countries: ["Poland"] };

      expect(regionOfHimalayasJob(["Poland"], [1, 2])).toEqual(expected);
      expect(regionOfHimalayasJob(["Poland"], [])).toEqual(expected);
      expect(regionOfHimalayasJob(["Poland"], null)).toEqual(expected);
      expect(regionOfHimalayasJob(["Poland"], offsets(37))).toEqual(expected);
    });

    it("is unknown when every name is blank", () => {
      expect(regionOfHimalayasJob(["", "  "], [])).toEqual(UNKNOWN_REGION);
    });
  });

  describe("without countries", () => {
    it("is worldwide when no time zone restricts it either", () => {
      expect(regionOfHimalayasJob([], offsets(37))).toEqual(WORLDWIDE);
      expect(regionOfHimalayasJob([], offsets(40))).toEqual(WORLDWIDE);
      expect(regionOfHimalayasJob([], [])).toEqual(WORLDWIDE);
    });

    it("is unknown when only a time zone restricts it", () => {
      expect(regionOfHimalayasJob([], [3.5])).toEqual(UNKNOWN_REGION);
      expect(regionOfHimalayasJob([], offsets(36))).toEqual(UNKNOWN_REGION);
    });

    it("is unknown when the time zones are missing", () => {
      expect(regionOfHimalayasJob([], null)).toEqual(UNKNOWN_REGION);
      expect(regionOfHimalayasJob([], undefined)).toEqual(UNKNOWN_REGION);
    });
  });

  it("is unknown when the countries are missing", () => {
    expect(regionOfHimalayasJob(null, [])).toEqual(UNKNOWN_REGION);
    expect(regionOfHimalayasJob(undefined, offsets(37))).toEqual(
      UNKNOWN_REGION,
    );
  });

  it("does not take a missing list for an empty one", () => {
    expect(regionOfHimalayasJob(undefined, [])).not.toEqual(WORLDWIDE);
  });
});
