import type { Locale } from "@/app/_i18n/config";
import type { Dictionary } from "@/app/_i18n/dictionaries";
import { formatMessage } from "@/app/_i18n/format-message";
import { formatPostedDate, scoreBand, SOURCES } from "@/app/_search/present";
import type { OfferView, SearchView } from "@/app/_search/search-view";

type ResultLabels = Dictionary["results"];

interface OfferItemProps {
  readonly offer: OfferView;
  readonly labels: ResultLabels;
  readonly locale: Locale;
}

function OfferItem({ offer, labels, locale }: OfferItemProps) {
  const source = SOURCES[offer.source];
  const posted =
    offer.postedAt === null
      ? labels.noDate
      : formatMessage(labels.posted, {
          date: formatPostedDate(offer.postedAt, locale),
        });

  return (
    <li>
      <article>
        <h4>
          {offer.url === null ? (
            offer.title
          ) : (
            <a href={offer.url} target="_blank" rel="noopener noreferrer">
              {offer.title}
            </a>
          )}
        </h4>
        <p>
          {offer.company ?? labels.noCompany} · {posted}
        </p>
        {offer.score === null ? null : (
          <p>
            <strong>
              {formatMessage(labels.score, { score: offer.score })}
            </strong>{" "}
            {labels.bands[scoreBand(offer.score)]}
          </p>
        )}
        {offer.reason === null ? null : <p>{offer.reason[locale]}</p>}
        {offer.matchedSkills.length === 0 ? null : (
          <p>
            {formatMessage(labels.matchedSkills, {
              skills: offer.matchedSkills.join(", "),
            })}
          </p>
        )}
        <p>
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
}

export function SearchResults({ view, labels, locale }: SearchResultsProps) {
  const scored = view.offers.filter((offer) => offer.score !== null);
  const unscored = view.offers.filter((offer) => offer.score === null);

  return (
    <section aria-labelledby="results-heading">
      <h2 id="results-heading">{labels.heading}</h2>
      <p>
        {formatMessage(labels.profileSkills, {
          skills: view.profile.skills.join(", "),
        })}
      </p>
      <p>
        {view.offers.length === 0
          ? labels.none
          : formatMessage(labels.summary, {
              matching: view.offers.length,
              eligible: view.eligibleCount,
            })}
      </p>

      {scored.length === 0 ? null : (
        <>
          <h3>{labels.scoredHeading}</h3>
          <ol>
            {scored.map((offer) => (
              <OfferItem
                key={offer.id}
                offer={offer}
                labels={labels}
                locale={locale}
              />
            ))}
          </ol>
        </>
      )}

      {unscored.length === 0 ? null : (
        <>
          <h3>{labels.unscoredHeading}</h3>
          <p>{labels.unscoredNotice[view.scoringStoppedBy ?? "partial"]}</p>
          <ul>
            {unscored.map((offer) => (
              <OfferItem
                key={offer.id}
                offer={offer}
                labels={labels}
                locale={locale}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
