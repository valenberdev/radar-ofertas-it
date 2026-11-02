import { describe, expect, it } from "vitest";
import { COUNTRY_GROUPS } from "../../../../src/domain/country-groups";
import type { Region } from "../../../../src/domain/region";
import { regionOfHackerNewsHeader } from "../../../../src/infrastructure/sources/hackernews/map-region";

type Expected = "unknown" | "worldwide" | readonly string[];

const US = ["United States"];
const CANADA = ["Canada"];
const UK = ["United Kingdom"];
const POLAND = ["Poland"];
const INDIA = ["India"];
const US_CA = [...US, ...CANADA];
const EU = [...COUNTRY_GROUPS.europeanUnion];
const EUROPE = [...COUNTRY_GROUPS.europe];
const NA = [...COUNTRY_GROUPS.northAmerica];
const AMERICAS = [...COUNTRY_GROUPS.americas];
const EU_NA = [...EU, ...NA];
const NA_EUROPE = [...NA, ...EUROPE];
const AMERICAS_EUROPE = [...AMERICAS, ...EUROPE];

function sorted(names: readonly string[]): string[] {
  return [...names].sort();
}

function expectRegion(region: Region, expected: Expected): void {
  if (expected === "unknown" || expected === "worldwide") {
    expect(region).toEqual({ kind: expected });
    return;
  }
  expect(region.kind).toBe("countries");
  if (region.kind === "countries") {
    expect(sorted(region.countries)).toEqual(sorted([...new Set(expected)]));
  }
}

