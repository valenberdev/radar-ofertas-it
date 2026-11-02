import { COUNTRIES } from "../../../domain/countries";
import { COUNTRY_GROUPS } from "../../../domain/country-groups";
import {
  regionOfCountries,
  UNKNOWN_REGION,
  WORLDWIDE,
  type Region,
} from "../../../domain/region";

const REMOTE = /\bremote\b(?![.]\w)/gi;
const LEADING_SEPARATORS = /^[\s\-–—:,/]+/;
const TERM_SEPARATORS = /\s*(?:[/,&+;]|\band\b|\bor\b)\s*/i;
const TRAILING_QUALIFIER = /[\s-]+(?:only|time ?zones?|based)$/;
const AMBIGUOUS_NAMES: ReadonlySet<string> = new Set(["georgia"]);
const WORLDWIDE_TERMS: ReadonlySet<string> = new Set([
  "worldwide",
  "world wide",
  "anywhere",
  "anywhere in the world",
  "global",
  "globally",
]);

function normalizeTerm(term: string): string {
  return term.toLowerCase().replaceAll(".", "").replace(/\s+/g, " ").trim();
}

function buildNamedTerms(): ReadonlyMap<string, readonly string[]> {
  const terms = new Map<string, readonly string[]>();
  for (const name of COUNTRIES) {
    const key = normalizeTerm(name);
    if (!AMBIGUOUS_NAMES.has(key)) {
      terms.set(key, [name]);
    }
  }
  const aliases: ReadonlyArray<readonly [string, readonly string[]]> = [
    ["us", ["United States"]],
    ["usa", ["United States"]],
    ["united states of america", ["United States"]],
    ["uk", ["United Kingdom"]],
    ["great britain", ["United Kingdom"]],
    ["uae", ["United Arab Emirates"]],
    ["russia", ["Russian Federation"]],
    ["czech republic", ["Czechia"]],
    ["the netherlands", ["Netherlands"]],
    ["eu", COUNTRY_GROUPS.europeanUnion],
    ["europe", COUNTRY_GROUPS.europe],
    ["north america", COUNTRY_GROUPS.northAmerica],
    ["na", COUNTRY_GROUPS.northAmerica],
    ["latam", COUNTRY_GROUPS.latinAmerica],
    ["latin america", COUNTRY_GROUPS.latinAmerica],
    ["americas", COUNTRY_GROUPS.americas],
    ["the americas", COUNTRY_GROUPS.americas],
  ];
  for (const [key, countries] of aliases) {
    terms.set(key, countries);
  }
  return terms;
}

const NAMED_TERMS = buildNamedTerms();

function toTerms(scope: string): string[] {
  return scope
    .split(TERM_SEPARATORS)
    .map((part) => normalizeTerm(part).replace(TRAILING_QUALIFIER, ""))
    .filter((term) => term !== "");
}

function resolveScope(scope: string): Region {
  const terms = toTerms(scope);
  const countries: string[] = [];
  let worldwide = false;
  for (const term of terms) {
    if (WORLDWIDE_TERMS.has(term)) {
      worldwide = true;
      continue;
    }
    const named = NAMED_TERMS.get(term);
    if (named === undefined) {
      return UNKNOWN_REGION;
    }
    countries.push(...named);
  }
  return worldwide ? WORLDWIDE : regionOfCountries(countries);
}

function scopeAfter(header: string, end: number): string | null {
  const rest = header.slice(end);
  const parenthesized = /^\s*\(([^)]*)\)/.exec(rest);
  if (parenthesized !== null) {
    const scope = (parenthesized[1] ?? "").trim();
    return scope === "" ? null : scope;
  }
  const scope = (
    /^([^|()]*)/.exec(rest.replace(LEADING_SEPARATORS, ""))?.[1] ?? ""
  ).trim();
  return scope === "" ? null : scope;
}

function scopeBefore(header: string, start: number): string | null {
  const word = /([A-Za-z.]+)\s*$/.exec(header.slice(0, start))?.[1];
  if (word === undefined) {
    return null;
  }
  const term = normalizeTerm(word);
  return WORLDWIDE_TERMS.has(term) || NAMED_TERMS.has(term) ? word : null;
}

export function regionOfHackerNewsHeader(header: string): Region {
  for (const match of header.matchAll(REMOTE)) {
    const start = match.index;
    const scope =
      scopeAfter(header, start + match[0].length) ?? scopeBefore(header, start);
    if (scope !== null) {
      return resolveScope(scope);
    }
  }
  return UNKNOWN_REGION;
}
