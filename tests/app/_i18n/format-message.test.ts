import { describe, expect, it } from "vitest";
import { formatMessage } from "../../../src/app/_i18n/format-message";

describe("formatMessage", () => {
  it("fills in the named values", () => {
    expect(
      formatMessage("{count} offers fit, up to {max}.", {
        count: 3,
        max: 12000,
      }),
    ).toBe("3 offers fit, up to 12000.");
  });

  it("fills in the same value more than once", () => {
    expect(formatMessage("{n} and {n}", { n: "x" })).toBe("x and x");
  });

  it("leaves a placeholder without a value as it is", () => {
    expect(formatMessage("{count} of {total}", { count: 1 })).toBe(
      "1 of {total}",
    );
  });

  it("returns a text without placeholders unchanged", () => {
    expect(formatMessage("Nothing to fill", { count: 1 })).toBe(
      "Nothing to fill",
    );
  });

  it("writes zero instead of skipping it", () => {
    expect(formatMessage("{count} offers", { count: 0 })).toBe("0 offers");
  });

  it("does not treat the values as placeholders", () => {
    expect(formatMessage("{a}", { a: "{b}", b: "nope" })).toBe("{b}");
  });
});
