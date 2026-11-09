import { describe, expect, it } from "vitest";
import { pacificDay } from "../../src/domain/pacific-day";

describe("pacificDay", () => {
  it.each([
    ["2026-06-30T06:59:59Z", "2026-06-29"],
    ["2026-06-30T07:00:00Z", "2026-06-30"],
    ["2026-07-01T06:59:59Z", "2026-06-30"],
    ["2026-07-01T07:00:00Z", "2026-07-01"],
    ["2026-11-01T07:59:59Z", "2026-11-01"],
    ["2026-11-02T07:59:59Z", "2026-11-01"],
    ["2026-11-02T08:00:00Z", "2026-11-02"],
    ["2026-11-09T03:00:00Z", "2026-11-08"],
    ["2026-11-09T12:00:00Z", "2026-11-09"],
  ])("maps %s to %s", (instant, day) => {
    expect(pacificDay(new Date(instant))).toBe(day);
  });

  it("changes day at midnight in Argentina minus five hours in november", () => {
    expect(pacificDay(new Date("2026-11-09T07:59:59Z"))).toBe("2026-11-08");
    expect(pacificDay(new Date("2026-11-09T08:00:00Z"))).toBe("2026-11-09");
  });

  it("handles the daylight saving start (march) and end (november)", () => {
    expect(pacificDay(new Date("2026-03-08T09:59:59Z"))).toBe("2026-03-08");
    expect(pacificDay(new Date("2026-03-08T10:00:00Z"))).toBe("2026-03-08");
    expect(pacificDay(new Date("2026-03-09T06:59:59Z"))).toBe("2026-03-08");
    expect(pacificDay(new Date("2026-03-09T07:00:00Z"))).toBe("2026-03-09");
  });

  it("pads month and day with zeros", () => {
    expect(pacificDay(new Date("2026-01-05T12:00:00Z"))).toBe("2026-01-05");
  });

  it("rejects an invalid date", () => {
    expect(() => pacificDay(new Date("not a date"))).toThrow(
      new RangeError("Invalid date"),
    );
  });
});
