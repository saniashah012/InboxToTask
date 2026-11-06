# Minimal Google Calendar integration — implementation and approval plan

Calendar branch: `agents/proceed-with-the-minimal-google-calendar-integra`.
Baseline: main `e2b0009`, plus exact PR #22 `4bb256b36731fccfb61e94c3a220620a8ee35ad0`
cherry-picked as `31aef8e`. The category-chip checkout and PR #20 are untouched.
No hosted SQL, deployment, Cloud API enablement, credential changes, merge, or real
Calendar writes were performed. This document is a deployment proposal, not approval.

**Rebase note, November 5, 2026:** `mzheng/calendar-rebase` carries this work on the full PR #22
branch without the `31aef8e` cherry-pick. The migration was renamed from `20261106020000` to
`20261106050000` so it sorts after `20261106040000`, which is already applied locally. Its contents
are unchanged, so the SHA-256 below still holds. After the rebase, on Gmail base `f48e204`:
`npm test` 171/171, `test:calendar` 17/17, frontend type check and build pass, all with migrations
`010000` to `040000` in the PGlite schema. Evidence below predates the rebase. No local
Supabase migration, OAuth round trip or Calendar write has been run.

## Behavior and boundaries

- Approved, uncancelled tasks offer Add to calendar in the persistent workspace.
  The review form copies accepted title and any known deadline date/start time.
  Missing dates and end times remain blank; a deadline supplies no duration.
- Primary calendar only. Editable title/date, all-day or explicit start/end dates
  and times, visible editable IANA zone. Timed events are limited to 24 hours.
  Both server and form reject nonexistent/ambiguous DST wall times. All-day dates
  use an exclusive next-day end without converting the selected date to UTC.
- Optional Calendar authorization upgrades the existing Gmail backend OAuth grant.
  It requests `https://www.googleapis.com/auth/calendar.events.owned`, with
  incremental grants and offline access. Supabase identity sign-in is unchanged.
- The same Gmail Cloud project/client and existing server-side keyring are reused.
  Google scope permits reading/editing/deleting owned-calendar events; this app
  exposes only creation and targeted reconciliation of its own deterministic IDs.
- OAuth state binds the upgrade intent. Identity, Gmail and requested Calendar
  grants are checked before replacement credentials are saved. Denied/cancelled or
  partial consent leaves saved Gmail credentials intact. Omitted refresh tokens
  reuse the existing encrypted token for the verified same account. A short,
  generation-fenced callback exclusion prevents overwriting a rotating refresh token.
- The draft is stored in tab-scoped sessionStorage under the Supabase user ID and
  is restorable for up to 24 hours. It contains title/schedule/task identity,
  never provider tokens or email excerpts. OAuth redirects restore review; only
  another explicit Add to Google Calendar confirmation invokes the writer. Success
  or explicit Cancel removes this task's draft. Storage must work before redirect.
- Disconnect Google revokes the combined Gmail/Calendar connection. It does not
  remove existing events. There is no separate Calendar-only revoke promise.
- No attendees, email excerpts, task requirements, automatic schedules, grid,
  external updates/deletes, two-way sync, or model calls are introduced.

## Durable duplicate and error handling

[Calendar migration](../app/supabase/migrations/20261106050000_calendar_events.sql)
adds a private execution receipt keyed by owner/task/Google subject, independent of
the older storage review preview records. This avoids replacing the shared
`storage_action` function or changing existing preview approval semantics.

Every explicit submission validates its payload, obtains a backend token, and
claims a serialized operation. SQL checks ownership, task approval, cancellation,
deletion, current revision, connection state and Calendar grant. Only the service
role can execute; the public status RPC returns the owner's safe receipt/draft.

The operation retains a stable Google-compatible event ID. The writer first GETs
that exact ID, verifies its private operation marker, and only inserts after 404.
A 409 is reconciled by GET. Each request makes at most three Google calls, each
with a timeout; there is no retry loop. A 90-second lease fences simultaneous
requests. Unknown outcomes retain the immutable submitted draft; retry reuses the
same ID/payload. Explicit provider rejection allows correction. A lost database
receipt is recovered using the same provider ID. Success is shown only after the
receipt persists, and survives reload.

Task eligibility is checked again immediately before insertion. External writes
cannot be atomic with a database transaction: a task edit or disconnect after
that last check may overlap an in-flight Google request. Late success never
updates task fields, and the event ID remains reserved for reconciliation.
Google-side deletion/cancellation or a conflicting private marker is reported as
unresolved rather than creating a replacement event. Stale task previews require
reloading/reviewing current task state. There is no automatic event recreation.

## Coordination

Calendar now uses **20261106050000**, after the teammate-owned
**20261106010000_gmail_manual_resolution.sql** and PR #22's
**20261106000000_gmail_scan_hardening.sql**. The earlier Calendar 010000 reservation
was superseded when the user reported the Gmail migration collision. The Gmail
migration was not renamed or edited. The teammate now owns the hosted rollout;
Calendar is a separate later change. Its exact final dependency schema must be
reviewed once the teammate publishes the uncommitted manual-resolution migration.
Calendar must not bypass or apply the teammate's batch.

The Gmail teammate retains shared OAuth ownership. No direct contact/session for
that teammate is available here; owner review remains a release gate. Forward:

> Calendar changes are isolated on the Calendar branch above. Please review
> `_shared/google-connection.mjs`, `_shared/google-runtime.ts`, and the new wrapper
> in `20261106050000_calendar_events.sql`. Gmail-only authorization still requests
> identity + gmail.readonly; Calendar is requested only by connect_calendar.
> Denied/partial grants preserve credentials; refresh-token rotation is serialized
> with callback completion; explicit refreshed scopes update capability metadata.
> Sign-in is unchanged. Confirm compatibility before any coordinated deployment
> of google_connection/google_callback and your gmail_scan consumer.

