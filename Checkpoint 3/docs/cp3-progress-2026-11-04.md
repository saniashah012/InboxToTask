# CP3 progress log — November 4, 2026

## Current checkpoint

Resumed from `7c94536` on `main` with a clean checkout. The user reports that storage implementation and repository guidance were committed and pushed. This session added local ICS export work and updated the implementation plan. At the user's subsequent request, ICS export was committed separately as `51a9349`; this plan/progress update is being committed next, followed by a push of both commits. No deployment or hosted-service modification was performed. Read current Git status and remote state when resuming rather than assuming commit/push status from this dated log.

CP3 has a verified local extraction/storage foundation, but the complete real Gmail → scheduled/manual scan → review → approved Calendar workflow is unfinished. The [implementation plan](../IMPLEMENTATION_PLAN.md) now distinguishes completed local work from partial integration and remaining validation. Its checked items apply only to their stated scope.

## Completed foundation

- Canonical backend extraction with metadata filtering on supplied fixtures, bounded context, combined structured output, and schema/evidence/ownership validation. Full bodies remain transient.
- Persistent normalized extractions, suggestions, evidence, accepted tasks, waiting-for items, follow-ups, and separate calendar-operation approval records.
- Owner-scoped reads, controlled mutations, verified identity, nonnegative revision checks, lease fencing, per-user budgets, shared provider limits, cache reuse, and deletion suppression.
- Task edit/approval/dismissal/restore, separate original proposals and accepted values, completion/undo with a resettable 30-day cleanup countdown, and explicitly targeted task-update proposals.
- Storage pause/resume and generation fencing; manual deletion, excerpt expiry, cleanup code, and an optional cleanup schedule installer. The schedule is not installed/enabled by default.
- Opt-in authenticated storage dashboard with local review controls, digest, waiting-for resolution and confirmed dashboard reminders, activity, and pause/resume. Reminders send no messages.

Contracts and integration boundaries: [storage contract](../app/supabase/STORAGE.md). Historical implementation details: [storage handoff](storage-handoff-2026-11-04.md); its original pending-fix list was resolved by the later [verification report](local-storage-verification-2026-11-04.md).

## This session: ICS export

- Added [calendar serialization](../app/web/src/calendarExport.ts), [preview form](../app/web/src/CalendarExportPanel.tsx), and an export action for accepted approved/completed tasks in the [storage dashboard](../app/web/src/StorageDashboard.tsx).
- Preview supports editable title, all-day or timed entries, date, IANA time zone, and explicit duration. Missing task deadlines remain empty until the user chooses an export date. Calendar choices do not modify accepted task fields.
- Serialization preserves date-only values, uses exclusive all-day end dates, converts timed entries to UTC, rejects skipped/repeated daylight-saving times, escapes text, folds UTF-8 lines, and uses stable task UIDs.
- Files contain the selected title and schedule, without source excerpts or attendees. Export calls no model or backend. Destination selection happens during manual import; imported entries have no connected synchronization or remote undo, and repeat imports may duplicate them.
- Added [five export regression tests](../tests/calendar-export.test.mjs), runnable with `npm.cmd run test:calendar` from the app directory on Node 22.6+; verified on Node 24.20.0.

## Frontend assessment and required follow-up

The current frontend does not accommodate the full CP3 product. There are two separate interfaces:

| Route | Actual behavior |
|---|---|
| `/` | Original Figma prototype; onboarding, connection, scans, Calendar previews, and preferences remain simulated |
| `/storage` | Lazy-loaded only with `VITE_STORAGE_ENABLED=true`; functional local authentication/storage review and the new ICS preview |

Storage controls are an integration foundation, not a finished redesign of the main product. The next frontend work must map one coherent navigation and screen/state design, then integrate the persistent functionality. Preserve both routes until an explicit integration decision replaces one.

Required coverage:

