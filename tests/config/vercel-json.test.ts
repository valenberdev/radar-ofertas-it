import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const SOURCES = ["himalayas", "hackernews"];

const vercelConfigSchema = z.object({
  crons: z.array(z.object({ path: z.string(), schedule: z.string() })),
});

const raw: unknown = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../vercel.json", import.meta.url)),
    "utf8",
  ),
);
const { crons } = vercelConfigSchema.parse(raw);

describe("vercel.json crons", () => {
  it("schedules every ingest source exactly once", () => {
    const paths = crons.map((cron) => cron.path).sort();

    expect(paths).toEqual(
      SOURCES.map((source) => `/api/cron/ingest/${source}`).sort(),
    );
  });

  it.each(crons.map((cron) => [cron.path, cron.schedule]))(
    "runs %s once a day at a fixed time (%s)",
    (_path, schedule) => {
      const match = /^(\d{1,2}) (\d{1,2}) \* \* \*$/.exec(schedule ?? "");

      expect(match).not.toBeNull();
      expect(Number(match?.[1])).toBeLessThan(60);
      expect(Number(match?.[2])).toBeLessThan(24);
    },
  );

  it("does not put two sources in the same hour", () => {
    const hours = crons.map((cron) => cron.schedule.split(" ")[1]);

    expect(new Set(hours).size).toBe(hours.length);
  });
});
