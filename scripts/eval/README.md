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
