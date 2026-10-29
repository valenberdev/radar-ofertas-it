const NAMED_ENTITIES: ReadonlyMap<string, string> = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", " "],
]);

const ANCHOR = /<a\s[^>]*?href=(?:"([^"]*)"|'([^']*)')[^>]*>[^<]*<\/a>/gi;
const PARAGRAPH = /<\/?p\s*>/gi;
const TAG = /<\/?[a-z][a-z0-9]*(?:\s[^>]*)?>/gi;
const ENTITY = /&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g;

function isValidCodePoint(codePoint: number): boolean {
  return (
    Number.isInteger(codePoint) &&
    codePoint > 0 &&
    codePoint <= 0x10ffff &&
    !(codePoint >= 0xd800 && codePoint <= 0xdfff)
  );
}

function decodeEntity(match: string, body: string): string {
  if (body.startsWith("#")) {
    const isHex = body[1] === "x" || body[1] === "X";
    const codePoint = Number.parseInt(
      body.slice(isHex ? 2 : 1),
      isHex ? 16 : 10,
    );
    return isValidCodePoint(codePoint)
      ? String.fromCodePoint(codePoint)
      : match;
  }
  return NAMED_ENTITIES.get(body) ?? match;
}

export function htmlToText(html: string): string {
  return html
    .replace(
      ANCHOR,
      (
        _match,
        doubleQuoted: string | undefined,
        singleQuoted: string | undefined,
      ) => doubleQuoted ?? singleQuoted ?? "",
    )
    .replace(PARAGRAPH, "\n\n")
    .replace(TAG, "")
    .replace(ENTITY, decodeEntity)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