const SAMPLE: ReadonlyArray<readonly [string, Expected]> = [
  [
    "Audio/Video Collaboration company, worldwide | GMT-2 <--> GMT+2 | Remote | Full time or part time or contract",
    "unknown",
  ],
  [
    "Mainmatter (https://mainmatter.com/rust-consulting/) | REMOTE (EU) | Lead Rust Engineering Consultant | Full-time | 100–140k€",
    EU,
  ],
  [
    "Arrangr | Growth Lead, Expansion & Lifecycle | REMOTE | Fixed-fee project ($12K, milestone-based) + equity tied to ARR results → founding role | https",
    "unknown",
  ],
  [
    "GC AI | Member of Technical Staff, Applied AI | REMOTE (US/Canada) | $180K–$430K + equity",
    US_CA,
  ],
  [
    "GiveDirectly | Senior Software Engineer | REMOTE in select countries (listed here https://perfectwiki.page/p/iOeyfUha_9) | $181K base + 15% bonus inde",
    "unknown",
  ],
  [
    "Applandeo | Senior Data Scientist | Remote (Poland) or Cracow | B2B from 200 PLN/h+ | 6month project",
    POLAND,
  ],
  [
    "Early-stage Startup | Software Engineer & Data Analyst | Full-Time | REMOTE (US & Canada) | $150,000 - $180,000 USD",
    US_CA,
  ],
  [
    "ORFF Maestra | Prototype Developer; Technical Product Lead | REMOTE (US only) | Contract, part-time | https://orffmaestra.com",
    US,
  ],
  [
    "applyapply | REMOTE (US) or Austin, TX | Full-time | https://applyapply.xyz",
    US,
  ],
  [
    "Sidekick Labs | Senior Technical Product Manager | REMOTE (US Timezones) | Full-time | $170k to $230k Base + Equity + Health",
    US,
  ],
  [
    "Bridge AI Consulting | AI Consultant, Junior AI Consultant | REMOTE (US) | Full-time | $60K–$100K base + upside for new business, equity possible | Vi",
    US,
  ],
  [
    "ParadeDB (YC S23, https://paradedb.com) | Database Internals Engineers, Platform Engineers | Remote or hybrid in San Francisco | Full-time",
    "unknown",
  ],
  ["ClickHouse | Remote | Full-time | https://clickhouse.com/", "unknown"],
  [
    "depproof | Part-time B2B Sales Lead | REMOTE (US) | Part-time | Equity + commission | https://depproof.com",
    US,
  ],
  [
    "Kraken Tech | Senior Software Engineer - AI Foundations | London, Paris, Berlin, Tokyo, New York, Remote | Full Time | https://kraken.tech",
    "unknown",
  ],
  [
    "Postscript (YC W19) | Senior Software Engineer, Full Stack | REMOTE (US, Canada) | Full-time | $180K to $220K base + equity",
    US_CA,
  ],
  [
    "SingleStore | Software Engineer, AI Platform | Full Time, Remote India",
    INDIA,
  ],
  [
    "Fastly | Software Engineers (Senior, Staff, Principal) | US, UK, EU, APAC ONSITE PREFERRED | Full-time",
    "unknown",
  ],
  [
    "StartupHakk | AI Engineer Apprentice | Remote (UT or ID residents only) | Full-time | $7.25–$10/hr | startuphakk.com/jobs",
    "unknown",
  ],
  [
    "Tahoma AI | tahoma.io | Austin, TX or Seattle, WA (ONSITE optional) | REMOTE (US) | Full-time | Founding Engineer",
    US,
  ],
  [
    "Radar Labs | Software Engineers (SRE, ML, backend, full-stack, mobile, security, QA) | Remote (US), NYC | Full Time | https://radar.com",
    US,
  ],
  [
    "Sudowrite | https://sudowrite.com | √ REMOTE (US) | √ PMF | √ PROFITABLE | Full-Time",
    US,
  ],
  [
    "NetBird | Berlin, Germany (or remote, CET/CEST overlap) | Full-time https://netbird.io/careers",
    "unknown",
  ],
  [
    "Search Atlas | Product Engineer (Product Manager role, not a Full-stack role) | REMOTE (anywhere, EST hours) | Full-time contractor | $23-$34 USD/hour",
    "unknown",
  ],
  [
    "FunnelStory | MTS, Applied ML | Remote (India) | Full-Time | https://funnelstory.ai",
    INDIA,
  ],
  [
    "PlantingSpace | Full-time | Remote (EU time zone) + Quarterly Meet-ups | https://planting.space",
    EU,
  ],
  [
    "OpenRent | London, UK | Full-Time | ONSITE+PART REMOTE | https://www.openrent.co.uk",
    "unknown",
  ],
  [
    "FUTO | https://futo.tech/ | Austin, TX | REMOTE(Worldwide) or ONSITE | Full Time",
    "worldwide",
  ],
  ["Software Engineer — Remote — US Only", US],
  [
    "NEO Holdings (stealth, regulated commodity markets infrastructure) | Malibu, CA | ONSITE (SoCal preferred) or REMOTE (US) | Full Time",
    US,
  ],
  [
    "Oklo | Remote (US) or Santa Clara or Brooklyn | Full time | https://oklo.com",
    US,
  ],
  [
    "PostHog | Full-Time | Technical CSMs, Product Managers, AI Research Engineer | REMOTE (all remote) | Hiring GMT-8 to GMT+2 | PostHog makes your produc",
    "unknown",
  ],
  [
    "vvd | Worldbuilding and storytelling platform (Remote / EU/NA timezones)",
    EU_NA,
  ],
  [
    "Ojin | Lead Platform Engineer | HYBRID (Berlin) or REMOTE (CET ±2h) | Full-time",
    "unknown",
  ],
  ["Manifest | https://www.manifestcyber.com/ | REMOTE (US) | Full Time", US],
  [
    "AssumeAI | AI Engineer (£30/hr) and Senior AI Engineer (£50/hr) | Contract | REMOTE (UK) | https://assume-ai.com",
    UK,
  ],
  [
    "Elman (Deep Science Ventures) | Co-founder & CTO | London, UK-based preferred / REMOTE considered | Full-time | Pre-seed",
    "unknown",
  ],
  [
    "General Intelligence Holdings | https://www.generalintelligenceholdings.com | Founding CTO | REMOTE (UK working-hour overlap preferred) | Fundraising ",
    "unknown",
  ],
  [
    "Tangram Vision | Calibration Engineer | Remote (US preferred) | Full Time | $160k-$180k + equity",
    "unknown",
  ],
  [
    "Sphinx Defense | Software Engineering | Remote (US Only) | https://www.sphinxdefense.com",
    US,
  ],
  [
    "Trackerbot | Full-Stack Developer (Node.js) | REMOTE | €35-45k/year",
    "unknown",
  ],
  [
    "Relevant Healthcare | Lead Engineer | Remote (US/Canada only) | Full-time",
    US_CA,
  ],
  [
    "KSC Trading | Remote | Full-Time | Senior Backend Software Engineer | $200k to $250k USD Total Compensation + Benefits",
    "unknown",
  ],
  [
    "Paramark | Software Engineer (L4) | San Francisco HYBRID (3 days/wk) or REMOTE (US) | Full-time | $199K–$249K + equity",
    US,
  ],
  ["Curai | Remote (US) | Full-time | https://curaihealth.com", US],
  [
    "CareerJumpShip | Multiple engineering + go-to-market roles | Remote-first",
    "unknown",
  ],
  [
    "Baserow (https://baserow.io) | Product Specialist | REMOTE (Europe) | Full-time | German-speaking",
    EUROPE,
  ],
  ["Mastra | Founding Sales (Founding AE) | US Remote | Full-time", US],
  ["Location: Spain", "unknown"],
  [
    "Stratirus (a Tennetech company) | AI Developer + Linux Admin (junior to mid) | REMOTE (US only, Central Time hours) | US work authorization required, ",
    "unknown",
  ],
  ["Qualcomm | Canada | Full Time | Engineer | Remote(Canada)| QEMU", CANADA],
  ["Location: Dubrovnik, Croatia (CET)", "unknown"],
  [
    "PrairieLearn (Remote US) — Full-Stack Software Engineer — TypeScript / Postgres / React / AI",
    US,
  ],
  [
    "Better Stack | https://betterstack.com/ | /^Full-?stack Engineer$/i | Remote (North America & Europe)",
    NA_EUROPE,
  ],
  [
    "Distru (https://www.distru.com) | AI Product Engineer | AI Product Manager | VP of Product (AI focus) | REMOTE (Americas & Europe) | Full-Time",
    AMERICAS_EUROPE,
  ],
  [
    "Stream | Multiple Positions | Amsterdam (NL), Skopje (North Macedonia) | Boulder, CO (US) | Toronto (Canada)) | Remote possible | Full Time | Visa Spo",
    "unknown",
  ],
  [
    "Brilliant.org | Senior/Staff Software Engineer (Interactives) | Remote (North America), SF, NYC | Full-time | $180k-$250k | https://brilliant.org",
    NA,
  ],
  [
    "Tether | AI Harness Engineer | REMOTE (Worldwide) | Full-time",
    "worldwide",
  ],
  ["HRS Systems | https://hrssystems.com | Remote (US) | Full-Time | SWE", US],
  [
    "Wipro.com | Multiple roles - Software - AI - FDE - Cloud | Global (US/CAN/EU/India) | on-site and remote",
    "unknown",
  ],
];

