"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { getDictionary } from "@/app/_i18n/dictionaries";
import styles from "./status-page.module.css";

export default function NotFound() {
  const { lang } = useParams<{ lang: string }>();
  const locale = lang === "en" ? "en" : "es";
  const dict = getDictionary(locale).status;

  return (
    <main className={styles.page}>
      <h1>{dict.notFoundHeading}</h1>
      <p className={styles.text}>{dict.notFoundText}</p>
      <Link href={`/${locale}`}>{dict.backHome}</Link>
    </main>
  );
}
