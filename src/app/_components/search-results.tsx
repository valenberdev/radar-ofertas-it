import type { Locale } from "@/app/_i18n/config";
import type { Dictionary } from "@/app/_i18n/dictionaries";
import { formatMessage } from "@/app/_i18n/format-message";
import { isNewSince } from "@/app/_search/new-since";
import {
  formatDate,
  formatPostedDate,
  scoreBand,
  SOURCES,
} from "@/app/_search/present";
import type { OfferView, SearchView } from "@/app/_search/search-view";
import styles from "./search-results.module.css";

type ResultLabels = Dictionary["results"];

const METER_BARS = 10;

interface ScoreProps {
  readonly score: number;
  readonly labels: ResultLabels;
}

function Score({ score, labels }: ScoreProps) {
  const band = scoreBand(score);
  const filled = Math.round((score / 100) * METER_BARS);

  return (
    <div className={styles.score} data-band={band}>
      <p className={styles.value}>
        <span className="sr-only">
          {formatMessage(labels.score, { score })}
        </span>
        <span className={styles.number} aria-hidden="true">
          {score}
        </span>
        <span className={styles.max} aria-hidden="true">
          /100
        </span>
      </p>
      <div className={styles.meter} aria-hidden="true">
        {Array.from({ length: METER_BARS }, (_, index) => (
          <span
            key={index}
            className={styles.bar}
            data-on={index < filled ? "" : undefined}
            style={{
              height: `${(index + 1) * 10}%`,
              animationDelay: `${index * 30}ms`,
            }}
          />
        ))}
      </div>
      <p className={styles.bandLabel}>{labels.bands[band]}</p>
    </div>
  );
}

interface OfferItemProps {
  readonly offer: OfferView;
  readonly labels: ResultLabels;
  readonly locale: Locale;
  readonly isNew: boolean;
}

function OfferItem({ offer, labels, locale, isNew }: OfferItemProps) {
  const source = SOURCES[offer.source];

  return (
    <li
      className={
        offer.score === null ? `${styles.item} ${styles.unscored}` : styles.item
      }
    >
      {offer.score === null ? null : (
        <Score score={offer.score} labels={labels} />
      )}
      <article className={styles.body}>
        <h4 className={styles.title}>
          {isNew ? (
            <span className={styles.newBadge}>{labels.newBadge}</span>
          ) : null}
          {offer.url === null ? (
            offer.title
          ) : (
            <a href={offer.url} target="_blank" rel="noopener noreferrer">
              {offer.title}
            </a>
          )}
        </h4>
        <p className={styles.meta}>
          <span>{offer.company ?? labels.noCompany}</span>
          {offer.postedAt === null ? (
            <span>{labels.noDate}</span>
          ) : (
            <time dateTime={offer.postedAt}>
              {formatMessage(labels.posted, {
                date: formatPostedDate(offer.postedAt, locale),
              })}
            </time>
          )}
        </p>
        {offer.reason === null ? null : <p>{offer.reason[locale]}</p>}
        {offer.matchedSkills.length === 0 ? null : (
          <p className={styles.skills}>
            {formatMessage(labels.matchedSkills, {
              skills: offer.matchedSkills.join(", "),
            })}
          </p>
        )}
        <p className={styles.source}>
          {labels.source}{" "}
          <a href={source.url} target="_blank" rel="noopener noreferrer">
            {source.name}
          </a>
        </p>
      </article>
    </li>
  );
}

export interface SearchResultsProps {
  readonly view: SearchView;
  readonly labels: ResultLabels;
  readonly locale: Locale;
  readonly previousSearchAt: string | null;
}

function newOffersMessage(
  labels: ResultLabels,
  locale: Locale,
  previousSearchAt: string | null,
  count: number,
): string {
  if (previousSearchAt === null) {
    return labels.firstSearch;
  }
  const date = formatDate(previousSearchAt, locale);
  if (count === 0) {
    return formatMessage(labels.noneNewSince, { date });
  }
  return formatMessage(count === 1 ? labels.newSinceOne : labels.newSinceMany, {
    count,
    date,
  });
}

export function SearchResults({
  view,
  labels,
  locale,
  previousSearchAt,
}: SearchResultsProps) {
  const scored = view.offers.filter((offer) => offer.score !== null);
  const unscored = view.offers.filter((offer) => offer.score === null);
  const newIds = new Set(
    view.offers
      .filter((offer) => isNewSince(offer.firstSeenAt, previousSearchAt))
      .map((offer) => offer.id),
  );

  return (
    <section className={styles.results} aria-labelledby="results-heading">
      <h2 id="results-heading">{labels.heading}</h2>
      <p className={styles.summary}>
        {formatMessage(labels.profileSkills, {
          skills: view.profile.skills.join(", "),
        })}
      </p>
      <p className={styles.summary}>
        {view.offers.length === 0
          ? labels.none
          : formatMessage(labels.summary, {
              matching: view.offers.length,
              eligible: view.eligibleCount,
            })}
      </p>
      {view.offers.length === 0 ? null : (
        <p className={styles.newSummary}>
          {newOffersMessage(labels, locale, previousSearchAt, newIds.size)}
        </p>
      )}

      {scored.length === 0 ? null : (
        <div className={styles.group}>
          <h3>{labels.scoredHeading}</h3>
          <ol className={styles.list}>
            {scored.map((offer) => (
              <OfferItem
                key={offer.id}
                offer={offer}
                labels={labels}
                locale={locale}
                isNew={newIds.has(offer.id)}
              />
            ))}
          </ol>
        </div>
      )}

      {unscored.length === 0 ? null : (
        <div className={styles.group}>
          <h3>{labels.unscoredHeading}</h3>
          <p className={styles.notice}>
            {labels.unscoredNotice[view.scoringStoppedBy ?? "partial"]}
          </p>
          <ul className={styles.list}>
            {unscored.map((offer) => (
              <OfferItem
                key={offer.id}
                offer={offer}
                labels={labels}
                locale={locale}
                isNew={newIds.has(offer.id)}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
