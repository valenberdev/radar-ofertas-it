import { describe, expect, it } from "vitest";
import {
  buildProfile,
  isSeniority,
  PROFILE_LIMITS,
  SENIORITIES,
} from "../../src/domain/profile";

describe("SENIORITIES", () => {
  it("lists the levels from the lowest to the highest", () => {
    expect(SENIORITIES).toEqual(["intern", "junior", "mid", "senior", "lead"]);
  });
});

describe("isSeniority", () => {
  it.each(["intern", "junior", "mid", "senior", "lead"])(
    "accepts %s",
    (value) => {
      expect(isSeniority(value)).toBe(true);
    },
  );

  it.each(["", "Junior", "principal", "staff", " mid"])(
    "rejects %j",
    (value) => {
      expect(isSeniority(value)).toBe(false);
    },
  );
});

describe("buildProfile", () => {
  it("returns an empty profile for an empty input", () => {
    expect(buildProfile({})).toEqual({
      seniority: null,
      yearsOfExperience: null,
      skills: [],
      targetRoles: [],
      languages: [],
      summary: "",
    });
  });

  it("keeps a clean input as it is", () => {
    const input = {
      seniority: "junior",
      yearsOfExperience: 1.5,
      skills: [
        { name: "Node.js", aliases: ["node", "nodejs"] },
        { name: "PostgreSQL", aliases: [] },
      ],
      targetRoles: ["Backend Developer"],
      languages: ["Spanish (native)", "English (B2)"],
      summary: "Junior backend developer.",
    };

    expect(buildProfile(input)).toEqual(input);
  });

  describe("seniority", () => {
    it.each([
      ["junior", "junior"],
      ["  Senior ", "senior"],
      ["LEAD", "lead"],
    ] as const)("normalizes %j to %s", (value, expected) => {
      expect(buildProfile({ seniority: value }).seniority).toBe(expected);
    });

    it.each(["principal", "", "   ", "jr"])(
      "turns the unknown level %j into null",
      (value) => {
        expect(buildProfile({ seniority: value }).seniority).toBeNull();
      },
    );

    it("keeps null as null", () => {
      expect(buildProfile({ seniority: null }).seniority).toBeNull();
    });
  });

  describe("yearsOfExperience", () => {
    it.each([
      [0, 0],
      [2, 2],
      [0.5, 0.5],
      [3.14159, 3.1],
      [60, 60],
    ])("keeps %s as %s", (value, expected) => {
      expect(buildProfile({ yearsOfExperience: value }).yearsOfExperience).toBe(
        expected,
      );
    });

    it.each([
      -1,
      -0.01,
      60.1,
      1000,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ])("turns %s into null", (value) => {
      expect(
        buildProfile({ yearsOfExperience: value }).yearsOfExperience,
      ).toBeNull();
    });

    it("keeps null as null", () => {
      expect(
        buildProfile({ yearsOfExperience: null }).yearsOfExperience,
      ).toBeNull();
    });
  });

  describe("skills", () => {
    it("trims names and aliases and collapses inner whitespace", () => {
      const profile = buildProfile({
        skills: [{ name: "  Spring   Boot ", aliases: ["  spring\tboot3 "] }],
      });

      expect(profile.skills).toEqual([
        { name: "Spring Boot", aliases: ["spring boot3"] },
      ]);
    });

    it("drops skills with an empty name", () => {
      expect(
        buildProfile({
          skills: [{ name: "" }, { name: "   " }, { name: "Go" }],
        }).skills,
      ).toEqual([{ name: "Go", aliases: [] }]);
    });

    it("drops a skill whose name is too long to be a name", () => {
      const tooLong = "x".repeat(PROFILE_LIMITS.maxSkillLength + 1);
      const justRight = "y".repeat(PROFILE_LIMITS.maxSkillLength);

      expect(
        buildProfile({ skills: [{ name: tooLong }, { name: justRight }] })
          .skills,
      ).toEqual([{ name: justRight, aliases: [] }]);
    });

    it("merges skills with the same name regardless of case, keeping the first spelling", () => {
      const profile = buildProfile({
        skills: [
          { name: "TypeScript", aliases: ["ts"] },
          { name: "typescript", aliases: ["TS", "tsc"] },
        ],
      });

      expect(profile.skills).toEqual([
        { name: "TypeScript", aliases: ["ts", "tsc"] },
      ]);
    });

    it("removes duplicate aliases ignoring case and aliases equal to the name", () => {
      const profile = buildProfile({
        skills: [
          {
            name: "React",
            aliases: ["react", "React.js", "REACT.JS", "reactjs"],
          },
        ],
      });

      expect(profile.skills).toEqual([
        { name: "React", aliases: ["React.js", "reactjs"] },
      ]);
    });

    it("drops empty and overlong aliases", () => {
      const tooLong = "z".repeat(PROFILE_LIMITS.maxSkillLength + 1);

      expect(
        buildProfile({
          skills: [{ name: "Docker", aliases: ["", "  ", tooLong, "compose"] }],
        }).skills,
      ).toEqual([{ name: "Docker", aliases: ["compose"] }]);
    });

    it("keeps at most the allowed number of aliases, in order", () => {
      const aliases = Array.from(
        { length: PROFILE_LIMITS.maxAliases + 3 },
        (_, index) => `alias-${index}`,
      );

      const [skill] = buildProfile({
        skills: [{ name: "Kubernetes", aliases }],
      }).skills;

      expect(skill?.aliases).toEqual(
        aliases.slice(0, PROFILE_LIMITS.maxAliases),
      );
    });

    it("keeps at most the allowed number of skills, in order", () => {
      const skills = Array.from(
        { length: PROFILE_LIMITS.maxSkills + 5 },
        (_, index) => ({ name: `skill-${index}` }),
      );

      const result = buildProfile({ skills }).skills;

      expect(result.map((skill) => skill.name)).toEqual(
        skills.slice(0, PROFILE_LIMITS.maxSkills).map((skill) => skill.name),
      );
    });

    it("does not count repeated skills against the limit", () => {
      const repeated = Array.from(
        { length: PROFILE_LIMITS.maxSkills + 10 },
        () => ({ name: "Same" }),
      );

      expect(
        buildProfile({ skills: [...repeated, { name: "Other" }] }).skills.map(
          (skill) => skill.name,
        ),
      ).toEqual(["Same", "Other"]);
    });

    it("still merges aliases of a repeated skill once the limit is reached", () => {
      const filler = Array.from(
        { length: PROFILE_LIMITS.maxSkills - 1 },
        (_, index) => ({ name: `s-${index}` }),
      );

      const result = buildProfile({
        skills: [
          { name: "First", aliases: ["a"] },
          ...filler,
          { name: "first", aliases: ["b"] },
          { name: "Late" },
        ],
      }).skills;

      expect(result).toHaveLength(PROFILE_LIMITS.maxSkills);
      expect(result[0]).toEqual({ name: "First", aliases: ["a", "b"] });
      expect(result.some((skill) => skill.name === "Late")).toBe(false);
    });
  });

  describe("targetRoles and languages", () => {
    it("cleans, deduplicates ignoring case and caps both lists", () => {
      const roles = Array.from(
        { length: PROFILE_LIMITS.maxRoles + 2 },
        (_, index) => `Role ${index}`,
      );
      const languages = Array.from(
        { length: PROFILE_LIMITS.maxLanguages + 2 },
        (_, index) => `Lang ${index}`,
      );

      const profile = buildProfile({
        targetRoles: ["  Backend  Dev ", "backend dev", ...roles],
        languages: ["English", "ENGLISH", ...languages],
      });

      expect(profile.targetRoles).toEqual([
        "Backend Dev",
        ...roles.slice(0, PROFILE_LIMITS.maxRoles - 1),
      ]);
      expect(profile.languages).toEqual([
        "English",
        ...languages.slice(0, PROFILE_LIMITS.maxLanguages - 1),
      ]);
    });

    it("drops empty and overlong entries", () => {
      const longRole = "r".repeat(PROFILE_LIMITS.maxRoleLength + 1);
      const longLanguage = "l".repeat(PROFILE_LIMITS.maxLanguageLength + 1);

      const profile = buildProfile({
        targetRoles: ["", longRole, "QA"],
        languages: ["  ", longLanguage, "Spanish"],
      });

      expect(profile.targetRoles).toEqual(["QA"]);
      expect(profile.languages).toEqual(["Spanish"]);
    });

    it("accepts entries exactly at the length limits", () => {
      const role = "r".repeat(PROFILE_LIMITS.maxRoleLength);
      const language = "l".repeat(PROFILE_LIMITS.maxLanguageLength);

      const profile = buildProfile({
        targetRoles: [role],
        languages: [language],
      });

      expect(profile.targetRoles).toEqual([role]);
      expect(profile.languages).toEqual([language]);
    });
  });

  describe("summary", () => {
    it("collapses whitespace and trims", () => {
      expect(buildProfile({ summary: "  Hello \n\n  world\t" }).summary).toBe(
        "Hello world",
      );
    });

    it("cuts a summary that is too long and leaves no trailing space", () => {
      const text = `${"a".repeat(PROFILE_LIMITS.maxSummaryLength - 1)} bbbbb`;

      const summary = buildProfile({ summary: text }).summary;

      expect(summary).toBe("a".repeat(PROFILE_LIMITS.maxSummaryLength - 1));
    });

    it("keeps a summary of exactly the limit", () => {
      const text = "c".repeat(PROFILE_LIMITS.maxSummaryLength);

      expect(buildProfile({ summary: text }).summary).toBe(text);
    });
  });

  it("does not modify its input", () => {
    const input = {
      skills: [{ name: " A ", aliases: ["x", "x"] }],
      targetRoles: [" r "],
    };
    const copy = JSON.parse(JSON.stringify(input));

    buildProfile(input);

    expect(input).toEqual(copy);
  });
});
