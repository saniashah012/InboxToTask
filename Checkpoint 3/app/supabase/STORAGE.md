# Storage contract and local trial

Use [the local setup guide](README.md) to start the stack and development review UI. The endpoint accepts fictional E01–E20 fixtures only. The [Google connection backend](GOOGLE_AUTH.md) uses the shared signed-in Supabase identity and keeps Gmail credentials encrypted/server-side; private configuration and live verification remain. The `/storage` UI/callback are localhost-development-only and excluded from production. Product onboarding must use separate routes and Google sign-in without a password prerequisite.

## Data flow

Verified session → prepare permitted fixture/context → hash effective input/configuration → claim budget and lease → canonical Gemini extraction/validation → transactional normalized persistence → owner reads suggestions → explicit review RPC creates or updates accepted tasks.

The browser cannot submit source bodies, owner identity, prompts, or model settings to the fixture endpoint. Full bodies are transient; storage contains minimal source metadata, normalized fields, and expiring evidence rather than a raw model response. Date-only deadlines remain date-only JSON values.

## Database and RPCs

Apply migrations in timestamp order. The original seven establish legacy tasks, normalized storage, controlled mutations, and conflict responses. Additional migrations recover the existing hosted onboarding schema and add private Google connection/state storage and scoped RPCs. Existing legacy rows retain nullable normalized fields until explicitly reviewed. Hosted history has been inspected/recovered locally; recheck it before rollout. Local tests and the schema rehearsal do not establish hosted runtime compatibility.

| Data | Purpose |
| --- | --- |
| `storage_preferences`, `storage_sources` | Trial processing controls and minimal source identity |
| `storage_extractions`, `storage_evidence` | Validated result metadata, summary, and expiring quotations |
| `storage_suggestions` | Original proposal plus separate user review fields and revision |
| `tasks`, `storage_task_sources` | Accepted values, completion state, and provenance |
| `storage_waiting_for`, `storage_followups` | External promises and user-confirmed reminder dates |
| `storage_calendar_operations` | Separate preview/approval records; no Calendar API execution |
| Private jobs, attempts, usage, provider limits, suppressions | Lease fencing, budget accounting, retry state, deletion protection |

Service-only public RPCs: `storage_claim`, `storage_finish`, `storage_fail`, `storage_propose_update`, and `storage_cleanup`. `storage_receipt` is an internal helper. Authenticated users call `storage_action` and `storage_activity`; identity comes from `auth.uid()`. All public wrappers use fixed search paths and scoped grants. Browser table reads use owner RLS; browser table mutations and private-table reads are denied.

Review mutations require a nonnegative revision; stale revisions fail. Approval is idempotent. Accepted edits do not overwrite original model proposals. Proposed updates require an explicitly selected target and expected revision; semantic matching is not implemented. Calendar approval also checks the task revision.

## Saved scanning permission

Owner-readable `scan_settings` are saved only through revision-checked
`scan_settings_get` / `scan_settings_save`. Exact sender/domain inclusions combine
with OR; source exclusions and literal case-insensitive subject exclusions win.
Domains do not include subdomains. Empty source inclusions permit nothing.
`semantic_preferences` holds separate include/exclude topics; topics never grant
source access. Semantic relevance is Phase 3 work, after permitted content is sent
to Gemini. Semantic exclusions cannot prevent transmission.

The [source/semantic migration](migrations/20261105200000_source_semantic_contract.sql)
retains incompatible phrase rules in `legacy_phrase_rules`, pauses affected users,
revokes consent, increments revisions/generations, and cancels storage work. It
requires explicit replacement review (`p_reviewed=true`) before saving again.
Previous subject-only exclusions retain their scope. Categories are never inferred
from expanded phrases. New saves require `p_semantic`; old clients fail closed.

New accounts default to no consent, paused, empty source lists, and five earlier
messages within 90 days. Existing saved settings and consent are preserved unless
incompatible phrase rules require review. Context supports 0?10 earlier messages,
1?365 days, 100?30,000 characters per message, and 100?60,000 total. Age is relative
to the analyzed message. Zero disables earlier context. Accepted tasks are unchanged.
Consent remains explicitly saved under `gmail-scan-v1`; saving filters or connecting
Google alone never grants it. Settings saves fence older storage work.

## Manual Gmail retrieval milestone

The separate [gmail_scan](functions/gmail_scan/index.ts) function verifies Supabase
Auth and accepts only `{ "mode": "initial" }` or `{ "mode": "more" }`. It is disabled
unless `ENABLE_GMAIL_RETRIEVAL=true` and the Google connection feature is configured.
It currently performs **retrieval only**, with zero inference, no saved extraction,
and count-only responses. Do not present it as a completed manual scan.

Service-only `gmail_scan_service` coordinates one four-minute lease per owner,
with a 60-second request cooldown, seven-day snapshot window, private continuation
IDs/cursor, and rechecks of saved consent, source access, settings revision, storage
generation, verified mailbox identity, connection state/scope/generation. The
handler additionally checks before and after obtaining/refreshing a backend token.
Continuation requires a new explicit `more` request. A changed revision/generation
requires a fresh initial request; no scheduler is installed.

