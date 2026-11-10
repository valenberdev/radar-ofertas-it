import { describe, expect, it } from "vitest";
import type {
  LabelingItem,
  LabelingPersona,
} from "../../../scripts/eval/labeling-items.mts";
import {
  buildLabelingPage,
  EXPORT_NAMES,
} from "../../../scripts/eval/labeling-page.mts";

const PERSONA: LabelingPersona = {
  id: "a-junior-backend",
  label: "A · Junior backend",
  seniority: "junior",
  yearsOfExperience: 1,
  skills: ["Node.js"],
  targetRoles: ["Backend Developer"],
  cvText: "Texto del CV",
};

const ITEM: LabelingItem = {
  persona: "a-junior-backend",
  offerKey: "himalayas:abc",
  contentHash: "a".repeat(64),
  title: "Backend Engineer",
  company: "Acme",
  url: "https://example.com/1",
  description: "Node.js",
  postedAt: "2026-11-01T12:00:00.000Z",
};

function page(
  items: readonly LabelingItem[],
  mode: "label" | "retest" = "label",
): string {
  return buildLabelingPage({
    mode,
    snapshotId: "2026-11-10",
    personas: [PERSONA],
    items,
  });
}

function embedded(html: string): {
  mode: string;
  snapshotId: string;
  heading: string;
  exportName: string;
  personas: unknown[];
  items: LabelingItem[];
} {
  const match =
    /<script type="application\/json" id="data">([\s\S]*?)<\/script>/.exec(
      html,
    );
  if (match === null || match[1] === undefined) {
    throw new Error("No data block");
  }
  return JSON.parse(match[1]);
}

describe("buildLabelingPage", () => {
  it("is a complete html document", () => {
    const html = page([ITEM]);

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="es">');
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
  });

  it("carries the data it needs to work offline", () => {
    const data = embedded(page([ITEM]));

    expect(data).toEqual({
      mode: "label",
      snapshotId: "2026-11-10",
      heading: "Etiquetado de encaje",
      exportName: "labels.json",
      personas: [PERSONA],
      items: [ITEM],
    });
  });

  it("uses another heading and export name for the retest", () => {
    const data = embedded(page([ITEM], "retest"));

    expect(data.heading).toBe(
      "Re-etiquetado: no mires tus respuestas anteriores",
    );
    expect(data.exportName).toBe("labels-retest.json");
  });

  it("names the export files", () => {
    expect(EXPORT_NAMES).toEqual({
      label: "labels.json",
      retest: "labels-retest.json",
    });
  });

  it("has one button for each of the four bands", () => {
    const html = page([ITEM]);

    for (const band of [0, 1, 2, 3]) {
      expect(html).toContain(`data-band="${band}"`);
    }
    expect(html.match(/data-band="/g)).toHaveLength(4);
  });

  it("does not load anything from the network", () => {
    const html = page([ITEM]);

    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+href=/i);
    expect(html).not.toMatch(/@import/);
    expect(html).not.toMatch(/\bfetch\(/);
  });

  it("never assigns offer text as html", () => {
    expect(page([ITEM])).not.toMatch(
      /innerHTML|insertAdjacentHTML|outerHTML|document\.write/,
    );
  });

  describe("with hostile offer text", () => {
    const hostile = [
      "</script><script>alert(1)</script>",
      "<!-- <script>",
      `line${String.fromCharCode(0x2028)}separator${String.fromCharCode(0x2029)}paragraph`,
      '"quotes" \\ back\\slash',
      "<img src=x onerror=alert(1)>",
    ].join("\n");
    const html = page([
      { ...ITEM, title: hostile, description: hostile, company: hostile },
    ]);

    it("keeps exactly the two script tags of the page", () => {
      expect(html.match(/<\/script>/gi)).toHaveLength(2);
      expect(html.match(/<script/gi)).toHaveLength(2);
    });

    it("keeps the data block free of raw angle brackets", () => {
      const block =
        /<script type="application\/json" id="data">([\s\S]*?)<\/script>/.exec(
          html,
        )?.[1] ?? "";

      expect(block).not.toContain("<");
    });

    it("keeps the line and paragraph separators escaped", () => {
      const block =
        /<script type="application\/json" id="data">([\s\S]*?)<\/script>/.exec(
          html,
        )?.[1] ?? "";

      expect(block).not.toContain(String.fromCharCode(0x2028));
      expect(block).not.toContain(String.fromCharCode(0x2029));
    });

    it("gives the same text back when the data is parsed", () => {
      const [item] = embedded(html).items;

      expect(item?.title).toBe(hostile);
      expect(item?.description).toBe(hostile);
      expect(item?.company).toBe(hostile);
    });
  });

  it("handles a page with no items", () => {
    expect(embedded(page([])).items).toEqual([]);
  });

  it("round-trips a large number of items", () => {
    const items = Array.from({ length: 135 }, (_, index) => ({
      ...ITEM,
      offerKey: `himalayas:${index}`,
      description: `Description ${index} <b>`,
    }));

    expect(embedded(page(items)).items).toEqual(items);
  });
});
