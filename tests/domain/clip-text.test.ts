import { describe, expect, it } from "vitest";
import { clipText } from "../../src/domain/clip-text";

describe("clipText", () => {
  it("returns a text shorter than the limit as it is", () => {
    expect(clipText("abc", 10)).toBe("abc");
  });

  it("returns a text of exactly the limit as it is", () => {
    expect(clipText("abcde", 5)).toBe("abcde");
  });

  it("does not trim a text of exactly the limit", () => {
    expect(clipText("abcd ", 5)).toBe("abcd ");
  });

  it("cuts a text one character over the limit", () => {
    expect(clipText("abcdef", 5)).toBe("abcde");
  });

  it("removes the whitespace left at the end by the cut", () => {
    expect(clipText("abc    def", 5)).toBe("abc");
  });

  it("does not split a character made of two code units", () => {
    expect(clipText("abc😀def", 4)).toBe("abc");
  });

  it("keeps a full character that fits", () => {
    expect(clipText("abc😀def", 5)).toBe("abc😀");
  });

  it("does not trim a text that needs no cut", () => {
    expect(clipText("abc ", 10)).toBe("abc ");
  });
});
