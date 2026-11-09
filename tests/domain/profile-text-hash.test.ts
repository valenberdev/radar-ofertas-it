import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { profileTextHash } from "../../src/domain/profile-text-hash";

describe("profileTextHash", () => {
  it("returns a lowercase sha-256 hex digest", () => {
    expect(profileTextHash("Node.js developer")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is the sha-256 of the text", () => {
    expect(profileTextHash("abc")).toBe(
      createHash("sha256").update("abc").digest("hex"),
    );
  });

  it("is stable", () => {
    expect(profileTextHash("Node.js developer")).toBe(
      profileTextHash("Node.js developer"),
    );
  });

  it.each([
    ["  Node.js   developer  ", "Node.js developer"],
    ["Node.js\ndeveloper", "Node.js developer"],
    ["Node.js\r\n\r\n\tdeveloper\n", "Node.js developer"],
    ["Node.js\u00A0developer", "Node.js developer"],
  ])("ignores differences in whitespace: %j", (input, canonical) => {
    expect(profileTextHash(input)).toBe(profileTextHash(canonical));
  });

  it.each([
    ["Node.js developer", "node.js developer"],
    ["Node.js developer", "Node.js developers"],
    ["Node.js developer", "Node.jsdeveloper"],
    ["", "x"],
  ])("tells %j apart from %j", (first, second) => {
    expect(profileTextHash(first)).not.toBe(profileTextHash(second));
  });

  it("gives the same digest to an empty text and to a blank one", () => {
    expect(profileTextHash("   \n")).toBe(profileTextHash(""));
  });
});
