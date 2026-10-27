"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LOCALE_COOKIE,
  localeNames,
  locales,
  type Locale,
} from "@/app/_i18n/config";
import { switchLocalePath } from "@/app/_i18n/locale-path";

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

function rememberLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR_IN_SECONDS}; samesite=lax`;
}

type LanguageSwitcherProps = {
  current: Locale;
  label: string;
};

export function LanguageSwitcher({ current, label }: LanguageSwitcherProps) {
  const pathname = usePathname();

  return (
    <nav aria-label={label}>
      <ul>
        {locales.map((locale) => (
          <li key={locale}>
            {locale === current ? (
              <span lang={locale} aria-current="true">
                {localeNames[locale]}
              </span>
            ) : (
              <Link
                href={switchLocalePath(pathname, locale)}
                lang={locale}
                hrefLang={locale}
                onClick={() => rememberLocale(locale)}
              >
                {localeNames[locale]}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