The canonical [retriever](../pipeline/gmail-retrieval.mjs) fetches candidate IDs,
then metadata, then permitted bodies. Each earlier context message passes the same
current access rules before body retrieval. The endpoint returns no bodies or
provider diagnostics, and stores only coordination IDs, cursor and sanitized counts.
See [phase evidence and limitations](../../docs/gmail-manual-scan-phases-2026-11-05.md).

The [semantic contract migration](migrations/20261105200000_source_semantic_contract.sql)
stores included and excluded topics as `semantic_preferences.include` and
`semantic_preferences.exclude`. Short suggestion names and custom phrases are
independent semantic strings; they are not expanded into Gmail labels or source
keyword rules. Source access remains governed separately by sender/domain rules.
The category-group migration used by an earlier frontend iteration was removed;
it is unnecessary for this contract and must not be applied.

## Trial limits and lifecycle

- Per-user defaults: 20 requests and 200,000 reserved/reported tokens per day. Shared default: three requests per model per minute.
- At most one live job per user, 90-second leases, three attempts per extraction identity, and a 60-second failure retry delay. There is no automatic retry dispatcher.
- Token reservation estimates are conservative byte-based estimates, not exact provider tokenization. Unknown usage keeps the reservation. Reservations are reconciled when usage is reported.
- Evidence, digest summaries, unapproved suggestions, and waiting items default to 30 days. Completed tasks become eligible for deletion after 30 days; undo cancels eligibility. Attempt diagnostics expire after 14 days.
- Source deletion removes extracted content and hides the source; approved tasks remain independently accepted values. Task/source deletion records suppressions so stale work cannot recreate deleted results, including a new configuration against the same source.
- Minimal source identifiers and suppressions remain until account deletion. Finalize this retention choice before real-email processing.
- Processing pause increments a generation and cancels current jobs. Late commits cannot override pause/deletion or newer leases.

These defaults support controlled fixture trials. They do not authorize real-email processing. The real app still needs explicit allowlists/exclusions and privacy checks before body/context retrieval.

## Cleanup and remaining integration

The [Google connection implementation](GOOGLE_AUTH.md) adds a separate private
credential/state boundary and safe authenticated status RPC. Configuration and
live OAuth verification remain; no scanning consent or real Gmail processing is
implied by a connection. Existing fixture processing controls remain independent.

[Cleanup](functions/storage_cleanup/index.ts) is disabled by default. Enable it only with a separately configured scheduler secret of at least 32 characters. The optional [schedule installer](operations/install_cleanup_schedule.sql) references Vault secrets and is not applied by migrations. Confirm schedule/time-zone behavior and configure secrets privately before installing it. Cleanup currently locks preference rows across users; batch it before public-scale use.

Remaining integration: private Google/provider configuration and live OAuth/refresh/revocation verification, Google-only product onboarding, persisted consent/source rules and permitted Gmail retrieval, incremental/manual/scheduled scans, semantic task matching, optional Calendar authorization plus approved writes/reconciliation/undo, final retention policies, and hosted rollout. Protected token and lifecycle code exist locally; they do not enable scanning. Preserve the [custom filter requirements](../../IMPLEMENTATION_PLAN.md#custom-sender-domain-and-subject-filters-implementation-plan) while implementing source rules. Dashboard reminders do not send email or notifications.

## Manual calendar export

The storage dashboard offers **Export calendar file** on accepted approved/completed tasks. The separate preview lets the user edit the calendar title, choose an all-day or timed entry, and supply a date. Timed entries require a start time, valid IANA time zone, and explicit duration (1–1440 minutes). An explicit task deadline can prepopulate the start; it does not imply duration or authorize a connected Calendar write. Missing task deadlines stay empty until the user chooses a calendar date. Export does not change accepted task values or call a model/backend.

[The ICS serializer](../web/src/calendarExport.ts) emits RFC 5545 text with stable task UIDs, CRLF line endings, escaped text, UTF-8 folding, exclusive all-day end dates, and UTC timed entries. Skipped/repeated daylight-saving wall times require another user choice. Files include only the chosen title and schedule, without evidence excerpts or attendees. Users choose the destination during manual import and manage imported entries there; exports provide no synchronization or remote undo, and repeated imports can create duplicates.

Run `npm.cmd run test:calendar` from the app directory with Node 22.6+ (verified on Node 24). Five offline tests cover date boundaries, time zones/DST, duration validation, text injection, and UTF-8 folding. TypeScript and the production frontend build passed on November 4, 2026. An isolated browser component check with synthetic task fields verified all-day preview, required timed duration, and ambiguous-time rejection. The browser tool did not deliver a download event; saving the file and importing into a destination calendar remain unverified. The authenticated task-to-export flow was not repeated in this check.

Read [the verification report](../../docs/local-storage-verification-2026-11-04.md) for actual tested behavior and limitations.
