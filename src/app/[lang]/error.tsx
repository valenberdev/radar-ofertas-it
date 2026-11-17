"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { getDictionary } from "@/app/_i18n/dictionaries";
import styles from "./status-page.module.css";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { lang } = useParams<{ lang: string }>();
  const locale = lang === "en" ? "en" : "es";
  const dict = getDictionary(locale).status;

  return (
    <main className={styles.page}>
      <h1>{dict.errorHeading}</h1>
      <p className={styles.text}>{dict.errorText}</p>
      <div className={styles.actions}>
        <button type="button" onClick={reset}>
          {dict.retry}
        </button>
        <Link href={`/${locale}`}>{dict.backHome}</Link>
      </div>
    </main>
  );
}