- Tasks, Needs Review, Waiting For, Completed, informational digest, scan activity, Calendar operations, and settings.
- Google connection and consent onboarding, persistent allowlists/exclusions, readable scope, context limits, and processing/retention disclosures.
- Real refresh/cooldown, running and partial scans, processed/excluded/failed/pending counts, backlog/Scan more, retries/deferred work, and budget/reset feedback.
- Filters/sorting, deadline/condition labels, source links and evidence, corrections, proposed updates, missing context, and expired excerpts.
- Separate Calendar destination/title/schedule approval, operation status, failure recovery, explicit undo, and clearly labeled manual ICS export.
- Pause/resume, reconnect, disconnect/revocation, deletion, retention controls, keyboard access, visible focus, responsive layouts, and CP2 Carbon/accessibility verification.

Reuse the shared Supabase client/session. Do not present simulated or unavailable services as successful real connections, scans, or Calendar writes.

## Verification evidence and limits

| Evidence | Result and scope |
|---|---|
| Previously completed storage verification | 75 offline tests; 28 actual database checks; seven local API integration groups; frontend TypeScript/production build; both Edge Function type checks; synthetic browser sign-in/review/reload/completion/undo checks |
| Earlier live extraction evaluation | 20 fictional cases completed with explicitly selected Gemini 3.6 Flash; 19/20 passed existing acceptance checks. E12 optional invitation became an incorrect task; E03/E09 wording issues remain. See [evaluation](cp2-live-evaluation-2026-11-03.md) |
| This session's ICS checks | Five export tests passed; frontend TypeScript and production build passed; `git diff --check` passed before the progress documentation update |
| This session's browser coverage | Isolated component rendered with synthetic task fields; all-day preview, required timed duration, ambiguous-time rejection, and cancel verified |
| ICS verification still needed | The browser tool did not report a completed download event. Saving the file, destination-calendar import, and the authenticated task-to-export flow remain unverified |

The five export tests are separate from the previous 75-test baseline. The full storage/database/API suites were not rerun for the export addition. No real inbox was accessed and no new model call was made in this session. Earlier live CLI extraction and synthetic local storage tests do not establish a live Gemini-to-Edge-to-database-to-UI trial or hosted behavior.

No runtime availability is asserted by this log. The temporary frontend dev server used for the isolated preview check was stopped; consult the older storage report for its dated local stack state and verify services before using them.

## Remaining CP3 priorities

1. Map the unified frontend workflows and confirm the teammate's shared OAuth/session contract. OAuth implementation was assigned to a teammate in the handoff but is absent from this checkout; do not infer its external completion status.
2. Integrate protected Google tokens, refresh/reconnect/revocation, explicit scanning consent, and persistent rules. Filter metadata before retrieving current/context bodies and recheck current permissions before inference/persistence.
3. Implement and verify a real manual Gmail scan, including initial seven-day/100-permitted-message bounds, backlog approval, MIME normalization, and the live extraction/storage/UI path.
4. Add incremental state, manual cooldown, 15-minute scheduling while the dashboard is closed, bounded retry dispatch, progressive status, and recovery from changed permissions/provider failures.
5. Implement reviewable automatic task-update matching and separately approved Google Calendar creation/updates/reconciliation/undo. Finish ICS saving/import verification.
6. Finalize retention/context/resource defaults and provider-data disclosures; enable/test scheduled cleanup. Fixture limits are not production-policy approval.
7. Fix/revalidate the known extraction errors and freeze effective model/prompt/schema/settings. The canonical default remains Gemini 3.8 Flash; the evaluated development candidate and local override are Gemini 3.6 Flash.
8. Complete evaluation/cost evidence and the human-alone/AI-alone/combined baseline; finish documentation, fresh setup, hosted reconciliation/deployment/verification, demo rehearsal, and submission.

The [architecture](architecture.md), [use cases](use-cases.md), [observability](observability.md), and [safety/privacy](safety_privacy.md) documents are currently TODO placeholders. Setup/templates/scripts exist but still need a complete teammate reproduction and hosted setup review. Confirm the instructor's due date and deliverable-location requirements separately. Core unfinished features remain CP3 requirements rather than automatically moving to CP4.
