# Evaluation dataset

This folder holds what the phase 6 measurements are built on: three fictional candidate personas and the human labels that say how well each offer fits each persona. The measurements themselves (prefilter recall, scorer quality, cost and latency) read these files; nothing here runs in production.

## What is committed and what stays local

| File                                       | Committed | What it is                                                                                                      |
| ------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------- |
| `personas/*.json`                          | yes       | CV text and the extracted profile of each persona                                                               |
| `labels.json`                              | yes       | One band per persona and offer. Holds the offer id, content hash, title, company and url, never the description |
| `labels-retest.json`                       | yes       | The second round, used only to measure how consistent the labeling is                                           |
| `snapshot.local.json`                      | no        | Full copy of the eligible offers, with descriptions, at the moment of the snapshot                              |
| `labeling.local.html`, `retest.local.html` | no        | Generated pages used to label                                                                                   |
| `configs.json`                             | yes       | The scorer configurations to compare: model and batch size                                                      |
| `results.json`                             | yes       | The metrics of the experiments. No offer text, only numbers per persona and config                              |
| `runs.local.jsonl`                         | no        | One line per Gemini call: offers, scores and latency                                                            |

The snapshot stays out of the repository because it holds the full text of third-party offers. The repository keeps the labels and the link to each original offer, which is enough to see what was judged and to rebuild the work from a new snapshot.

## Rubric

Every offer is labeled for one persona at a time, reading the full description. The bands match the bands of the scoring prompt, so the scorer and the human are measured on the same scale.

| Band | Name      | Meaning                                                                                         |
| ---- | --------- | ----------------------------------------------------------------------------------------------- |
| 0    | No encaja | A different field, or it asks for skills the candidate does not have                            |
| 1    | Parcial   | Some skills match, but important requirements are missing or the seniority is clearly different |
| 2    | Bueno     | Most of the required skills match, with small gaps in skills or seniority                       |
| 3    | Muy bueno | It asks for the candidate's main skills and a seniority that matches                            |

Judge only what the persona's profile and CV say. Do not give credit for what the persona could learn.

## Workflow

Run everything from the repository root.

1. **Extract the profiles of the personas.** `npm run eval:personas` reads `GEMINI_API_KEY` and `GEMINI_MODEL` from `.env.local`, extracts a profile from each CV text and writes it into the persona file. Read each extracted profile and fix the persona text, not the profile, if something is wrong. Add `-- --force` to extract again.
2. **Take the snapshot.** `npm run eval:snapshot` reads `DATABASE_URL_UNPOOLED` from `.env.local`. `npm run eval:snapshot:prod` reads it from `.env.production.local`. The first argument is the country (default `Argentina`). Pass `--force` to replace an existing snapshot, and only do it before labeling: a new snapshot changes the pools.
3. **Label.** `npm run eval:label` writes `eval/labeling.local.html` and prints its address. Open it in the browser. Keys `0` to `3` answer and move on, the left and right arrows move without answering. Progress is kept in the browser, so the tab can be closed and reopened. When every offer has an answer, Export saves `labels.json`: move it into `eval/`.
4. **Re-label a sample the next day.** `npm run eval:retest` builds a page with 20 of your labels in a new order. Label them without looking at the earlier answers, export `labels-retest.json` and move it into `eval/`.
5. **Check how consistent the labeling is.** `npm run eval:agreement` compares both rounds and prints the exact agreement, the agreement within one band and the linear weighted kappa.

## How the pool of each persona is built

For each persona the pool has 45 offers, shuffled together so the label is blind to where each one came from:

- 30 candidates: the top of the deterministic prefilter, the same ones the product would send to the scorer.
- 8 beyond the top: offers the prefilter matched but ranked below the 30. They measure what the cut leaves out.
- 7 unmatched: offers that mention none of the persona's skills. They measure whether the prefilter discards something that should have been seen.

When there are not enough offers in a group, the free places go to the unmatched group.

## Experiments

The experiments answer three questions, each with its own measure:

1. **Does the prefilter leave out offers that fit?** Recall at 30: the share of relevant offers (band 2 or 3) that fall inside the top 30. The offers outside the top are only known through the two samples (8 beyond the top, 7 unmatched), so the total is estimated by scaling each sample up to the size of its stratum. With samples this small the estimate is rough: read it together with the counts printed next to it.
2. **Does the scorer rank the 30 candidates like a person does?** Spearman correlation between the score and the band, per persona, averaged over the three personas. Precision at 5 (how many of the 5 highest scores are relevant) is secondary. The order of the prefilter itself is printed as a baseline: the scorer has to beat it to justify its cost. An offer without a score is ranked last, and a correlation that cannot be computed counts as zero.
3. **What does it cost?** Calls per search (each one uses one unit of the daily quota) and the latency of a whole search, with the calls made one after another as in production.

Every config runs three times. The offers are sent in the prefilter order, in consecutive batches of the config's size, with the same cleaning and clipping as in production.

### Decision rule, fixed before running

- Only configs with their three repetitions take part.
- The best config is the one with the highest mean Spearman.
- The noise is half of the largest difference between the best and worst repetition of any config.
- Every config within the noise of the best is considered equivalent.
- Among the equivalent ones, the choice is the one with the fewest calls per search, then the lowest latency, then the id.
- At most two versions of the prompt are compared, and a second version is only written if the first results show a concrete weakness.

### Workflow

6. **Run.** `npm run eval:run` reads `GEMINI_API_KEY` from `.env.local` and makes the planned calls (108 for the default configs). It saves each call as it finishes, so it can be stopped and run again. `npm run eval:run -- --max-calls 20` limits one session. When Gemini answers 429 it waits 65 seconds and tries again twice, then stops: the daily limit resets at midnight Pacific time (05:00 in Buenos Aires).
7. **Report.** `npm run eval:report` prints the tables and writes `eval/results.json`.

To compare another model, add an entry to `configs.json` and run again: only the new calls are made.
