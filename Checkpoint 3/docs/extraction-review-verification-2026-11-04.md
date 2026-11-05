# Extraction uncertainty and wording verification — November 4, 2026

Local development changes; no hosted deployment or real Gmail access. Report
filenames use UTC November 5 (the runs occurred November 4 in America/Chicago).

## Changes

- Versioned prompt/settings candidate: `cp3-extraction-v2-review`. Optional
  participation does not establish an obligation, even with a registration deadline.
- Ambiguous obligations/ownership request specific user verification through the
  existing `uncertainties` field. An established action remains a proposal while
  unsupported timing remains null. Explicitly ambiguous date formats must not be
  resolved by choosing a date and merely attaching a warning.
- By/before wording must agree across structured fields and prose. Conditional
  reminder checkpoints must not become send-by deadlines.
- The opt-in storage dashboard displays verification reasons beside suggestions,
  Passive digest entries and waiting-for records. The digest shows a review count
  and supporting evidence, including for uncertain messages with no task.
- Existing extraction warnings/review flags already persist through the storage
  transaction. No database migration or new RPC was needed. Review/edit/approval
  remain code-only operations and accepted task fields remain separate.

## Live development evaluation

Effective configuration: explicitly selected `gemini-3.6-flash`, OpenAPI response
schema, LOW thinking, 8192 output-token cap, 60-second timeout, one attempt per
case, 20-second spacing. The configured default remains `gemini-3.8-flash`;
neither model is declared a final winner. Successful reports record prompt hashes
and actual returned model versions.

| Run | Outcome |
| --- | --- |
| [Sandboxed attempt](../tests/extraction-review-2026-11-05T04-20-01-862Z.json) | Stopped on the first network/timeout error; no extraction result. Provider execution/cost is unknown. |
| [First connected run](../tests/extraction-review-2026-11-05T04-20-23-199Z.json) | Six of eight checks passed under its recorded scoring: E09 exposed an incorrect answer-key requirement; R04 correctly requested review but still guessed a date. The failed results remain unchanged. |
| [Final targeted run](../tests/extraction-review-2026-11-05T04-23-21-822Z.json) | Eight of eight passed after correcting E09 scoring and strengthening ambiguous-date instructions. Its prompt hash matches the final source. |
| [Full candidate regression](../tests/extraction-cp2-2026-11-05T04-26-47-290Z.json) | Twenty of twenty passed current acceptance/wording checks, with no provider failures. Its prompt hash matches the final targeted run and source. |

Final targeted manual inspection:

- E03: October 6 at 12:00 America/Chicago, inclusive `by`; requirements and summary
  preserve the boundary.
- E09: reminder deadline null, Friday afternoon/October 9 checkpoint in the condition;
  Maya's separate October 8 promise remains waiting-for. The reminder is not due
  before the trigger. Existing missing-deadline logic marks this for review.
- E12 and R01: clear optional invitations are Passive with no tasks or unnecessary
  review flags.
- R02: explicit prior commitment produces one reservation proposal due October 8;
  date-only timing does not itself force review.
- R03: unclear volunteer/owner produces no task, with a question asking whether
  the user volunteered. Its summary still loosely describes checking the earlier
  discussion before registration closes; the uncertainty notice is essential.
- R04: clear upload action remains; deadline null, with a question distinguishing
  October 11 and November 10. No preferred date is populated.
- R05: exclusive `before` October 8 at 16:00 America/Chicago is preserved.

The final targeted run reported 12,767 input tokens, 2,212 output tokens, and
15,297 provider-total tokens. Provider-total fields need not equal input plus
visible output; thinking usage is not consistently exposed. Latencies ranged
from 2,403 to 3,624 ms, averaging 2,854.5 ms, excluding pacing. These figures do
not include earlier runs or unknown failed-request charges; no monetary estimate
is asserted.

The full candidate run reported 32,334 input, 5,139 output and 37,817 provider-total
tokens. Latencies ranged from 1,703 to 3,545 ms, averaging 2,569.3 ms, excluding
pacing. E07/E08 were flagged for date-only historical context; E09/E16 for missing
task deadlines; E15 for model-supplied uncertainty. The final targeted run flagged
E09/R03/R04 and left the five clear cases unflagged. Thirty-six network-enabled
generation attempts completed across the first targeted, final targeted and full
runs; the separate sandboxed failed attempt has unknown provider execution/cost.
The expanded prompt increases input usage versus the original full baseline
(20,554 input tokens); no cost reduction is claimed.

Manual inspection of the full run confirmed E03's inclusive noon deadline,
E09's condition and separate waiting-for promise, E10's two actions, E11's response
alternatives, E12's optional status, E19's overdue follow-up based on limited
visible history, and no invented follow-up threshold for E20. The E02 and E15
limitations below remain despite the passing automated scores.

### Scoring correction

The old E09 answer key demanded `2026-10-09` in a task deadline. The source instead
says to remind Maya **if no response has arrived by Friday afternoon, October 9**.
Current scoring requires a null reminder deadline and that checkpoint in the
condition. This correction follows the source semantics; original benchmark
artifacts and their 19/20 result are preserved. New scores use a changed rubric
and are not a directly comparable accuracy improvement.

## Offline and browser checks

- `npm.cmd test`: 81 passing tests, including PostgreSQL semantics via PGlite.
  New checks verify high-confidence uncertain results route to review, Passive
  uncertainty persists without a task, and the historical E03/E09 outputs fail
  the new focused wording checks. After a test-only wording adjustment, the
  36-test pipeline subset passed again.
- Frontend TypeScript check and production build passed.
- All eight targeted inputs and all twenty CP2 inputs prepared offline without
  reading credentials or making model calls.
- Synthetic browser checks mounted the real dashboard with a mocked storage
  adapter: suggestion reasons/excerpt, digest review count/reason/excerpt, and
  keyboard activation of Edit passed. These checks did not authenticate against
  Supabase, persist a correction, or call a model. Existing transaction tests
  cover saved review semantics separately.
- `npm.cmd run supabase:prepare` rebuilt the ignored Edge bundle from canonical
  sources. No hosted function, schema, or settings were changed.

## Remaining limits

Actionable/Passive remains mandatory. Review is a separate flag, not a third
classification, and a confidently wrong model can still omit uncertainty.
Prompt instructions and focused wording checks do not guarantee semantic safety.
These are small development cases used for tuning, not held-out accuracy evidence.

Passive digest entries have no persistent reclassification, create-task, or
resolve-review action. Users can inspect them; richer resolution remains a later
contract/UI change. Existing task proposals can be edited, approved or dismissed.
Model-generated requirements may still paraphrase the source, so users must check
evidence. Automatic confirmation from confidence scores is not implemented.

Manual inspection of the full candidate run also found that E02 retained the
required findings section and its deadline but omitted Jordan's dependency on
that section before finishing the team summary. Existing automated checks do
not score that detail. This remains a refinement item and is another reason not
to freeze settings or equate acceptance-check success with complete extraction.
E15 also emitted an unnecessary calendar-day observation and a request to verify
the unspecified shared-document location. Its task/deadline are correct, but it
demonstrates extra review burden. Further evaluation should score unnecessary
review as well as missed uncertainty; raising review frequency is not itself an
accuracy improvement.

Google integration, hosted rollout and a live Edge-to-storage-to-UI inference trial
remain unverified. Rebuild/deploy the Edge Function and deploy the frontend in an
explicit rollout; changing local sources does not update hosted behavior.

Reproduce using the commands in the [pipeline guide](../app/pipeline/README.md#uncertainty-and-wording-regression-checks).
