import { describe, expect, it } from "vitest";
import type { Profile } from "../../src/domain/profile";
import { profileHash } from "../../src/domain/profile-hash";

const BASE: Profile = {
  seniority: "junior",
  yearsOfExperience: 1.5,
  skills: [
    { name: "TypeScript", aliases: ["ts", "typescript"] },
    { name: "PostgreSQL", aliases: ["postgres"] },
  ],
  targetRoles: ["Backend Developer", "Software Engineer"],
  languages: ["Spanish (native)", "English (B2)"],
  summary: "Junior backend developer.",
};

describe("profileHash", () => {
  it("returns a lowercase sha-256 hex digest", () => {
    expect(profileHash(BASE)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable", () => {
    expect(profileHash(BASE)).toBe(profileHash({ ...BASE }));
  });

  it("ignores the order of skills, aliases, roles and languages", () => {
    const shuffled: Profile = {
      ...BASE,
      skills: [
        { name: "PostgreSQL", aliases: ["postgres"] },
        { name: "TypeScript", aliases: ["typescript", "ts"] },
      ],
      targetRoles: ["Software Engineer", "Backend Developer"],
      languages: ["English (B2)", "Spanish (native)"],
    };

    expect(profileHash(shuffled)).toBe(profileHash(BASE));
  });

  it.each<[string, Partial<Profile>]>([
    ["seniority", { seniority: "senior" }],
    ["no seniority", { seniority: null }],
    ["years", { yearsOfExperience: 2 }],
    ["no years", { yearsOfExperience: null }],
    [
      "a skill name",
      {
        skills: [
          { name: "TypeScript", aliases: ["ts", "typescript"] },
          { name: "MySQL", aliases: ["postgres"] },
        ],
      },
    ],
    [
      "an alias",
      {
        skills: [
          { name: "TypeScript", aliases: ["ts"] },
          { name: "PostgreSQL", aliases: ["postgres"] },
        ],
      },
    ],
    [
      "a missing skill",
      { skills: [{ name: "TypeScript", aliases: ["ts", "typescript"] }] },
    ],
    [
      "the case of a skill",
      {
        skills: [
          { name: "typescript", aliases: ["ts", "typescript"] },
          { name: "PostgreSQL", aliases: ["postgres"] },
        ],
      },
    ],
    ["a role", { targetRoles: ["Backend Developer"] }],
    ["a language", { languages: ["Spanish (native)"] }],
    ["the summary", { summary: "Junior backend developer" }],
  ])("changes when %s changes", (_name, change) => {
    expect(profileHash({ ...BASE, ...change })).not.toBe(profileHash(BASE));
  });

  it("changes when an alias moves to another skill", () => {
    const moved: Profile = {
      ...BASE,
      skills: [
        { name: "TypeScript", aliases: ["ts"] },
        { name: "PostgreSQL", aliases: ["postgres", "typescript"] },
      ],
    };

    expect(profileHash(moved)).not.toBe(profileHash(BASE));
  });

  it("tells apart a list of two items from one joined item", () => {
    const two: Profile = { ...BASE, targetRoles: ["a", "b"] };
    const one: Profile = { ...BASE, targetRoles: ["ab"] };

    expect(profileHash(two)).not.toBe(profileHash(one));
  });

  it("tells apart a role from a language with the same text", () => {
    const role: Profile = { ...BASE, targetRoles: ["English"], languages: [] };
    const language: Profile = {
      ...BASE,
      targetRoles: [],
      languages: ["English"],
    };

    expect(profileHash(role)).not.toBe(profileHash(language));
  });

  it("does not modify the profile", () => {
    const copy = JSON.parse(JSON.stringify(BASE)) as Profile;

    profileHash(BASE);

    expect(BASE).toEqual(copy);
  });
});
