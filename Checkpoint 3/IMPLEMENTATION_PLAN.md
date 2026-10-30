# InboxToTask: CP3 plan and CP4 implementation checklist

Updated: October 30, 2026. This is a planning document, not a report of implemented features. Unchecked items are work to complete or verify. Decisions explicitly accepted by the team are separated from suggested defaults requiring confirmation.

## Product and architecture

InboxToTask is a hosted AI application that automatically scans permitted Gmail messages and prepares evidence-linked tasks, deadlines, external commitments, and informational summaries. Users control email access rules and approve consequential changes. The Figma prototype must become a real, persistent application for CP3.

| Component | Planned role |
|---|---|
| React dashboard on Vercel | Onboarding, tasks, informational digest, source evidence, scan activity, preferences, and account controls |
| Supabase Auth | App accounts and sessions; Google sign-in is distinct from permission to read Gmail |
| Supabase Postgres | User preferences, protected account connections, suggestions, tasks, scan state, and calendar operation records |
| Supabase Edge Functions | Verify users, enforce privacy rules, retrieve permitted content, invoke Gemini, validate results, and perform approved calendar operations |
| Scheduled backend work | Incremental scans while the dashboard is closed, bounded retries, and retention cleanup |
| Gmail API and Google OAuth | Authorized email access and server-side refresh-token lifecycle |
| Gemini 3.8 Flash | Classification and structured extraction from permitted content; no Jev integration |
| Google Calendar API | User-approved creation and updates, tracked operation status, and undo of app-created entries |
| ICS download | Export for manual import into other calendar providers; no equivalent connected synchronization or remote undo |

Flow: scheduled/manual trigger -> verify account and preferences -> filter message metadata -> fetch permitted bodies/context -> recheck permissions -> Gemini extraction -> validate -> save suggestions -> progressive dashboard results -> user review -> approved task -> separate calendar approval.

## Confirmed decisions

### Scanning and filtering

- Automatic scans operate on a 15-minute default interval, with manual refresh available. This adopts the proposed default accepted in discussion; scheduling is not an exact arrival-time guarantee.
- Manual refresh processes newly available permitted messages and uses a cooldown, shared scan coordination, and deduplication.
- A message must match at least one allowed label, sender, or domain. These inclusion conditions combine with OR.
- Any matching exclusion overrides permission. Exclusions include labels, senders, domains, and configured subject keywords.
- No allowlist means scanning is disabled. Notify the user and provide a direct action to configure permitted sources; connecting Gmail alone does not enable scanning.
- Display the effective scope in plain language, for example: "Process messages labeled School OR from professor@illinois.edu, except blocked sources and subject keywords."
- Initial scanning covers the past seven days, up to 100 permitted messages. Where labels are selected as allowed sources, they participate in the OR rule rather than becoming a separate mandatory condition.
- Show any remaining initial backlog and require "Scan more" approval. Process new arrivals separately so backlog limits do not block them.
- Changes to rules affect queued and future processing. Offer separate deletion of previous results; already transmitted content cannot be retracted.
- Pause, disconnect, and preference changes must be checked before new external requests. Already in-flight requests cannot be unsent; stale results should not be persisted after account/data deletion.

### Thread context and privacy

- Every earlier message must independently pass current rules before its body is retrieved for context.
- Provide customizable message-count, age, and text-size limits, within enforced server limits.
- Proposed starting context defaults: allow up to five earlier permitted messages from the past 30 days, but include only context needed to interpret the current message. Five is a ceiling, not an amount to attach to every request. The text/token cap remains to be selected; these numerical context defaults need confirmation.
- Remove quoted history and signatures where practical; retrieve original earlier messages individually through filtering. Recognize that quoted-text removal is imperfect and inline copied private content may remain.
- If necessary context is excluded, unavailable, or truncated, flag the suggestion as Needs Review and explain the limitation.
- Sender/label/subject rules do not guarantee exclusion of all healthcare or financial topics. Semantic sensitive-topic classification is outside the current scope.
- Do not persist full email bodies by default or put email content, prompts, credentials, or model output in technical logs. Supporting excerpts and task fields remain sensitive data.

### Task and calendar control

- Suggestions are separate from approved active tasks. Approving a task does not create a calendar entry.
- Users can edit fields, approve, dismiss, complete, and undo completion; source evidence stays accessible subject to retention.
- Missing deadlines remain empty and are flagged for review. Ambiguous relative dates/time zones must not be silently guessed.
- Users choose all-day versus timed calendar entries and required duration. Explicit due times can prepopulate the preview but do not authorize creation or establish an event duration.
- Calendar creation and proposed changes to approved task/calendar values require approval. Record proposed values separately from accepted values.
- Google Calendar is the connected integration. ICS is a downloadable export; explain that imported entries must be managed in the destination calendar.
- Completing or deleting an InboxToTask record does not implicitly delete Gmail messages or calendar entries.

