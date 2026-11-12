import type { Metadata } from "next";
import { signOutOwner } from "@/app/_actions/owner-session";
import { isOwnerRequest } from "@/app/_auth/owner-access";
import { OwnerSignInForm } from "@/app/_components/owner-sign-in-form";
import { getDictionary } from "@/app/_i18n/dictionaries";
import { resolveLocale } from "@/app/_i18n/resolve-locale";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/owner">): Promise<Metadata> {
  const dict = getDictionary(await resolveLocale(params));
  return { title: dict.owner.title, robots: { index: false, follow: false } };
}

export default async function OwnerPage({
  params,
}: PageProps<"/[lang]/owner">) {
  const dict = getDictionary(await resolveLocale(params)).owner;
  const signedIn = await isOwnerRequest();

  return (
    <main>
      <h1>{dict.heading}</h1>
      {signedIn ? (
        <>
          <p>{dict.signedIn}</p>
          <form action={signOutOwner}>
            <button type="submit">{dict.signOut}</button>
          </form>
        </>
      ) : (
        <>
          <p>{dict.description}</p>
          <OwnerSignInForm labels={dict} />
        </>
      )}
    </main>
  );
}
