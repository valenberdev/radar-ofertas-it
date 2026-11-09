const EMAIL_MARKER = "[EMAIL]";
const PHONE_MARKER = "[PHONE]";
const URL_MARKER = "[URL]";

const MIN_PHONE_DIGITS = 8;

const PROFILE_HOSTS = [
  "linkedin.com",
  "github.com",
  "gitlab.com",
  "bitbucket.org",
  "twitter.com",
  "x.com",
  "instagram.com",
  "facebook.com",
  "t.me",
  "wa.me",
  "behance.net",
  "dribbble.com",
  "medium.com",
];

const URL_BODY = `[^\\s<>"]*[^\\s<>".,;:!?)'\\]]`;

const URL_PATTERN = new RegExp(
  `(?:https?:\\/\\/|www\\.)${URL_BODY}` +
    `|(?<![A-Za-z0-9@.-])(?:[A-Za-z0-9-]+\\.)*(?:${PROFILE_HOSTS.map((host) => host.replaceAll(".", "\\.")).join("|")})\\/${URL_BODY}`,
  "gi",
);

const EMAIL_PATTERN =
  /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

const PHONE_SEPARATOR = "[ \\u00A0.\\-\\u2010-\\u2015()]";

const PHONE_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}_])\\+?\\(?\\d(?:${PHONE_SEPARATOR}{0,2}\\d)*`,
  "gu",
);

const YEAR = /^(?:19|20)\d{2}$/;
const DATE_SEPARATOR = "[.\\-\\u2010-\\u2015]";
const DATE = new RegExp(
  `^(?:\\d{4}${DATE_SEPARATOR}\\d{1,2}${DATE_SEPARATOR}\\d{1,2}|\\d{1,2}${DATE_SEPARATOR}\\d{1,2}${DATE_SEPARATOR}\\d{4})$`,
);
const LETTER_OR_UNDERSCORE = /[\p{L}_]/u;

function countDigits(text: string): number {
  return text.replace(/\D/g, "").length;
}

function isYearList(text: string): boolean {
  const groups = text.split(/\D+/).filter((group) => group !== "");
  return groups.every((group) => YEAR.test(group));
}

function redactPhone(match: string, offset: number, whole: string): string {
  if (LETTER_OR_UNDERSCORE.test(whole.charAt(offset + match.length))) {
    return match;
  }
  if (countDigits(match) < MIN_PHONE_DIGITS) {
    return match;
  }
  if (DATE.test(match) || isYearList(match)) {
    return match;
  }
  return PHONE_MARKER;
}

export function redactPersonalData(text: string): string {
  return text
    .replace(URL_PATTERN, URL_MARKER)
    .replace(EMAIL_PATTERN, EMAIL_MARKER)
    .replace(PHONE_PATTERN, redactPhone);
}
