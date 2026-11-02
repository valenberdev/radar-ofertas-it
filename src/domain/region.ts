export type Region =
  | { readonly kind: "worldwide" }
  | { readonly kind: "countries"; readonly countries: readonly string[] }
  | { readonly kind: "unknown" };

export const WORLDWIDE: Region = { kind: "worldwide" };

export const UNKNOWN_REGION: Region = { kind: "unknown" };

export function regionOfCountries(countries: readonly string[]): Region {
  const names = countries
    .map((name) => name.trim())
    .filter((name) => name !== "");
  const unique = [...new Set(names)];
  return unique.length === 0
    ? UNKNOWN_REGION
    : { kind: "countries", countries: unique };
}
