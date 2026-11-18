# ADR-0010: Measuring the prefilter and the scorer

Status: Accepted (2026-11-18)

## Context

ADR-0007 left two choices open: whether scoring with Gemini adds anything over the deterministic prefilter, and how many offers to send per call. The `eval` folder (see `eval/README.md`) was built to answer them with a decision rule fixed before running.

- Snapshot of 2026-11-18: 1,248 eligible offers for Argentina.
- Three fictional personas (junior backend, mid frontend, senior data). Each gets a pool of 45 offers: the 30 prefilter candidates, 8 sampled beyond the cut and 7 sampled among the offers that mention none of its skills.
- Four configs of `gemini-3.5-flash-lite` with batches of 5, 10, 15 and 30 offers, three repetitions each: 108 calls.

## Who labeled the offers

The plan was to label the 135 offers by hand. They were labeled by Claude instead: Opus 5.5, high effort, one incognito chat per persona with no memory, following the same rubric and rules as the human labeling page, with the offers shuffled and descriptions cut at 8,000 characters.

To check the judge, 30 of its labels drawn at random were labeled again by hand without seeing its answers. The acceptance rule, fixed before labeling, asked for a linear weighted kappa of at least 0.60 and an agreement within one band of at least 90%.

| Check                 | Result | Required |
| --------------------- | ------ | -------- |
| Exact agreement       | 46.7%  | —        |
| Within one band       | 86.7%  | ≥ 90%    |
| Linear weighted kappa | 0.32   | ≥ 0.60   |

**The judge failed the acceptance rule.** The owner decided to use its labels anyway, as a proxy. Every result below therefore measures agreement with Claude, not with a person. The human labels stay in `eval/labels-retest.json`.

## Results

Relevant means band 2 or 3.

| Config         | Spearman (3 runs) | Mean | Precision at 5 | Calls per search | Search latency | Unscored |
| -------------- | ----------------- | ---- | -------------- | ---------------- | -------------- | -------- |
| flash-lite-b5  | 0.56, 0.56, 0.61  | 0.57 | 0.31           | 6                | 11.7 s         | 0.0%     |
| flash-lite-b10 | 0.51, 0.56, 0.57  | 0.55 | 0.36           | 3                | 8.9 s          | 0.0%     |
| flash-lite-b15 | 0.50, 0.51, 0.59  | 0.54 | 0.38           | 2                | 7.9 s          | 0.4%     |
| flash-lite-b30 | 0.58, 0.58, 0.59  | 0.58 | 0.40           | 1                | 7.0 s          | 0.0%     |

- The order of the prefilter alone reaches a Spearman of 0.02. Gemini's order is far closer to the judge's than the prefilter's is.
- No call failed.
- Prefilter recall at 30: 1.00 for backend and data, 0.04 for frontend. Very few offers are relevant at all (1, 2 and 6 inside the top 30), and the frontend figure rests on a single relevant offer among the 8 sampled beyond the cut, scaled up to hundreds of React offers. These estimates are too rough to act on.

By the decision rule, the best config is flash-lite-b30 (0.58), the noise is 0.045, and b5, b10 and b30 are equivalent. The one with the fewest calls is **flash-lite-b30**.

No second version of the prompt was written: the rule allowed it only for a concrete weakness, and an unvalidated judge cannot show one.

## Decision

- Score in batches of 30 instead of 10. With the prefilter keeping 30 candidates, a new search makes one scoring call instead of three, so it uses 2 units of the daily quota (extraction and scoring) instead of 4.
- The batch size stays injectable in `matchOffers`, so the logic that stops halfway when the quota runs out or Gemini fails is still tested.

The decision rests on the comparison between configs, which is the most robust part of this measurement: every config is measured against the same judge, so the judge's errors weigh on all of them alike. The absolute quality figures are not used for any decision.

## Consequences

- A search costs a third of the scoring quota and is about 2 seconds faster.
- If the single scoring call fails, all 30 offers are left unscored at once instead of 10. The app already lists them by matched skills with a notice, so nothing breaks.
- The README and the interview story cannot claim that the scorer ranks like a person. They can claim that it ranks far closer to a strong LLM judge than the prefilter does, and that the judge itself agreed only weakly with the one human check.
- Labeling the 135 offers by hand would turn this into a real measurement without new Gemini calls: the runs are kept and the report takes a second.