### Retention

| Record | Agreed or previously accepted behavior |
|---|---|
| Full email body | Temporary processing only; no durable application storage by default |
| Active approved task | Keep until completed or explicitly deleted |
| Completed task | Eligible for deletion after remaining completed for 30 days |
| Undo completion | Return to active; clear completion and deletion timestamps |
| Complete again | Start a new 30-day countdown |
| Supporting excerpt | Previously accepted default: 30 days after extraction; source link and task may remain afterward |
| Gmail connection credential | Backend-only while connected; remove on disconnect and implement provider revocation |
| Technical logs | Previously accepted default: 14 days, excluding content and credentials |

Use scheduled cleanup to remove eligible records; show the expected deletion date and document cleanup timing. Cleanup must recheck current status/timestamps so undo cannot race with deletion. Clearly disclose separate backup and provider retention rather than promising immediate deletion of every copy.

Unreviewed suggestions, informational summaries, dismissed items, scan history, and duplicate-suppression records still need explicit retention decisions before CP3 implementation is finished.

## Model configuration

Selected model: `gemini-3.8-flash`. Google documents structured outputs and low/medium/high thinking support; minimal thinking is unsupported. Settings below are proposals, not a frozen evaluation configuration.

- Require JSON Schema output and validate it again on the backend. Schema conformance does not establish factual accuracy.
- Include task type, owner, title, requirements, nullable deadline/time zone, source message IDs/excerpts, and uncertainty/missing-context reasons.
- Begin with default sampling parameters rather than assuming that temperature zero is best. Record effective settings and API/SDK versions.
- Trial low thinking for extraction, compare medium on a fixed difficult subset, and select based on accuracy, latency, and cost.
- Choose explicit input/output limits, request timeout, and per-user budget before enabling scans. Treat truncation as a visible failure or incomplete result.
- Give the model no email-sending, arbitrary browsing, or calendar execution tools. Treat email instructions as untrusted data. Backend code performs only separately authorized operations.
- Version prompts, model ID, settings, and schema; freeze the CP3 configuration after targeted validation.
- Verify the selected Gemini service/tier's retention, training-use, and human-review terms before sending real personal email. Document the actual configuration and do not promise zero retention without evidence.

