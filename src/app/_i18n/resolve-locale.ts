import { notFound } from "next/navigation";
import { isLocale, type Locale } from "./config";

export async function resolveLocale(
  params: Promise<{ lang: string }>,
): Promise<Locale> {
  const { lang } = await params;
  if (!isLocale(lang)) {
    notFound();
  }
  return lang;
}
