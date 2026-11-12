import {
  createOwnerSessionToken,
  isOwnerSecret,
  OWNER_SESSION_COOKIE,
  OWNER_SESSION_TTL_MS,
} from "./owner-session";

export const MAX_SECRET_INPUT_LENGTH = 512;

export interface OwnerCookie {
  readonly name: string;
  readonly value: string;
  readonly options: {
    readonly httpOnly: true;
    readonly secure: boolean;
    readonly sameSite: "strict";
    readonly path: "/";
    readonly maxAge: number;
  };
}

export type OwnerSignInFailure = "disabled" | "invalid";

export type OwnerSignInResult =
  | { readonly ok: true; readonly cookie: OwnerCookie }
  | { readonly ok: false; readonly reason: OwnerSignInFailure };

export function checkOwnerSignIn(
  secret: string | undefined,
  candidate: unknown,
  now: Date,
  secure: boolean,
): OwnerSignInResult {
  if (secret === undefined) {
    return { ok: false, reason: "disabled" };
  }
  if (
    typeof candidate !== "string" ||
    candidate.length > MAX_SECRET_INPUT_LENGTH ||
    !isOwnerSecret(secret, candidate.trim())
  ) {
    return { ok: false, reason: "invalid" };
  }
  return {
    ok: true,
    cookie: {
      name: OWNER_SESSION_COOKIE,
      value: createOwnerSessionToken(secret, now),
      options: {
        httpOnly: true,
        secure,
        sameSite: "strict",
        path: "/",
        maxAge: Math.floor(OWNER_SESSION_TTL_MS / 1000),
      },
    },
  };
}
