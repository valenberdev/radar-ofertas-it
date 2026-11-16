"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { searchAction } from "@/app/_actions/search";
import { SearchResults } from "@/app/_components/search-results";
import type { Locale } from "@/app/_i18n/config";
import type { Dictionary } from "@/app/_i18n/dictionaries";
import { formatMessage } from "@/app/_i18n/format-message";
import type { SearchState } from "@/app/_search/run-search";

const INITIAL_STATE: SearchState = { status: "idle" };

export interface SearchFormProps {
  readonly labels: Dictionary["search"];
  readonly resultLabels: Dictionary["results"];
  readonly locale: Locale;
  readonly countries: readonly string[];
  readonly defaultCountry: string;
  readonly maxLength: number;
}

export function SearchForm({
  labels,
  resultLabels,
  locale,
  countries,
  defaultCountry,
  maxLength,
}: SearchFormProps) {
  const [state, action, pending] = useActionState(searchAction, INITIAL_STATE);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  }

  return (
    <section>
      <form onSubmit={handleSubmit}>
        <label htmlFor="search-profile">{labels.profileLabel}</label>
        <p id="search-profile-hint">{labels.profileHint}</p>
        <textarea
          id="search-profile"
          name="profile"
          rows={12}
          maxLength={maxLength}
          required
          aria-describedby="search-profile-hint search-privacy"
        />
        <p id="search-privacy">{labels.privacyNotice}</p>

        <label htmlFor="search-country">{labels.countryLabel}</label>
        <select
          id="search-country"
          name="country"
          defaultValue={defaultCountry}
          aria-describedby="search-country-hint"
        >
          {countries.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </select>
        <p id="search-country-hint">{labels.countryHint}</p>

        <button type="submit" disabled={pending}>
          {pending ? labels.submitting : labels.submit}
        </button>
      </form>

      <div aria-live="polite">
        {state.status === "error" ? (
          <p role="alert">
            {formatMessage(labels.errors[state.reason], { max: maxLength })}
          </p>
        ) : null}
      </div>

      {state.status === "done" ? (
        <SearchResults
          view={state.view}
          labels={resultLabels}
          locale={locale}
        />
      ) : null}
    </section>
  );
}
