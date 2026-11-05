# Frontend integration handoff

Updated November 5, 2026; the filename is retained for existing references.

Upstream synchronization: the teammate's auth/preferences milestone is now
included. [supabase.ts](../app/web/src/supabase.ts) owns the shared PKCE client;
the main frontend already initiates Google sign-in returning to the root origin
and loads/saves basic onboarding preferences. Preserve that work. The development
storage adapter now reuses this client too. Dedicated product callback routes are
an integration option, not a requirement to replace the existing root callback.
Live provider verification, backend Gmail connection UI, validated scan consent,
custom-filter rules, and persistent task review integration remain unfinished.

Resume by integrating Google-only sign-in and persistent review into the designed
product interface. The local Google backend foundation is implemented; successful
live OAuth and product onboarding remain unfinished. Users must not create a
separate InboxToTask password. `/storage` is a localhost development tool and is
excluded from production builds, including its Auth callback.

Preserve the separate-chat [custom sender/domain/subject filter plan](../IMPLEMENTATION_PLAN.md#custom-sender-domain-and-subject-filters-implementation-plan)
and its frontend/backend/test checklist entries. Subject inclusion matching has a
proposed OR default pending confirmation; do not silently settle that decision or
remove existing label rules, custom fields, or accessible info-icon requirements.

## Current repository state

- Branch: `main`. Google backend milestone: `bf5a5fb`, "Add Google sign-in and
  secure backend connection lifecycle", committed locally and not pushed. The
  follow-up handoff commit includes the updated plan, development-only storage
  restriction, and documentation, preserving the custom-filter additions. Run
  `git log -1` and `git status --short` for the latest checkout state before editing.
- GitHub redirects the existing origin URL to
  [InboxToTask](https://github.com/saniashah012/InboxToTask). The remote configuration
  was not changed. Recheck Git status and remote state on resumption.
- No hosted schema, Edge Function, or frontend deployment was performed.
- The localhost frontend was restarted for user review at `http://127.0.0.1:5173`.
  A fictional local review account was retained for the user; do not include its
  credentials in source/docs. Older temporary integration accounts were removed.
  Recheck ports and service health rather than assuming processes remain running.
- Do not push until setup is ready for Vercel testing and the user authorizes it.
  New commits, hosted migrations/functions, and deployment need their own instruction.

Read [repository guidance](../../AGENTS.md), [web guidance](../app/web/AGENTS.md),
and the [implementation plan](../IMPLEMENTATION_PLAN.md). For database/API changes,
also read [Supabase guidance](../app/supabase/AGENTS.md) and the
[storage contract](../app/supabase/STORAGE.md). Google setup and actual evidence are
in [Google Auth setup](../app/supabase/GOOGLE_AUTH.md) and
[the November 5 verification report](google-auth-verification-2026-11-05.md).

## Existing implementation

| Entry point | Current role |
| --- | --- |
| [React entry](../app/web/src/main.tsx) | `/` opens the prototype; storage/callback routes require localhost Vite development and `VITE_STORAGE_ENABLED=true`. Production omits the dashboard and shows Page not found even with flags enabled. |
| [Figma-derived app](../app/web/src/App.tsx) | Layout, onboarding, dashboard, task rows, dialogs, settings, and Calendar previews. Uses sample records and local state. |
| [Preview adapter](../app/web/src/previewAdapter.ts) and [demo data](../app/web/src/demoData.ts) | Simulated connections, scans, Calendar writes, and sample activity. Keep confined to visibly labeled preview behavior. |
| [Storage dashboard](../app/web/src/StorageDashboard.tsx) | Working authentication, suggestions, accepted tasks, editing/review, completion/undo, digest, waiting-for controls, activity, pause/resume, and ICS export. |
| [Storage adapter](../app/web/src/storageAdapter.ts) | Shared Supabase client/session boundary, snapshot reads, authenticated review RPC, and restricted fixture invocation. |
| [Google connection panel](../app/web/src/GoogleConnectionPanel.tsx) | Development connection/status/refresh-availability/disconnect controls. Does not enable scanning or connect Calendar. |
| [Google backend](../app/supabase/functions/_shared/google-connection.mjs) and [runtime](../app/supabase/functions/_shared/google-runtime.ts) | Account-bound single-use state, encrypted PKCE/credentials, same-email/subject checks, refresh leases, sanitized status/errors, disconnect/revocation and generation fencing; disabled until privately configured. |
| [Verification notice](../app/web/src/ExtractionReview.tsx) | Shows uncertainty reasons; reused by suggestions, Passive digest, and waiting-for views. |
| [ICS panel](../app/web/src/CalendarExportPanel.tsx) and [serializer](../app/web/src/calendarExport.ts) | Separate title/schedule preview and manual calendar-file export for accepted tasks. |

Reuse the existing backend rather than recreating its mutation semantics. Stored
model proposals, user review fields, and accepted task values are distinct.
Mutations require revision checks. Task approval never authorizes Calendar writes.

## Product decisions and remaining configuration

- Target journey: Continue with Google -> Gmail connection -> saved source rules
  and explicit scanning consent -> optional Calendar connection / Skip for now ->
  designed dashboard. Reuse one Supabase session throughout; no password prerequisite.
- Calendar can also be connected later from Add to Calendar/settings. Request its
  permission only on that choice. Denial/skip must leave Gmail/tasks usable, and
  connecting must not create events without separate preview/approval.
- Select Calendar destination/scopes and shared-grant revocation behavior before
  implementing its backend. The current Google connection requests Gmail access
  only; it does not yet support Calendar or combined partial grants.
- Current Gmail connection requires the same verified email as the app account.
  A different mailbox needs a separately agreed account-linking design.
- Configure Google Cloud test clients, Supabase provider, callbacks, and private
  Edge secrets following the setup guide. Live sign-in/exchange/refresh/revocation
  remain unverified. Keep scanning disabled during connection verification.
- Hosted read-only inspection recovered its missing onboarding migration. Pending
  migrations were rehearsed in disposable PGlite against the inspected schema with
  fictional legacy rows preserved. Hosted settings/data/functions were not changed.

## Phase 1 Complete one persistent workflow

Target flow: sign in → load suggestions → inspect evidence → edit → approve →
complete → undo → reload.

1. Add the authenticated product route and Google-only onboarding/return route
   (for example `/app` and `/auth/callback`; these are not implemented yet).
   Preserve the prototype; keep `/storage` development-only.
2. Reuse the existing shared Supabase client and Google sign-in session. Update
   the sign-in redirect, backend `GOOGLE_RETURN_URL`, Auth allowlist, and hosting
   SPA fallback for the actual product routes. Never use `/storage` for hosted
   OAuth. Password test accounts remain development tooling only.
3. Display actual pending suggestions and accepted tasks in the designed layout.
4. Wire edit/approve/dismiss to the existing `storage_action` RPC through the
   adapter. Use the correct record kind, ID, and current revision.
5. Wire completion/undo to the existing task operations.
6. Refresh saved data after mutations. Announce success only after confirmation;
   preserve entered values on failure and clear busy state in `finally`.
7. Handle stale revisions with a reload/review message rather than overwriting.
8. Clear records and editors when users change. Fence late reads and mutation
   completions so they cannot repopulate a previous user's interface.

Acceptance: Google sign-in reaches the designed interface without a separate
password account; the edited proposal becomes an accepted task; completion and
undo survive reload. Review actions make zero model calls. No review-schema
migration is expected solely for wiring this existing workflow. Explicitly report
any live Google verification blocked on private configuration.

## Phase 2 Separate layout from data and actions

Refactor incrementally while implementing phase 1; avoid a broad rewrite first.

- Extract dashboard navigation, suggestion/task cards, evidence panel, editor,
  and loading/error/status presentation from the prototype.
- Give components data and callbacks. Keep seeded arrays and simulated operations
  out of persistent application components.
- Introduce a shared hook/controller for the authenticated snapshot, refresh,
  mutation progress, and user-facing errors.
- Define explicit record/view types instead of extending the adapter's broad
  `Record<string, any>` types into the new interface.
- Map stored records to presentation while preserving IDs, revisions, proposed
  versus accepted values, nullable dates, conditions, and evidence relationships.
- Reserve local React state for selected views, open dialogs, and unsaved drafts.
  Persisted records remain the source of truth for task status.
- Preserve the current visual language; verify the required Carbon/accessibility
  conventions rather than claiming compliance from appearance.

Acceptance: reusable visual components work with either clearly identified preview
data or real authenticated records. The preview remains functional and distinct.

## Phase 3 Cover real records and remaining views

After the first workflow, integrate Needs Review and dismissed suggestions, digest,
Waiting For, ICS export, and actual stored activity in that order.

| Area | Required behavior |
| --- | --- |
| Suggestions and Needs Review | Show specific verification reasons beside evidence; support edit, approval, dismissal, and restoration. |
| Proposed updates | Compare accepted values with proposed changes. Never replace accepted values before approval. |
| Source evidence | Show available sender, subject, timestamp, and excerpts. Distinguish expired/unavailable excerpts. Do not invent full email bodies. |
| Dates and conditions | Preserve missing dates, date-only values, IANA zones, by/before boundaries, and conditional checkpoints. Do not invent a time or turn a reminder trigger into its send-by deadline. |
| Digest | Show stored summaries, uncertainty, and available evidence, including Passive messages with no proposed task. |
| Waiting For | Show external owner, promised timing, resolution/reopen, and separately confirmed dashboard reminders. Reminders send no email or notification. |
| Calendar file | Reuse the existing panel/serializer; keep export separate from task acceptance and explain manual-import limitations. |
| Activity | Use actual saved/running/failed/request counts supplied by storage. Do not present simulated Gmail scan counts as real activity. |

Design adjustments:

- The backend does not durably retain full email bodies. Adapt the prototype's
  email modal to evidence/source metadata. Gmail links can follow when reliable
  message references are supplied by the integration.
- Personal categories such as Homework or Jobs are different from the extraction
  category Actionable/Passive. Start with supported status/review/deadline filters;
  persistent personal categorization needs a separate assignment/storage design.
- Passive digest entries currently lack persistent reclassification, create-task,
  and resolve-review actions. Showing verification notices is supported; richer
  resolution requires separate contract/UI work.
- Preserve planned custom sender/domain/subject inputs and the accessible info
  icon; follow the canonical implementation plan rather than replacing them with
  fixed presets. Source rules/settings remain backend work until persisted.
- Keep unavailable Google connection, scan, and connected Calendar controls
  explicitly unavailable outside preview mode.

Acceptance: no sample content silently substitutes for absent backend fields.
Missing, loading, empty, partial/error, uncertain, and expired states are visible.

## Phase 4 Persist privacy settings and agree on Google boundaries

This phase requires additive backend work. Existing `storage_preferences` mainly
supports trial processing/pause and budgets, not the complete consent/rules model.

Use one settings contract across the frontend and backend for:

- Explicit scanning consent, separate from account connection and trial processing.
- Allowed labels, senders, and domains; inclusion combines with OR.
- The separate custom-filter plan's proposed subject inclusions, once matching
  behavior is confirmed; preserve its compatibility/validation requirements.
- Excluded labels, senders, domains, and subject keywords; exclusions override.
- Context message-count, age, and text-size limits within server-enforced caps.
- Pause state and a settings revision/generation for queued-work rechecks.

Implement an ordered migration, owner-isolated reads, controlled updates, backend
validation, and settings UI with saved-state loading and retained drafts on error.
Show readable effective scope. Empty allowlists disable scanning. Do not convert
the existing trial `enabled` default into implicit consent.

Confirm unresolved context, retention, and budget defaults before encoding them;
the implementation plan separates accepted decisions from proposals.

| Frontend/settings responsibility | Backend integration responsibility |
| --- | --- |
| Shared Google-created Supabase session | Reuse the existing account-bound connection/protected token lifecycle; configure and live-test it |
| Saved consent and current source rules | Metadata filtering before current/context body retrieval |
| Saved context limits | Enforced bounded context retrieval |
| Pause and settings revision | Rechecks before external requests and persistence; stale-job fencing |
| Safe connection/status interface | Integrate and live-verify existing refresh/reconnect/disconnect/revocation; add Calendar capabilities separately |

The owner comes from verified Auth. Google/model credentials stay backend-only.
Connecting Google does not authorize scanning. No real Gmail extension of the
fixture endpoint is authorized as part of frontend integration.

Acceptance: settings survive reload, remain isolated across users, and have a
clear backend contract the Gmail adapter can consume without duplicate logic.

## Optional Calendar integration

Design its optional onboarding step alongside the product UI, but enable Connect
only when the real authorization backend exists. Include Skip for now and later
connection, actual granted capability/status, and clear denied/revoked states.
Then implement destination/title/date/time-zone/duration preview, separately
approved create/update operations, stable event IDs, retry reconciliation, and
explicit undo. Retain ICS as manual import. Calendar work and real Gmail scanning
remain open milestones in the main plan; neither is provided by the current
Google backend or simulated prototype.

## Phase 5 Verify and prepare a separate rollout

Use fictional stored records for ordinary UI work. Reuse saved extractions rather
than making repeated paid model calls. The fixture endpoint remains restricted to
E01–E20 and disabled by default.

Verify persisted edit/approve/dismiss/restore/complete/undo, stale revisions,
failed-save input preservation, sign-out/account switching, and two-user isolation.
Exercise missing dates, date-only deadlines, conditions, expired evidence, proposed
updates, and empty views. Verify review and ICS actions make zero model calls.

Check keyboard navigation, dialog focus/return focus, accessible labels and status
announcements, responsive layouts, and Carbon requirements. Verify an ICS file
actually saves and imports into a destination calendar; prior browser coverage
did not establish saving/import success.

Commands, with existing dependencies (do not install or rerun suites without a
task-related reason):

```powershell
# From Checkpoint 3/app
npm.cmd test
npm.cmd run test:google
npm.cmd run test:calendar
npm.cmd run supabase:prepare  # When canonical extraction assets change

# From Checkpoint 3/app/web
corepack pnpm exec tsc --noEmit
corepack pnpm build
corepack pnpm dev --host 127.0.0.1
```

For actual local Auth/PostgREST/Edge checks or migrations, follow the scoped
Supabase instructions. Never reset a database merely to apply migrations. Check
ports/services before starting them; never print status credentials or env values.

Acceptance: authenticated browser checks establish the integrated workflow,
appropriate offline/type/build checks pass, and new settings behavior has meaningful
regression coverage. Update setup and plan documentation. Deployment is separate.

Latest saved evidence: 99 offline tests, 40 real local database checks, four Google
local API/Edge groups, frontend type/build, new Edge types, and local browser checks.
The development-only route change additionally passed a production build with all
feature flags enabled: no storage dashboard bundle/code remained; storage and its
callback showed Page not found while the homepage and localhost development route
worked. These are dated checks, not a claim that a new full suite ran for this
documentation reconciliation. Google provider tests used fictional injected
responses. Live OAuth, product onboarding, Gmail retrieval, and Calendar writes
remain unverified/unimplemented as described in the main plan.

## Extraction work already completed

The pushed extraction change uses existing uncertainty/review fields; no migration
was needed. It strengthens optional invitations, inclusive/exclusive wording,
conditional reminders, and null ambiguous dates. The Edge bundle was rebuilt
locally, not deployed.

- 81 offline tests passed; 36 pipeline tests passed again after a test-only change.
- Frontend type/build checks and synthetic browser checks passed.
- Final live development evaluation: 8/8 targeted cases and 20/20 CP2 cases passed
  current checks using explicitly selected Gemini 3.6 Flash, LOW thinking.
- E09 scoring was corrected: Friday afternoon is a conditional checkpoint, not a
  send-by deadline. The old 19/20 baseline is not directly comparable.
- Canonical default remains Gemini 3.8 Flash. Configuration is not frozen.
- Manual findings remain: E02 omitted a dependency detail; E15 added unnecessary
  review prose. A model can still be confidently wrong without flagging uncertainty.

See the [verification report](extraction-review-verification-2026-11-04.md) for
run artifacts, costs/usage boundaries, and limitations. Do not rerun paid extraction
evaluation merely to begin frontend work.

## Prompt for the next session

> Read this handoff, the current implementation plan, Google setup, and scoped
> instructions. Preserve all current uncommitted work, including the separate-chat
> custom sender/domain/subject filter plan and its unresolved matching decision.
> Integrate Google-only product onboarding and the designed dashboard using the
> existing shared Supabase session, Google backend, persistent review RPCs, and
> fictional records. Add product callback/return routes; keep /storage local-only
> and excluded from production. No separate user password account is required.
> Include the optional Calendar step in the design with Skip for now; do not claim
> a working Calendar connection until its backend exists. Keep Gmail connection,
> saved scanning consent/filters, Calendar permission, and event approval separate.
> Verify actual persistence, stale revisions, account isolation, callback/reload,
> loading/errors, keyboard interaction, and production exclusion of developer UI.
> Report private configuration and live checks still pending. Do not enable scans,
> make unnecessary model calls, commit, push, or deploy without the applicable
> user instruction. Push remains deferred until ready for Vercel testing.
