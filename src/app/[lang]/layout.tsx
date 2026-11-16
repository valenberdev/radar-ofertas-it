import type { Metadata } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import { LanguageSwitcher } from "@/app/_components/language-switcher";
import { locales } from "@/app/_i18n/config";
import { getDictionary } from "@/app/_i18n/dictionaries";
import { resolveLocale } from "@/app/_i18n/resolve-locale";
import "../globals.css";

const sans = Schibsted_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[lang]">): Promise<Metadata> {
  const dict = getDictionary(await resolveLocale(params));
  return { title: dict.metadata.title, description: dict.metadata.description };
}

export default async function RootLayout({
  children,
  params,
}: LayoutProps<"/[lang]">) {
  const lang = await resolveLocale(params);
  const dict = getDictionary(lang);

  return (
    <html lang={lang} className={sans.variable}>
      <body>
        <header className="site-header">
          <LanguageSwitcher
            current={lang}
            label={dict.languageSwitcher.label}
          />
        </header>
        {children}
      </body>
    </html>
  );
}
