"use server";

import { cookies } from "next/headers";
import { OWNER_SESSION_COOKIE } from "@/infrastructure/auth/owner-session";
import {
  checkOwnerSignIn,
  type OwnerSignInFailure,
} from "@/infrastructure/auth/owner-sign-in";
import { env } from "@/infrastructure/env";

export interface OwnerSignInState {
  readonly status: "idle" | "signed_in" | OwnerSignInFailure;
}

export async function signInAsOwner(
  _previous: OwnerSignInState,
  formData: FormData,
): Promise<OwnerSignInState> {
  const result = checkOwnerSignIn(
    env.OWNER_SECRET,
    formData.get("secret"),
    new Date(),
    process.env.NODE_ENV === "production",
  );
  if (!result.ok) {
    return { status: result.reason };
  }
  const store = await cookies();
  store.set(result.cookie.name, result.cookie.value, result.cookie.options);
  return { status: "signed_in" };
}

export async function signOutOwner(): Promise<void> {
  const store = await cookies();
  store.delete(OWNER_SESSION_COOKIE);
}
