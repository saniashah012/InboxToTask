# Current implementation and verification state

Updated the evening of November 12, 2026 (Central), after the CP4 study release: PRs #103–#111
and #35 merged to `main` (latest `6ae3356`), with hosted migrations and function deploys
recorded in [November 12](#november-12-2026-cp4-study-release) below. Older sections keep their
dates and were not re-verified unless marked. Later Google Calendar work on the unmerged branch
`claude/calendar-designed-ui` (PR #116) is recorded under November 13 and November 15 in
[local migration and feature state](#local-migration-and-feature-state-last-observed); it is not
on `main` or hosted. This is the resumption index, not a claim that services are running. Check Git status and local runtime/migration state before new work.

## Read in this order

1. [Repository instructions](../AGENTS.md) and the relevant scoped instructions.
2. This status page for implemented versus verified versus pending work.
3. [Implementation plan](IMPLEMENTATION_PLAN.md) for requirements and acceptance
   gates. An unchecked item can have code without completed acceptance evidence.
4. [Review, fixes and live runbook](docs/gmail-manual-scan-review-2026-11-05.md), then the
   earlier [phase report](docs/gmail-manual-scan-phases-2026-11-05.md) and
   [Claude handoff](../CLAUDE_HANDOFF.md) for continuation detail.

Source/package manifests define code and commands. Migrations define the intended
database contract; only an inspected runtime establishes which are applied. Dated
reports describe their own run, not today's runtime or later code.

## November 12, 2026: CP4 study release

All merged to `main` on November 12 (times Central), each a production deployment:

| PR | Merged | What changed |
| --- | --- | --- |
| #103 | 10:41 AM | "Unsaved changes" no longer stays after saving Settings; editable word lists for categories to skip and to check (`semantic_preferences.includeWords`): with any category to check saved, email using none of its words is skipped before Gemini |
| #108 (contains #104–#107) | 12:07 PM | #104: a category to check can stand in for a sender or domain, and saving settings clears stale unfinished scan work. #105: Save settings returns to the dashboard and says what changed. #106: New and Unread cards and "N new" counts. #107: agent rule to draft updates for every affected issue. Also PRs #36 and #37 (rebased, migrations renumbered) and every-minute incremental automatic checks while the app is open |
| #110 | 3:55 PM | Gmail's 204 No Content (no matching messages) treated as an empty result, not a network error; automatic checks retry passing problems with a growing wait and never stop for them; specific Gmail error codes; one message per stop; compact status line; Settings leave dialog and bottom exit; expandable "About these filters"; "View details" placement; New labels after an empty first load; several tabs kept in step; skipped emails counted once per check |
| #109 | 4:14 PM | "Gaps from production practice" in [safety and privacy](docs/safety_privacy.md) |
| #111 | 4:15 PM | Supabase CLI 3.0 → 3.1 (run `npm ci` in `app` once; a stack started by 3.1 can't be restored by 3.0) |
| #35 | 4:27 PM | Product sign-in always shows Google's account picker (`prompt=select_account`); November 9 hosted records |

**Hosted changes on November 12** (project `IS492_c3`), each approved by Matthew in chat and run by a Claude Code session:

- About 10:40 AM: migration `20261111000000_topic_to_check_words` applied; `gmail_scan` and `analysis_email` redeployed; then #103 merged.
- About 12:05 PM: migrations `20261112000000_topics_without_senders`, `20261112001000_scan_cooldown_and_batch_stops`, `20261112002000_auto_scan_preference` and `20261112010000_incremental_scan_window` applied (a dry run showed exactly these four); both functions redeployed; then #108 merged. #36's and #37's migrations, first numbered `20261110000000`/`20261110010000`, were renumbered to run after production's, so those old numbers were never applied to hosted.
- About 1:15 PM: one read-only query of `private.gmail_scan_work` (times, counts and error codes only) to diagnose the "network error"; no content read.
- About 3:50 PM: both functions redeployed from #110's branch; no migrations (dry run: up to date); then #110 merged.

Hosted now has 30 migration versions, through `20261112010000`. No secrets or feature flags were changed.

**Verification:** offline suites 214/214 and 56/56 at #110, type-check and build, GitHub CI and the Vercel production deploy on each merge. Matthew browser-checked locally, on a database rebuilt on November 12 from all migrations in production's order: Settings save, exits and dialog; categories without senders; the compact line; New and Unread labels; "View details"; quiet automatic checks after the 204 fix; several tabs. Not checked: the live site after each deploy (beyond Vercel's build), a real Gmail outage (covered by tests), the account picker in a browser, pgTAP and `deno check`.

**Local live check (reported by the scanning session from stored scan state; not re-checked for this record):** Matthew's local scan that finished at 23:12 UTC on November 12 (5:12 PM Central) covered an incremental window of about 6 minutes and was recorded as a complete check, so the incremental every-minute checks ran against real Gmail locally. Not confirmed by that stored state: the full 7-day recheck after a settings change or Gmail reconnect, the one-minute timing, and the "Checked just now · no new email" line. **Limit:** a message that fails all its attempts during a complete check is not tried again until a settings change or Gmail reconnect starts a full 7-day check; the activity panel says so, and it is listed in [safety and privacy](docs/safety_privacy.md#honest-limits).

**Decisions recorded today:** categories to check are literal word lists that narrow what reaches Gemini, and with no sender they decide which senders are checked (this supersedes the "meaningful topics, not literal terms" line in the [plan](IMPLEMENTATION_PLAN.md)); participants will not connect their own email (#94); scored study tasks use one standard setup with automatic scanning off, and an optional, logged exploration follows (#58, #59, #60, #101).

**Still open:** PRs #36 and #37 are replaced by #108, and both were closed on November 12. Calendar's latest work is on branch `claude/calendar-designed-ui` (PR #116, not merged), rebased onto `main` on November 13, with remove, read, update and an all-tasks status read added on November 15 and the Calendar screens built the same day; offline checks pass, and create, update, remove and the screens were partly checked in a local browser against Google, with the cases listed under November 15 still not run live (see #44, #45, #46). Its migration is applied locally only; nothing Calendar is on `main` or hosted; the Calendar decision is due noon Tuesday November 17. The study freeze starts Tuesday November 17 (evening).

**Docs record (November 12, evening):** branch `mzheng/docs-nov12` (unpushed when written) brought the living docs up to date with this release and added [Checkpoint 4](<../Checkpoint 4/README.md>). A second review on branch `claude/docs-review-fable-65324d`, on top of it, then removed four statements from the CP4 plan that a public repository shouldn't carry and corrected stale lines in this file, the handoff, the implementation plan, `INSTALL.md`, the local setup guide, safety and privacy, the root README and the CP4 plan. Docs only; no code, hosted or board changes. Verified: PR merge times, issue numbers and the board against GitHub; migration names, limits and line counts against the code; relative links and anchors; `git diff --check`. Not run: the test suites (no `node_modules` in the review worktree). A later one-line correction on branch `mzheng/current-state-pr37` (unpushed when written) records that PR #37 was closed on November 12 (5:25 PM Central), where this file had said it should be closed; verified against GitHub and with `git diff --check`.

**#51 browser-check fixes (November 12, late evening):** branch `mzheng/narrow-details-onboarding-summary` (unpushed when written; not merged or deployed). A local browser check of `main` for #51 found two bugs, fixed here. (1) "View details" was hidden on suggestion, task and proposed-change cards at window widths of 1050px or less (a rule from the designed CSS), with no menu equivalent, so a card's sender and evidence couldn't be opened; it now shows at every width, and at phone width it sits under the card text with the ⋮ menu kept at the top right (`real-dashboard.css`). (2) With only a category to check, onboarding's review step said "Included senders and domains: None, so nothing will be processed", contradicting #104; it now says any sender you haven't excluded is checked for your categories' words (`noSendersLabel` in `scanSetup.ts`). Verified: offline suites 214/214 and 56/56 (a new assertion for the label), type-check and build; in the browser, locally with fictional users and seeded data, "View details" visible and opening the source email at 1024, 900, 760 and 390px, Passive cards unchanged, and the new onboarding label. Not checked: the live site. A card's text can still overflow at phone width (a proposed-change link; existing, for #100).

**November 15 (docs only), branch `mzheng/claude-md-prompting`:** [CLAUDE.md](../CLAUDE.md) was
rewritten for clarity: a numbered reading order, a reason given with each rule, "ask first"
and "report offline and live results separately" stated as instructions, and plainer terms. The
rules themselves are unchanged and still live in [AGENTS.md](../AGENTS.md). Verified: every link
in the file resolves and `git diff --check` is clean. No code changed and nothing was run.

**November 16, study test sender (#57), branch `mzheng/study-sender-and-reset` (unpushed when
written; not merged or deployed):** a send script for the fictional study inboxes,
`npm run study:send -- --inbox A [--send]` in [app/study](app/study/), and the runner's page
[loading_inboxes.md](<../Checkpoint 4/docs/study_materials/loading_inboxes.md>). The script
reads one Markdown file per email from `inbox_a/emails/` or `inbox_b/emails/`, sends only the
files marked `sender: test-sender` over Gmail SMTP as the signed-in test sender, lists the rest
as "send by hand", is a dry run unless `--send` is given, and takes addresses and the app
password only from the environment or a Git-ignored `.env.study`. Decisions by Matthew on
November 16: the test sender is the team's existing development test account, and the study
uses inboxes A and B only, with no spare inbox. **Verified offline only:** `npm run test:study`
15/15 (fake transport and a loopback fake SMTP server), and a dry run that stops with "the
inbox email folder does not exist yet" because #62 and #63 have not added their files.
**Not verified:** no email has been sent with the script, so the Gmail sign-in, delivery,
threading and inbox order are untested; the email file format is not yet agreed with the
owners of #62–#64. Nothing hosted changed.

## Gmail phases

| Phase | Code | Verification and remaining gate |
| --- | --- | --- |
| 1: permissions/settings | Exact sender/domain access, subject exclusions, separate semantic preferences, legacy phrase review, context defaults/ranges | Offline and local database/API checks pass; existing saved context preserved |
| 2: retrieval/coordination | Bounded metadata-first retrieval, independent context permissions, per-message failure handling, explicit continuation | Injected tests and local coordination checks pass. Real Gmail retrieval worked in live testing; scan-time rate limits were not exercised live |
| 3: extraction/task context | Versioned Gmail schema, per-item topic relevance, bounded same-thread task candidates, edit/cancel proposals | Fictional injected tests pass. The real model accepted the schema on 15 fictional emails, which shows the workflow runs, **not extraction accuracy** |
| 4: persistence | Gmail identities, budgets/leases/cache, revision/permission fencing, proposal review/rebase, re-extraction dedupe | PGlite and actual local Auth/PostgREST with an injected model pass; live saved results, reuse and dedupe confirmed on fictional mail |
| 5: product UI | Restyled signed-in `ManualWorkspace` with connection/settings, scan/status/backlog, stored review, before/after changes, source email history and ICS export on accepted tasks, and an Information tab with executive summaries, a Gmail link and read state remembered only in that browser. `App.tsx` routes signed-in users there, so the designed onboarding and dashboard remain sample-only | Workspace browser-checked with seeded fictional accounts: review, reload, stale rebase, cancellation, account switching. Google sign-in and real scans exercised in live testing. One all-day and one timed ICS import were tester-reported as correct in Google Calendar. **Not complete: real data and onboarding are not yet connected to the designed dashboard.** Onboarding work is on `claude/onboarding-connect-0e9360` at `91234dd`, not merged. Onboarding preview `91234dd` is ready, with its remaining checks still pending. The workspace also has no Waiting For view: those records are saved but not displayed |
| 6: live local acceptance | Executed with a dedicated test mailbox on fictional mail | Real Gmail → Gemini → storage → review works, including a correctly targeted deadline-change proposal and the OAuth lifecycle checks. Results and findings are in [UC8](docs/use-cases.md#uc8-real-gmail-to-review-workflow). **Not run live:** settings changed during a scan, rate limits, wrong-account connection, expired or replayed OAuth state, domain and subdomain rules. Fixes after the live run have automated coverage only |
| 7: automatic scans | Opt-in automatic checks while the app is open (user decisions, November 10 and 12): a check starts when the dashboard opens and again one minute after the previous one finished; a saved backlog is always continued first. Each new check is incremental (migration `20261112010000_incremental_scan_window`): it covers email since the last complete check with a 5-minute overlap, and the full 7 days for the first check or after a settings, storage-generation or Gmail-reconnect change. Stops at the daily allowance, a non-limit error, three batches without progress or Stop. Chosen in onboarding or Settings (`scan_auto_scan_save`, which does not bump the settings revision). No server schedule; nothing runs with the app closed | Offline tests only (PGlite window rule, pure scheduling functions); not checked signed in or live. No schedule authorized or installed |

Empty semantic inclusions mean no topic inclusion restriction within source-permitted
content; skipped topics still apply. The user explicitly accepted that behavior.

**Skipped topics block before Gemini (November 9, user decision).** Each skipped topic is a
literal word list checked in backend code before any model call; a matching email (subject,
body, earlier thread message or existing-task context) is never sent to Gemini. Suggested
topics turn on starter lists; a typed word blocks that literal word. Code, migration
`20261109200000_private_topic_words` and offline tests were merged into
`integration/designed-frontend` (PR #31) on November 9. That migration is **not applied**
locally or on hosted, and pgTAP and Deno checks were not run for it. Designed-UI word-list
editing is a separate follow-up.
Edit/cancel proposals use conservative review and stale-target rebase; that was the
recommended option and was not separately confirmed by the user. **The user explicitly
decided** that ambiguous updates show the source and let the user enter what is correct. No source inclusions
means no processing, regardless of semantic topics.

## Source email access: naive implementation

**This is deliberately a naive implementation for now, chosen by the user.** Users see a
saved excerpt and metadata in InboxToTask and open the full email through a Gmail link.
The app does not fetch or display email bodies on demand.

- [`gmail_task_source_links`](app/supabase/migrations/20261106030000_gmail_task_source_links.sql)
  returns each task's sources (created, updated or cancelled by), including after the
  30-day expiry of excerpts and proposals. [SourceEmails](app/web/src/SourceEmails.tsx)
  renders them in `ManualWorkspace`. The designed dashboard does not use them yet.
- **Known limitations:** the `#all/<message_id>` URL is not a documented Google contract
  and could stop working; it opened the right conversation on real mail in one tester-reported check. Gmail opens the whole conversation, including excluded
  messages and later replies. Deleting a source here does not affect Gmail. A deleted or
  moved email gives a Gmail error. Details of a cited earlier message come from
  `permission_metadata`, which a re-scan overwrites; the link then falls back to the
  scanned message. Lookups cover the 200 tasks the workspace loads.
- **Verification:** PGlite and actual local Auth/PostgREST pass, and a browser check with seeded fictional data shows task sources. Source lists on real tasks were not checked live.

## Local migration and feature state last observed

- **November 9 migrations** (all on `main`; PR #26 merged the designed frontend there):

  | Migration | From | Local | Hosted |
  | --- | --- | --- | --- |
  | `20261109000000_onboarding_preference_limits` | PR #29 | Not applied | Applied November 9 |
  | `20261109000100_calendar_preview_replace` | PR #29 | Not applied | Applied November 9 |
  | `20261109120000_task_return_to_review` | PR #28, corrected by #32 | Applied, corrected function re-run (see below) | Applied November 9, corrected version |
  | `20261109200000_private_topic_words` | PR #31 | Not applied | Applied November 9 |
  | `20261109220000_source_delete_quotes_and_boundary` | Fixes the two open defects (below) | Applied (local database rebuilt November 12) | Applied November 9 (seen in `migration list` that evening) |
  | `20261111000000_topic_to_check_words` | Word lists for categories to check (#103) | Applied (rebuilt November 12) | Applied November 12 |
  | `20261112000000_topics_without_senders` | A category to check can stand in for a sender; saving clears stale scan work (#104) | Applied (rebuilt November 12) | Applied November 12 (#108) |
  | `20261112001000_scan_cooldown_and_batch_stops` | 30-second scan cooldown; a planned per-batch stop counts as successful (F6); PR #36 renumbered | Applied (rebuilt November 12) | Applied November 12 (#108) |
  | `20261112002000_auto_scan_preference` | Saved opt-in for automatic scanning while the app is open; PR #37 renumbered | Applied (rebuilt November 12) | Applied November 12 (#108) |
  | `20261112010000_incremental_scan_window` | New checks cover email since the last complete check (5-minute overlap); status reports the window | Applied (rebuilt November 12) | Applied November 12 (#108) |

  The two #29 migrations are dated earlier than one already applied locally, so the local
  database needs `migration up --include-all`. Before the hosted push, read-only aggregate
  counts found no rows that the onboarding limits or the topic-word backfill would reject
  (3 settings rows, no excluded topics) and no pending calendar operations. After it,
  `migration list` showed all 24 applied, and the backfill gave every settings row `blockedWords`.
- **`20261109120000` was corrected in place** before reaching hosted: Return to review failed
  with a foreign-key error for a task that had an accepted incoming update, because that
  update kept `approved_task_id`. A PGlite test now covers it. Because the local database had
  already applied the earlier version, the corrected file was re-run there with
  `supabase db query -f` on November 9 (it only replaces the function). Any other database
  that applied the earlier version needs the same.
- **Local (November 12):** Matthew's local database was rebuilt from all migrations on November 12
  (`supabase stop --no-backup`, then `start` from the release branch), so all 30 are applied, in
  production's order. Local test data from before then is gone.
- **Hosted (`IS492_c3`) has migrations through `20261106040000_gmail_token_recheck`** (20 versions),
  applied November 6 at 03:26 and 03:50 UTC; see the [first](docs/hosted-backup-verification-2026-11-06.md)
  and [second](docs/hosted-rollout-2-manifest-2026-11-06.md) rollout records. The four
  migrations above were pushed on November 9, so hosted has 24 versions through
  `20261109200000_private_topic_words`. `20261109220000_source_delete_quotes_and_boundary` was
  also applied later on November 9, so hosted has 25 versions. On November 12 five more were
  applied (see [November 12](#november-12-2026-cp4-study-release)), so hosted has 30 versions.
- **Hosted Gmail connection and scanning are live (checked November 9, about 6:30 PM Central).**
  `google_connection`, `google_callback` and `gmail_scan` were deployed at 00:20 UTC on November 10
  (6:20 PM Central November 9), alongside `analysis_email`. Read from secret digests, not values:
  `ENABLE_GOOGLE_CONNECTION` and `ENABLE_GMAIL_SCAN` are true; `ENABLE_GMAIL_RETRIEVAL`,
  `ENABLE_FIXTURE_EXTRACTION` and `ENABLE_STORAGE_CLEANUP` are false; a Gemini key and Google
  OAuth/token secrets are set. Matthew approved the deployment in chat; a Claude Code session ran it, applying `20261109220000`, setting the function secrets and deploying the three functions (corrected November 9: an earlier version of this note said it was unrecorded). On the live site, anyone who
  signs in can connect Gmail and, after saving consent, send permitted email to Gemini.
  Signed-in hosted scanning has no recorded verification.
- **Unused Groq secret removed from hosted (November 9, 10:16 PM Central).** `GROP_API_KEY` was
  deleted with `supabase secrets unset`, approved by Matthew in chat; 20 secrets remain. No code on
  `main` reads it. Only the legacy Groq `analysis_email` deployment (version 7, October 30) did,
  and it is called only by the local-development `/storage` route, which production builds omit.
  The key itself should also be revoked in the Groq console.
- **Personal accounts removed from hosted (November 9).** A teammate's sign-in landed on their
  personal Google account (see the sign-in note below), and Disconnect appeared to fail. The user
  deleted those accounts from hosted Auth, which cascades to their connection, settings and scan
  rows. That cannot revoke the Google grant or recall anything already sent to Gemini; the
  teammate was advised to remove the app on Google's third-party access page. Whether a scan ran
  on that account was not checked before deletion.
- **Sania reports that signed-in hosted settings checks are complete and passed,** on a preview of
  `ffa915a`, an older commit than current `main`: save/reload, sign-out/in, stale-tab conflict and isolation
  between two accounts in the tested workspace flows. These were not RLS penetration tests and did not
  cover onboarding or chip screens. Review, manual resolution and source links remain unverified
  signed-in on hosted, because there was no Gmail data there at the time. Sign-in silently reuses the current
  Google account, so unassisted account switching is not established. The fix that adds
  `prompt=select_account` to product sign-in was merged on November 12 (#35); it is not yet
  browser-checked on the live site. After the PR #22 merge, Sania reports production sign-in passed and accounts A and B went straight to the workspace without saving. Workspace tabs, settings and stale-save behavior on the newest code remain unconfirmed. Details are in the
  [rollout record](docs/hosted-backup-verification-2026-11-06.md#signed-in-checks-reported-by-sania).
- **Google Calendar moved to CP4 by user decision.** It is not in CP3, on `main` or on hosted. The
  latest work is on branch `claude/calendar-designed-ui` (pushed November 13 as PR #116, not merged): event creation, the
  reconnect fixes with a Calendar-only disconnect, and the dashboard choice.
  **November 13 (#44):** the branch was rebased onto `main` at `455cba4` (three commits, plus one
  for the items here). The dashboard, onboarding and settings edits were reapplied to the files
  `main` split out of `App.tsx`. The migration is renumbered to `20261113000000_calendar_events`,
  after `20261112010000`; no later migration defines `google_connection_service`, which it wraps.
  One more reconnect defect was fixed: after a token-key change, Disconnect could not open the
  saved credentials and left the account in "disconnecting", which also blocked Reconnect. It
  now finishes, and tells the user to remove the app's access in their Google Account because
  Google could not be told. The three reconnect cases (Gmail-only reconnect after full
  revocation, reconnect after a key change, a revoked refresh token never reused) have offline
  tests at the handler level and, for the first and the cleared credentials, against the
  migrations in PGlite. Verified November 13: `npm test` (222 + 56 pass), `npm run test:calendar`
  (19 pass), `tsc --noEmit`, the web build and `deno check` of every function. Not done: any
  browser check, any run against the local stack or Google (#46), and the migration is not
  applied anywhere. The Calendar plan's recorded SHA-256 predates the November 9 migration change.
  The older rebase is on the unmerged GitHub branch `mzheng/calendar-rebase` at `da4417d`, with
  migration `20261106050000`; it still has the reconnect failures found in review and is
  superseded. ICS export is the CP3 calendar path and writes nothing to Google.
  **November 15 (#45, backend only), same branch, after merging `main` at `909a951`:** the
  intended behavior and the backend contract are now in [Calendar behavior](docs/calendar-behavior.md).
  The `calendar_event` function now takes an `action`: `create` (the default, unchanged), `read`,
  `update` and `remove`.
  - **Remove** deletes the app's event from the primary calendar without guest notifications. An
    event already gone in Google counts as removed. A confirmed removal deletes the record, so
    adding the task again makes a new event with a new ID. A lost answer leaves the state
    `removing`, and removing again is safe.
  - **Read** fetches the event from Google and returns its current details and version, saving
    them for the task card. An event deleted in Google is reported as removed and its record
    dropped.
  - **Update** changes the same event in place, sending the version that was read, so Google
    refuses the write if the event changed meanwhile (`CALENDAR_EVENT_CHANGED`). A lost update
    stays `updating` and is settled by retrying the same values; a marker on the event shows
    whether the earlier attempt landed, so it is never written twice.
  - **Rules:** create and update need an open task; read and remove also work on completed,
    cancelled and deleted tasks. While a create, update or removal is unsettled, the others are
    refused with `CALENDAR_BUSY`.
  - **Status for the cards:** `calendar_event_statuses()` returns the signed-in user's events for
    all tasks in one read, from stored records only.
  - **Migration:** `20261113000000_calendar_events` was changed in place (states `updating` and
    `removing`, two columns, the new actions and the new function). It is not applied on hosted.
  - **Local stack, November 15 (approved in chat):** the local database was dumped and the dump
    restored into a scratch database with matching row counts, then `20261113000000` was applied
    locally with `supabase migration up`. The local stack was restarted from this branch's
    worktree, so its functions are this branch's, with `ENABLE_CALENDAR_EVENTS=true` and
    `VITE_CALENDAR_EVENTS_ENABLED=true` in the untracked local env files. Checked: the sign-in
    page loads with no console errors and `calendar_event` answers 401 without a session. No
    Calendar action has been run against Google yet. Later changes to this migration need the
    local copy replaced, not patched.
  - **Verified offline November 15:** `npm test` (222 + 56 pass, with a new assertion that
    approving a task creates no Calendar record), `npm run test:calendar` (31 pass, 12 of them
    new handler and database tests), `tsc --noEmit`, the web build and `deno check` of every
    function. Checked against Google's Calendar API reference: the delete, patch and get
    endpoints, `sendUpdates=none`, that the requested permission covers all three, and that a
    stale `If-Match` returns 412.
  - **Two dialog fixes, November 15, found in a local browser review of Add to calendar:**
    - A dialog taller than the window was cut off at the top and bottom and could not be
      scrolled, which hid its title, Close and buttons (the cut-off reported on #45 for the
      calendar-file form). The backdrop (`.overlay` in `index.css`) now scrolls, and the dialog
      centers itself only when it fits. This applies to every dialog.
    - The "All-day event" checkbox sat alone on its own line above its label. In the
      dashboard's embedded forms it now sits beside the label (`real-dashboard.css`).
    - Checked in the browser on the local stack at 1280x800 and 583x566, all-day and timed:
      24px above the dialog at the top of the scroll and 24px below it at the end, with no
      console errors. Other dialogs and the remaining review findings (button styles, wording,
      the time zone box, focus on open) were not changed; they belong to the form redesign in
      #45.
  - **No Reload status button, November 15** (`TaskCalendarControl.tsx`): the Add to calendar
    form now checks status by itself when it opens, after a failed attempt, when the user
    returns to the tab, and every 4 seconds while a request is in progress. A lost result shows
    "We couldn't confirm whether the event was added" with the fields locked and a **Retry**
    button; a request still in progress disables the button and says "Checking…". A request
    that has not settled after 100 seconds is treated as lost.
    - Checked in the browser on the local stack, by placing a temporary record for the one
      local task and removing it afterwards: the idle form has no Reload status button; an
      `unknown` record showed Retry with locked fields after a return to the tab; an
      `executing` record disabled the button; and after the record was removed the form went
      back to normal without a click. No console errors. Retry itself was not pressed, so
      nothing was sent to Google.
  - **Time zone is text, not a field, November 15** (`TaskCalendarControl.tsx`): the editable
    "Time zone (IANA)" box is gone. A timed event shows "Times are in Central Time." under the
    times; an all-day event shows nothing, because Google stores it as a date. The zone still
    comes from the task's deadline, or else the browser. A saved draft with an empty or unusable
    zone falls back to the task's. Checked in the browser on the local stack, all-day and timed,
    with no console errors.
  - **Start and end time share a row, November 15** (`TaskCalendarControl.tsx`,
    `real-dashboard.css`): the two time fields sit side by side, with End date under them; they
    stack when the dialog is too narrow for both. Checked in the browser on the local stack at
    the pane's width and at a 360px-wide window, with no console errors.
  - **Add task notice, November 15** (`RealDashboard.tsx`): adding a suggestion as a task now
    says "Task added." and no longer adds "No Calendar event was created." Approval still
    creates no event; the notice just stops mentioning Calendar. Type-checked and built; not
    clicked in the browser, since that would approve a saved suggestion. The notices after a
    task edit, an approved change and a cancellation still end with "No Calendar write was
    authorized."
  - **The form asks Google when it opens, November 15** (`TaskCalendarControl.tsx`): when the
    app's record says a task has an event and Calendar is authorized, the form calls the `read`
    action on open and on each automatic check. An event deleted in Google drops the record,
    and the form says "This event was deleted in Google Calendar. You can add it again." and
    offers Add to Google Calendar again. Without Calendar access, or if Google cannot be
    reached, the saved details are shown as before.
  - **First live results, November 15, local stack with a real Google account** (done by hand
    in the browser, not by a script):
    - *Create:* an event was added from the form and its record saved as `succeeded`.
    - *Read after a deletion in Google:* the event was then deleted in Google Calendar. Before
      the change above, the form kept saying the task was already in the calendar. After it,
      opening the form called `read`, the record was dropped (checked in the local database)
      and the task could be added again. So a deleted event is detected; whether Google
      answered 404, 410 or `cancelled` was not recorded.
    - *Not yet run live:* update, remove, a lost result and its retry, and the three reconnect
      cases (#46).
  - **Not verified:** apart from the two live results above, no Calendar action was run
    against Google (#46). Assumed and not confirmed by Google's reference: that deleting an already-deleted
    event answers 404 or 410, that a deleted event read by ID comes back as `cancelled`, and that
    a patch with explicit nulls clears the old date or time when an event changes between
    all-day and timed.
  - **Against [Calendar behavior](docs/calendar-behavior.md):**
    - *Built in the backend:* everything under "Backend contract for the designed screens"
      except the task deadline's `endTime`: the four actions, their results, the event states,
      the two status reads, the error codes and who may do what. Connecting, disconnecting and
      creating an event were already on the branch.
    - *Frontend built later on November 15 (#45):* see "Calendar screens" below. It replaces
      the earlier Add to calendar form, which only created.
    - *Not started:* the end time in extraction (`endTime`, with its schema, prompt and migration
      changes) and the study reset script (#101).
    - *Disconnected accounts:* the status reads keep listing a task's event after Google is
      disconnected, so its "Added to Google Calendar" line stays. Connecting a different Google
      account hides the earlier account's events.
  - The form's draft holds one day for an all-day event, so an event the user stretched over
    several days in Google reads back as its first day.
  - **Calendar screens, November 15 (#45), same branch:** the screens described in
    [Calendar behavior](docs/calendar-behavior.md) are built on the backend actions above.
    - *New files:* `calendarForm.ts` (the form's fill-in rules and the follow-up rules, pure
      functions), `calendarApi.ts` (calls to `calendar_event` and the all-tasks status read),
      `calendar-cards.css`, and `tests/calendar-form.test.mjs` (in `npm run test:calendar`).
    - *Event dialog* (`TaskCalendarControl.tsx`): the Add form opens with All day unticked,
      the task's date, a start only when the task has a time and an end only when there is a
      start; blank required fields are outlined and the button stays disabled until they are
      filled; a read-only "Calendar · Primary only" row shows the connected account. For a task
      with an event it becomes Manage event: Google's current details, Save changes (same
      event), Open in Google Calendar, and Remove from calendar with a confirmation. It handles
      an event changed or deleted in Google, a lost update or removal with Retry, and missing
      Calendar permission. A lost update can be retried only from the browser that sent it,
      because the status reads do not return the pending values.
    - *Dashboard* (`RealDashboard.tsx`): cards show "Added to Google Calendar" with the saved
      date and time and a Manage event button, in Active and Completed; completed and cancelled
      tasks get Open and Remove only. After a task's deadline changes, a follow-up offers to
      move the event (one click only for an "on" deadline with a time), review it, or keep it.
      After an approved cancellation it asks whether to remove the event. Moving a task with
      an event to Suggestions or Dismissed asks about the event first. The three notices that
      ended "No Calendar write was authorized." drop that ending when Calendar is enabled.
    - *Onboarding* (`GoogleConnectionPanel.tsx`, `Onboarding.tsx`): the Connect step has an
      unticked checkbox that asks Google for Calendar on the same consent screen.
    - *Verified offline:* `npm test` (222 + 56 pass), `npm run test:calendar` (45 pass, 14 of
      them the new form tests), `tsc --noEmit` and the web build.
    - *Verified in the browser on the local stack, against Google, with events titled
      `[TEST]` that were removed afterwards:* the Add form for a date-only task (All day
      unticked, times blank and outlined, button disabled, nothing filled after typing a
      start); creating a timed event; the card line and Manage event; Save changes with the end
      following a moved start; the deadline follow-up with a one-click move for an "on"
      deadline, and without one for a "by" deadline; Review calendar event opening on the new
      date; Remove from calendar with its confirmation; a completed task keeping its line with
      Open and Remove only; and the question before moving a task with an event back to
      Suggestions (cancelled, so the task stayed). No console errors. Two defects found and
      fixed during this: the review dialog lost its new schedule when the dialog read Google a
      second time, and two notices ended with a doubled period.
    - *Backend actions run live through the page before the screens existed:* read, update
      both ways between all-day and timed (so the explicit-null patch works), a stale version
      refused with `CALENDAR_EVENT_CHANGED`, a second create returning the same event, a wrong
      task revision refused, remove, `CALENDAR_NOT_ADDED` after removal, and adding again as a
      new event.
    - *Not checked live:* the cancellation follow-up (it needs a cancellation approved on a
      task with an event), "Remove event and continue" and "Keep event and continue", the
      onboarding checkbox (the test account already has Calendar, so it is hidden), an event
      changed or deleted in Google while Manage event is open, a lost result and Retry,
      missing Calendar permission, and the three reconnect cases (#46).
    - *Side effect of the test:* the local task "Review the advisor notes…" was edited and
      edited back, so its deadline wording now reads "Entered by you after reading the source
      email." and its revision is 4. Its date, time and timing are as before.
    - *Event links, November 16, same branch* (`RealDashboard.tsx`,
      `calendar-cards.css`): the card's calendar line and a "View in Google Calendar" link on
      the notice after adding, saving or moving an event open the event in a new tab. A plain
      click first asks Google whether the event still exists, and returning to the tab
      re-reads that one event; see
      [Calendar behavior](docs/calendar-behavior.md#what-the-task-card-shows). Nothing opens by
      itself. Onboarding's review step now says Calendar is optional when Calendar is enabled.
      - *Verified:* `tsc --noEmit`, the web build and `npm run test:calendar` (45 pass). In the
        browser on the local stack with a `[TEST]` event, removed afterwards: both links appear
        with the event's address; a click opens a tab, reads the event and sends the tab to it;
        returning to the tab reads that event once and not again; no console errors.
      - *Checked with a simulated backend answer, not a real one:* an event deleted in Google
        (the tab closes and the notice says it was deleted) and Google unreachable (the saved
        link opens and no error shows).
      - *Not verified:* the event page opening in Google Calendar itself (the test browser
        blocks tabs opened by automated clicks), the card returning to Add to calendar after a
        real deletion in Google, and a browser that blocks the new tab.
    - *Documentation, November 16:* every tracked document that describes Calendar was brought
      in line with this branch: the handoffs, the root README, the implementation plan,
      architecture, use cases, safety and privacy, local setup, the Supabase and web guides, the
      two environment templates' comments and the CP4 plan. Dated reports keep their history,
      with a dated note where one would now mislead. They say what is built on the branch and
      what was verified; none claims Calendar is on `main` or hosted. No requirement was ticked.
      Checked: every added link resolves and `git diff --check` is clean.
    - *Agent guidance, November 16:* the root [AGENTS.md](../AGENTS.md) gained a Calendar
      entry point, `npm run test:calendar` in its validation commands and the rule that each
      Calendar write follows its own confirmation, with the reason. The Supabase guide now lists
      `calendar_event` and what keeps a Calendar write safe to retry; the web guide says which
      rules have offline tests. Each rule states what to do and why. Checked: every added link
      resolves. No code changed.
- **The two defects to fix before hosted scanning now have a fix in
  `20261109220000_source_delete_quotes_and_boundary`**, applied on hosted November 9 and locally on November 12: deleting a Gmail
  source now also clears quotes of that message in other sources' evidence, and
  `valid_task_fields` rejects a null or non-string boundary. PGlite tests cover both and failed
  without the migration. The defects are described in the [second rollout record](docs/hosted-rollout-2-manifest-2026-11-06.md#open-defects-not-blocking-this-rollout).
- `ENABLE_GMAIL_SCAN` was set to false after live testing, then turned on the night of November 5 for the local demo. No scan has been confirmed since; recheck it, and turn it off after the demo. A Gemini key remains in the private local
  function configuration. Retrieval-only mode, fixture inference and cleanup remain disabled.
- The local Google token key was rotated after being exposed in a development session's output.
  Stored local Gmail connections were cleared, so local accounts must reconnect. The hosted key's
  status is not recorded here, because this repository is public.
- `GOOGLE_RETURN_URL` in the private local file points at the product root.
- The demo's raised daily request limit (50) was lost when the local database was rebuilt on November 12; local accounts are back to the default 20. Hosted defaults are unchanged.

## Latest evidence and next action

PR #22 was merged to `main` at `59461b6` on November 5 at about 11:01 PM Central, by the user's decision. GitHub CI passed on that merge commit, and production returned a new build. Earlier local runs, not repeated at the current tip: offline suite **168/168**; pgTAP **71**; unmodified local API suite **15 groups, zero model calls**, with scanning disabled. Live results are recorded separately in [UC8](docs/use-cases.md#uc8-real-gmail-to-review-workflow).

Sania reports that Vercel's production branch is `main` (Settings > Git), and that rollback to `e2b0009` is available after the PR #22 merge. Treat every merge as a production deployment. A rollback does not undo migrations.

Next (as of November 12):

1. Check the live site signed in: account picker, Settings save and exits, a categories-only scan, New/Unread labels, quiet automatic checks (#54, #51).
2. Calendar (branch `claude/calendar-designed-ui`, PR #116, not merged): the rebase (#44) and the screens (#45) are built; finish and verify the event links, commit, run the remaining live cases and the three reconnect cases locally (#46), then the noon November 17 decision (#53). Applying the migration on hosted and turning the flags on there need separate approval.
3. Study materials (#58–#64, #101) to match the release; hosted items left in #52 (security review, OAuth test users for the study inboxes, a model spending limit).
4. Close PR #37 (#36 is closed). Background scanning with the app closed (#49) stays after the study.

CP4 deliverables and the evaluation design are in [Checkpoint 4](<../Checkpoint 4/README.md>); the [CP4 plan](<../Checkpoint 4/CP4_PLAN.md>) was updated November 12 to the decisions above.

**Known CP3 gap:** the assignment's "all proposed core features" is not met. Not built: automatic scans, real data in the designed dashboard, a Waiting For view in the workspace and account deletion. Calendar events moved to CP4. **CP4 update (November 12):** real data is in the designed dashboard and onboarding (#51), and automatic checks run while the app is open (#108, #110); scanning with the app closed and account deletion are still not built. Calendar events are built only on the unmerged branch `claude/calendar-designed-ui` (see November 15 above), off by default, and are not on `main` or hosted.
