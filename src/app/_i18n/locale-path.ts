import { isLocale, type Locale } from "./config";

export function hasLocalePrefix(pathname: string): boolean {
  const firstSegment = pathname.split("/")[1] ?? "";
  return isLocale(firstSegment);
}

export function prefixWithLocale(pathname: string, locale: Locale): string {
  return pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
}

export function switchLocalePath(pathname: string, locale: Locale): string {
  if (!hasLocalePrefix(pathname)) {
    return prefixWithLocale(pathname, locale);
  }
  const [, , ...rest] = pathname.split("/");
  return ["", locale, ...rest].join("/");
}