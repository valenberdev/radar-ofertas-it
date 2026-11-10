import { describe, expect, it } from "vitest";
import { buildProfile, type Profile } from "../../src/domain/profile";
import {
  DEFAULT_TOP_K,
  DESCRIPTION_WEIGHT,
  prefilterOffers,
  TITLE_WEIGHT,
  type PrefilterOffer,
} from "../../src/domain/prefilter";

function profileWith(
  ...skills: Array<string | { name: string; aliases: string[] }>
): Profile {
  return buildProfile({
    skills: skills.map((skill) =>
      typeof skill === "string" ? { name: skill, aliases: [] } : skill,
    ),
  });
}

function offer(
  overrides: Partial<PrefilterOffer> & { id: string },
): PrefilterOffer {
  return { title: "Engineer", description: "", postedAt: null, ...overrides };
}

function idsFor(
  profile: Profile,
  offers: PrefilterOffer[],
  limit?: number,
): string[] {
  return prefilterOffers(profile, offers, limit).map((match) => match.offer.id);
}

describe("prefilterOffers", () => {
  describe("scoring", () => {
    it("returns nothing for a profile without skills", () => {
      expect(
        prefilterOffers(profileWith(), [
          offer({ id: "1", description: "Node.js" }),
        ]),
      ).toEqual([]);
    });

    it("returns nothing for no offers", () => {
      expect(prefilterOffers(profileWith("Node.js"), [])).toEqual([]);
    });

    it("leaves out offers that mention no skill", () => {
      const offers = [
        offer({ id: "1", description: "Cooking" }),
        offer({ id: "2", description: "We use Node.js" }),
      ];

      expect(idsFor(profileWith("Node.js"), offers)).toEqual(["2"]);
    });

    it(`gives ${DESCRIPTION_WEIGHT} point to a skill found in the description`, () => {
      const [match] = prefilterOffers(profileWith("Node.js"), [
        offer({ id: "1", description: "We use Node.js" }),
      ]);

      expect(match?.score).toBe(DESCRIPTION_WEIGHT);
      expect(DESCRIPTION_WEIGHT).toBe(1);
    });

    it(`gives ${TITLE_WEIGHT} points to a skill found in the title`, () => {
      const [match] = prefilterOffers(profileWith("Node.js"), [
        offer({ id: "1", title: "Node.js Developer" }),
      ]);

      expect(match?.score).toBe(TITLE_WEIGHT);
      expect(TITLE_WEIGHT).toBe(3);
    });

    it("counts a skill found in both the title and the description once, with the title weight", () => {
      const [match] = prefilterOffers(profileWith("Node.js"), [
        offer({
          id: "1",
          title: "Node.js Developer",
          description: "Node.js all day, Node.js",
        }),
      ]);

      expect(match?.score).toBe(TITLE_WEIGHT);
    });

    it("adds the points of every different skill", () => {
      const [match] = prefilterOffers(
        profileWith("Node.js", "PostgreSQL", "Docker", "Rust"),
        [
          offer({
            id: "1",
            title: "Node.js Developer",
            description: "PostgreSQL and Docker",
          }),
        ],
      );

      expect(match?.score).toBe(
        TITLE_WEIGHT + DESCRIPTION_WEIGHT + DESCRIPTION_WEIGHT,
      );
    });

    it("counts a skill once even when several of its names appear", () => {
      const profile = profileWith({
        name: "PostgreSQL",
        aliases: ["postgres", "psql"],
      });

      const [match] = prefilterOffers(profile, [
        offer({ id: "1", description: "PostgreSQL, Postgres and psql" }),
      ]);

      expect(match?.score).toBe(DESCRIPTION_WEIGHT);
      expect(match?.matchedSkills).toEqual(["PostgreSQL"]);
    });

    it("finds a skill through its aliases and reports its canonical name", () => {
      const profile = profileWith({
        name: "PostgreSQL",
        aliases: ["postgres"],
      });

      const [match] = prefilterOffers(profile, [
        offer({ id: "1", description: "Experience with Postgres" }),
      ]);

      expect(match?.matchedSkills).toEqual(["PostgreSQL"]);
    });

    it("reports the matched skills in the order of the profile", () => {
      const profile = profileWith("Docker", "Node.js", "Git");

      const [match] = prefilterOffers(profile, [
        offer({ id: "1", description: "git, node.js and docker" }),
      ]);

      expect(match?.matchedSkills).toEqual(["Docker", "Node.js", "Git"]);
    });

    it("returns the original offer object with its extra fields", () => {
      const original = {
        ...offer({ id: "1", description: "Node.js" }),
        company: "Acme",
      };

      const [match] = prefilterOffers(profileWith("Node.js"), [original]);

      expect(match?.offer).toBe(original);
      expect(match?.offer.company).toBe("Acme");
    });
  });

  describe("matching", () => {
    it.each([
      ["node.js", "NODE.JS"],
      ["Node.js", "we use node.JS here"],
      ["TypeScript", "typescript"],
    ])("ignores case: %s in %j", (skill, text) => {
      expect(
        idsFor(profileWith(skill), [offer({ id: "1", description: text })]),
      ).toEqual(["1"]);
    });

    it.each([
      ["Integración continua", "Experiencia en integracion continua"],
      ["Integracion continua", "Experiencia en INTEGRACIÓN CONTINUA"],
      ["Español", "Nivel nativo de espanol"],
    ])("ignores accents: %s in %j", (skill, text) => {
      expect(
        idsFor(profileWith(skill), [offer({ id: "1", description: text })]),
      ).toEqual(["1"]);
    });

    it.each([
      ["React Native", "We build with react-native"],
      ["React-Native", "We build with React Native"],
      ["Spring Boot", "spring_boot services"],
      ["Full Stack", "full\u00A0stack developer"],
    ])(
      "treats hyphens, underscores and spaces alike: %s in %j",
      (skill, text) => {
        expect(
          idsFor(profileWith(skill), [offer({ id: "1", description: text })]),
        ).toEqual(["1"]);
      },
    );

    it.each([
      ["Java", "Java/Kotlin"],
      ["Java", "(Java)"],
      ["Java", "Java, Kotlin"],
      ["Java", "Java."],
      ["Java", "Java 17"],
      ["Java", "Senior Java\nDeveloper"],
      ["Node", "Node.js"],
      ["C++", "C++, Rust"],
      ["C#", "C# and F#"],
      [".NET", "ASP .NET Core"],
      ["SQL", "SQL"],
      ["CI/CD", "CI/CD pipelines"],
    ])("finds %s in %j", (skill, text) => {
      expect(
        idsFor(profileWith(skill), [offer({ id: "1", description: text })]),
      ).toEqual(["1"]);
    });

    it.each([
      ["Java", "JavaScript"],
      ["Java", "Javanese"],
      ["Go", "Google Cloud and Django"],
      ["SQL", "PostgreSQL and MySQL"],
      ["Postgres", "PostgreSQL"],
      ["C", "C++ and C#"],
      ["Vue", "Vue3"],
      ["Node.js", "Nodexjs"],
      ["React", "Reactive programming"],
      ["Git", "GitHub"],
    ])("does not find %s in %j", (skill, text) => {
      expect(
        idsFor(profileWith(skill), [offer({ id: "1", description: text })]),
      ).toEqual([]);
    });

    it.each([
      ["Go", "Go developer"],
      ["Go", "Python, Go, Rust"],
      ["R", "R, Python"],
    ])("matches the short skill %s in %j", (skill, text) => {
      expect(
        idsFor(profileWith(skill), [offer({ id: "1", description: text })]),
      ).toEqual(["1"]);
    });

    it.each([
      ["Go", "we like to go to the office"],
      ["R", "r and d"],
      ["go", "Go developer"],
    ])(
      "matches the short skill %s in %j only with the same case",
      (skill, text) => {
        expect(
          idsFor(profileWith(skill), [offer({ id: "1", description: text })]),
        ).toEqual([]);
      },
    );

    it("treats the special characters of a skill as plain text", () => {
      const offers = [
        offer({ id: "1", description: "Scala (JVM) and Node.js" }),
        offer({ id: "2", description: "Nodexjs" }),
      ];

      expect(idsFor(profileWith("Scala (JVM)", "Node.js"), offers)).toEqual([
        "1",
      ]);
    });

    it("does not let a blank name or alias match everything", () => {
      const profile: Profile = {
        seniority: null,
        yearsOfExperience: null,
        skills: [{ name: "  ", aliases: ["", " "] }],
        targetRoles: [],
        languages: [],
        summary: "",
      };

      expect(
        prefilterOffers(profile, [
          offer({ id: "1", title: "Anything", description: "Anything" }),
        ]),
      ).toEqual([]);
    });
  });

  describe("ordering and limit", () => {
    const profile = profileWith("Node.js", "Docker");

    it("puts the best score first", () => {
      const offers = [
        offer({ id: "1", description: "Docker" }),
        offer({ id: "2", title: "Node.js", description: "Docker" }),
        offer({ id: "3", description: "Node.js and Docker" }),
      ];

      expect(idsFor(profile, offers)).toEqual(["2", "3", "1"]);
    });

    it("breaks ties with the newest posting date, leaving undated offers last", () => {
      const offers = [
        offer({ id: "1", description: "Docker", postedAt: null }),
        offer({
          id: "2",
          description: "Docker",
          postedAt: new Date("2026-11-01T00:00:00Z"),
        }),
        offer({
          id: "3",
          description: "Docker",
          postedAt: new Date("2026-11-05T00:00:00Z"),
        }),
        offer({ id: "4", description: "Docker", postedAt: null }),
      ];

      expect(idsFor(profile, offers)).toEqual(["3", "2", "4", "1"]);
    });

    it("breaks the remaining ties with the highest id, comparing ids as numbers", () => {
      const offers = [
        offer({ id: "9", description: "Docker" }),
        offer({ id: "10", description: "Docker" }),
        offer({ id: "100", description: "Docker" }),
      ];

      expect(idsFor(profile, offers)).toEqual(["100", "10", "9"]);
    });

    it("keeps only the requested number of offers", () => {
      const offers = Array.from({ length: 5 }, (_, index) =>
        offer({ id: String(index + 1), description: "Docker" }),
      );

      expect(idsFor(profile, offers, 2)).toEqual(["5", "4"]);
    });

    it("keeps the best ones when the limit cuts the list", () => {
      const offers = [
        offer({ id: "1", description: "Docker" }),
        offer({ id: "2", title: "Docker engineer" }),
        offer({ id: "3", description: "Docker" }),
      ];

      expect(idsFor(profile, offers, 1)).toEqual(["2"]);
    });

    it(`keeps ${DEFAULT_TOP_K} offers by default`, () => {
      const offers = Array.from({ length: DEFAULT_TOP_K + 20 }, (_, index) =>
        offer({ id: String(index + 1), description: "Docker" }),
      );

      expect(prefilterOffers(profile, offers)).toHaveLength(DEFAULT_TOP_K);
      expect(DEFAULT_TOP_K).toBe(30);
    });

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
      "rejects the limit %s",
      (limit) => {
        expect(() => prefilterOffers(profile, [], limit)).toThrow(
          new RangeError("The limit must be a positive integer"),
        );
      },
    );

    it("does not change the list it receives", () => {
      const offers = [
        offer({ id: "1", description: "Docker" }),
        offer({ id: "2", title: "Docker" }),
      ];
      const copy = [...offers];

      prefilterOffers(profile, offers);

      expect(offers).toEqual(copy);
    });
  });
});
