# CP2 live extraction evaluation — November 3, 2026

The full 20-case evaluation completed with `gemini-3.6-flash`, the OpenAPI response adapter, LOW thinking, an 8,192 output-token cap, a 60-second timeout, and one attempt per invocation. All twenty cases returned validated outputs across an initial pass and paced retries. **19/20 passed the existing acceptance checks.** E12 incorrectly classified an optional invitation as Actionable. This is a synthetic development benchmark, not a held-out accuracy estimate.

## Evidence

- [Structured results and manual review](../tests/cp2-live-2026-11-03.json) retain the fictional outputs, usage, provider version, checks, and failure records.
- All 31 offline tests passed using `node --test "Checkpoint 3/tests/pipeline.test.mjs"`.
- The initial restricted-sandbox run returned `NETWORK_OR_TIMEOUT` for all twenty cases. A subsequent run with network access produced the results below. Neither run displayed the API key.

| Cases | Final outcome |
| --- | --- |
| E01-E11, E13-E20 | Validated extraction; existing automated acceptance checks passed |
| E12 | Validated output, but category and task-count checks failed: optional invitation became a task |

The initial pass produced E01-E05 successfully, two HTTP 503 failures (E06, E17), and thirteen HTTP 429 failures. After a cooldown, E06 succeeded. E07-E20 then resumed with 20-second spacing and a stop-on-429/network-error policy; all succeeded. There were 35 network-enabled generation attempts, including the fifteen initial provider failures. Successful cases were not resubmitted. Provider failures are distinct from E12's semantic error.

## Manual inspection

E01 preserved the reading response deadline of October 7 at 17:00. E02 preserved the findings-section deadline of October 8 at 18:00 and its dependency on the team's summary. E03 preserved the interview-confirmation deadline of October 6 at 12:00. E04 correctly treated urgent marketing as Passive with no task. E05 preserved the usability findings deadline of October 5 at 16:00 with an exclusive `before` boundary. All times use America/Chicago and owners match the inbox owner.

E06 correctly retained the reading choice and Canvas deadline. E07/E08 produced no tasks for canceled/completed requests and retained date-only history warnings with `needsReview: true`. E09 retained the conditional reminder, the afternoon wording without inventing an hour, and Maya's separate promise. E10 extracted both actions with the same noon deadline. E11 retained confirm/reschedule alternatives without assuming acceptance. E13/E14/E17/E18 remained Passive. E15 preserved the notes deadline, while E16 left its unspecified deadline null and routed to review. E19 separated an overdue external promise from a suggested follow-up and cited limited visible history. E20 kept an undated promise without inventing a follow-up threshold.

E12 is a substantive false positive: an invitation conditioned on wanting to attend does not establish an existing obligation. The model returned an Actionable reservation task with confidence 95 despite the explicit optional-event rule. High self-reported confidence and schema validity did not detect the mistake.

Two wording issues also remain. E03 adds a requirement to "reply before deadline," although the source says "by" noon; its structured boundary correctly remains `by`. E09's summary says to send a reminder "by" Friday afternoon, while the actual condition correctly says to act if no response has arrived by then. Preserve source boundaries and trigger semantics in the UI. No prompts or answer-key expectations were changed to make the benchmark pass.

The twenty successful responses reported 20,554 input tokens and 5,046 output tokens, totaling 25,600. Their request latencies ranged from 2,056 to 5,633 ms, averaging 2,914 ms; this excludes retry delays, pacing, and failed requests. Thinking-token counts were absent. Failed-attempt usage and monetary charges are unknown.

## Model decision and next run

Use Gemini 3.6 Flash as the explicitly selected candidate for further development because this is the combination tested across all twenty cases. Keep the configured default unchanged until optional-invitation behavior is corrected and revalidated. Retain the tested OpenAPI adapter and LOW thinking as the baseline; this run provides no controlled evidence for changing thinking level or comparing 3.6 with the configured 3.8 default. Do not call either model a proven final winner.

Next, strengthen optional-invitation handling and verify it against E12 plus distinct optional-invitation and explicit-commitment examples. Recheck the conditional-reminder distinction so that a fix does not suppress E09. If the prompt/settings change, label subsequent results as a new run rather than replacing this baseline. Continue pacing live evaluations and stop on renewed throttling. The full twenty-case baseline evaluation is complete; the E12 defect remains unresolved.
