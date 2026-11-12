# Current implementation and verification state

Updated the evening of November 12, 2026 (Central), after the CP4 study release: PRs #103–#111
and #35 merged to `main` (latest `6ae3356`), with hosted migrations and function deploys
recorded in [November 12](#november-12-2026-cp4-study-release) below. Older sections keep their
dates and were not re-verified unless marked. This is the resumption index, not a claim that
services are running. Check Git status and local runtime/migration state before new work.

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

**Still open:** PRs #36 and #37 are replaced by #108: #36 was closed on November 12, and #37 should be closed. Calendar's latest work is on the local, unpushed branch `claude/calendar-designed-ui` (see #44, #45); the Calendar decision is due noon Tuesday November 17. The study freeze starts Tuesday November 17 (evening).

**Docs record (November 12, evening):** branch `mzheng/docs-nov12` (unpushed when written) brought the living docs up to date with this release and added [Checkpoint 4](<../Checkpoint 4/README.md>). A second review on branch `claude/docs-review-fable-65324d`, on top of it, then removed four statements from the CP4 plan that a public repository shouldn't carry and corrected stale lines in this file, the handoff, the implementation plan, `INSTALL.md`, the local setup guide, safety and privacy, the root README and the CP4 plan. Docs only; no code, hosted or board changes. Verified: PR merge times, issue numbers and the board against GitHub; migration names, limits and line counts against the code; relative links and anchors; `git diff --check`. Not run: the test suites (no `node_modules` in the review worktree).

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
- **Google Calendar moved to CP4 by user decision.** It is not in CP3 or on hosted. The latest work
  (November 12) is on the local, unpushed branch `claude/calendar-designed-ui`: event creation, the
  reconnect fixes with a Calendar-only disconnect, and the dashboard choice; it needs a rebase onto
  current `main` (see #44). The older rebase is on
  the unmerged GitHub branch `mzheng/calendar-rebase` at `da4417d`, with migration `20261106050000`, offline tests reported and no live test. That
  commit still has the OAuth reconnect failures found in review, which block its release:
  a Gmail-only reconnect after full revocation, reconnecting after a key rotation, and reuse of a revoked refresh
  token. ICS export is the CP3 calendar path and writes nothing to Google.
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
2. Calendar: rebase `claude/calendar-designed-ui`, finish #44's reconnect checks, push and review before the noon November 17 decision (#53).
3. Study materials (#58–#64, #101) to match the release; hosted items left in #52 (security review, OAuth test users for the study inboxes, a model spending limit).
4. Close PR #37 (#36 is closed). Background scanning with the app closed (#49) stays after the study.

CP4 deliverables and the evaluation design are in [Checkpoint 4](<../Checkpoint 4/README.md>); the [CP4 plan](<../Checkpoint 4/CP4_PLAN.md>) was updated November 12 to the decisions above.

**Known CP3 gap:** the assignment's "all proposed core features" is not met. Not built: automatic scans, real data in the designed dashboard, a Waiting For view in the workspace and account deletion. Calendar events moved to CP4. **CP4 update (November 12):** real data is in the designed dashboard and onboarding (#51), and automatic checks run while the app is open (#108, #110); scanning with the app closed, account deletion and Calendar are still not built.
