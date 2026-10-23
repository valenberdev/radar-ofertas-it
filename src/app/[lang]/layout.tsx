import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { locales } from "@/app/_i18n/config";
import { getDictionary } from "@/app/_i18n/dictionaries";
import { resolveLocale } from "@/app/_i18n/resolve-locale";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const dict = getDictionary(await resolveLocale(params));
  return { title: dict.metadata.title, description: dict.metadata.description };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const lang = await resolveLocale(params);
  return (
    <html lang={lang} className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}