## Google dashboard setup — owner action, not performed here

First check **APIs & Services → Enabled APIs & services** in the Gmail Cloud
project. Verify whether **Google Calendar API** is already listed before anyone
tries to enable it. Its enabled status is currently unverified by this chat.

After that check, the next guided step is Google Auth Platform → Data Access:
verify/add `calendar.events.owned` to the existing backend OAuth app, retaining
Gmail scopes. Confirm the test user's audience access and any Workspace admin
restrictions. Check the current backend callback URI matches its registered URI;
this implementation adds no callback URI and requires no new client secret.
Do not change the Supabase sign-in client, redirects or provider scopes.
Never send secrets through chat. Public release/verification requirements are a
separate dashboard gate; a test-user flow is not evidence of public approval.

## Exact hosted sequence proposed for approval

Run only after the teammate confirms their final Gmail/database batch is complete,
the backup/recovery gates pass, and the Gmail owner approves the shared OAuth diff.
Pin the final reviewed Calendar commit before executing. The current Calendar SQL
SHA-256 is `95717f63713b7d83a6d0c48e4895f7a1df3bfd1f42aa6cea401e183e2b895e88`.
Recompute it after any compatibility fixes; approval must name the reviewed version.

1. Read-only preflight on IS492_c3 (`ltxhxqxpatemgkhjzmaq`): verify the migration
   ledger through the agreed Gmail `20261106040000` migration, expected Google/task tables/RPCs, no version
   `20261106050000`, no active rollout, and a current verified recovery backup.
   Stop on mismatch. Verify the Calendar API and consent scope in the Gmail project.
2. Apply **only** `20261106050000_calendar_events.sql`, transactionally with its
   normal migration ledger entry. Prefer the coordinator's reviewed one-migration
   runner. Do not run an unrestricted `db push`, history repair, or reset. Existing
   migrations are unchanged. Verify private-table/function grants and owner status
   isolation after application. Keep `ENABLE_CALENDAR_EVENTS=false`.
3. From `Checkpoint 3/app`, deploy these exact entry points at the reviewed commit:

   ```sh
   npx supabase --agent no functions deploy google_connection --project-ref ltxhxqxpatemgkhjzmaq --no-verify-jwt
   npx supabase --agent no functions deploy google_callback --project-ref ltxhxqxpatemgkhjzmaq --no-verify-jwt
   npx supabase --agent no functions deploy calendar_event --project-ref ltxhxqxpatemgkhjzmaq --no-verify-jwt
   ```

   The endpoints verify Supabase Auth themselves; callback uses single-use state.
   Deploy connection/callback together and avoid starting OAuth during this window.
   The Gmail owner separately coordinates any `gmail_scan` deployment containing
   this shared helper (prepare its canonical bundle first). This plan does not
   authorize a Gmail deployment or change retrieval/scan/model flags.
4. Verify disabled/authentication/CORS behavior and Gmail-only connection status.
   Keep existing `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, token keyring,
   `ENABLE_GOOGLE_CONNECTION`, origins and callback values; review privately and
   do not print or rotate them. Confirm `GOOGLE_RETURN_URL` is the product root.
5. Release the frontend containing TaskCalendarControl using the separately
   approved frontend release process. No additional public secret or Auth client
   configuration is needed. Calendar remains disabled until explicit enablement.
6. With separate approval, set the backend-only `ENABLE_CALENDAR_EVENTS=true`
   privately, then exercise a dedicated account with fictional tasks/events.
   Verify all-day and timed creation, explicit post-OAuth confirmation, denial
   preserving Gmail, refresh, double-clicks, lost-response retry and View event
   after reload. A test requires actual Google consent; no model/Gmail scan is needed.
7. If validation fails, disable `ENABLE_CALENDAR_EVENTS` first and retain operation
   receipts for recovery. Do not delete/revert the additive schema or revoke the
   combined Google grant as a Calendar-only rollback. Existing Google events remain.

## Verification evidence

- Final full offline suite: **158/158 passed**, including Gmail and shared OAuth
  regressions after the callback/refresh exclusion fix.
- Calendar suite: **17/17 passed**. The final OAuth + Calendar SQL subset was also
  rerun after the callback exclusion change: **20/20 passed**. Coverage includes
  PGlite ownership/grants, stale/cancelled/deleted tasks, stable IDs, single-use
  OAuth intent, callback/refresh serialization, provider reconciliation and ICS
  regressions. The version rename changes only the filename and ordering comment.
- Frontend TypeScript and production build passed. Calendar, Google connection,
  Google callback and Gmail scan Edge entry points passed final Deno checking.
- Browser component checks used fictional tasks and intercepted HTTP responses:
  missing dates/end times blank; editable fields/zone; retry error preserves edits;
  return restores draft with zero automatic creates; confirmed success shows View
  event; saved success survives reload; unresolved draft restores locked fields.
  The workspace selects Accepted tasks when a user-bound review draft exists.
  The temporary harness is removed before handoff. These checks do not establish
  a real authenticated Supabase/Google round trip. The unavailable teammate Gmail
  manual-resolution migration was not included in these offline schema runs;
  final compatibility review against that SQL remains a release gate.
- No actual local Supabase migration/API test, live Google OAuth/refresh, Calendar
  event write, hosted rollout, or deployment is claimed by this implementation.

## Official references checked

- [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth)
- [events.insert: primary, supported scopes, dates and event IDs](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)
- [Incremental web-server OAuth and offline tokens](https://developers.google.com/identity/protocols/oauth2/web-server#incrementalAuth)
- [Calendar error handling](https://developers.google.com/workspace/calendar/api/guides/errors)
