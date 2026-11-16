import { SearchForm } from "@/app/_components/search-form";
import { getDictionary } from "@/app/_i18n/dictionaries";
import { resolveLocale } from "@/app/_i18n/resolve-locale";
import { MAX_PROFILE_TEXT_LENGTH } from "@/application/extract-profile";
import { COUNTRIES } from "@/domain/countries";
import styles from "./page.module.css";

export const maxDuration = 120;

export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const locale = await resolveLocale(params);
  const dict = getDictionary(locale);
  return (
    <main>
      <div className={styles.intro}>
        <h1>{dict.home.heading}</h1>
        <p className={styles.tagline}>{dict.home.tagline}</p>
      </div>
      <SearchForm
        labels={dict.search}
        resultLabels={dict.results}
        locale={locale}
        countries={COUNTRIES}
        defaultCountry="Argentina"
        maxLength={MAX_PROFILE_TEXT_LENGTH}
      />
    </main>
  );
}
