# InboxToTask: CP3 plan and CP4 implementation checklist

Updated: November 5, 2026. Checked items have implementation evidence within the scope stated beside them; they do not imply hosted deployment. Unchecked items may be partially implemented and retain their remaining integration or verification requirements. Decisions explicitly accepted by the team are separated from suggested defaults requiring confirmation.

## Current progress and next work

Local phrase-filter implementation, November 5: PR #19's suggested categories now
expand into visible editable terms. Custom words/phrases match the subject or
parsed sender address/domain, using OR inclusions and overriding exclusions.
Exact sender/domain controls remain. The separate subject input is removed; old
subject-only exclusions retain their scope. Onboarding saves to revision-checked
scan settings; obsolete source permissions require renewed consent. The new
[migration](app/supabase/migrations/20261105160000_phrase_filters.sql) is applied
locally. This supersedes pending matching proposals below for this local build.
Gmail retrieval, inference permission gates, and hosted rollout remain unfinished.


November 5 continuation: saved scanning consent/rules/context/revisions and a
shared product/development settings form are implemented and migrated locally.
New users default to no consent, paused, empty inclusions, and zero earlier
context. Settings saves fence existing storage jobs without altering accepted
tasks. This is partial milestone 3: canonical category/phrase matching is now
implemented locally; Gmail retrieval/inference permission gates are not wired.
Old onboarding selections remain reviewable drafts until explicitly saved to scan settings.
See [the settings verification report](docs/scan-settings-verification-2026-11-05.md)
for 107 offline tests, 67 local database checks, frontend type/build and actual
local Auth/PostgREST/browser evidence. Vite was restarted; the shared browser was
signed out, so live Google lifecycle verification remains pending. No scanning,
model calls, cleanup scheduling, or hosted changes were enabled.

Upstream synchronization: the main frontend now includes Google sign-in and
basic onboarding preference persistence through the shared client in
[supabase.ts](app/web/src/supabase.ts). Preserve the existing root-origin callback
and preference implementation when integrating this branch. A dedicated product
callback can be added if needed; `/storage` callbacks remain development-only.
Basic preference persistence does not implement the validated custom-filter or
explicit scanning-consent contract below. The user reports successful initial
local Google sign-in/Gmail connection; the remaining live lifecycle checks are pending.

The local extraction/storage foundation and Google sign-in/backend connection implementation are committed and locally verified within the limits below. Google Auth implementation is recorded in commit `bf5a5fb`; that historical local verification does not establish deployment. Separate sign-in and Gmail Cloud projects are created, private local credentials/encryption are provisioned, and local Google services are enabled. The user reports a successful initial connection; reload, refresh, denial, revocation, and disconnect/reconnect still need live verification. Local Google setup and handoff are committed; the saved-scanning-settings foundation is recorded separately. CP3 is not complete: the unified product frontend, permitted Gmail retrieval/scanning, and connected Calendar operations remain unfinished. See [Google Auth verification](docs/google-auth-verification-2026-11-05.md), [Google setup](app/supabase/GOOGLE_AUTH.md), [local storage verification](docs/local-storage-verification-2026-11-04.md), and [the storage contract](app/supabase/STORAGE.md).

| Workstream | Current state | Remaining CP3 work |
|---|---|---|
| Repository/setup | React, pipeline/prompts, migrations/functions, templates, and tests exist; hosted-only onboarding migration recovered locally; pending SQL rehearsed against inspected hosted schema with fictional rows | Confirm deliverable locations; rehearse fresh setup; recheck hosted state and coordinate legacy task-write contract before rollout |
| Extraction | Original Gemini evaluation: 19/20 fictional cases passed; uncertainty/wording candidate passes 8/8 targeted and 20/20 full live checks under corrected E09 scoring | Address remaining detail/review-burden findings, freeze validated settings, and verify live Edge-to-storage-to-UI path; see [review verification](docs/extraction-review-verification-2026-11-04.md) |
| Storage/review | Persistent proposals and accepted values, RLS, revision checks, budgets/leases/cache, review, completion/undo, deletion fencing, cleanup code | Integrate real permissions/scans; finalize retention and enable/test scheduled cleanup |
| Frontend | Main frontend has Google sign-in/basic preference persistence, with remaining product behavior simulated; `/storage` provides localhost development persistence/review and Google controls, excluded from production builds | Preserve shared session/root-origin callback; integrate real Gmail consent/status and saved review records into the product dashboard; verify accessibility/Carbon conventions |
| OAuth/privacy | Backend connection lifecycle implemented; private local credentials/encryption configured and services enabled; initial local connection reported successful by user | Finish live lifecycle checks; integrate product onboarding; add optional Calendar authorization, explicit scanning consent, persisted rules, and pre-retrieval enforcement; hosted configuration remains separate |
| Scans | Fixture-only endpoint and bounded extraction coordination | Gmail retrieval, incremental state, initial backlog, manual cooldown, scheduler, retry dispatch, progressive counts |
| Calendar | Separate approval storage and local ICS preview/serializer exist; no connected Calendar authorization or execution | Optional onboarding connection with Skip for now; least necessary scopes, destination selection, approved creation/update/reconciliation/undo; verify ICS saving/import |
| Delivery | Local verification evidence and synthetic live extraction baseline exist | Finish docs/evaluation, hosted integration, closed-dashboard scan, demo rehearsal, and submission |

