"use client";

import { useActionState } from "react";
import {
  signInAsOwner,
  type OwnerSignInState,
} from "@/app/_actions/owner-session";
import type { Dictionary } from "@/app/_i18n/dictionaries";

const INITIAL_STATE: OwnerSignInState = { status: "idle" };

export function OwnerSignInForm({ labels }: { labels: Dictionary["owner"] }) {
  const [state, action, pending] = useActionState(signInAsOwner, INITIAL_STATE);
  const error =
    state.status === "invalid" || state.status === "disabled"
      ? labels.errors[state.status]
      : null;

  return (
    <form action={action}>
      <label htmlFor="owner-secret">{labels.secretLabel}</label>
      <input
        id="owner-secret"
        name="secret"
        type="password"
        autoComplete="current-password"
        required
      />
      <button type="submit" disabled={pending}>
        {pending ? labels.submitting : labels.submit}
      </button>
      {error === null ? null : <p role="alert">{error}</p>}
    </form>
  );
}
