import { joinPdfItems, type CvTextReaders, type PdfTextItem } from "./cv-file";

async function readPdf(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  try {
    const pdf = await task.promise;
    const pages: string[] = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const items = content.items.filter(
        (item): item is PdfTextItem & typeof item => "str" in item,
      );
      pages.push(joinPdfItems(items));
    }
    return pages.join("\n\n");
  } finally {
    await task.destroy();
  }
}

async function readDocx(data: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: data });
  return result.value;
}

async function readTxt(data: ArrayBuffer): Promise<string> {
  return new TextDecoder("utf-8").decode(data);
}

export const CV_TEXT_READERS: CvTextReaders = {
  pdf: readPdf,
  docx: readDocx,
  txt: readTxt,
};