describe("regionOfHackerNewsHeader", () => {
  describe("headers sampled from the real threads", () => {
    it.each(SAMPLE)("%s", (header, expected) => {
      expectRegion(regionOfHackerNewsHeader(header), expected);
    });
  });

  describe("where the scope is", () => {
    it.each([
      ["Acme | Engineer | REMOTE (US) | Full-time", US],
      ["Acme | Engineer | Remote(US) | Full-time", US],
      ["Acme | Engineer | remote (us) | Full-time", US],
      ["Acme (Remote US) | Engineer", US],
      ["Acme | Engineer | US Remote | Full-time", US],
      ["Acme | Engineer | Remote - US", US],
      ["Acme | Engineer | Remote: US", US],
      ["Acme | Engineer | Remote, US", US],
      ["Acme | Engineer | Remote US", US],
    ])("reads %j", (header, expected) => {
      expectRegion(regionOfHackerNewsHeader(header), expected);
    });
  });

  describe("names", () => {
    it.each([
      ["USA", US],
      ["U.S.", US],
      ["United States", US],
      ["United States of America", US],
      ["UK", UK],
      ["Great Britain", UK],
      ["LatAm", COUNTRY_GROUPS.latinAmerica],
      ["Latin America", COUNTRY_GROUPS.latinAmerica],
      ["the Americas", AMERICAS],
      ["Czech Republic", ["Czechia"]],
      ["Russia", ["Russian Federation"]],
      ["Argentina", ["Argentina"]],
      ["argentina", ["Argentina"]],
      ["Germany", ["Germany"]],
    ])("understands %s", (scope, expected) => {
      expectRegion(
        regionOfHackerNewsHeader(
          `Acme | Engineer | REMOTE (${scope}) | Full-time`,
        ),
        expected,
      );
    });

    it.each([
      "Worldwide",
      "world wide",
      "Anywhere",
      "anywhere in the world",
      "Global",
      "globally",
    ])("takes %s for worldwide", (scope) => {
      expectRegion(
        regionOfHackerNewsHeader(
          `Acme | Engineer | REMOTE (${scope}) | Full-time`,
        ),
        "worldwide",
      );
    });

    it("does not take the American state of Georgia for the country", () => {
      expectRegion(
        regionOfHackerNewsHeader(
          "Acme | Engineer | REMOTE (Georgia) | Full-time",
        ),
        "unknown",
      );
    });
  });

  describe("lists", () => {
    it.each([
      ["US/Canada", US_CA],
      ["US, Canada", US_CA],
      ["US & Canada", US_CA],
      ["US + Canada", US_CA],
      ["US and Canada", US_CA],
      ["US or Canada", US_CA],
      ["US; Canada", US_CA],
      ["US, US, Canada", US_CA],
      ["Argentina, Brazil, Chile", ["Argentina", "Brazil", "Chile"]],
    ])("reads %s", (scope, expected) => {
      expectRegion(
        regionOfHackerNewsHeader(`Acme | REMOTE (${scope}) | Full-time`),
        expected,
      );
    });

    it("lets worldwide win over a country in the same list", () => {
      expectRegion(
        regionOfHackerNewsHeader("Acme | REMOTE (Worldwide, US) | Full-time"),
        "worldwide",
      );
    });

    it("gives up on the whole list when one term is not understood", () => {
      expectRegion(
        regionOfHackerNewsHeader(
          "Acme | REMOTE (US, somewhere nice) | Full-time",
        ),
        "unknown",
      );
      expectRegion(
        regionOfHackerNewsHeader("Acme | REMOTE (Narnia) | Full-time"),
        "unknown",
      );
    });
  });

  describe("qualifiers", () => {
    it.each([
      ["US only", US],
      ["US Only", US],
      ["US timezones", US],
      ["US time zone", US],
      ["EU time zones", EU],
      ["US-based", US],
      ["US/Canada only", US_CA],
    ])("ignores the qualifier in %s", (scope, expected) => {
      expectRegion(
        regionOfHackerNewsHeader(`Acme | REMOTE (${scope}) | Full-time`),
        expected,
      );
    });

    it.each([
      "US preferred",
      "US hours",
      "US residents",
      "EST hours",
      "GMT-8 to GMT+2",
      "CET ±2h",
      "UT or ID residents only",
    ])("does not read %s as a place", (scope) => {
      expectRegion(
        regionOfHackerNewsHeader(`Acme | REMOTE (${scope}) | Full-time`),
        "unknown",
      );
    });
  });

  describe("what is not a scope", () => {
    it.each([
      "",
      "Acme | Engineer | Full-time",
      "Acme | Engineer | REMOTE | Full-time",
      "Acme | Engineer | Remote",
      "Acme | Engineer | Remote-first",
      "Acme | Engineer | Remote possible",
      "Acme | Engineer | Remote or hybrid in Berlin",
      "Acme | Engineer | Fully remote | Full-time",
      "Acme | Berlin, Germany | hybrid",
      "Acme | Engineer | remotely | US",
      "Acme | Engineer | Remote $150k",
    ])("is unknown for %j", (header) => {
      expect(regionOfHackerNewsHeader(header)).toEqual({ kind: "unknown" });
    });

    it("ignores a company called Remote", () => {
      expectRegion(
        regionOfHackerNewsHeader(
          "Remote.com | Engineer | REMOTE (US) | Full-time",
        ),
        US,
      );
      expect(
        regionOfHackerNewsHeader("Remote.com | Engineer | Full-time"),
      ).toEqual({ kind: "unknown" });
    });

    it("is unknown for a parenthesis that never closes", () => {
      expect(regionOfHackerNewsHeader("Acme | Engineer | Remote (US")).toEqual({
        kind: "unknown",
      });
      expect(regionOfHackerNewsHeader("Acme | Engineer | Remote ()")).toEqual({
        kind: "unknown",
      });
    });

    it("does not read the place of an office as the scope", () => {
      expect(
        regionOfHackerNewsHeader("Acme | Berlin, Germany or remote"),
      ).toEqual({ kind: "unknown" });
      expect(
        regionOfHackerNewsHeader("Acme | Berlin, Germany | Remote"),
      ).toEqual({ kind: "unknown" });
    });
  });

  describe("which mention decides", () => {
    it("uses the first mention that has a scope", () => {
      expectRegion(
        regionOfHackerNewsHeader(
          "Acme | Remote | Engineer | REMOTE (US) | Full-time",
        ),
        US,
      );
    });

    it("does not look further once a scope was found, even if it is not understood", () => {
      expectRegion(
        regionOfHackerNewsHeader(
          "Acme | REMOTE (somewhere nice) | or REMOTE (US)",
        ),
        "unknown",
      );
    });

    it("skips a mention that has no scope at all", () => {
      expectRegion(
        regionOfHackerNewsHeader(
          "Acme | Fully remote | Engineer | REMOTE (US) | Full-time",
        ),
        US,
      );
    });

    it("keeps the scope that sits next to the first mention", () => {
      expectRegion(
        regionOfHackerNewsHeader("Acme | Remote (US) or Remote (Europe)"),
        US,
      );
    });
  });
});
