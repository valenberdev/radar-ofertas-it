# ADR-0009: Loading the CV from a file

Status: Accepted (2026-11-17)

## Context

Most people keep their CV as a PDF or a Word file. Copying the text out of a PDF is clumsy, and on a phone it is close to impossible.

The search already works on plain text. The server rejects text over 12,000 characters, redacts emails, phone numbers and URLs, and caches the extracted profile by the hash of the redacted text (ADR-0007). The privacy notice promises that redaction.

Gemini can read a PDF directly, but a PDF sent as is would skip the redaction and the cache.

Loading the CV from Google Drive was also requested.

## Decision

- The file is read in the browser and its text is put into the existing profile field. The server, the redaction, the cache and the limits do not change. The file input has no `name`, so the file is never part of the form data that reaches the server.
- Supported formats are PDF (`pdfjs-dist`), DOCX (`mammoth`) and TXT (`TextDecoder`), up to 5 MB. The kind comes from the extension first and the MIME type second, because browsers on Windows sometimes report no type for DOCX files. Any other format, including the old `.doc`, is rejected with a message.
- Both libraries are loaded with a dynamic `import()` only when a file is chosen. The page itself only ships the small reading code, and the PDF parsing runs in the pdf.js worker.
- The extracted text is normalized: line breaks, invisible characters, repeated spaces and blank lines. Text over 12,000 characters is still loaded, with a warning, so it can be trimmed in place.
- There is no OCR. A scanned PDF has no text layer, so the person is asked to paste the text instead.
- There is no Google Drive integration. The file pickers of Android and iOS already list Drive when its app is installed, and Drive for desktop shows up as a local folder. A Picker integration would need an OAuth client, a consent screen, app verification for the `drive.file` scope and two external scripts, for little gain.

## Consequences

- The person sees the extracted text before searching and can fix what the extraction got wrong.
- The client gains two dependencies. pdf.js 6 targets current browsers. It was tested on desktop Chromium and on a phone; if an older browser fails, the legacy build of pdf.js is the fallback.
- Reading a large file costs the visitor's device, not the server.
- If Drive becomes a requirement, it can feed the same `readCvFile` function without touching the rest.
