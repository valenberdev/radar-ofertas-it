import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../src/domain/source-offer";
import { mapHimalayasJob } from "../../../../src/infrastructure/sources/himalayas/map-job";

type JsonObject = { [key: string]: JsonValue };

function makeJob(overrides: JsonObject = {}): JsonObject {
  return {
    title: "Senior Backend Engineer",
    excerpt: "Build and run our payments API.",
    companyName: "Acme Corp",
    companySlug: "acme-corp",
    employmentType: "Full Time",
    seniority: ["Senior"],
    locationRestrictions: ["Argentina", "Brazil"],
    timezoneRestrictions: [-3],
    parentCategories: ["Developer"],
    description: "<p>We are hiring.</p>",
    pubDate: 1793117001,
    expiryDate: 1798301000,
    applicationLink:
      "https://himalayas.app/companies/acme-corp/jobs/senior-backend-engineer?utm_source=api",
    guid: "https://himalayas.app/companies/acme-corp/jobs/senior-backend-engineer",
    ...overrides,
  };
}

function without(job: JsonObject, key: string): JsonObject {
  const copy = { ...job };
  delete copy[key];
  return copy;
}

describe("mapHimalayasJob", () => {
  it("maps the fields of a complete job", () => {
    const offer = mapHimalayasJob(makeJob());

    expect(offer.source).toBe("himalayas");
    expect(offer.sourceId).toBe(
      "https://himalayas.app/companies/acme-corp/jobs/senior-backend-engineer",
    );
    expect(offer.title).toBe("Senior Backend Engineer");
    expect(offer.company).toBe("Acme Corp");
    expect(offer.description).toBe("<p>We are hiring.</p>");
  });

  it("converts unix seconds to dates", () => {
    const offer = mapHimalayasJob(makeJob());

    expect(offer.postedAt?.toISOString()).toBe("2026-10-27T16:03:21.000Z");
    expect(offer.expiresAt?.toISOString()).toBe("2026-12-26T16:03:20.000Z");
  });

  it("keeps the application link exactly as received", () => {
    const link =
      "https://himalayas.app/companies/acme-corp/jobs/x?utm_source=api&ref=A%20B";

    expect(mapHimalayasJob(makeJob({ applicationLink: link })).url).toBe(link);
  });

  it("keeps the whole original payload in raw, including fields it does not map", () => {
    const job = makeJob({ somethingNew: { nested: [1, 2, 3] } });

    expect(mapHimalayasJob(job).raw).toEqual(job);
  });

  it("trims the title and the company", () => {
    const offer = mapHimalayasJob(
      makeJob({ title: "  Data Engineer \n", companyName: "  Acme Corp " }),
    );

    expect(offer.title).toBe("Data Engineer");
    expect(offer.company).toBe("Acme Corp");
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["blank", "   "],
  ])("uses a null company when companyName is %s", (_label, value) => {
    const job =
      value === undefined
        ? without(makeJob(), "companyName")
        : makeJob({ companyName: value });

    expect(mapHimalayasJob(job).company).toBeNull();
  });

  it("uses null dates when pubDate and expiryDate are missing or null", () => {
    const missing = mapHimalayasJob(
      without(without(makeJob(), "pubDate"), "expiryDate"),
    );
    const nulls = mapHimalayasJob(makeJob({ pubDate: null, expiryDate: null }));

    expect(missing.postedAt).toBeNull();
    expect(missing.expiresAt).toBeNull();
    expect(nulls.postedAt).toBeNull();
    expect(nulls.expiresAt).toBeNull();
  });

  it("rejects timestamps that look like milliseconds", () => {
    expect(() => mapHimalayasJob(makeJob({ pubDate: 1793117001000 }))).toThrow(
      /pubDate/,
    );
  });

  it.each([
    ["javascript:alert(1)"],
    ["data:text/html,hello"],
    ["//evil.example/apply"],
    ["himalayas.app/jobs/1"],
    [""],
  ])("rejects an application link that is not http(s): %j", (link) => {
    expect(() => mapHimalayasJob(makeJob({ applicationLink: link }))).toThrow(
      /applicationLink/,
    );
  });

  it.each([["guid"], ["title"], ["description"], ["applicationLink"]])(
    "rejects a job without %s",
    (key) => {
      expect(() => mapHimalayasJob(without(makeJob(), key))).toThrow(
        new RegExp(key),
      );
    },
  );

  it("rejects a blank title", () => {
    expect(() => mapHimalayasJob(makeJob({ title: "   " }))).toThrow(/title/);
  });

  it("does not put the rejected value in the error message", () => {
    let message = "";
    try {
      mapHimalayasJob(
        makeJob({ applicationLink: "javascript:steal(document.cookie)" }),
      );
    } catch (error) {
      message = error instanceof Error ? error.message : "";
    }

    expect(message).toContain("applicationLink");
    expect(message).not.toContain("steal");
  });

  it.each([[null], [[]], ["text"], [42]])(
    "rejects input that is not an object: %j",
    (input) => {
      expect(() => mapHimalayasJob(input)).toThrow(/Invalid Himalayas job/);
    },
  );
});
