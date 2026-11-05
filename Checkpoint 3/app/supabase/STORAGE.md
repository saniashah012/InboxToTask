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

## Saved scanning permission (local foundation)

The [settings migration](migrations/20261105070000_scan_settings.sql) adds owner-read
`scan_settings` and controlled authenticated `scan_settings_get` / `scan_settings_save`
RPCs. Writes derive the owner from `auth.uid()` and require the expected revision;
stale saves return `PT409`. New users have no consent, empty inclusions, paused
scanning, and no earlier-message context. Explicit consent records the
`gmail-scan-v1` disclosure version and timestamp. Source-rule saves alone never
grant consent. Legacy onboarding preferences remain separate.

The [phrase-filter migration](migrations/20261105160000_phrase_filters.sql) adds
explicit inclusion/exclusion keywords. Phrase lists, sender addresses, and domains
trim and deduplicate without case sensitivity. Words/phrases match the subject or
parsed sender address/domain; exact sender/domain controls keep their exact scope.
Obsolete source rules revoke consent, pause affected users, and fence old jobs;
previous subject-only exclusions retain their original scope. Onboarding now saves
reviewed terms through the same revision-checked scanning RPCs.
Context limits are bounded by the canonical pipeline caps, with a conservative
zero-message default. Saves follow preference-before-child lock order, increment
storage generation, cancel current jobs, and preserve accepted tasks. This does
not authorize retrieval: a future Gmail dispatcher must recheck settings and
Google connection generations at each external boundary and commit. Deterministic canonical phrase matching is implemented locally; trusted Gmail
retrieval/inference enforcement remains unconnected. See
[verification and limitations](../../docs/scan-settings-verification-2026-11-05.md).

The [category-group migration](migrations/20261105170000_category_filter_groups.sql)
stores selected suggestion groups separately from custom phrases while preserving
`allow.keywords` and `block.keywords` as the effective terms consumed by the
scanner. A group stores its category name and exact keyword bundle, so future
preset edits do not silently change saved filtering. Existing keyword-only rows
are retained as custom phrases; no category is inferred from a coincidental
keyword set. Apply this migration before the updated frontend saves category
metadata. It does not change scanning consent or authorize Gmail access.

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