The Google backend is configured for local connection testing; product integration and full lifecycle verification remain. Do not treat connecting Google as permission to scan or connecting Calendar as approval to create events.

### Next implementation milestones

Google configuration handoff, November 5:

- [x] User reports creating `inboxtotask-sign-in` and `inboxtotask-gmail` Cloud projects. Keep the existing Gemini project; a Cloud organization is not required for the class scope.
- [x] Create a [step-by-step local setup guide](app/supabase/GOOGLE_AUTH.md#step-by-step-local-google-setup), an [Auth environment template](app/supabase/.env.example), and private ignored local configuration files. Preserve entered credentials; never print or commit them.
- [ ] Independently verify both Web OAuth clients, consent configuration, test-user lists, and Gmail API enablement. User reports completing Google Console setup and subsequently connecting successfully in the local UI; provider Console settings have not been independently inspected.
- [x] Confirm both private credential sets are populated without displaying them; generate the missing backend encryption key and verify an encrypt/decrypt round trip; configure frontend public local values. Local Supabase restarted without resetting data; migrations are current, Google Auth settings report enabled, and the sign-in endpoint redirects to Google with the correct local callback. Credential validity is not established until live exchange. Fixture extraction and cleanup remain disabled.
- [ ] Complete remaining live local OAuth checks with a dedicated same-email test account: reload, actual token refresh, denied/partial consent, wrong mailbox, expired/replayed state, provider-side revocation, disconnect/reconnect, and server-side sign-out behavior. Inspect browser/network/log handling without exposing credentials. Verify zero retrieval/model calls on connection. Existing offline simulations are not substitutes for these live checks.
- [x] User reports successful local Google sign-in/Gmail connection after private configuration. This is user-observed initial connection evidence, not completion of the full OAuth checklist. The agent-shared browser remains signed out, so persistence across reload, refresh, revocation, and reconnect have not been independently verified.

Local runtime handoff: Vite at `http://127.0.0.1:5173/storage` and all Edge
functions were started with private Google configuration. The Google endpoint
rejects anonymous requests with `AUTH_REQUIRED`; cleanup returns
`CLEANUP_DISABLED`. Initial setup checks displayed Sign in with Google and made
no Google token exchange, Gmail retrieval, Calendar write, or model call. The user
subsequently reports a successful connection in their browser. Finish OAuth
lifecycle verification, then implement persisted consent/rules before retrieval;
scanning is not connected yet. Runtime processes may stop;
recheck them on resumption. The checked-in local Auth configuration now enables
Google and requires private credentials; fresh checkouts must follow the setup
guide before starting Auth with that provider enabled.

Register local sign-in redirect `http://127.0.0.1:54321/auth/v1/callback`
and local Gmail redirect `http://127.0.0.1:54321/functions/v1/google_callback`
on their respective clients. Hosted callbacks can be registered in advance using
the confirmed target Supabase project's URL; registration does not deploy or
configure that environment. Preserve the existing product root-origin callback
when integrating upstream; `/storage` returns remain local-development-only.

Calendar can later share the Gmail Cloud project; an additional project is not a
prerequisite. Sharing means Gmail and Calendar Google grants share project-wide
revocation. Independent Calendar revocation would require a separate project.
This is an available design option, not a confirmed Calendar topology or a
completed integration. Destination, scopes, optional consent, and approved
execution remain milestone 5 work.

| Order | Work | Completion check |
|---|---|---|
| 1 | Complete designed onboarding/dashboard integration around existing Google sign-in and the shared Supabase session; preserve the root-origin callback unless a change is needed. Move persistent review controls into the product UI; keep `/storage` for development. | Normal users never create an InboxToTask password or visit `/storage`; real Gmail status, actual saved records, loading/errors, reload, and account switching work. |
| 2 | Local credentials/services are configured and initial connection is user-reported successful. Finish the remaining live OAuth checklist in [the setup guide](app/supabase/GOOGLE_AUTH.md); record evidence and fix failures. | A dedicated account signs in with Google, connects Gmail, reloads, refreshes authorization, and disconnects/reconnects. Wrong account, denied consent, replayed state, and revoked access are handled; zero scans/model calls occur on connection. |
| 3 | Persist scanning consent, source rules, context limits, and settings revisions; enforce pause/deletion/settings changes. Preserve the [custom sender/domain/subject filter plan](#custom-sender-domain-and-subject-filters-implementation-plan), including its proposed category/phrase matching decision and accessible info icon. | Empty allowlists or absent consent block retrieval; saved settings isolate users; queued work cannot bypass changed permissions; custom matching/validation/UI acceptance checks pass after the open decision is confirmed. |
| 4 | Implement one bounded manual Gmail-to-extraction-to-review flow, then incremental scheduled scans, cooldown, retries, and visible progress. | Permitted fictional test mail produces saved reviewable results; exclusions apply before body/context retrieval; unchanged/empty scans use zero inference; automatic scans work with the dashboard closed. |
| 5 | Implement optional Calendar connection in onboarding, with Skip for now and later connection from Add to Calendar/settings. Choose destination/scopes, then build approved create/update/undo execution. | Skipping/denying Calendar leaves Gmail/task features usable. Connected status reflects real authorization; no event is written until its preview is approved; retries and undo avoid duplicate/unintended writes. |
| 6 | Prepare hosted Supabase and Vercel integration, verify configuration and compatibility, then perform a separately authorized rollout and live demo trial. | Vercel build/routing/redirect settings and hosted migration/function/secret plan are reviewable; after rollout, the complete test-account workflow works on the hosted origin. |

Milestones 1 and 2 can proceed together. The optional Calendar onboarding UI can be designed with milestone 1, but its live connection action must ship with working authorization in milestone 5. Do not show simulated success while that backend is missing.

Immediate resumption order: inspect Git/runtime state and preserve private keys;
finish available OAuth checks without repeating project creation or exposing
credentials. In parallel with independent implementation preparation, obtain the
category/phrase matching decision before changing matching behavior. Next build
milestone 3 (validated saved consent/rules, revisions, and accessible product
controls), then one bounded manual scan from milestone 4 with saved review in the
product dashboard. Add incremental scheduling after the manual path works;
Calendar and hosted rollout follow. A missing shared authenticated browser only
limits live browser verification; it need not block independent offline work.

Delivery constraint: keep work local and do not push until setup is ready for Vercel testing and the user explicitly authorizes the push. Hosted Supabase migrations/functions and Vercel deployment also require a separate rollout instruction; this plan update does not authorize them.

Handoff status: `bf5a5fb` contains the Google backend milestone. The follow-up
handoff commit includes the updated plan, localhost-only storage guard, and docs. Use the
[refreshed frontend handoff](docs/frontend-integration-handoff-2026-11-04.md) for
resumption; preserve the custom-filter additions from the separate chat. This is
a development handoff, not evidence of Vercel/live OAuth readiness.

## Product and architecture

InboxToTask is a hosted AI application that automatically scans permitted Gmail messages and prepares evidence-linked tasks, deadlines, external commitments, and informational summaries. Users control email access rules and approve consequential changes. The Figma prototype must become a real, persistent application for CP3.

| Component | Planned role |
|---|---|
| React dashboard on Vercel | Onboarding, tasks, informational digest, source evidence, scan activity, preferences, and account controls |
| Supabase Auth | Google-only user sign-in and app sessions; Gmail and Calendar permissions are separate service capabilities |
| Supabase Postgres | User preferences, protected account connections, suggestions, tasks, scan state, and calendar operation records |
| Supabase Edge Functions | Verify users, enforce privacy rules, retrieve permitted content, invoke Gemini, validate results, and perform approved calendar operations |
| Scheduled backend work | Incremental scans while the dashboard is closed, bounded retries, and retention cleanup |
| Gmail API and Google OAuth | Authorized email access and server-side refresh-token lifecycle |
| Gemini 3.8 Flash | Classification and structured extraction from permitted content; no Jev integration |
| Google Calendar API | User-approved creation and updates, tracked operation status, and undo of app-created entries |
| ICS download | Export for manual import into other calendar providers; no equivalent connected synchronization or remote undo |

Flow: scheduled/manual trigger -> verify account and preferences -> filter message metadata -> fetch permitted bodies/context -> recheck permissions -> Gemini extraction -> validate -> save suggestions -> progressive dashboard results -> user review -> approved task -> separate calendar approval.

## Confirmed decisions

### Accounts and onboarding

- Users sign in with Google; no separate InboxToTask email/password signup or login is required in the normal product flow. Email/password accounts on `/storage` are local development/test tooling. Both `/storage` and its callback require local Vite development; production builds omit the dashboard and reject these routes even when its environment flag is enabled. Product onboarding needs its own callback/return routes before hosted sign-in.
- Target journey: Continue with Google -> connect Gmail and explain access -> configure permitted sources and scanning consent -> optional Connect Google Calendar / Skip for now -> authenticated product dashboard. Consent text and source rules must be saved before any scan starts.
- Reuse the Google-created Supabase session automatically throughout onboarding, review, and backend requests. Do not require an existing password account before Google sign-in or create independent Auth clients per screen.
- Request Calendar access only when the user chooses its optional onboarding step or later uses Add to Calendar. Users can skip or deny it and still use tasks/Gmail. Show actual granted capabilities rather than a single assumed all-services connection state.
- Google sign-in, Gmail authorization, scanning consent, Calendar authorization, and individual event approval are distinct decisions. They may appear in one coherent onboarding journey without granting each other implicitly.
- The implemented Gmail connection currently requires the same verified email as the app account and checks Google subject on reconnect. Supporting a different mailbox would need an explicit account-linking design; it is not part of the current implementation.
- Calendar destination and scope selection remain open: choose between an app-created calendar and supported existing calendars before implementing its authorization/execution contract. Do not assume broad calendar access is required or already granted.

### Scanning and filtering

- Automatic scans operate on a 15-minute default interval, with manual refresh available. This adopts the proposed default accepted in discussion; scheduling is not an exact arrival-time guarantee.
- Manual refresh processes newly available permitted messages and uses a cooldown, shared scan coordination, and deduplication.
- Planned permission uses included words/phrases, sender addresses, and domains. Suggested categories expand into visible editable terms; they are app preferences rather than mailbox tags. OR matching is proposed below and must be confirmed before runtime changes.
- Any matching exclusion overrides permission. Planned exclusions include words/phrases, sender addresses, and domains.
- No allowlist means scanning is disabled. Notify the user and provide a direct action to configure permitted sources; connecting Gmail alone does not enable scanning.
- Display the effective scope in plain language, for example: "Process messages containing assignment in the subject or sender address/domain OR from professor@illinois.edu, except excluded phrases and blocked senders/domains."
- Initial scanning covers the past seven days, up to 100 permitted messages, using the same inclusion/exclusion rules as subsequent scans.
- Show any remaining initial backlog and require "Scan more" approval. Process new arrivals separately so backlog limits do not block them.
- Changes to rules affect queued and future processing. Offer separate deletion of previous results; already transmitted content cannot be retracted.
- Pause, disconnect, and preference changes must be checked before new external requests. Already in-flight requests cannot be unsent; stale results should not be persisted after account/data deletion.

#### Custom sender, domain, and subject filters: implementation plan

Requested direction after merged PR #19 (`c74f4da`, Restore email category preference controls): retain its suggested-category chips, custom category entry, separate sender/domain controls, and shared-session preference persistence. The current category selections are saved preferences only; they do not yet filter messages. Replace the earlier mailbox-tag filtering direction with app-defined words/phrases and sender/domain rules. No runtime change or hosted rollout is established by this plan.

**Proposed matching behavior, pending confirmation:** each included word/phrase matches the subject line OR parsed sender email address/domain using case-insensitive literal substring matching. A complete address entered in the sender control matches exactly; a domain entered in the domain control matches exactly, without implicitly including subdomains. Sender display names and bodies are not searched. Any inclusion match permits processing unless any exclusion matches; an entirely empty inclusion group processes nothing. A phrase alone could therefore permit mail from any sender. Confirm this scope before implementation rather than silently treating phrases as AND constraints.

| Control | Planned behavior |
|---|---|
| Suggested category | Expand into a documented, visible, editable list of words/phrases; do not require the category title itself to appear in the message |
| Custom word or phrase | Literal case-insensitive substring in subject or parsed sender address/domain; no regex, stemming, semantic classification, or body search |
| Sender address | Exact case-insensitive parsed email address match |
| Sender domain | Exact case-insensitive domain match; no implicit subdomains |

Preserve PR #19's inclusion suggestions (School, Job applications, Research, Meetings) and exclusion suggestions (Financial, Health, Promotions, Family & friends). Define and review their term lists before enabling them. For example, School could suggest `homework`, `assignment`, and `syllabus`; these are proposed terms, not implemented mappings. Show the resulting terms before save and allow removal/addition. Do not imply that Financial or Health detects all content on those topics. Store the selected terms explicitly so later preset changes cannot silently broaden previously saved permission.

Frontend copy and controls:

- On "Which email categories should we check?", preserve suggested categories and custom entry. Describe them as shortcuts for editable words/phrases; keep explicit sender/domain inputs.
- On "What would you like to keep private?", remove the separate "Subject keyword" input. Keep the "Add an excluded email category" control and change its description to: "Add a word or phrase that you would like to exclude." Use a word/phrase placeholder rather than asking for an abstract category.
- Merge existing subject exclusions into the unified exclusion-term editor during migration, preserving at least their existing blocking behavior. Disclose that expanding an old subject-only exclusion to sender fields may block additional messages; keep previous scope until the user reviews and saves the new rule.
- Update review, settings, preview, empty states, validation, and effective-scope summaries consistently. Do not claim categories are effective scan filters until the backend uses the same saved rules.
- Keep an accessible info icon beside the filter heading, usable on hover, focus, and tap, with dismissal and visible focus. Proposed copy: "Words and phrases match subject lines and sender email addresses/domains. Sender and domain rules match exactly. Email bodies are not searched for filtering. Any matching exclusion blocks processing." Explain separately that permitted bodies may be sent for task extraction.

Implementation order and completion requirements:

1. [ ] Confirm phrase matching fields, literal substring behavior, OR inclusion semantics, suggested term mappings, and explanatory copy. Keep these proposals distinct from the user's confirmed direction to use app categories/phrases and remove the duplicate subject input.
2. [ ] Update [pipeline rules](app/pipeline/core.mjs) to use explicit inclusion/exclusion terms plus sender/domain rules. Remove mailbox-tag matching from the active contract, including empty-allowlist checks and context filtering. Validate and canonicalize rules server-side: trim, deduplicate case-insensitively, reject malformed values, and retain the existing 200-entry/254-character limits unless documented otherwise. Update [pipeline documentation](app/pipeline/README.md), fixtures, and callers; rebuild the ignored Edge bundle from canonical sources.
3. [ ] Evolve the locally implemented [settings schema](app/supabase/migrations/20261105070000_scan_settings.sql) through a new ordered migration rather than editing applied history. Preserve owner isolation, verified-session RPCs, revisions, consent, pause, and generation fencing. Map PR #19's `includedTypes`/`excludedTypes` to explicit terms only after review; keep category titles separate from expanded terms. Require replacement/reconfirmation of obsolete source selections rather than reinterpreting them as words or silently broadening scope. Block processing while conversion is incomplete; preserve accepted tasks and unrelated account data. Saving filters alone never grants scanning consent.
4. [ ] Adapt PR #19's [onboarding controls](app/web/src/App.tsx) and [preference persistence](app/web/src/supabase.ts) to the validated contract through the shared-session [storage adapter](app/web/src/storageAdapter.ts). Update the shared [scan settings form](app/web/src/ScanSettingsPanel.tsx), preview summaries, and settings together. Keep loading, validation, saving, confirmed save, failure, stale revision, reload, and account-switch states explicit. Remove obsolete source controls and summaries from active flows.
5. [ ] Integrate trusted saved rules into backend processing. Check consent, pause, connection, and current rules before body retrieval, independently for each context message, and again before inference/commit. Fence queued/in-flight work and cache reuse with current settings revisions/generations. Keep the default-disabled E01-E20 fixture endpoint intact; real Gmail scanning remains separate work. Filtering uses deterministic code before the LLM; the LLM extracts tasks only from permitted content.
6. [ ] Verify preset expansion/editing, custom phrases, mixed case, literal substring boundaries, subject/sender phrase matches, exact address/domain rules, subdomains, OR combinations, exclusion precedence, empty inclusions, independently excluded context, malformed rules, and migration/reconfirmation. Verify save/reload, two-user isolation, anonymous denial, stale saves, permission changes during work, accepted-task preservation, and accessible browser interactions. Check that no obsolete source controls remain in active UI.

Validation for implementation: follow [backend instructions](app/supabase/AGENTS.md) for migrations, RPCs, Edge checks, and local integration; run `npm.cmd test` from `Checkpoint 3/app`. Follow [web instructions](app/web/AGENTS.md) for pinned pnpm type checking/build and browser checks. No live model calls are needed for deterministic filtering. Offline and simulated checks do not establish real Gmail retrieval or hosted enforcement. Documentation-only changes require link/path/command verification and `git diff --check`.

### Thread context and privacy

- Every earlier message must independently pass current rules before its body is retrieved for context.
- Provide customizable message-count, age, and text-size limits, within enforced server limits.
- Proposed starting context defaults: allow up to five earlier permitted messages from the past 30 days, but include only context needed to interpret the current message. Five is a ceiling, not an amount to attach to every request. The text/token cap remains to be selected; these numerical context defaults need confirmation.
- Remove quoted history and signatures where practical; retrieve original earlier messages individually through filtering. Recognize that quoted-text removal is imperfect and inline copied private content may remain.
- If necessary context is excluded, unavailable, or truncated, flag the suggestion as Needs Review and explain the limitation.
- Sender/domain/phrase rules do not guarantee exclusion of all healthcare or financial topics. Semantic sensitive-topic classification is outside the current scope.
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

### Class-project API abuse controls: proposed implementation

The [safety/privacy plan](docs/safety_privacy.md#proposed-class-project-implementation)
defines a small CP3 scope. These are design proposals, not implemented controls
or additional instructor-issued requirements. Numerical global limits still need
selection. Reuse existing storage claims instead of adding a separate service.

1. [ ] Add private approved-tester access, an operator-controlled inference kill
   switch, and global daily request/token accounting. Reserve user and global
   allowance atomically before each attempt; fail closed if accounting is
   unavailable. Browser roles cannot edit controls. Token limits are not a
   guaranteed dollar cap; select allowances from measured usage and team budget.
2. [ ] Route manual/scheduled/backlog/retry extraction through the same bounded
   coordinator. Recheck permission and the switch before dispatch, preserve
   unknown-cost reservations, and reuse valid unchanged results. The switch
   cannot retract in-flight requests; scan suspension must also gate retrieval.
3. [ ] Add transactional per-user scan leases and backend manual cooldown
   (60 seconds proposed, unconfirmed), generation checks, and resumable deferred
   items. Return the running scan instead of starting overlapping work.
4. [ ] Expose owner-only progress, allowance/reset, cooldown, and safe deferral
   reasons. Document private tester approval, limit changes, and stopping new
   dispatches. The 100-message initial ceiling never overrides daily budgets;
   display excess work as deferred without resetting allowance on reconnect.
5. [ ] Test concurrent reservations, denied-claim rollback, UTC reset, fifty
   simultaneous refreshes, scheduled/manual overlap, expired leases, permission
   changes, and zero inference when disabled/exhausted/accounting-unavailable.
   Use fake providers, then a small fictional Gmail live trial.

Defer Redis infrastructure, device tracking, automated fraud detection, and a
custom admin dashboard. Preserve authentication, ownership, privacy gates,
bounded retries, and input/output limits. Configure provider quotas/spending
controls where available; billing alerts alone do not stop spending.

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
- [x] Scaffold the React app, Supabase configuration, migrations, backend functions, scripts, and environment templates without secrets. Local implementation exists; hosted rollout is separate.
- [ ] Configure the Gemini model and version-controlled prompts/settings/schema; select and record validated settings. The development candidate is explicitly selected Gemini 3.6 Flash, while the canonical default remains 3.8 Flash. The versioned uncertainty/wording candidate passes 8/8 targeted and 20/20 full live checks under corrected E09 scoring; manual detail/review-burden findings and final configuration selection remain. See [original evaluation](docs/cp2-live-evaluation-2026-11-03.md) and [review verification](docs/extraction-review-verification-2026-11-04.md).

### CP3.2 Dashboard and persistence

- [ ] Implement the Figma flows using the IBM Carbon component/accessibility conventions required by the CP2 design specification.
- [ ] Implement Tasks, informational digest, Needs Review, Waiting For, Completed, scan activity, and settings.
- [ ] Add category filters, deadline labels, keyboard access, visible focus, source links, and evidence excerpts.
- [x] Persist task approval/edit/dismiss/complete/restore decisions across reloads. Implemented in storage/RPCs and the opt-in dashboard; local API/browser evidence is linked above. Integration into the main frontend remains below.
- [ ] Distinguish loading, empty, partial failure, uncertainty, missing context, and expired-excerpt states.

The current frontend does not yet accommodate the complete CP3 product. Preserve the prototype and storage route while building the integrated interface; route replacement should be an explicit implementation decision. `/storage` is a development interface, not the intended user destination. The product must use Google-only onboarding and the designed dashboard. Prototype controls must remain visibly simulated until their backend integration works.

#### Unified frontend work remaining

- [ ] Map navigation and screen/state coverage for Tasks, Needs Review, Waiting For, Completed, digest, scan activity, Calendar operations, and settings; define how users move between evidence, corrections, approval, and recovery.
- [ ] Integrate the existing persistent review, edit, dismiss/restore, complete/undo, waiting-for resolution/reminders, and ICS controls into the product design using the shared Auth client/session.
- [ ] Implement Google-only sign-in in the designed onboarding; automatically reuse the Supabase session and handle callback/reload/cancel/reconnect without asking users for a separate password account.
- [ ] Implement Gmail connection and consent onboarding: actual Google status, data-flow/retention disclosures, explicit scanning consent, allowlists/exclusions, context limits, and readable effective scope.
- [ ] Implement the [custom filter frontend](#custom-sender-domain-and-subject-filters-implementation-plan): suggested categories, editable words/phrases, sender/domain controls, accessible hover/focus/tap info icon, saved-settings states, and accurate effective-scope copy.
- [ ] Add optional Calendar onboarding with Connect / Skip for now, later connection from Add to Calendar/settings, and independent permission/error states. Wire connected status only after Calendar authorization exists.
- [ ] Add real scan controls/status: manual refresh and cooldown, running scan, processed/excluded/failed/pending counts, backlog/Scan more, retry/deferred work, and budget/reset feedback.
- [ ] Complete task filters/sorting, deadline/condition labels, source links and evidence inspection, uncertainty/missing-context/expired-excerpt states, and separate proposed updates from accepted edits.
- [ ] Add separate Calendar destination/title/schedule approval, operation status, failure recovery, and explicit undo; retain the manual-import limitations on ICS exports.
- [ ] Add account/privacy settings for pause/resume, reconnect, disconnect/revocation, deletion, and retention controls; reflect actual backend availability.
- [ ] Verify keyboard navigation, visible focus, accessible labels/status announcements, responsive layouts, and the CP2 Carbon conventions across the integrated workflows; run authenticated browser checks after wiring persistence.

### CP3.3 Accounts, privacy, and Google connections

November 5 implementation: [Google Auth setup](app/supabase/GOOGLE_AUTH.md)
documents the sign-in/connection scaffold, private credentials, single-use state,
refresh/disconnect lifecycle, and hosted schema inspection. Google is now enabled
in the current local Auth/private Functions configuration; templates retain
disabled frontend/backend flags until configured. Initial connection is reported
successful by the user; the remaining live checklist and hosted setup remain.

- [x] Implement app authentication and verify sessions in backend endpoints; derive ownership from verified identity. Google sign-in reuses the shared session/client and exists in the main frontend. Local provider configuration is enabled; the user reports successful sign-in. Full product integration and live lifecycle verification remain.
- [x] Implement and locally test storage RLS/grants, two-user isolation, private Google credential/state tables, safe status reads, and service-only credential operations. No browser credential access; hosted deployment/isolation verification remains below.
- [x] Implement backend Gmail OAuth state/callback, PKCE, same-account checks, refresh leases, and disconnect/revocation handling. Offline/provider simulations and local database/API gates pass; initial live connection is now user-reported successful. Independent lifecycle verification remains.
- [x] Implement encrypted backend Google credentials with an independently configured AES-GCM keyring; keep Gmail access/refresh tokens out of browser responses and app logs. The private local keyring is provisioned and passes an encrypt/decrypt round trip. Operational key rotation, hosted secret provisioning, and live browser/network inspection remain to verify.
- [x] Wire Google sign-in and callback into the shared Supabase client on the development interface. The normal product must move this into designed onboarding without requiring email/password.
- [x] Inspect hosted migration history/schema and recover its missing onboarding migration locally. Rehearse pending SQL against the inspected hosted schema with fictional rows preserved. Hosted compatibility/runtime checks and rollout remain.
- [x] Provision private local sign-in/Gmail credentials and encryption key, enable local Supabase Google provider and Google connection, and configure public frontend settings. User reports completing Console setup and connecting successfully; secrets are ignored by Git.
- [ ] Finish live refresh, denied/partial consent, wrong account, state expiry/replay, revocation, disconnect/reconnect, reload, and sign-out verification; record sanitized evidence. Independently check Console settings as needed to resolve failures; hosted setup is not complete.
- [ ] Add optional Calendar authorization using the same app identity and protected backend lifecycle; validate actual granted scopes, partial consent, independent service status, and the chosen destination. Existing Gmail-only scope checks are not a Calendar integration.
- [ ] Explain data flow, model-provider processing, filtering limits, and retention before automation consent.
- [ ] Implement OR allowlists, overriding exclusions, no-allowlist notification, readable scope descriptions, and privacy settings. Canonical fixture filtering exists; persisted user configuration and enforcement before Gmail body/context retrieval remain.
- [ ] Complete the [custom filter backend plan](#custom-sender-domain-and-subject-filters-implementation-plan), including confirmation of category/phrase matching, canonical rules and safe preference conversion, authenticated persistence/revisions, and stale-work fencing.
- [ ] Integrate pause/resume, reconnect, disconnect/revocation, deletion controls, and stale-job protection into real scans and the product frontend. Storage fencing and the local Google lifecycle exist; live provider behavior and future Gmail/Calendar work still need end-to-end coverage.
- [x] Document Google implementation/testing status and private setup requirements in [the setup guide](app/supabase/GOOGLE_AUTH.md) and [verification report](docs/google-auth-verification-2026-11-05.md).
- [ ] Complete live Google test-account/demo evidence using fictional content, including provider-side permission removal and confirmed server-side sign-out behavior.

### CP3.4 Scanning and real inference

- [ ] Implement bounded initial retrieval: past seven days, at most 100 permitted emails, plus visible backlog and Scan more.
- [ ] Implement backend scheduling at the selected 15-minute default and manual refresh with cooldown.
- [ ] Use incremental scan state, bounded batches, concurrency protection, and a separate failed-item retry queue; do not mark failures successful.
- [ ] Enforce current filters before retrieving bodies, on every context message, and again before external inference.
- [ ] Add customizable thread limits with backend-enforced maximums; remove quoted history where practical and flag missing context.
- [ ] Call real Gemini inference for permitted messages and distinguish noise, tasks, events, and external commitments. Real fictional-case inference is evaluated; real Gmail processing and a live Gemini-to-Edge-to-database-to-UI trial remain unverified.
- [ ] Extract and validate ownership, dates, requirements, dependencies, and supporting evidence; preserve nullable/ambiguous fields.
- [ ] Display progressive validated results with processed/excluded/failed/pending counts and clear scan scope.
- [ ] Implement retry-safe extraction, multi-action handling, duplicate suppression, and reviewable update matching without overwriting edits. Canonical multi-action extraction, storage retry/cache/deletion safeguards, and explicitly targeted proposals exist; automatic matching and real scan integration remain.
- [ ] Implement the token-cost requirements: zero inference on empty/unchanged scans, combined structured extraction, bounded relevant context, safe result reuse, and code-only task/calendar actions. Fixture extraction/storage provide combined output, bounded input, reservations/cache reuse, and code-only review; verify these properties across real Gmail scans and connected Calendar operations.

### CP3.5 Approval, calendars, and lifecycle

- [ ] Select the supported Calendar destination model and least necessary scopes; implement optional onboarding connection and later connection from Add to Calendar/settings. Calendar connection may not be required for sign-in, Gmail processing, or task approval.
- [ ] Keep task approval separate from calendar authorization; enforce approval server-side. Review RPCs and separate calendar approval records exist; the future Calendar executor must enforce these approvals before external writes.
- [ ] Preview Google Calendar destination, title, all-day/timed choice, time zone, and duration; prepopulate explicit times and avoid private excerpts/attendees by default.
- [ ] Create real Google Calendar entries, record event IDs, handle ambiguous retry outcomes, and prevent duplicate creation.
- [ ] Implement approved event updates and explicit undo of app-created entries, with visible failure recovery.
- [x] Generate valid ICS exports and label them as manual import, without claiming synchronized updates or remote undo. Implemented on the opt-in storage dashboard; serializer tests and isolated preview browser check pass. File saving and destination-calendar import remain to verify; see [storage contract](app/supabase/STORAGE.md#manual-calendar-export).
- [ ] Verify ICS file saving and import into a destination calendar from the authenticated task flow; verify all-day and timed schedules and document duplicate-import behavior.
- [x] Add dashboard waiting-for reminders, recipients/rationale, and user-confirmed resolution. Implemented in storage and the opt-in dashboard; reminders do not send email or notifications.
- [ ] Propose deadline/commitment changes for approval; retain prior approved values until accepted. Explicitly targeted task-update RPCs preserve accepted fields; automatic matching, commitment-change workflow, and integrated review UI remain.
- [x] Implement completion undo and reset the 30-day countdown on recompletion. Database semantics and local completion/undo behavior verified.
- [ ] Implement scheduled retention cleanup, manual deletion, and excerpt expiry; prevent deleted tasks being unintentionally recreated by retries. Cleanup/deletion/expiry/suppression code exists and storage semantics are tested; finalize policies and enable/test the actual cleanup schedule.

### CP3.6 Tests, observability, documentation, and demo

- [ ] Build a labeled realistic fictional-email set: direct assignments, external commitments, multi-action threads, information-only messages, missing/relative dates, exclusions, quoted text, and deadline updates.
- [ ] Test user isolation, OR/exclusion precedence, empty allowlists, excluded context, and changed settings during queued work.
- [ ] Complete the [custom filter acceptance checks](#custom-sender-domain-and-subject-filters-implementation-plan), covering deterministic matching, persistence/API boundaries, permission changes, and accessible info-icon interactions without model calls.
- [ ] Test pause/disconnect/deletion, duplicate processing, preserved edits, retries, approval enforcement, calendar undo, and completion/retention boundaries using a controlled clock.
- [ ] Exercise revoked consent, Gmail/model rate limits, timeouts, invalid/truncated output, and partial scan recovery.
- [ ] Record request/scan IDs, latency, token use, estimated cost, prompt/model versions, and sanitized errors; omit sensitive payloads.
- [ ] Set per-user message/token limits, concurrent work limits, and spending controls; do not silently skip work when limits are reached. Follow the [proposed class-project abuse-control plan](#class-project-api-abuse-controls-proposed-implementation) for tester access, atomic global budgets, a kill switch, scan coordination, and acceptance checks; fixture limits alone do not establish real-scan enforcement.
- [ ] Test model-call counts for empty scans, repeated refresh, unchanged content, completion/undo, and calendar export; test that trimming/grouping preserves all actions and cannot bypass updated privacy rules.
- [ ] Establish a token/cost baseline on the labeled set, including retry and thinking usage; verify budget reservations under concurrent scans and compare accuracy before accepting optimizations.
- [ ] Perform a small human-alone / AI-alone / combined-workflow baseline check as specified in CP2; preserve cases, settings, and results for CP4.
- [ ] Complete `app/INSTALL.md`, `app/.env.example`, `app/prompts/`, runnable scripts, and `tests/`.
- [ ] Final-review and maintain [architecture](docs/architecture.md) (including the diagram), [use cases](docs/use-cases.md), and [observability](docs/observability.md). Current-state drafts now distinguish implemented code, dated verification, and planned integrations; they include the selected 15-minute scan interval, unconfirmed manual cooldown, separate context defaults, and future optional Calendar lifecycle. Update them as integrations are completed; drafting does not close end-to-end acceptance requirements.
- [ ] Final-review and validate [safety/privacy documentation](docs/safety_privacy.md). The November 5 draft covers implemented boundaries, proposed class-project abuse controls, privacy/retention limits, recovery, and verification criteria. Runtime integration, final policy decisions, and hosted evidence remain; drafting does not complete those checks.
- [ ] Verify fresh local setup and hosted operation, including an automatic scan with the dashboard closed.
- [ ] Rehearse a 5-8 minute presentation with at least half devoted to live use: allowed/blocked email, extraction, uncertainty correction, calendar approval/undo, and recovery. Use manual refresh to demonstrate the same pipeline without waiting 15 minutes; explain the schedule honestly.
- [ ] Submit required forum materials and document actual limitations rather than simulating unfinished core features.

Historical Google Auth verification: 99 offline tests, 40 real local database checks, four Google local Auth/PostgREST/Edge groups, frontend type/build, new Edge type checks, and browser checks are recorded in [the November 5 report](docs/google-auth-verification-2026-11-05.md). Provider exchange/refresh/revocation tests in that report use fictional injected responses. Subsequent setup verified private credential presence, a real encryption round trip, current local migrations, enabled local Google Auth and its redirect, anonymous Google endpoint rejection, and disabled cleanup; the user then reported successful initial local sign-in/Gmail connection. This is not a rerun of those suites. Full live OAuth lifecycle, Gmail retrieval, Calendar writes, hosted runtime, and designed product integration remain unverified.

Earlier evidence: the [storage report](docs/local-storage-verification-2026-11-04.md) records 75 offline tests, 28 database checks, seven local API groups, and browser persistence checks. ICS passed five separate export tests and isolated preview checks; [extraction review verification](docs/extraction-review-verification-2026-11-04.md) records the later fictional-case model evaluation. Do not add counts across dated reports or interpret them as one new end-to-end suite. Architecture, use-case, and observability drafts now exist and need final review and continued updates; safety/privacy documentation remains a placeholder.

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
