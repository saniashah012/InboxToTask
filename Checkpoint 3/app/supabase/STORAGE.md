# Storage contract and local trial

Use [the local setup guide](README.md) to start the stack and review UI. The endpoint accepts fictional E01–E20 fixtures only. A teammate's Google OAuth work must eventually use the same signed-in Supabase user/session and keep Google refresh tokens server-side.

## Data flow

Verified session → prepare permitted fixture/context → hash effective input/configuration → claim budget and lease → canonical Gemini extraction/validation → transactional normalized persistence → owner reads suggestions → explicit review RPC creates or updates accepted tasks.

The browser cannot submit source bodies, owner identity, prompts, or model settings to the fixture endpoint. Full bodies are transient; storage contains minimal source metadata, normalized fields, and expiring evidence rather than a raw model response. Date-only deadlines remain date-only JSON values.

## Database and RPCs

Apply migrations in timestamp order. The first two establish legacy tasks; the next four add storage and controlled mutations; the seventh upgrades conflict responses for initialized trials. Existing legacy rows retain nullable normalized fields until explicitly reviewed. Reconcile hosted schema/history before considering deployment; local baseline migrations are not proof of compatibility with the hosted project.

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

[Cleanup](functions/storage_cleanup/index.ts) is disabled by default. Enable it only with a separately configured scheduler secret of at least 32 characters. The optional [schedule installer](operations/install_cleanup_schedule.sql) references Vault secrets and is not applied by migrations. Confirm schedule/time-zone behavior and configure secrets privately before installing it. Cleanup currently locks preference rows across users; batch it before public-scale use.

Remaining integration: OAuth/revocation, protected tokens, permitted Gmail retrieval, incremental/manual/scheduled scan dispatch, semantic task matching, Calendar writes/reconciliation/undo/ICS, final retention policies, and deployment. Dashboard reminder dates do not send email or notifications.

Read [the verification report](../../docs/local-storage-verification-2026-11-04.md) for actual tested behavior and limitations.