Sources checked October 30, 2026: [model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash), [structured output documentation](https://ai.google.dev/gemini-api/docs/structured-output).

## Token-cost requirements and optimization proposals

These additions make cost controls explicit without removing core features. Numerical budgets and optional optimizations require validation; no percentage savings are assumed before measurement.

### CP3: avoid unnecessary inference

- A scheduled check is a Gmail/database operation, not automatically a Gemini call. With no new permitted content or eligible failed work, make zero model calls. A 15-minute interval does not mean reprocessing the inbox 96 times per day.
- Make classification, task/commitment extraction, and a short informational summary branches of one structured response. Do not run separate classifier, summarizer, and extractor calls for every message. Information-only results still produce the required digest entry.
- Process all actions in an eligible message in one call. If several new messages in the same thread arrive before a scan, consider one bounded thread request instead of repeatedly sending overlapping context; preserve per-message coverage and all distinct actions.
- Strip HTML markup, tracking URLs, duplicate MIME representations, practical quote/signature boilerplate, and repeated content before token budgeting. Preserve meaningful URLs, deadline wording, negation, ownership, and evidence. Do not discard messages as noise solely because they are automated notifications or lack deadline keywords.
- Use compact, versioned instructions with only useful few-shot examples, a concise schema, and short uncertainty codes. Do not ask for long explanations or chain-of-thought text. Return short titles, necessary fields, a short informational summary where applicable, and bounded evidence excerpts; attach deterministic metadata in code when possible.
- Include the current message and directly relevant approved task state/context for an update. Do not attach the entire inbox, every task, or all five historical messages by default. For genuinely missing context, allow a bounded enrichment attempt or Needs Review rather than an unbounded agent loop. Test extra-call costs as well as context savings.
- Reuse valid stored extraction results for unchanged permitted content, including information-only outcomes. Scope reuse by user, message/content identity, relevant context/task revision, prompt/model/schema version, and applicable processing settings. Recheck current permissions before reuse or display; changing rules does not grant access to an old cached excerpt.
- Prompt/model version changes mark results as potentially stale, but do not automatically reprocess the whole mailbox. Re-extraction of history is an explicit, budgeted operation. Store minimal processing identifiers rather than full raw-email caches, and honor deletion/retention rules.
- Approve, edit, complete, undo, dismiss, remind, filter, sort, create calendar entries, and export ICS through application code and stored structured fields. These actions do not require another model call unless the user explicitly requests new interpretation. Reuse informational summaries rather than regenerating the entire digest after each scan.
- Start with the planned low-thinking trial and count thinking/reasoning usage where exposed. Keep task output concise, but do not set output limits so low that multi-action results are truncated or missing. On truncation, split or flag the item rather than saving partial output as complete.
- Reserve a request budget before dispatching concurrent work. Bound input/output, retry attempts, and context-enrichment attempts within the per-user/day budget; surface deferred work and reset times. Failed/timeout requests may still incur provider charges, so never assume retries are free.
- Keep a stable instruction/schema prefix for possible implicit caching, but do not pad short prompts to meet a cache threshold. Treat cache discounts as an observed bonus; use stateless requests for CP3 rather than chaining provider conversations that retain excluded or stale context.

### CP4: evaluate additional optimizations

- Compare a current-message-first approach with targeted thread context on a held-out set; report missed actions and deadline/ownership errors alongside tokens, cost, and latency.
- Test same-thread grouping or small independent-email batches only when they reduce measured total cost without cross-message contamination, omissions, or expensive whole-batch retries. Do not mix users; map each output to its input and retry only failed work.
- Consider Gemini's asynchronous Batch API for non-urgent historical backfills and offline evaluation, not manual refresh or the live demo. Check endpoint/model compatibility, provider retention of uploaded files/results, preference changes during queued jobs, and cleanup before adoption.
- Consider explicit provider caching only after a break-even calculation including storage charges, minimum lengths, endpoint support, expiry, and privacy/deletion effects. Never cache raw email across users; a shared cache may contain only public static instructions/examples.

Measurement: track uncached and cached input tokens, generated output, thinking tokens where exposed, retry/enrichment calls, and provider-cache storage fees if used. Derive estimates from the selected service's current rates without double-counting cached input or thinking/output fields; record pricing date and reconcile with provider billing. Compare cost per successfully reviewed task and extraction accuracy, not just cost per request.

Sources checked October 30, 2026: [Gemini caching](https://ai.google.dev/gemini-api/docs/caching), [Batch API](https://ai.google.dev/gemini-api/docs/batch-api), [pricing and data-use tier distinctions](https://ai.google.dev/gemini-api/docs/pricing). Batch pricing reduces price per token, not the number of tokens; its documented target turnaround is 24 hours. Do not switch to a free tier for cost alone without checking email-data handling terms.

## Suggested defaults still requiring confirmation

| Topic | Proposed CP3 behavior |
|---|---|
| Duplicate processing | Unique processing record per user/message/extraction version; retries upsert rather than append; task writes and calendar operations have stable operation IDs |
| Multiple tasks and updates | Stable application task IDs with source-evidence associations; same thread does not mean same task; unresolved matches go to review |
| Preserve corrections | Keep accepted/user-edited fields separate from incoming proposals; never overwrite them during rescans |
| Waiting-for reminders | Dashboard-only reminders at a user-confirmed follow-up date; show recipient and rationale; user confirms resolution; no outgoing email |
| Dismissal | Restore from a Dismissed view during a selected retention window; suppress identical suggestions from the same evidence without hiding genuinely new requests |
| Refresh cooldown | Start with 60 seconds and show an existing running scan instead of launching an overlapping one |
| Transient failures | At most three total attempts with backoff and provider retry guidance; no automatic retry loop for revoked authorization or invalid configuration |
| Unreviewed results and digests | Consider a 30-day lifetime with expiry visible in the UI; confirm whether unreviewed items should instead require explicit dismissal |
| Scan/duplicate history | Retain minimal metadata long enough to prevent rescans from recreating removed items; specify the duration and privacy tradeoff before launch |
| Date interpretation | Use message timestamp and user-confirmed time zone as context; surface ambiguous interpretations for review; do not invent a time for date-only deadlines |

## CP3 implementation checklist: working application and live demo

### CP3.1 Scope, configuration, and repository setup

- [ ] Confirm proposed defaults above, context caps, remaining retention periods, and resource budgets.
- [ ] Confirm the instructor's actual due date/forum deadline; repository dates and the general assignment schedule should not be assumed interchangeable.
- [ ] Establish root `app/`, `docs/`, and `tests/` deliverables as required by the assignment; keep this planning file under Checkpoint 3.
- [ ] Scaffold the React app, Supabase configuration, migrations, backend functions, scripts, and environment templates without secrets.
- [ ] Configure the Gemini model and version-controlled prompts/settings/schema; select and record validated settings.

### CP3.2 Dashboard and persistence

- [ ] Implement the Figma flows using the IBM Carbon component/accessibility conventions required by the CP2 design specification.
- [ ] Implement Tasks, informational digest, Needs Review, Waiting For, Completed, scan activity, and settings.
- [ ] Add category filters, deadline labels, keyboard access, visible focus, source links, and evidence excerpts.
- [ ] Persist task approval/edit/dismiss/complete/restore decisions across reloads.
- [ ] Distinguish loading, empty, partial failure, uncertainty, missing context, and expired-excerpt states.

### CP3.3 Accounts, privacy, and Google connections

- [ ] Implement app authentication and verify sessions in backend endpoints; derive ownership from verified identity.
- [ ] Enable and test Row Level Security on user-facing tables; isolate credential storage from browser access and keep privileged keys server-side.
- [ ] Implement Google OAuth with account-bound, single-use state validation, approved callback URLs, refresh handling, and least necessary Gmail/calendar scopes.
- [ ] Protect refresh tokens with encryption and separately managed keys; prevent tokens in logs, URLs, and client responses.
- [ ] Explain data flow, model-provider processing, filtering limits, and retention before automation consent.
- [ ] Implement OR allowlists, overriding exclusions, no-allowlist notification, readable scope descriptions, and privacy settings.
- [ ] Add pause/resume, reconnect, disconnect/revocation, deletion controls, and stale-job protection.
- [ ] Document Google verification/testing status; use dedicated test accounts and fictional content for the demo.

### CP3.4 Scanning and real inference

- [ ] Implement bounded initial retrieval: past seven days, at most 100 permitted emails, plus visible backlog and Scan more.
- [ ] Implement backend scheduling at the selected 15-minute default and manual refresh with cooldown.
- [ ] Use incremental scan state, bounded batches, concurrency protection, and a separate failed-item retry queue; do not mark failures successful.
- [ ] Enforce current filters before retrieving bodies, on every context message, and again before external inference.
- [ ] Add customizable thread limits with backend-enforced maximums; remove quoted history where practical and flag missing context.
- [ ] Call real Gemini inference for permitted messages and distinguish noise, tasks, events, and external commitments.
- [ ] Extract and validate ownership, dates, requirements, dependencies, and supporting evidence; preserve nullable/ambiguous fields.
- [ ] Display progressive validated results with processed/excluded/failed/pending counts and clear scan scope.
- [ ] Implement retry-safe extraction, multi-action handling, duplicate suppression, and reviewable update matching without overwriting edits.
- [ ] Implement the token-cost requirements: zero inference on empty/unchanged scans, combined structured extraction, bounded relevant context, safe result reuse, and code-only task/calendar actions.

### CP3.5 Approval, calendars, and lifecycle

- [ ] Keep task approval separate from calendar authorization; enforce approval server-side.
- [ ] Preview Google Calendar destination, title, all-day/timed choice, time zone, and duration; prepopulate explicit times and avoid private excerpts/attendees by default.
- [ ] Create real Google Calendar entries, record event IDs, handle ambiguous retry outcomes, and prevent duplicate creation.
- [ ] Implement approved event updates and explicit undo of app-created entries, with visible failure recovery.
- [ ] Generate valid ICS exports and label them as manual import, without claiming synchronized updates or remote undo.
- [ ] Add dashboard waiting-for reminders, recipients/rationale, and user-confirmed resolution.
- [ ] Propose deadline/commitment changes for approval; retain prior approved values until accepted.
- [ ] Implement completion undo and reset the 30-day countdown on recompletion.
- [ ] Implement scheduled retention cleanup, manual deletion, and excerpt expiry; prevent deleted tasks being unintentionally recreated by retries.

### CP3.6 Tests, observability, documentation, and demo

- [ ] Build a labeled realistic fictional-email set: direct assignments, external commitments, multi-action threads, information-only messages, missing/relative dates, exclusions, quoted text, and deadline updates.
- [ ] Test user isolation, OR/exclusion precedence, empty allowlists, excluded context, and changed settings during queued work.
- [ ] Test pause/disconnect/deletion, duplicate processing, preserved edits, retries, approval enforcement, calendar undo, and completion/retention boundaries using a controlled clock.
- [ ] Exercise revoked consent, Gmail/model rate limits, timeouts, invalid/truncated output, and partial scan recovery.
- [ ] Record request/scan IDs, latency, token use, estimated cost, prompt/model versions, and sanitized errors; omit sensitive payloads.
- [ ] Set per-user message/token limits, concurrent work limits, and spending controls; do not silently skip work when limits are reached.
- [ ] Test model-call counts for empty scans, repeated refresh, unchanged content, completion/undo, and calendar export; test that trimming/grouping preserves all actions and cannot bypass updated privacy rules.
- [ ] Establish a token/cost baseline on the labeled set, including retry and thinking usage; verify budget reservations under concurrent scans and compare accuracy before accepting optimizations.
- [ ] Perform a small human-alone / AI-alone / combined-workflow baseline check as specified in CP2; preserve cases, settings, and results for CP4.
- [ ] Complete `app/INSTALL.md`, `app/.env.example`, `app/prompts/`, runnable scripts, and `tests/`.
- [ ] Complete `docs/architecture.md` (diagram), `docs/use-cases.md`, `docs/observability.md`, and `docs/safety_privacy.md`.
- [ ] Verify fresh local setup and hosted operation, including an automatic scan with the dashboard closed.
- [ ] Rehearse a 5-8 minute presentation with at least half devoted to live use: allowed/blocked email, extraction, uncertainty correction, calendar approval/undo, and recovery. Use manual refresh to demonstrate the same pipeline without waiting 15 minutes; explain the schedule honestly.
- [ ] Submit required forum materials and document actual limitations rather than simulating unfinished core features.

CP3 exit condition: another teammate can reproduce setup, connect a real test account, demonstrate automatic and manual permitted-email processing with actual inference, persist review decisions, perform approved calendar operations, and recover from a realistic failure. Core CP2 commitments above remain CP3 work; unresolved core features are gaps to disclose, not automatically CP4 scope.

## CP4 checklist: evaluation, refinement, and final delivery

The CP4 instructions have not been supplied. This is a provisional plan based on CP3's Track A/Track B preview and CP2's baseline requirement; align it with the official CP4 rubric when available.

- [ ] Obtain CP4 requirements; select Track A user study or Track B algorithmic benchmark and set success thresholds before final testing.
- [ ] Expand the CP3 labeled cases with varied senders/domains, ambiguous dates, multiple responsibilities, changed deadlines, mixed-topic content, and adversarial instructions.
- [ ] Reserve a held-out set; freeze prompts/settings before final evaluation and avoid tuning on held-out cases.
- [ ] Compare human-alone, AI-alone, and combined workflows; specify identical inputs, timing rules, and how each workflow's outputs are scored.
- [ ] Measure task detection precision/recall, ownership/deadline correctness, missed actions, duplicate rate, update matching, and uncertainty handling.
- [ ] Evaluate filtering separately: rule enforcement, excluded context/quoted-content limitations, and unwanted external disclosures. Do not claim semantic privacy protection from metadata rules.
- [ ] Measure end-to-end latency, time to first useful result, cost per email/scan, retry recovery, and scan completeness.
- [ ] Evaluate context selection, same-thread grouping, and optional Batch API/provider caching using the cost section above; report measured savings and accuracy/privacy tradeoffs against the CP3 baseline.
- [ ] For Track A, measure completion time, correction effort, source verification, understanding of privacy scope, and user control with consent and appropriate study data handling.
- [ ] For Track B, report dataset composition, labels, scoring, baselines, per-scenario failures, and uncertainty/variation appropriate to the sample size.
- [ ] Tune prompts, settings, context limits, and reminder/duplicate logic against observed errors, then rerun relevant tests and held-out evaluation.
- [ ] Refine accessibility, onboarding comprehension, calendar behavior, and retention controls based on evidence.
- [ ] Test larger inboxes, overlapping jobs, prolonged failures, expiry/disconnection, cleanup races, and backup/deletion disclosures.
- [ ] Reassess public-launch Gmail verification and model-provider terms before extending beyond test users.
- [ ] Produce the final report, evaluation evidence, updated architecture/setup/safety documents, and reproducible final artifact.

Optional only if evidence and time support them: push-based arrival detection, richer rule previews, additional calendar integrations, or a separate classifier. None replaces completing the core application, and Jev is not selected.

## Project references

- [Project README](../README.md)
- [CP1 proposal](../Checkpoint%201/proposal/PROPOSAL.md)
- [CP2 design specification](../Checkpoint%202/DESIGN_SPEC.md)
- [CP2 prototype](../Checkpoint%202/prototype/README.md)
