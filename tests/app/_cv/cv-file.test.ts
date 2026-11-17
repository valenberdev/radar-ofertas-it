import { describe, expect, it, vi } from "vitest";
import {
  checkCvFile,
  cvFileKind,
  joinPdfItems,
  MAX_CV_FILE_BYTES,
  normalizeExtractedText,
  readCvFile,
  type CvTextReaders,
} from "@/app/_cv/cv-file";

const DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function info(name: string, type = "", size = 10) {
  return { name, type, size };
}

function readers(overrides: Partial<CvTextReaders> = {}): CvTextReaders {
  return {
    pdf: vi.fn(async () => "pdf text"),
    docx: vi.fn(async () => "docx text"),
    txt: vi.fn(async () => "txt text"),
    ...overrides,
  };
}

describe("cvFileKind", () => {
  it.each([
    ["cv.pdf", "pdf"],
    ["CV.PDF", "pdf"],
    ["mi.cv.final.docx", "docx"],
    ["notes.txt", "txt"],
  ])("reads the kind of %s from its extension", (name, kind) => {
    expect(cvFileKind(info(name))).toBe(kind);
  });

  it("trusts the extension over the browser type", () => {
    expect(cvFileKind(info("cv.pdf", "text/plain"))).toBe("pdf");
  });

  it.each([
    ["application/pdf", "pdf"],
    [DOCX_TYPE, "docx"],
    ["text/plain", "txt"],
  ])(
    "falls back to the type %s when the name has no known extension",
    (type, kind) => {
      expect(cvFileKind(info("cv", type))).toBe(kind);
    },
  );

  it.each([
    info("cv.doc", "application/msword"),
    info("cv.odt"),
    info("photo.png", "image/png"),
    info("cv"),
  ])("rejects %j", (file) => {
    expect(cvFileKind(file)).toBeNull();
  });
});

describe("checkCvFile", () => {
  it("accepts a supported file within the size limit", () => {
    expect(checkCvFile(info("cv.pdf", "", MAX_CV_FILE_BYTES))).toEqual({
      ok: true,
      kind: "pdf",
    });
  });

  it("rejects a file one byte over the limit", () => {
    expect(checkCvFile(info("cv.pdf", "", MAX_CV_FILE_BYTES + 1))).toEqual({
      ok: false,
      error: "too_large",
    });
  });

  it("rejects an empty file", () => {
    expect(checkCvFile(info("cv.txt", "", 0))).toEqual({
      ok: false,
      error: "empty_file",
    });
  });

  it("reports the type before the size", () => {
    expect(checkCvFile(info("cv.doc", "", 0))).toEqual({
      ok: false,
      error: "unsupported_type",
    });
  });
});

describe("normalizeExtractedText", () => {
  it("turns Windows and old Mac line breaks into plain ones", () => {
    expect(normalizeExtractedText("a\r\nb\rc")).toBe("a\nb\nc");
  });

  it("turns tabs and non-breaking spaces into single spaces", () => {
    expect(normalizeExtractedText("React\tNext.js\u00A0\u00A0Vitest")).toBe(
      "React Next.js Vitest",
    );
  });

  it("removes invisible characters", () => {
    expect(normalizeExtractedText("\uFEFFNode\u0000.js\u200B")).toBe("Node.js");
  });

  it("trims every line and keeps at most one blank line in a row", () => {
    expect(normalizeExtractedText("  Ana  \n\n\n\n  Backend   dev  \n")).toBe(
      "Ana\n\nBackend dev",
    );
  });

  it("keeps accents and symbols", () => {
    expect(normalizeExtractedText("Inglés C1 · C#")).toBe("Inglés C1 · C#");
  });

  it("returns an empty text when there is only whitespace", () => {
    expect(normalizeExtractedText(" \n\t\n ")).toBe("");
  });
});

describe("joinPdfItems", () => {
  it("adds a line break only after the items that end a line", () => {
    expect(
      joinPdfItems([
        { str: "Ana", hasEOL: false },
        { str: " Pérez", hasEOL: true },
        { str: "Backend", hasEOL: false },
      ]),
    ).toBe("Ana Pérez\nBackend");
  });

  it("returns an empty text for a page without items", () => {
    expect(joinPdfItems([])).toBe("");
  });
});

describe("readCvFile", () => {
  it("uses the reader of the file kind and returns the normalized text", async () => {
    const all = readers({
      docx: vi.fn(async () => "  Ana\r\n\r\n\r\nBackend  "),
    });

    expect(await readCvFile(new File(["x"], "cv.docx"), all)).toEqual({
      ok: true,
      text: "Ana\n\nBackend",
    });
    expect(all.docx).toHaveBeenCalledOnce();
    expect(all.pdf).not.toHaveBeenCalled();
    expect(all.txt).not.toHaveBeenCalled();
  });

  it("passes the bytes of the file to the reader", async () => {
    const pdf = vi.fn(async (data: ArrayBuffer) =>
      new TextDecoder().decode(data),
    );

    expect(
      await readCvFile(new File(["raw bytes"], "cv.pdf"), readers({ pdf })),
    ).toEqual({ ok: true, text: "raw bytes" });
  });

  it("does not read a file that fails the check", async () => {
    const all = readers();

    expect(await readCvFile(new File(["x"], "cv.doc"), all)).toEqual({
      ok: false,
      error: "unsupported_type",
    });
    expect(all.pdf).not.toHaveBeenCalled();
    expect(all.docx).not.toHaveBeenCalled();
    expect(all.txt).not.toHaveBeenCalled();
  });

  it("reports a reader that throws as unreadable", async () => {
    const pdf = vi.fn(async () => {
      throw new Error("Invalid PDF structure");
    });

    expect(
      await readCvFile(new File(["x"], "cv.pdf"), readers({ pdf })),
    ).toEqual({ ok: false, error: "unreadable" });
  });

  it("reports a file without text, like a scanned PDF", async () => {
    const pdf = vi.fn(async () => " \n\n ");

    expect(
      await readCvFile(new File(["x"], "cv.pdf"), readers({ pdf })),
    ).toEqual({ ok: false, error: "no_text" });
  });
});
