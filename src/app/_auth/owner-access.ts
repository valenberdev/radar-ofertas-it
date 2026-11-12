import { cookies } from "next/headers";
import {
  OWNER_SESSION_COOKIE,
  verifyOwnerSessionToken,
} from "@/infrastructure/auth/owner-session";
import { env } from "@/infrastructure/env";

export async function isOwnerRequest(): Promise<boolean> {
  if (env.OWNER_SECRET === undefined) {
    return false;
  }
  const store = await cookies();
  return verifyOwnerSessionToken(
    env.OWNER_SECRET,
    store.get(OWNER_SESSION_COOKIE)?.value,
    new Date(),
  );
}
