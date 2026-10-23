import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE } from "@/app/_i18n/config";
import { hasLocalePrefix, prefixWithLocale } from "@/app/_i18n/locale-path";
import { negotiateLocale } from "@/app/_i18n/negotiate-locale";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (hasLocalePrefix(pathname)) {
    return NextResponse.next();
  }

  const locale = negotiateLocale({
    cookie: request.cookies.get(LOCALE_COOKIE)?.value,
    acceptLanguage: request.headers.get("accept-language"),
  });

  const url = request.nextUrl.clone();
  url.pathname = prefixWithLocale(pathname, locale);

  const response = NextResponse.redirect(url);
  response.headers.set("Vary", "Accept-Language, Cookie");
  return response;
}

export const config = {
  matcher: ["/((?!api/|_next/|.*\\..*).*)"],
};
