import { getDictionary } from "@/app/_i18n/dictionaries";
import { resolveLocale } from "@/app/_i18n/resolve-locale";

export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const dict = getDictionary(await resolveLocale(params));
  return (
    <main>
      <h1>{dict.home.heading}</h1>
      <p>{dict.home.tagline}</p>
    </main>
  );
}
