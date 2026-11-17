export const MAX_CV_FILE_BYTES = 5 * 1024 * 1024;

export type CvFileKind = "pdf" | "docx" | "txt";

export type CvFileError =
  | "unsupported_type"
  | "too_large"
  | "empty_file"
  | "no_text"
  | "unreadable";

export interface CvFileInfo {
  readonly name: string;
  readonly type: string;
  readonly size: number;
}

const PDF_TYPE = "application/pdf";
const DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const TXT_TYPE = "text/plain";

export const CV_FILE_ACCEPT = [
  ".pdf",
  ".docx",
  ".txt",
  PDF_TYPE,
  DOCX_TYPE,
  TXT_TYPE,
].join(",");

const KIND_BY_EXTENSION: Readonly<Record<string, CvFileKind>> = {
  pdf: "pdf",
  docx: "docx",
  txt: "txt",
};
const KIND_BY_TYPE: Readonly<Record<string, CvFileKind>> = {
  [PDF_TYPE]: "pdf",
  [DOCX_TYPE]: "docx",
  [TXT_TYPE]: "txt",
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export function cvFileKind(file: CvFileInfo): CvFileKind | null {
  return (
    KIND_BY_EXTENSION[extensionOf(file.name)] ?? KIND_BY_TYPE[file.type] ?? null
  );
}

export type CvFileCheck =
  | { readonly ok: true; readonly kind: CvFileKind }
  | { readonly ok: false; readonly error: CvFileError };

export function checkCvFile(file: CvFileInfo): CvFileCheck {
  const kind = cvFileKind(file);
  if (kind === null) {
    return { ok: false, error: "unsupported_type" };
  }
  if (file.size === 0) {
    return { ok: false, error: "empty_file" };
  }
  if (file.size > MAX_CV_FILE_BYTES) {
    return { ok: false, error: "too_large" };
  }
  return { ok: true, kind };
}

const INVISIBLE =
  /[\u0000-\u0008\u000B-\u001F\u007F\u00AD\u200B-\u200D\u2060\uFEFF]/g;
const WIDE_SPACE = /[\t\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

export function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(WIDE_SPACE, " ")
    .replace(INVISIBLE, "")
    .split("\n")
    .map((line) => line.replace(/ {2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface PdfTextItem {
  readonly str: string;
  readonly hasEOL: boolean;
}

export function joinPdfItems(items: readonly PdfTextItem[]): string {
  return items
    .map((item) => (item.hasEOL ? `${item.str}\n` : item.str))
    .join("");
}

export type CvTextReader = (data: ArrayBuffer) => Promise<string>;

export type CvTextReaders = Readonly<Record<CvFileKind, CvTextReader>>;

export type ReadCvFileResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly error: CvFileError };

export async function readCvFile(
  file: File,
  readers: CvTextReaders,
): Promise<ReadCvFileResult> {
  const check = checkCvFile(file);
  if (!check.ok) {
    return check;
  }
  let raw: string;
  try {
    raw = await readers[check.kind](await file.arrayBuffer());
  } catch {
    return { ok: false, error: "unreadable" };
  }
  const text = normalizeExtractedText(raw);
  return text === "" ? { ok: false, error: "no_text" } : { ok: true, text };
}
