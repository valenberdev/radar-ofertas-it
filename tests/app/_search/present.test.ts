import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatPostedDate,
  scoreBand,
  SOURCES,
} from "../../../src/app/_search/present";

describe("scoreBand", () => {
  it.each([
    [100, "excellent"],
    [90, "excellent"],
    [89, "good"],
    [70, "good"],
    [69, "partial"],
    [40, "partial"],
    [39, "low"],
    [0, "low"],
  ])("puts %s in the band %s", (score, band) => {
    expect(scoreBand(score)).toBe(band);
  });
});

describe("SOURCES", () => {
  it("links each source to its home page", () => {
    expect(SOURCES).toEqual({
      himalayas: { name: "Himalayas", url: "https://himalayas.app" },
      hackernews: { name: "Hacker News", url: "https://news.ycombinator.com" },
    });
  });
});

describe("formatPostedDate", () => {
  it("writes the date in Spanish", () => {
    expect(formatPostedDate("2026-11-06T15:00:00.000Z", "es")).toBe(
      "6 nov 2026",
    );
  });

  it("writes the date in English", () => {
    expect(formatPostedDate("2026-11-06T15:00:00.000Z", "en")).toBe(
      "Nov 6, 2026",
    );
  });

  it("uses the day in UTC, so it does not move with the time zone of the server", () => {
    expect(formatPostedDate("2026-11-06T23:30:00.000Z", "en")).toBe(
      "Nov 6, 2026",
    );
    expect(formatPostedDate("2026-11-06T00:30:00.000Z", "en")).toBe(
      "Nov 6, 2026",
    );
  });
});

describe("formatDate", () => {
  it("uses the time zone it receives", () => {
    expect(
      formatDate(
        "2026-11-13T01:30:00.000Z",
        "es",
        "America/Argentina/Buenos_Aires",
      ),
    ).toBe("12 nov 2026");
    expect(formatDate("2026-11-13T01:30:00.000Z", "es", "UTC")).toBe(
      "13 nov 2026",
    );
  });

  it("uses the time zone of the browser when it receives none", () => {
    const expected = new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
    }).format(new Date("2026-11-13T01:30:00.000Z"));

    expect(formatDate("2026-11-13T01:30:00.000Z", "en")).toBe(expected);
  });
});
