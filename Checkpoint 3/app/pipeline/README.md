# Local InboxToTask extraction pipeline

This directory contains the canonical extraction core, provider adapter, prompts
integration, and Gmail retrieval/task-context/persistence coordinators. The fixture
CLI can run fictional email independently of Supabase; persistent Gmail processing
requires backend Auth, configured Google/model services and saved scanning permission.
See [current state](../../CURRENT_STATE.md) for implemented versus verified behavior.
No automatic inbox polling or Calendar writes are implemented.

The original fixture schema remains the default; `gmailSchema` adds per-item semantic
relevance and reviewable edit/cancel proposals. [gmail-processor.mjs](gmail-processor.mjs)
uses [task-context.mjs](task-context.mjs), then canonical extraction/validation and
service-only persistence. [gmail-retrieval.mjs](gmail-retrieval.mjs) independently
checks source metadata before bodies/context. The offline suite uses fictional injected
model responses. Live local results on fictional mail are recorded separately in
[UC8](../../docs/use-cases.md#uc8-real-gmail-to-review-workflow).

## Historical model evaluation (November 3, 2026)

All 31 offline tests passed on Node.js 24.20.0, and offline preparation covered all 20 CP2 targets. Earlier direct JSON Schema requests returned HTTP 400 on alternative models; default-model requests returned HTTP 503. Controlled tests narrowed the 400 to structured-output configuration rather than explicit thinking settings. An OpenAPI-style responseSchema adapter then succeeded on Gemini 3.6 Flash, including a full E01 pipeline run with LOW thinking, strict backend validation, and the automated E01 checks. That successful request took 3186 ms and reported 1001 input + 346 output = 1347 total tokens (thinking-token count absent). An initial full adapter attempt returned 503 and a subsequent explicit retry succeeded. This is one case, not a 20-email accuracy result or proof of exactly which JSON Schema constraint caused the original rejection.

The default provider format is now `schemaMode: "openapi"`. The selected default model remains `gemini-3.8-flash`; the successful run explicitly selected `gemini-3.6-flash`, with no silent model fallback. Run the command below with `--model gemini-3.6-flash` to reproduce that combination.

A subsequent evaluation explicitly using Gemini 3.6 Flash completed all 20 cases across an initial pass and paced retries: **19/20 passed the existing acceptance checks**. E12 incorrectly turned an optional workshop invitation into an Actionable task. Initially, thirteen HTTP 429 and two HTTP 503 responses prevented completion; after a cooldown, all fifteen remaining cases succeeded with 20-second spacing between E07-E20 requests. The 20 successful responses reported 20,554 input + 5,046 output = 25,600 total tokens; failed-attempt usage is unknown. Manual inspection also found loose boundary/trigger paraphrases in E03 and E09. All 31 offline tests passed again. See the [evaluation evidence](../../tests/cp2-live-2026-11-03.json) and [evaluation report](../../docs/cp2-live-evaluation-2026-11-03.md). This synthetic development benchmark does not establish general inbox accuracy or model superiority. Gemini 3.6 Flash is the tested development candidate; the default remains unchanged pending correction and revalidation of optional-invitation handling.

## Run locally

### Uncertainty and wording regression checks

The `cp3-extraction-v2-review` candidate strengthens optional-invitation handling,
requires specific user-verification reasons for ambiguous obligations/fields,
and preserves by/before boundaries and conditional reminder checkpoints. It
uses the existing `uncertainties` / `needsReview` storage contract; no migration
is required. A model confidence score cannot override a review reason.

From the repository root:

```powershell
# Prepare eight fictional cases without reading credentials or calling a model.
node "Checkpoint 3/tests/extraction-review-evaluation.mjs"
# Billable live checks: eight targeted cases, then the full twenty-case set.
node "Checkpoint 3/tests/extraction-review-evaluation.mjs" --live
node "Checkpoint 3/tests/extraction-review-evaluation.mjs" --live --cp2
```

The runner explicitly selects the previously evaluated Gemini 3.6 Flash candidate,
LOW thinking, and one attempt per case, with 20-second spacing. It stops on the
first provider/validation failure and saves a uniquely named fictional-output
report after each case. Reports record effective settings, prompt hash and scoring
expectations. This does not change the default model or enable the Edge fixture
endpoint. Semantic failures remain in the report; there is no automatic tuning,
retry, or fallback. Inspect wording/evidence manually as well as automated scores.

E09 scoring now requires a null reminder deadline and the Friday-afternoon/October-9
checkpoint in its condition. The previous answer key incorrectly required that
checkpoint as a task deadline. Original evaluation artifacts remain unchanged;
new scores are not directly comparable to the old 19/20 headline.

The storage UI shows verification reasons on suggestions, waiting-for entries,
and Passive digest entries (including results with no proposed task). Passive
results cannot yet be reclassified or converted into a task through the digest;
that richer resolution workflow remains separate work. Existing proposal edits,
approval and dismissal use stored fields/RPCs and do not invoke the model.

### Existing CLI

Use Node.js 22 or later. From the repository root in PowerShell:

```powershell
# Offline tests: no environment-file access, no network, no model charges.
node --test "Checkpoint 3/tests/pipeline.test.mjs"

# Inspect filtering/context selection for all 20 CP2 targets without inference.
node "Checkpoint 3/app/pipeline/cli.mjs" --all

# Live smoke test: one fictional email, one provider attempt by default.
node "Checkpoint 3/app/pipeline/cli.mjs" --case E01 --live

# Explicit alternate-model test; does NOT edit the configured default.
node "Checkpoint 3/app/pipeline/diagnose.mjs" --model gemini-3.6-flash
node "Checkpoint 3/app/pipeline/cli.mjs" --case E01 --live --model gemini-3.6-flash

# Live CP2 evaluation: up to 20 sequential requests; consumes API quota/money.
node "Checkpoint 3/app/pipeline/cli.mjs" --all --live

# Additional fictional probes (manually review their semantic correctness).
node "Checkpoint 3/app/pipeline/cli.mjs" --input "Checkpoint 3/tests/fixtures/deadline-update.json" --live
node "Checkpoint 3/app/pipeline/cli.mjs" --input "Checkpoint 3/tests/fixtures/prompt-injection.json" --live
```

If Node is installed but not on PATH, replace `node` with `& "C:/Program Files/nodejs/node.exe"` in PowerShell, or reopen the terminal after installing Node. From `Checkpoint 3/app`, equivalent npm commands are `npm test`, `npm run extract:plan`, `npm run extract:live -- --case E01`, and `npm run extract:live -- --all`.

For live runs only, place `GEMINI_API_KEY=your_key` in the ignored `Checkpoint 3/app/.env`. The CLI loads that fixed location internally, independent of the current directory; it never prints the file, key, request headers, or raw provider errors. Existing process environment values take precedence. Do not use a `VITE_` variable or import this pipeline into the web bundle. `.env.example` stays blank. A dry run or test never loads the environment file.

Mode is explicit: `OFFLINE_PLAN_NO_INFERENCE` is not an extraction result. `LIVE_API` calls Google's fixed HTTPS endpoint. There is no simulated live fallback, alternate provider, or silent model substitution. Exit code 1 means a startup failure, item failure, Needs Review due to oversized input, or a failed acceptance check. Skipped privacy-filtered inputs are shown separately.

`--model` overrides the selected model for that run only; prompt, JSON schema and thinking settings stay the same. Choose a model compatible with those settings. Check `returnedModelVersion` when supplied by Google to identify provider-side routing/version differences. A successful one-case run does not establish full CP2 accuracy or justify silently replacing the default.

`--schema-mode openapi` selects the provider adapter (`responseSchema`, uppercase types, nullable flags, no extra bounds/patterns). It preserves field names, per-task deadlines, conditions, evidence, and the original by/before/on/unspecified boundary enum. Strict validation still uses the canonical JSON Schema, including extra-field rejection, lengths, patterns and numeric limits. `--schema-mode json-schema` explicitly selects the earlier direct JSON Schema path for diagnosis; it is not an automatic fallback. The adapter change does not mean all Gemini JSON Schema features are universally unsupported.

The CLI prints extracted fixture results and usage to the terminal but does not save them. For real personal email, do not redirect output into committed files or shared logs. Automated diagnostic logs should retain metadata only. Costs are not guessed: usage includes input, cached input, visible output, thinking, and total counts where the provider supplies them. Failed attempts may be charged even when usage is unavailable.

## CP2 contract and provenance

Source: [PROMPTING_PROTOCOL.md](../../../Checkpoint%202/validation/PROMPTING_PROTOCOL.md), especially Sections 2, 5, and 7, and [GAP_ANALYSIS.md](../../../Checkpoint%202/validation/GAP_ANALYSIS.md). The [CP2 fixture](../../tests/fixtures/cp2-inbox.json) copies only the fictional Section 7 inbox, preserving E01-E20 and separate earlier messages for E07/E08. Regenerate it with:

```powershell
node "Checkpoint 3/app/pipeline/import-cp2.mjs"
```

Earlier messages with no supplied hour use midnight placeholders with `sentAtPrecision: "date"`; the pipeline warns that their actual sent time is unknown. The simulation time remains October 5, 2026, 09:00 America/Chicago, not the machine's current date.

The [expected checks](../../tests/fixtures/cp2-expected.json) come from the protocol/gap analysis, NOT from treating one model's transcript as ground truth. They are loaded locally for scoring only and never enter prompts. This small synthetic set is a development benchmark, not a held-out CP4 evaluation or a claim about general inbox accuracy.

The additional deadline-update probe should retain the original report requirements but use November 8, 17:00 America/Chicago as the proposed deadline. It is not a database update or calendar authorization. The injection probe should remain Passive with no invented money-transfer task, no secrets, and no external execution. These custom inputs have no automatic answer-key scoring; inspect their results explicitly. Never interpret schema-valid output as proof of injection resistance.

Preserved semantics:

- Exactly one Actionable/Passive category per current email.
- Extract all outstanding inbox-owner actions, including conditional reminders.
- External commitments are waiting-for details; suggested overdue follow-ups remain separate from explicit tasks.
- Optional invitations/promotions do not create obligations by default.
- Completed/canceled history does not create new outstanding tasks.
- Missing deadlines stay null; preserve before/by wording and conditional timing.
- Evidence quotes must match supplied permitted bodies. This prevents fabricated quotes, not every semantic hallucination.
- Self-reported classification confidence is not calibrated probability.

The production adaptation returns concise structured JSON rather than CP2 Markdown. It omits the original global LLM attention-order essay to avoid repeated inbox-wide inference. The frontend should derive deadline ordering, preserve undated items, separate conditional actions, and let users review priorities. No automatic task/calendar state changes occur here.

## Input

Use `--input path/to/input.json --live` for one custom case (paths are relative to the terminal directory). The file contains:

```json
{
  "user": { "email": "student@example.org", "timeZone": "America/Chicago" },
  "analysisTime": "2026-10-05T09:00:00-05:00",
  "rules": {
    "allow": { "domains": [], "senders": ["professor@example.org"] },
    "block": { "senders": [], "domains": [], "keywords": [], "subjectKeywords": [] }
  },
  "message": {
    "id": "sample-1", "threadId": "sample-thread", "from": "professor@example.org",
    "sentAt": "2026-10-05T07:30:00-05:00", "labels": ["School"],
    "subject": "Reading response", "body": "Please upload your response by October 7 at 5 pm."
  },
  "threadContext": [],
  "contextLimits": { "maxMessages": 5, "maxAgeDays": 30, "maxMessageChars": 12000, "maxTotalChars": 24000 }
}
```

Context messages use the same message shape, unique IDs, the same threadId, and timestamps no later than the current message. Inputs must be plain text: MIME/HTML decoding belongs in the future Gmail adapter. Each context message is independently checked against the rules. The module is not a retrieval boundary: a future Gmail adapter must filter metadata BEFORE fetching excluded bodies; this local module receives already supplied fixture text.

Inclusions use OR: exact case-insensitive sender/domain matches, with no implicit
subdomains. Source exclusions and literal case-insensitive `block.subjectKeywords`
override inclusion. Phrase access rules and mailbox labels fail closed with
`RULE_REVIEW_REQUIRED`; they never grant source access. Empty source allowlists
produce `NO_ALLOWLIST` and zero inference, unless a topic to check is saved: then
`filterMessage(..., anySender)` permits any sender that is not excluded (retrieval
still requires Gmail's authentication result) and the topic words decide. Optional `semanticPreferences` are
validated separately from access permissions. Only `include` (topics of interest)
reaches Gemini; relevance to it is part of the versioned Gmail extraction contract.
Each `exclude` topic is a list of literal words in `blockedWords` (suggested topics
start from the lists in [private-topics.mjs](private-topics.mjs)). Retrieval checks the
subject before fetching a body, then the decoded body; `prepareInput` checks again, and
earlier thread messages and existing-task candidates get the same check. A matching
email makes no model call and stores nothing; scan counts record only `privateTopic`.
Each `include` topic (topic to check) also has a word list, in `includeWords`, with
starter lists for the suggested topics in `STARTER_TOPIC_WORDS`. When any topic to check
is saved, a permitted email whose subject and decoded body contain none of their words
is skipped after the body check, before any model call; `prepareInput` repeats the check
(`NO_TOPIC_WORD`) and scan counts record `noTopicWord`. With no topic to check, nothing
is required. The words narrow what is processed and never reach Gemini; only topic names do.
Every-minute automatic checks overlap the previous complete check by `SCAN_OVERLAP_MS`
(5 minutes, matching migration `20261112010000`) so email Gmail indexes late is not
missed. An email skipped in that overlap is read and skipped again but not counted
again (`skipCountStart`); a full 7-day check counts every skip. Nothing is stored for
a skipped email either way.
Matching ignores case, accents and punctuation but needs whole words, with no stemming.
Metadata rules and word lists are not semantic healthcare/financial classifiers.

The [Gmail retriever](./gmail-retrieval.mjs) is canonical and packaged by
`supabase:prepare`. Its separate, disabled-by-default Edge endpoint currently
supports separately gated retrieval-only and persistent modes; both remain disabled by default. It independently
filters every context message before fetching its body and keeps bodies transient.
See [phase evidence](../../docs/gmail-manual-scan-phases-2026-11-05.md).

Quoted `>` lines, common reply headers, and signature separators are removed conservatively. This is not a guarantee that inline sensitive content is removed. Original messages must be supplied independently as permitted context. Context omission adds deterministic uncertainty; oversized current content goes to review without silently truncating or paying for inference.

## Output and settings

See [extraction.schema.mjs](../prompts/extraction.schema.mjs) for the shared JSON Schema. A successful envelope contains `messageId`, `status: "extracted"`, `needsReview`, `contextWarnings`, `result`, `modelCalls`, `usage`, and `latencyMs`. `result` includes category/confidence, evidence, explanation, short summary, tasks, waitingFor, suggestedFollowUps, and uncertainties. Backend context warnings always appear in the envelope even if the model omits them, and must be displayed alongside model uncertainty. The backend also adds a warning, and requires review, when a suggestion contains a web link or mentions passwords, codes, payments, gift cards or bank details. Dates are local date/time plus IANA zone, not automatically calendar-ready event durations. Field facts still require human review.

The runtime-independent [core module](./core.mjs) validates inputs, filters context, validates schema/evidence/ownership, and wraps an injected `generate` function. [gemini.mjs](./gemini.mjs) provides the actual HTTP implementation. It uses Google's generateContent endpoint with JSON Schema output, no tools, no provider conversation chain, and default sampling. Later Supabase functions can import these modules, load prompt/settings assets during deployment, read secrets server-side, and supply the same interface.

[model-settings.json](../prompts/model-settings.json) selects `gemini-3.8-flash`, OpenAPI provider schema mode, LOW thinking, an 8192 output-token cap, 60-second request timeout, and ONE attempt. These are initial settings requiring empirical evaluation. Do not silently switch models if access is unavailable. Optional retry maximum is three total attempts; only HTTP 429/selected server errors are retried, not unknown network outcomes, validation failures, or unauthorized requests. Timeout failures can have unknown provider cost. Character caps are not tokenizer-based input budgets. Global quotas, cross-scan caching, real-time preference rechecks, and persistent duplicate handling are integration work.

## Failure diagnosis

### Isolate configuration without exposing raw errors

Run stages separately, proceeding only if the previous stage succeeds:

```powershell
node "Checkpoint 3/app/pipeline/isolate.mjs" --model gemini-3.6-flash --stage minimal
node "Checkpoint 3/app/pipeline/isolate.mjs" --model gemini-3.6-flash --stage baseline
node "Checkpoint 3/app/pipeline/isolate.mjs" --model gemini-3.6-flash --stage simple-schema
node "Checkpoint 3/app/pipeline/isolate.mjs" --model gemini-3.6-flash --stage schema
node "Checkpoint 3/app/pipeline/isolate.mjs" --model gemini-3.6-flash --stage thinking
node "Checkpoint 3/app/pipeline/isolate.mjs" --model gemini-3.6-flash --stage full
```

Each command makes ONE billable/quota-consuming generation attempt, with no automatic retries. `minimal` submits only a request to reply OK, with no system prompt, email, schema or generationConfig. `baseline` uses fictional E01 and the extraction system prompt, with no generationConfig. `simple-schema` tests a one-field category schema; `schema` uses the full extraction schema; `thinking` adds LOW thinking; `full` adds the configured output cap. The E01/system content stays identical. The diagnostic defaults to the configured OpenAPI schema mode; use `--schema-mode json-schema` to reproduce the earlier responseFormat.text JSON Schema probe. These diagnostic probes do not validate or persist extracted results and never change the default model.

Results include HTTP status, a whitelisted provider status, fixed diagnostic hints, and a bounded error message redacted for the loaded key, Google-key patterns, and email addresses. This is limited to the built-in synthetic probes; production errors remain fixed hints only. No generated text, request headers, or environment contents are printed. The built-in Node env loader loads the fixed backend location internally; no custom parser is needed. A failure on minimal cannot be caused by the extraction schema or explicit thinkingConfig, since neither was sent. However, one successful request does not prove every model, feature, quota or billing requirement is satisfied. A 503 does not identify the exact infrastructure cause, and metadata success does not establish generation eligibility. Check official per-model thinking documentation rather than assuming all Flash-Lite models lack reasoning controls.

Before submitting more email, check access to the configured model metadata:

```powershell
node "Checkpoint 3/app/pipeline/diagnose.mjs"
```

This loads the key internally and makes one metadata GET request with no email content or generation. It emits only HTTP status, a whitelisted provider status, and whether the metadata advertises generateContent. A successful metadata request does not prove generation capacity or billing eligibility. An HTTP 503 from generation means the provider could not serve that request; do not treat it as evidence that the key is invalid or immediately change billing. Retry the one-case smoke test later, rather than repeatedly submitting the whole inbox. No automatic model fallback is performed.

| Code | Action |
|---|---|
| `MISSING_API_KEY` | Set the key locally; do not paste it into chat or logs |
| `PROVIDER_HTTP_400` | Check model/settings/schema against current provider docs; raw error bodies are deliberately hidden |
| `PROVIDER_HTTP_401` / `403` | Check key permissions and project eligibility locally |
| `PROVIDER_HTTP_404` | Confirm the configured model/API availability for your project; no automatic fallback |
| `PROVIDER_HTTP_429` | Check quota/billing and retry later; default has no automatic retry |
| `NETWORK_OR_TIMEOUT` | Check network/proxy access and provider status; the previous request may have executed |
| `OUTPUT_TRUNCATED` | Review output/thinking budget or reduce case size; partial data is not accepted |
| `INVALID_OUTPUT_SCHEMA` / `UNGROUNDED_EVIDENCE` | Inspect fictional case output using a controlled development run; do not persist invalid extraction |

The tests inject fake HTTP responses to validate contracts and error handling. Passing them does NOT establish Gemini extraction accuracy or prompt-injection resistance. Live acceptance checks cover labels, task counts, selected deadline dates, conditions, and follow-up boundaries only; manually inspect owners, exact times, alternative branches, requirements, and omissions.

Provider references: [generateContent API](https://ai.google.dev/api/generate-content), [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), [model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash).
