# Current implementation and verification state

Updated the evening of November 5, 2026 (Central), after live local manual-scan testing, two
hosted database rollouts and the merge of PR #22 to `main` at `59461b6`. Migration state was
rechecked on November 9 (see below); other sections were not. This is the resumption index, not a claim that
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

## Gmail phases

| Phase | Code | Verification and remaining gate |
| --- | --- | --- |
| 1: permissions/settings | Exact sender/domain access, subject exclusions, separate semantic preferences, legacy phrase review, context defaults/ranges | Offline and local database/API checks pass; existing saved context preserved |
| 2: retrieval/coordination | Bounded metadata-first retrieval, independent context permissions, per-message failure handling, explicit continuation | Injected tests and local coordination checks pass. Real Gmail retrieval worked in live testing; scan-time rate limits were not exercised live |
| 3: extraction/task context | Versioned Gmail schema, per-item topic relevance, bounded same-thread task candidates, edit/cancel proposals | Fictional injected tests pass. The real model accepted the schema on 15 fictional emails, which shows the workflow runs, **not extraction accuracy** |
| 4: persistence | Gmail identities, budgets/leases/cache, revision/permission fencing, proposal review/rebase, re-extraction dedupe | PGlite and actual local Auth/PostgREST with an injected model pass; live saved results, reuse and dedupe confirmed on fictional mail |
| 5: product UI | Restyled signed-in `ManualWorkspace` with connection/settings, scan/status/backlog, stored review, before/after changes, source email history and ICS export on accepted tasks, and an Information tab with executive summaries, a Gmail link and read state remembered only in that browser. `App.tsx` routes signed-in users there, so the designed onboarding and dashboard remain sample-only | Workspace browser-checked with seeded fictional accounts: review, reload, stale rebase, cancellation, account switching. Google sign-in and real scans exercised in live testing. One all-day and one timed ICS import were tester-reported as correct in Google Calendar. **Not complete: real data and onboarding are not yet connected to the designed dashboard.** Onboarding work is on `claude/onboarding-connect-0e9360` at `91234dd`, not merged. Onboarding preview `91234dd` is ready, with its remaining checks still pending. The workspace also has no Waiting For view: those records are saved but not displayed |
| 6: live local acceptance | Executed with a dedicated test mailbox on fictional mail | Real Gmail → Gemini → storage → review works, including a correctly targeted deadline-change proposal and the OAuth lifecycle checks. Results and findings are in [UC8](docs/use-cases.md#uc8-real-gmail-to-review-workflow). **Not run live:** settings changed during a scan, rate limits, wrong-account connection, expired or replayed OAuth state, domain and subdomain rules. Fixes after the live run have automated coverage only |
| 7: automatic scans | Opt-in automatic checks while the app is open (user decisions, November 10 and 12): a check starts when the dashboard opens and again one minute after the previous one finished; a saved backlog is always continued first. Each new check is incremental (migration `20261111000000_incremental_scan_window`): it covers email since the last complete check with a 5-minute overlap, and the full 7 days for the first check or after a settings, storage-generation or Gmail-reconnect change. Stops at the daily allowance, a non-limit error, three batches without progress or Stop. Chosen in onboarding or Settings (`scan_auto_scan_save`, which does not bump the settings revision). No server schedule; nothing runs with the app closed | Offline tests only (PGlite window rule, pure scheduling functions); not checked signed in or live. No schedule authorized or installed |

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
  | `20261109220000_source_delete_quotes_and_boundary` | Fixes the two open defects (below) | Not applied | Not applied |
  | `20261112001000_scan_cooldown_and_batch_stops` | 30-second scan cooldown; a planned per-batch stop counts as successful (F6) | Not applied under this number (applied November 10 as `20261110000000`) | Not applied |
  | `20261112002000_auto_scan_preference` | Saved opt-in for automatic scanning while the app is open | Not applied under this number (applied November 10 as `20261110010000`) | Not applied |
  | `20261111000000_incremental_scan_window` | New checks cover email since the last complete check (5-minute overlap); status reports the window | Not applied | Not applied |

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
- All migrations through [gmail_token_recheck](app/supabase/migrations/20261106040000_gmail_token_recheck.sql)
  are applied to the local database, without reset.
- **Hosted (`IS492_c3`) has migrations through `20261106040000_gmail_token_recheck`** (20 versions),
  applied November 6 at 03:26 and 03:50 UTC; see the [first](docs/hosted-backup-verification-2026-11-06.md)
  and [second](docs/hosted-rollout-2-manifest-2026-11-06.md) rollout records. The four
  migrations above were pushed on November 9, so hosted has 24 versions through
  `20261109200000_private_topic_words`.
- **Hosted Gmail functions are not deployed.** Only `analysis_email` is deployed, and the scan,
  retrieval and Google connection flags are unset, so Connect Gmail and Scan cannot work on the
  live site.
- **Sania reports that signed-in hosted settings checks are complete and passed,** on a preview of
  `ffa915a`, an older commit than current `main`: save/reload, sign-out/in, stale-tab conflict and isolation
  between two accounts in the tested workspace flows. These were not RLS penetration tests and did not
  cover onboarding or chip screens. Review, manual resolution and source links remain unverified
  signed-in on hosted, because there is no Gmail data there. Sign-in silently reuses the current
  Google account, so unassisted account switching is not established. After the PR #22 merge, Sania reports production sign-in passed and accounts A and B went straight to the workspace without saving. Workspace tabs, settings and stale-save behavior on the newest code remain unconfirmed. Details are in the
  [rollout record](docs/hosted-backup-verification-2026-11-06.md#signed-in-checks-reported-by-sania).
- **Google Calendar moved to CP4 by user decision.** It is not in CP3 or on hosted. The rebase is on
  the unmerged GitHub branch `mzheng/calendar-rebase` at `da4417d`, with migration `20261106050000`, offline tests reported and no live test. That
  commit still has the OAuth reconnect failures found in review, which block its release:
  a Gmail-only reconnect after full revocation, reconnecting after a key rotation, and reuse of a revoked refresh
  token. ICS export is the CP3 calendar path and writes nothing to Google.
- **The two defects to fix before hosted scanning now have a fix in
  `20261109220000_source_delete_quotes_and_boundary`**, not yet applied anywhere: deleting a Gmail
  source now also clears quotes of that message in other sources' evidence, and
  `valid_task_fields` rejects a null or non-string boundary. PGlite tests cover both and failed
  without the migration. The defects are described in the [second rollout record](docs/hosted-rollout-2-manifest-2026-11-06.md#open-defects-not-blocking-this-rollout).
- `ENABLE_GMAIL_SCAN` was set to false after live testing, then turned on the night of November 5 for the local demo. No scan has been confirmed since; recheck it, and turn it off after the demo. A Gemini key remains in the private local
  function configuration. Retrieval-only mode, fixture inference and cleanup remain disabled.
- The local Google token key was rotated after being exposed in a development session's output.
  Stored local Gmail connections were cleared, so local accounts must reconnect. If hosted used
  the same key value, rotate it there too.
- `GOOGLE_RETURN_URL` in the private local file points at the product root.
- For the demo, the test account's daily request limit in the local database is 50, not the default 20. Hosted defaults are unchanged.

## Latest evidence and next action

PR #22 was merged to `main` at `59461b6` on November 5 at about 11:01 PM Central, by the user's decision. GitHub CI passed on that merge commit, and production returned a new build. Earlier local runs, not repeated at the current tip: offline suite **168/168**; pgTAP **71**; unmodified local API suite **15 groups, zero model calls**, with scanning disabled. Live results are recorded separately in [UC8](docs/use-cases.md#uc8-real-gmail-to-review-workflow).

Sania reports that Vercel's production branch is `main` (Settings > Git), and that rollback to `e2b0009` is available after the PR #22 merge. Treat every merge as a production deployment. A rollback does not undo migrations.

Next:

1. Collect Sania's pending results for workspace tabs, settings and stale saves on the newest code, and for onboarding preview `91234dd`.
2. Connect real data and onboarding to the designed dashboard, and make PR 20's chip screens reachable for signed-in testing.
3. Apply `20261109220000_source_delete_quotes_and_boundary` before any hosted Gmail deployment. That deployment and hosted scanning need separate approval.
4. In CP4, finish Calendar's OAuth fixes and review, then consider Phase 7 and the remaining live checks.

**Known CP3 gap:** the assignment's "all proposed core features" is not met. Not built: automatic scans, real data in the designed dashboard, a Waiting For view in the workspace and account deletion. Calendar events moved to CP4.
