"use client";

import {
  startTransition,
  useActionState,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { searchAction } from "@/app/_actions/search";
import { SearchResults } from "@/app/_components/search-results";
import {
  CV_FILE_ACCEPT,
  MAX_CV_FILE_BYTES,
  readCvFile,
  type CvFileError,
} from "@/app/_cv/cv-file";
import { CV_TEXT_READERS } from "@/app/_cv/cv-readers";
import type { Locale } from "@/app/_i18n/config";
import type { Dictionary } from "@/app/_i18n/dictionaries";
import { formatMessage } from "@/app/_i18n/format-message";
import {
  readLastSearch,
  writeLastSearch,
  type SearchStorage,
} from "@/app/_search/new-since";
import type { SearchState } from "@/app/_search/run-search";
import styles from "./search-form.module.css";

const INITIAL_STATE: SearchState = { status: "idle" };

const MAX_CV_FILE_MB = MAX_CV_FILE_BYTES / (1024 * 1024);

type UploadState =
  | { readonly status: "idle" }
  | { readonly status: "reading"; readonly name: string }
  | {
      readonly status: "loaded";
      readonly name: string;
      readonly length: number;
    }
  | { readonly status: "error"; readonly error: CvFileError };

const UPLOAD_IDLE: UploadState = { status: "idle" };

function browserStorage(): SearchStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function UploadMessage({
  upload,
  labels,
  maxLength,
}: {
  readonly upload: UploadState;
  readonly labels: Dictionary["search"]["upload"];
  readonly maxLength: number;
}) {
  if (upload.status === "idle") {
    return null;
  }
  if (upload.status === "reading") {
    return (
      <p className={styles.uploadStatus}>
        {formatMessage(labels.reading, { name: upload.name })}
      </p>
    );
  }
  if (upload.status === "error") {
    return (
      <p role="alert">
        {formatMessage(labels.errors[upload.error], { maxMb: MAX_CV_FILE_MB })}
      </p>
    );
  }
  if (upload.length > maxLength) {
    return (
      <p role="alert">
        {formatMessage(labels.tooLong, {
          name: upload.name,
          length: upload.length,
          max: maxLength,
        })}
      </p>
    );
  }
  return (
    <p className={styles.uploadStatus}>
      {formatMessage(labels.loaded, { name: upload.name })}
    </p>
  );
}

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
  const [previousSearchAt, setPreviousSearchAt] = useState<
    string | null | undefined
  >(undefined);
  const [upload, setUpload] = useState<UploadState>(UPLOAD_IDLE);
  const fileRef = useRef<HTMLInputElement>(null);
  const profileRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const storage = browserStorage();
    if (previousSearchAt === undefined) {
      setPreviousSearchAt(readLastSearch(storage));
    }
    writeLastSearch(storage, new Date());
    startTransition(() => action(formData));
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (file === undefined) {
      return;
    }
    setUpload({ status: "reading", name: file.name });
    const result = await readCvFile(file, CV_TEXT_READERS);
    if (!result.ok) {
      setUpload({ status: "error", error: result.error });
      return;
    }
    if (profileRef.current !== null) {
      profileRef.current.value = result.text;
    }
    setUpload({
      status: "loaded",
      name: file.name,
      length: result.text.length,
    });
  }

  function handleProfileChange() {
    if (upload.status === "loaded" || upload.status === "error") {
      setUpload(UPLOAD_IDLE);
    }
  }

  return (
    <section>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor="search-profile">{labels.profileLabel}</label>
          <p id="search-profile-hint" className={styles.hint}>
            {labels.profileHint}
          </p>
          <div className={styles.upload}>
            <button
              type="button"
              className={styles.uploadButton}
              onClick={() => fileRef.current?.click()}
              disabled={upload.status === "reading" || pending}
              aria-describedby="search-upload-hint"
            >
              {labels.upload.button}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={CV_FILE_ACCEPT}
              hidden
              onChange={handleFile}
            />
            <p id="search-upload-hint" className={styles.hint}>
              {formatMessage(labels.upload.hint, { maxMb: MAX_CV_FILE_MB })}
            </p>
          </div>
          <div aria-live="polite">
            <UploadMessage
              upload={upload}
              labels={labels.upload}
              maxLength={maxLength}
            />
          </div>
          <textarea
            ref={profileRef}
            id="search-profile"
            className={styles.profile}
            name="profile"
            rows={12}
            maxLength={maxLength}
            required
            onChange={handleProfileChange}
            aria-describedby="search-profile-hint search-privacy"
          />
          <p id="search-privacy" className={styles.privacy}>
            {labels.privacyNotice}
          </p>
        </div>

        <div className={styles.field}>
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
          <p id="search-country-hint" className={styles.hint}>
            {labels.countryHint}
          </p>
        </div>

        <div className={styles.actions}>
          <button type="submit" disabled={pending}>
            {pending ? labels.submitting : labels.submit}
          </button>
        </div>
      </form>

      <div className={styles.status} aria-live="polite">
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
          previousSearchAt={previousSearchAt ?? null}
        />
      ) : null}
    </section>
  );
}
