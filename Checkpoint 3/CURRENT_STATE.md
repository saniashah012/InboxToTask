# Current implementation and verification state

Updated the evening of November 12, 2026 (Central), after the CP4 study release: PRs #103–#111
and #35 merged to `main` (latest `6ae3356`), with hosted migrations and function deploys
recorded in [November 12](#november-12-2026-cp4-study-release) below. Older sections keep their
dates and were not re-verified unless marked. Google Calendar events (PR #116) were merged to
`main` on November 16, and their migration and functions reached hosted the same day, switched
off, so the live site does not offer Calendar (see the November 16 entry below); their
development is recorded under November 13 to 16 in
[local migration and feature state](#local-migration-and-feature-state-last-observed). This is the resumption index, not a claim that services are running. Check Git status and local runtime/migration state before new work.

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

**Still open:** PRs #36 and #37 are replaced by #108, and both were closed on November 12. Calendar (PR #116) is on `main` since November 16, off by default; offline checks pass, and create, update, remove and the screens were partly checked in a local browser against Google, with the cases listed under November 15 still not run live (#46). Its migration and functions are on hosted since November 16, with the backend switch `ENABLE_CALENDAR_EVENTS` set the same day; the production web build still has `VITE_CALENDAR_EVENTS_ENABLED` unset and the Google Cloud Calendar setup is not done, so the live site does not offer Calendar; the rest is left in #53; the Calendar decision is due noon Tuesday November 17. The study freeze starts Thursday November 19 (night); it was moved from Tuesday November 17 (evening) at the November 16 team meeting.

**Docs record (November 12, evening):** branch `mzheng/docs-nov12` (unpushed when written) brought the living docs up to date with this release and added [Checkpoint 4](<../Checkpoint 4/README.md>). A second review on branch `claude/docs-review-fable-65324d`, on top of it, then removed four statements from the CP4 plan that a public repository shouldn't carry and corrected stale lines in this file, the handoff, the implementation plan, `INSTALL.md`, the local setup guide, safety and privacy, the root README and the CP4 plan. Docs only; no code, hosted or board changes. Verified: PR merge times, issue numbers and the board against GitHub; migration names, limits and line counts against the code; relative links and anchors; `git diff --check`. Not run: the test suites (no `node_modules` in the review worktree). A later one-line correction on branch `mzheng/current-state-pr37` (unpushed when written) records that PR #37 was closed on November 12 (5:25 PM Central), where this file had said it should be closed; verified against GitHub and with `git diff --check`.

**#51 browser-check fixes (November 12, late evening):** branch `mzheng/narrow-details-onboarding-summary` (unpushed when written; merged to `main` on November 13 as #115). A local browser check of `main` for #51 found two bugs, fixed here. (1) "View details" was hidden on suggestion, task and proposed-change cards at window widths of 1050px or less (a rule from the designed CSS), with no menu equivalent, so a card's sender and evidence couldn't be opened; it now shows at every width, and at phone width it sits under the card text with the ⋮ menu kept at the top right (`real-dashboard.css`). (2) With only a category to check, onboarding's review step said "Included senders and domains: None, so nothing will be processed", contradicting #104; it now says any sender you haven't excluded is checked for your categories' words (`noSendersLabel` in `scanSetup.ts`). Verified: offline suites 214/214 and 56/56 (a new assertion for the label), type-check and build; in the browser, locally with fictional users and seeded data, "View details" visible and opening the source email at 1024, 900, 760 and 390px, Passive cards unchanged, and the new onboarding label. Not checked: the live site. A card's text can still overflow at phone width (a proposed-change link; existing, for #100).

**November 15 (docs only), branch `mzheng/claude-md-prompting`:** [CLAUDE.md](../CLAUDE.md) was
rewritten for clarity: a numbered reading order, a reason given with each rule, "ask first"
and "report offline and live results separately" stated as instructions, and plainer terms. The
rules themselves are unchanged and still live in [AGENTS.md](../AGENTS.md). Verified: every link
in the file resolves and `git diff --check` is clean. No code changed and nothing was run.

**November 16: Google Calendar merged to `main`, off by default.** PR #116
(`claude/calendar-designed-ui`, which also carried the `CLAUDE.md` rewrite above) was merged at
12:22 AM Central as merge commit `44ad77f`, a production deployment. Before merging, on the
branch: `npm test` (222 + 56 pass), `npm run test:calendar` (45 pass), `supabase:prepare`,
`deno check` of all six functions, `tsc --noEmit` and the web build; all four PR checks passed.
On the merge commit both CI jobs passed and Vercel reported the deployment complete. The live
site was not opened in a browser afterwards. With Calendar off, the live site changes in two
ways: every dialog scrolls when it is taller than the window, and adding a suggestion says
"Task added." The live site's bundle was later downloaded and contains the #116 code ("Manage
event", "Remove from calendar", "View in Google Calendar", "Task added.", and no longer "No
Calendar event was created"). What was and was not verified live against Google is unchanged
(see November 15 below; #46 is still open), and the end time in extraction and the #101 reset
script are not started.

**Hosted changes on November 16** (project `IS492_c3`), each approved by Matthew in chat and run by a Claude Code session:

- About 11:58 AM: read-only preflight. The hosted ledger had every migration through `20261112010000`, with `20261113000000` pending; a dry run showed exactly that one migration. A schema-only snapshot of the hosted `public` and `private` schemas (no data, no credentials) was saved privately, outside Git.
- About 11:59 AM: migration `20261113000000_calendar_events` applied with `supabase db push` (one migration); the ledger shows it applied. Checked afterwards without a session: `calendar_event_statuses`, `calendar_event_status`, `calendar_event_service`, `google_connection_service`, `google_connection_service_base` and `google_connection_status` all refuse anonymous calls (401, `42501`), and `private.calendar_events` is not exposed through REST.
- About 12:01 PM: `google_connection` (now version 3), `google_callback` (version 3) and `calendar_event` (version 1, new) deployed from `main` at `44ad77f`. `gmail_scan` (version 5) and `analysis_email` (version 10) were not redeployed. Checked afterwards without a session: `calendar_event` answers 401 `AUTH_REQUIRED` with no or a bad token, 403 `ORIGIN_NOT_ALLOWED` for another origin, 405 for GET and 204 to the live site's preflight; `google_connection` answers 401 and 403 the same way; `google_callback` with a bad state redirects (303) to the live site with `google=failed`.
- Early afternoon: Matthew signed in on the live site and reported Gmail still connected and no Calendar option, as expected with the web flag off. This is the only signed-in check of the new `google_connection` and `google_callback` versions; a fresh connect or reconnect was not run.
- About 12:19 PM: `ENABLE_CALENDAR_EVENTS=true` set on hosted (`supabase secrets set`), after that report. No other secret or flag was changed. Checked afterwards without a session: `calendar_event` and `google_connection` still answer 401 `AUTH_REQUIRED`.

Hosted now has 31 migration versions, through `20261113000000`. `VITE_CALENDAR_EVENTS_ENABLED` is not set for the production web build, and the Google Calendar API and the `calendar.events.owned` scope are not added to the production Google Cloud project, so the live site does not offer Calendar. **Not verified:** no signed-in request has reached `calendar_event` on hosted, and connecting or reconnecting Google through the new function versions has not been run on the live site. **Remaining before Calendar is usable on the live site (#53):** set `VITE_CALENDAR_EVENTS_ENABLED` for the production web build and redeploy it; enable the Calendar API and add the scope in Google Cloud; then check connect, add and remove with a study account. The reconnect cases (#46) are still not run against Google.

**November 16: one layout for source email and proposed-change popups.** Branch
`mzheng/source-popup-layout` (stacked on `mzheng/record-calendar-merge`; unpushed when written).
Frontend only; no backend, migration or hosted change.
- "View details" opens the same layout in every tab (Suggestions, Active, Completed, Dismissed,
  Passive communication, and proposed changes): the "Email history" list from
  `TaskSourceEmails`, which tasks already used. A suggestion's single email is labelled "Found
  in"; this `source` role is display-only, and the stored task-link type is unchanged
  (`SourceEmails.tsx`).
- Each saved excerpt is shown open; it can still be collapsed.
- The duplicate divider above "Email history" is removed, and "Open conversation in Gmail" lines
  up with the popup's left edge (`real-dashboard.css`).
- The "Review proposed change" popup was rebuilt on the same parts. It shows a Task / Change /
  Reason summary, the edit table or the cancellation sentence, warnings including a separate one
  for an expired excerpt, and the proposing email as a "Cancelled by" or "Updated by" history
  entry. Approve is disabled under the same conditions as before.
- The local setup guide and demo script now say "Saved excerpt" instead of "Show saved excerpt".

Verified: `tsc --noEmit`. In a local browser against Matthew's own saved records, checked a
suggestion's and an active task's popups, and the cancellation popup (closed without approving or
dismissing). Not checked: the Dismissed tab (empty), the edit-proposal popup and its blocked
states (no such proposals existed), a task with several linked emails, phone width, and the
live site. Escape does not close these popups (existing behavior, not changed here).

**November 16: daily request default raised from 20 to 50.** Branch `mzheng/daily-requests-50`,
requested by Matthew in chat so study and test accounts can explore without reaching the limit.
Migration `20261116180000_daily_requests_default_50` sets the `storage_preferences.daily_requests`
default to 50 and moves rows still at 20 to 50; a limit set by hand is kept. The 1–100 range, the
200,000 daily tokens and the 3-per-minute provider limit are unchanged, so the token limit may now
be reached before 50 requests on long emails (not measured). Docs that stated 20 were updated.
Verified: `npm test` 222 + 56 pass, with a new assertion on the default that fails without the
migration (the move of existing rows has no test); a separate review approved the change. Not run:
pgTAP and `test:local`. Part of #48's discussion; #48's items are not changed by this.

**Hosted change on November 16** (project `IS492_c3`), approved by Matthew in chat on the
condition that tests passed and the review approved, and run by a Claude Code session:

- About 3:13 PM Central: a dry run showed exactly `20261116180000` pending; it was applied with
  `supabase db push` from this branch, before the branch was merged. The ledger shows it applied.
  A read-only count afterwards: the column default is 50 and the one existing preference row is
  at 50. Accounts without a row (it is created on an account's first model call) start at 50.

Hosted now has 32 migration versions, through `20261116180000`. No function was redeployed and no
secret or flag was changed. A read-only check the same afternoon matched the hosted flags against
`true`/`false` without printing values: fixture extraction is off and Gmail scanning is on.
If the study reset (PR #122) snapshots `storage_preferences`, take that snapshot after this
change, or it restores the old limit.

**November 17: turn a Passive email into a task.** Branch `mzheng/passive-to-task` (off `main`;
pushed on November 17, no pull request yet, not merged). The study freeze was moved at the November 16 team meeting to start
Thursday November 19 (night), so whether this merges before it is Matthew's decision. No hosted change: the
migration is applied to the local database only, and nothing was deployed.
- **Dashboard:** the Source email popup of a Passive item has **Turn into task**, which opens a
  **Create task** form (title, due date, time, description, the summary for reference). Saving
  makes one active task, removes the row from Passive, and shows **Task created** with **View
  task** and **Undo**. The task's menu has **Move back to Passive**, only for tasks made this way;
  with a Calendar event it first asks whether to keep or remove the event
  ([Calendar behavior](docs/calendar-behavior.md)). `CreateTaskFromEmail.tsx`, `passiveTask.ts`,
  `RealDashboard.tsx`, `dashboardModel.ts`, `readMarks.ts`.
- **Prefill:** from details the scan now saves for a Passive email, else from a small parser over
  the summary, excerpt and subject (for email scanned earlier). A time with no date is prefilled
  but a date is required to save. Several dates are all listed and none is preselected.
- **Scan contract (`gmail-v1`):** the model output gained `details` (a suggested title, every
  date or time the email states, a location, links), and the summary instruction now leads with
  what the email is about, then when and where. A date's wording, the location and each link must
  appear in the email or the entry is dropped (`groundDetails` in `pipeline/core.mjs`). The prompt
  and schema are part of the cache key, so already-scanned email is analysed again on its next
  full 7-day check (after a settings change or a Gmail reconnect); a routine check only covers
  mail since the last complete one. Passive read marks stay in the browser; the earlier mark is restored by Undo and Move
  back in the same browser only.
- **Database, migration `20261117000000_passive_to_task`:** `storage_extractions.details`
  (cleared whenever the summary is), service-only `gmail_extraction_details`,
  `tasks.origin_extraction_id`, and two `storage_action` branches: `create_task` on an
  extraction (one task per email) and `return_to_passive` on a task. Deleting such a task clears
  that email's summary and suppresses its rescan.

- **A task needs a due date, and "Needs verification" opens the editor** (Matthew's decision,
  November 17; dashboard only, the database still accepts a task with no deadline). **Add task**
  on a suggestion that has no deadline or is marked "Needs verification" opens **Review before
  adding**, which lists what the scan asked the user to check and adds the task on save; a due
  date is required there, in the Create task form, and when editing an active task. "Move to
  Active" and "Move to Completed" on such a suggestion open the same editor. Checked in a local
  browser: the editor opens for a suggestion with no deadline and refuses to add without a date.
  Later the same day: a task was added through the editor with a date entered and then moved
  back to Suggestions. Not checked: the Move menu path into the editor, a dismissed suggestion.
- **Shorter suggested titles:** the scan is asked for an imperative title of two to six words
  with no date, time, place or sender; one over 60 characters is dropped. For email scanned
  earlier the form reduces the summary to what it is about ("Exam", "Campus bake sale").

Verified offline, rerun after every change above: `npm test` 236 and 80 pass, `npm run
test:calendar` 45 pass, `tsc --noEmit`, the web build, `deno check` of all six functions, and
pgTAP on the local database (93 pass);
these use fake Gemini and Gmail responses. In a local browser against Matthew's saved records,
with Calendar off: the button, the form prefilled from an email scanned earlier (Thursday's date
and 3:30 PM), the two validation messages, saving, the row leaving Passive, the task card and its
source popup, Move back to Passive and the pop-up's Undo, both restoring the Unread mark.
Live model check (November 17, approved by Matthew): four fictional emails sent to Gemini through
the canonical pipeline with the `gmail-v1` contract, in a throwaway script that touches no
database. All four were Passive with the expected details: a bake sale (title, Thursday's date
with 3:30 PM, location, link), a showcase with an RSVP (both dates, labelled), a time with no
date (time kept, date null), and "details coming soon" (nothing). Four emails do not measure
accuracy.
Real Gmail scan, local (November 17, approved by Matthew): the new scan bundle was placed in the
folder the local function runtime serves (it is mounted from another worktree), the runtime
container restarted, and one full 7-day check run on the dedicated test mailbox. Three model calls
(the per-batch cap; the rest stayed as backlog) saved two Passive results with details and one
Actionable result with none; the dashboard form then opened with the model's title, date and
time. The earlier bundle was put back and the runtime restarted afterwards. One thing seen: an
email sent on a Thursday afternoon saying "3:30PM thursday" was dated the following Thursday.
**Fixed the same day (Matthew's rule: a relative day counts from the day the email was sent,
never from the day it was analysed):** the prompt now says so for weekdays and "tomorrow", and
`relativeDayFromSent` in `pipeline/core.mjs` recomputes a details date whose wording is only a
relative day ("Thursday", "next Friday", "tomorrow") from the sent date. A weekday is the first
such day on or after the sent day, the sent day included; "next <weekday>" skips the sent day.
Checked: `npm test` 237 and 80, and three fictional emails sent on a Thursday and analysed five
days later, where the model itself returned the sent-based dates.
**Extended later the same day to task deadlines (`gmail-v1` only; the fixture contract is
unchanged):** the same rule now corrects a suggestion's deadline, a waiting-for promised date
(before the follow-up check, which depends on it) and a proposed deadline change, the last only
when the deadline is a changed field. The day is counted from the message the item's evidence
cites. The rule is also narrower: it applies only when the wording is nothing but one relative
day, an optional "this"/"next", a clock time and small connecting words, so "the Friday after
Thanksgiving" or "two weeks from Friday" keeps the model's date. A weekday named on the sent
weekday means that day only while its stated time is still ahead; otherwise the next one.
Known limits: wording that is short while the email sets another week elsewhere ("Next week's
schedule: quiz Thursday") is still counted from the sent day, and so is a relative day whose
evidence cites a different message from the one it was written in. Checked: `npm test` 244 and
80, `deno check`, and five fictional task emails against the live model (four already right;
"before Thursday at noon", sent that Thursday at 3:23 PM, moved from the sent day to the next
Thursday). Not checked: a real Gmail scan with this version.
**Flag it and let the user decide in the app (Matthew's rule, November 17):** when code and the
model disagree about a date, or code cannot be sure, the item gets a specific note and is marked
"Needs verification"; when they agree, nothing is added.
- **Notes** (`core.mjs`, stored with the result's warnings): a date the sent-day rule changed; a
  date left alone because the sentence around it, the one before it or a colon heading sets
  another week ("Next week's schedule:"); "next <weekday>" wording the rule changed; a holiday
  phrase the calendar disagrees on; and wording that cannot be matched to one supplied email (a
  paraphrase, or several emails say it), where the date is left as the model gave it. Each note
  names the wording and both dates.
- **Holidays** (`pipeline/holidays.mjs`): 14 fixed-rule US holidays, for wording that is only a
  holiday or a weekday or day before or after one ("by the Friday after Thanksgiving"). Anything
  else, school breaks included, keeps the model's date.
- **Which email:** a deadline is counted from the email whose body contains its wording: the
  cited one, else the only other supplied one.
- **Review screen** (`RealDashboard.tsx`, `reviewNotes.ts`): Review before adding and Edit
  suggestion show the sender, subject, the sent time with its weekday, the email's date wording
  and the saved excerpt; Review before adding also offers each date named in a note as a
  one-click choice and, for plain relative wording, a line saying what the sent-day rule gives.
  Create task shows the sent time and excerpt too. Only the saved excerpt is shown; full email
  bodies are still not stored.
Checked: `npm test` 267 and 99, `test:calendar` 45, `tsc --noEmit`, the web build, `deno check`.
Live model, five fictional emails sent on a Thursday and analysed five days later: the holiday
phrase and the plain cases agreed with the rule and got no note; "Next week's schedule:" kept
the model's next-week dates with a note for each. Real Gmail scan, local, on the dedicated test
mailbox with this version (three model calls): two Passive results dated from the sent day and
one Actionable result, no failures and no date notes. In a local browser, with a sample note
placed on one suggestion and removed afterwards: the email block, the two date buttons and the
hint. Known limits: a week cue two or more sentences away, in the subject or in an earlier
email is not seen; cue words can match unrelated phrases ("every two weeks"), which only adds a
note. Not checked: the review screen at phone width or by keyboard alone, hosted.
**Later on November 17, the open items from that round:**
- **Wider week check** (`core.mjs`): a week cue is now also looked for in the subject line of the
  email the wording was read from, in a short heading above the wording with no colon (within 6
  lines and one blank line), and up to 3 sentences back in the same paragraph. Past, repeating,
  lasting and same-week phrasing ("two weeks ago", "every two weeks", "for the next two weeks",
  "this week") and "after <Name> <does something>" are no longer cues. Other emails in the
  thread are still not searched.
- **Agreeing date near a cue:** when the model and the sent-day rule agree but the email sets
  another week nearby, the date stays and a note offers the week-later reading. Found with the
  live model: subject "Next week's schedule" over "quiz corrections Thursday" was dated in the
  sent week by both.
- **Review-screen hint** (`reviewNotes.ts`, `RealDashboard.tsx`): it uses the deadline's time
  zone, and shows nothing for a weekday named on the sent weekday with a clock time, which only
  the scan can settle.
- **Keyboard focus in every dialog** (`designedUi.tsx`, `index.css`): focus now moves into a
  dialog when it opens, Tab stays inside it, and focus returns to the opening control on close.
  Before, Tab kept moving through the page behind the dialog. This is the shared `Modal`, so it
  applies to every dashboard dialog (source email, the editors, proposed changes, the Calendar
  event dialog and its follow-ups, follow-up reminders) and to the "Unsaved changes" dialog in
  Settings. Onboarding has no dialogs (corrected November 17: an earlier version of this line,
  and commit `34ad667`'s message, said it applied to onboarding too).
- **Study reset (PR #122, #101), checked in a scratch copy, nothing changed in either branch:**
  with this migration the reset as written refuses (`STUDY_RESET_SCHEMA_CHANGED: unknown
  trigger … extraction_details_follow_summary`). Adding that trigger to its list of known
  triggers is enough; a full snapshot, Passive-to-task session and reset then restored the
  account exactly in PGlite. If the migration is applied after the snapshot, every reset
  refuses. Its test also needs the empty `details` object once merged with this pipeline.
- **Scan now after a Gmail reconnect:** fixed separately on branch
  `mzheng/scan-now-after-reconnect` (off `main`, local, not pushed); see that branch's entry.
Checked: `npm test` 274 and 99, `test:calendar` 45, `tsc --noEmit`, the web build, `deno check`.
Live model, three fictional emails for the new cue rules (dates unchanged; this run is what
showed the agreeing-date gap, fixed afterwards and covered by tests, not rerun live). In a local
browser with a sample note placed on one suggestion and removed afterwards: Tab order through
Review before adding, a date button chosen with Space, focus returning on close. At phone width
the dialog's rows stack and it scrolls inside itself, but the Suggestions page is already wider
than the screen (#100), which pushes the dialog partly off it. Not checked: a screen reader,
hosted.
- **Calendar question on Move back, checked locally with Calendar on** (Matthew signed in to the
  dedicated test account; the web flag was set in an ignored `.env.local`): a task made from a
  Passive email was added to Google Calendar, then Move back to Passive asked "Keep the calendar
  event?". Cancel left the task and event in place. Remove deleted the app's record of the event
  and moved the task back. Keep moved the task back and left the event in Google Calendar, no
  longer shown in the app. The Passive row returned with its earlier Read mark each time. Not
  checked: a removal that fails.
- **Create task form:** it now has an "Open in Gmail" link under the saved excerpt, as the
  review dialog does.
- **Card button squeezed between about 621 and 720px wide** (`real-dashboard.css`; also on
  `main`): the row's main button (Add task, Review change) had no column at that width, landed
  in the 34px menu column and its label spilled out. It now sits under the card text at 720px
  and below. Checked in a local browser at 420, 650, 700, 720 and 721px on Suggestions and
  Active: no button clipped or outside its card.
**Correction to the scan-contract note above:** a routine check only covers mail since the last
complete check, so already-scanned email is analysed again only on a full 7-day check (after a
settings change or a Gmail reconnect), not on every next scan.
**Not verified:** the Calendar question on Move back (Calendar
is off in the local build); `test:local` (it expects scanning switched off, and it is on
locally); hosted.
Second browser pass the same day, with details placed on one local email by hand and removed
afterwards: the several-dates choice (nothing preselected, choosing fills the fields, editing
clears the choice), location and link in Description, the required due date, View task (opens
Active, scrolls to and focuses the card), a save that fails (form and entries kept, row stays
in Passive), and the Create task form at phone width.

**November 17, later: run setup again from empty fields, and an honest "Edited by you".** Same
branch, `mzheng/passive-to-task`. For the user study (Matthew's decision, November 17): the
study does not use a reset script; the runner puts the account back by hand and each participant
enters the setup fields themselves. Local only: migration `20261117010000_restart_scan_setup` is
applied to the local database, not to hosted, and it must follow `20261117000000` there.
- **Clear settings and run setup again** (Settings › Connections, behind a confirmation):
  `scan_settings_restart(p_revision)` puts the saved scan settings back to a new account's
  (no senders, topics, consent or automatic checks; paused) and sets `scan_settings.setup_pending`,
  which routes the account to onboarding until the next save (`needsSetup` in `scanSetup.ts`).
  The revision still goes up and in-flight work is fenced as on a save, so nothing can be scanned
  until setup is saved. Tasks, suggestions, Passive emails, Calendar records and the Google
  connection are not touched. `RealSettingsScreen.tsx`, `App.tsx`, `useSavedScanSettings.ts`,
  `storageAdapter.ts`, `supabase.ts`.
- **What this does not do:** it does not undo what a participant did to records (the runner moves
  those back by hand), and it does not freeze results. After setup is saved again the next check
  covers the past 7 days; where the topics, earlier-email limits or the account's accepted tasks
  differ from the earlier scan, an email is analysed again and its newest result is what the
  dashboard shows. Email older than 7 days is not looked at again.
- **"Edited by you"** (`dashboardModel.ts`, also wrong on `main`): the badge showed whenever a
  suggestion had saved review values, which adding a task and moving it back to Suggestions
  always writes. It now shows only when those values differ from what the scan found
  (`suggestionEdited`, `sameTaskFields`; key order ignored, every deadline field counts).
- **Restore original** in Edit suggestion (`RealDashboard.tsx`), only on a pending suggestion
  with a real edit: saves the scan's values back through the existing edit action, which also
  discards a due date typed in Review before adding.
Verified offline, on the combined tree: `npm test` 275 and 102, `test:calendar` 45, `tsc
--noEmit`, the web build, `git diff --check`; the database tests (`supabase test db`, 99 pass)
and the settings database test were run once when the migration was written. **Not verified:**
anything in a browser (the dialog, the move to onboarding, the badge, Restore original); the new
function through the HTTP API (`test:local`); hosted.

**November 17, later: Delete from InboxToTask in the Source email dialog.** Same branch,
`mzheng/passive-to-task`; web only, no new migration. For the study: an email a participant sends
to the study account must be removed before the next participant, and leaving it in Dismissed
would show it to them. The Source email dialog of a suggestion (also a dismissed one, a proposed
change or a waiting-for item) and of a Passive email now has "Delete from InboxToTask", behind a
confirmation that says what is removed (the email's suggestions, including dismissed ones, its
summary, saved excerpt, sender and subject), that it cannot be undone, that InboxToTask will not
check the email again, and that the email stays in Gmail. It calls the existing source delete
(`storage_action` with kind `source`, action `delete`; no revision). It is not offered while a
task (open, completed or cancelled) was added from the email or changed by it, because that
action leaves such a task in place without its email; the dialog says to move the task back
first. With tasks present and their source emails not loaded, it is not offered either. The rule
is checked again on freshly loaded records just before deleting. No Calendar write is involved:
Calendar records belong to tasks, and no task can come from a deletable email.
`dashboardModel.ts` (`sourceDeleteCheck`), `RealDashboard.tsx`, `real-dashboard.css`,
`tests/dashboard-model.test.mjs`.
Verified offline: `npm test` 275 and 107, `test:calendar` 45, `tsc --noEmit`, the web build,
`git diff --check`. **Not verified:** in a browser; hosted.
This is the first option listed under "Open gap" in the next entry, which was written before it
was built; the email still has to be deleted from the study account's Gmail by hand. Known
limits: a task that was cancelled, or changed by the email, cannot be moved back, so its email
cannot be deleted here; deleting an email also clears the saved excerpt of other suggestions in
the same thread that quote it, which then show "Evidence expired".
**Study documents reworded the same day** (`Checkpoint 4/CP4_PLAN.md`,
`Checkpoint 4/docs/study_materials/task_script.md`): they no longer say results are frozen,
that automatic scanning is off, that there is one standard setup, or that a reset script is
used. Points not yet decided are marked "To be decided" in place. The issues named in the next
entry are not reworded yet; drafts exist and are not posted.

**November 17, study decisions and one open gap (docs only).** Same branch,
`mzheng/passive-to-task`. No code, database or hosted change.
- **Decisions by Matthew, November 17** (decided, not done):
  - PR #124 ships for the study. Applying both migrations to hosted
    (`20261117000000_passive_to_task`, then `20261117010000_restart_scan_setup`), redeploying
    `gmail_scan` and `analysis_email`, and the merge must happen before the freeze scan (#67) and
    the freeze on Thursday November 19 (night). None has happened; each needs his approval.
  - Automatic checks are on during study sessions (decided with Sania). This replaces the earlier
    assumption that results are scanned once and frozen with automatic checks off, which #67, #62,
    #63, #64, #58, #54, #101, #76 and `Checkpoint 4/CP4_PLAN.md` still state; none is reworded yet.
  - No reset script: the runner puts the account back by hand and each participant goes through
    setup (previous entry).
- **What automatic checks during sessions mean, from reading the code (not run on hosted):**
  - After setup is saved, the first check covers the past 7 days and starts when the dashboard
    opens. A saved result is reused, with no model call, only when the topics to check, the
    earlier-email limits and the tasks offered as context match the earlier scan; otherwise the
    email is analysed again.
  - The per-account allowance is 50 model requests a day (`storage_preferences.daily_requests`,
    default 50 since migration `20261116180000`, on hosted since November 16; this line said 20
    until corrected later on November 17), a batch makes at most 3 model calls, and the model
    limit is 3 calls a minute across all accounts. A study inbox is about 24 emails (#62–#64), so
    one full re-analysis fits in a day's allowance.
  - Email sent more than 7 days before a session is not read again. Send dates for inboxes A and B
    are not set.
  - Still to decide: whether every participant enters the same scripted setup values; whether to
    raise the daily allowance for the two study accounts; whether the Scan now fix (branch
    `mzheng/scan-now-after-reconnect`) ships before the freeze; what the AI-only baseline in #76
    scores.
- **Open gap: email a participant sends in during exploration.** If exploration has participants
  send email from their own inbox to the study account, each such email leaves the email in the
  study account's Gmail; a suggestion or Passive entry with its sender, subject and saved excerpt;
  and possibly a task and a Calendar event. These must be removed before the next participant, and
  they would be a real person's email, unlike the fictional inboxes.
  - Today the designed dashboard and Settings have no permanent delete. A task can be moved back
    (to Suggestions, Dismissed or Passive, which removes the task); a suggestion can be dismissed
    (it stays in Dismissed and can be restored); a Passive entry cannot be removed.
  - The backend already has a delete for a source email (`storage_action`, kind `source`, action
    `delete`). It clears the sender, subject, summary and excerpt, removes pending, dismissed and
    rejected suggestions and Waiting For entries, and stops that email being scanned again. It
    does not remove a task already made from the email, a Calendar event or the Gmail message. No
    designed screen calls it. Found by reading the code, not in a browser.
  - Options, not decided: a delete control on a source email using that action (no migration);
    exploration uses a prepared fictional email the runner sends; or sending email is left out of
    exploration. The protocol and consent wording (#58) should cover whichever is chosen. Matthew
    is to look at this on the evening of November 18.

**November 17, 12:45 CST: branch pushed; runner wording in the CP4 plan.** Same branch,
`mzheng/passive-to-task`. Matthew approved the push ("Yes, push"). Origin went from `c22a118` to
`967a6c0` (`8df183a`, `380adca`, `967a6c0`) with a plain push, so PR #124 now includes Clear
settings and run setup again, the "Edited by you" fix, Restore original and Delete from
InboxToTask. CI on PR #124 was still running when this was written. The PR and issue text was not
changed. This commit adds one line to `Checkpoint 4/CP4_PLAN.md`: the runner, not the participant,
uses Clear settings and run setup again between sessions. Read from the code, not seen in a
browser: automatic checks keep running while the runner puts the account back, until Clear
settings removes consent. The scan panel's Stop link pauses them for that page only. After Clear
settings the account opens at setup, which also offers "Skip setup for now". Nothing on hosted;
the four new controls are still not browser-checked. Docs only; `git diff --check`.

**November 17, afternoon: study setup and reset decisions in the CP4 plan and task script.** Same
branch. Matthew decided: every participant enters the same scripted setup values (#59) and no one
changes settings during a session, exploration included ("there should not be any reanalyzing of
emails"); each participant gets a new Guest or private browser window; the exploration email is a
new email, not a reply, and participants do not act on proposed changes. `CP4_PLAN.md` and
`task_script.md` (before arrival, Sections 4, 7 and 10, the last now including removing the
exploration email with Delete from InboxToTask and then in Gmail) now say so; the allowance line now applies only to each
account's first check after PR #124's function deploy (that check fits in the 50-a-day default), and the AI-only baseline question is whether
it scores the shared saved analysis. Read from the code, not run: a saved analysis is reused with no
model call when the content, analysis settings (topics, context limits, prompt, schema, model
settings) and the open tasks sent as thread context all match (`gmail-processor.mjs`,
`20261106000000_gmail_scan_hardening.sql`); so a different setup value, a task left active at the
next setup, or a function deploy that changes the prompt makes email be analysed again. Nothing on
hosted. Docs only; `git diff --check`.

**November 17, 1:37–1:38 PM CST: hosted migration dry run for PR #124 — did not pass.** Approved
by Matthew ("Yes, run them"; read-only commands only). Branch `mzheng/passive-to-task` at
`bcf8e0f`. Nothing on hosted was changed.
- `npx.cmd supabase migration list --linked` (from `Checkpoint 3/app`): hosted has every migration
  on this branch up to `20261113000000`, the two new ones (`20261117000000`, `20261117010000`)
  are pending, and hosted also has `20261116180000`, which is not on this branch.
- `npx.cmd supabase db push --dry-run` targets the local stack in CLI 3.1 unless `--remote` is
  passed; it failed to connect to the stopped local stack and touched nothing. With `--remote` it
  stopped with `DbPushMissingLocalError: Remote migration versions not found in local migrations
  directory` and suggested `migration repair --status reverted 20261116180000`, which was not run
  (it would rewrite hosted's migration history).
- `20261116180000_daily_requests_default_50` is commit `a7bad46` ("Raise the default daily model
  request limit from 20 to 50"), dated November 16, on local branches `mzheng/daily-requests-50`
  and `mzheng/passive-read-in-db`; neither is on GitHub and it is not on `main`. Its commit says it
  was applied to hosted on November 16. So the hosted default is 50 requests a day (rows that were
  at 20 moved to 50), not the 20 stated in the "study decisions" entry above; that line and the
  drafted PR #124 and #123 text need correcting.
- Next, Matthew's decision: bring `20261116180000` onto this branch (or onto `main` first) so the
  local migrations match hosted, then dry-run again. The pass condition stays: exactly
  `20261117000000` then `20261117010000` pending.

**November 17, after the failed dry run: `20261116180000` brought onto this branch.** Matthew chose
to cherry-pick `a7bad46` into PR #124 ("Cherry-pick into #124"). The migration and its doc and
test changes are now on `mzheng/passive-to-task`, so the local migrations match hosted again. The
allowance lines in this file and `CP4_PLAN.md` now say 50. Hosted is unchanged; the dry run is to be
run again, with the same pass condition.

**November 18, 4:17 PM CST: hosted migration dry run for PR #124 — passed.** Approved by Matthew
("Yes, run them"; read-only commands only). Branch `mzheng/passive-to-task` at `29089e7`. Nothing on
hosted was changed. From `Checkpoint 3/app`: `npx.cmd supabase migration list --linked` shows
`20261116180000` on both sides and only `20261117000000` and `20261117010000` local-only;
`npx.cmd supabase db push --dry-run --remote` printed "Would push these migrations:
20261117000000_passive_to_task.sql, 20261117010000_restart_scan_setup.sql", with no seeds or roles.
Applying them is the next step and needs its own approval. Pre-deploy checks on `bcf8e0f` (same
code; `29089e7` added the cherry-picked migration and docs, and the lead session reran `npm test`
275 and 107 on it): `npm test` 275 and 107, `test:calendar` 45, `tsc --noEmit`, the web build and
`deno check` of all six functions pass; `supabase:prepare` not yet run.

**November 18, 4:19 PM CST: both PR #124 migrations applied to hosted.** Approved by Matthew ("Yes,
apply both"). Branch `mzheng/passive-to-task`; no migration file changed since the passing dry run
(`29089e7`; local `3f0d144` adds only that record). From `Checkpoint 3/app`: the dry run again
listed exactly `20261117000000_passive_to_task.sql` then `20261117010000_restart_scan_setup.sql`;
`npx.cmd supabase db push --remote` without `--yes` refused in agent mode and changed nothing;
`npx.cmd supabase db push --remote --yes` printed "Applying migration
20261117000000_passive_to_task.sql..." and "Applying migration
20261117010000_restart_scan_setup.sql..." and finished (exit 0). Checked afterwards:
`migration list --linked` shows all 34 migrations on both sides; a catalog-only query
(`supabase db query --remote --read-only`, no table rows read) found
`storage_extractions.details` (jsonb, nullable), `tasks.origin_extraction_id` (uuid, nullable),
`scan_settings.setup_pending` (boolean, not null, default false),
`public.`/`private.scan_settings_restart(p_revision bigint)` and `public.gmail_extraction_details`.
Production still runs the `main` web build and the earlier `gmail_scan` and `analysis_email` until
the redeploy and merge; per the line-by-line comparison it should keep working, but the live site
was not checked after the apply. Not yet done, each needing its own approval: `supabase:prepare`
and the redeploy of `gmail_scan` and `analysis_email`, the merge of PR #124 (not during the freeze
from Thursday November 19, night), and the signed-in live check. PR #124 has no review yet.

**November 18, 4:25 PM CST: `gmail_scan` and `analysis_email` redeployed to hosted for PR #124.**
Approved by Matthew ("Yes, redeploy both"). Branch `mzheng/passive-to-task`, local `53a5ea8` (code
identical to origin `29089e7`). From `Checkpoint 3/app`: `npm.cmd run supabase:prepare` rebuilt the
ignored bundle (no tracked file changed; every bundled pipeline file matches its source);
`deno check` of both functions passed; then `node_modules/.bin/supabase functions deploy gmail_scan
analysis_email --use-api --yes` ("Deployed Functions.", exit 0; JWT settings from `config.toml`,
unchanged). `functions list` before and after: `gmail_scan` v6 → v7 (JWT check off),
`analysis_email` v11 → v12 (JWT check on), both ACTIVE, updated 16:25 CST; `google_connection` v4,
`google_callback` v4 and `calendar_event` v2 unchanged (November 16). Neither function was invoked
and no scan was started. From now on hosted scans use the new prompt, the sent-day rules and save
Passive details; already-scanned email is analysed again only on each account's next full 7-day
check. The production web build is still `main` until PR #124 merges. Not yet done, each needing
approval: the merge (not during the freeze from Thursday November 19, night; PR #124 has no
review yet) and the signed-in live check.

**November 18, evening: "reimbursement" added to the Financial starter words (branch
`mzheng/passive-to-task`, PR #124).** Requested by Matthew so the study inboxes' reimbursement
emails (A12, B12) are skipped when Financial is a skipped topic; before this, only A11 and B11
matched ("financial aid"). `reimbursement` and `reimbursements` were added to
`STARTER_BLOCKED_WORDS.financial` in `app/pipeline/private-topics.mjs`, to
`starterBlockedWords.financial` in `app/web/src/filterPresets.ts`, and to
`private.starter_blocked_words` in the new migration
`20261118000000_financial_reimbursement_word.sql` (same function as `20261109200000` apart from the
two words). Only a later selection of Financial picks up the words; a list already saved keeps its
own. Verified offline: `tests/private-topics.test.mjs` and `tests/scan-settings.test.mjs` (32 pass;
the latter applies every migration in PGlite and compares the SQL list with the code list) and
`tests/onboarding-settings.test.mjs` (27 pass); run against the inbox packets on `main`, the
Financial words now match A11, A12, B11 and B12 and no other study email. Not on hosted: the
migration, the `gmail_scan`/`analysis_email` redeploy and the web build (with PR #124's merge) each
still need approval.

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
  | `20261113000000_calendar_events` | Google Calendar event records, status reads and the `google_connection_service` wrapper (#116) | Applied November 15 | Applied November 16 (Calendar switched off) |

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
  On November 16 `20261113000000_calendar_events` was applied (see the November 16 hosted
  changes above), so hosted has 31 versions.
- **Hosted Gmail connection and scanning are live (checked November 9, about 6:30 PM Central).**
  `google_connection`, `google_callback` and `gmail_scan` were deployed at 00:20 UTC on November 10
  (6:20 PM Central November 9), alongside `analysis_email`. Read from secret digests, not values:
  `ENABLE_GOOGLE_CONNECTION` and `ENABLE_GMAIL_SCAN` are true; `ENABLE_GMAIL_RETRIEVAL`,
  `ENABLE_FIXTURE_EXTRACTION` and `ENABLE_STORAGE_CLEANUP` are false; a Gemini key and Google
  OAuth/token secrets are set. Matthew approved the deployment in chat; a Claude Code session ran it, applying `20261109220000`, setting the function secrets and deploying the three functions (corrected November 9: an earlier version of this note said it was unrecorded). On the live site, anyone who
  signs in can connect Gmail and, after saving consent, send permitted email to Gemini.
  Signed-in hosted scanning has no recorded verification. On November 16 `google_connection` and
  `google_callback` were redeployed from `main` (version 3 each) and `calendar_event` was deployed
  (version 1), switched off; see the November 16 hosted changes above.
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
- **Google Calendar moved to CP4 by user decision.** It is not in CP3 or on hosted. The
  work was done on branch `claude/calendar-designed-ui` (pushed November 13 as PR #116, merged to
  `main` on November 16, off by default; see the November 16 entry above): event creation, the
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
- The demo's raised daily request limit (50) was lost when the local database was rebuilt on November 12; local accounts were back to the default 20. Since migration `20261116180000` (November 16) the default is 50.

## Latest evidence and next action

PR #22 was merged to `main` at `59461b6` on November 5 at about 11:01 PM Central, by the user's decision. GitHub CI passed on that merge commit, and production returned a new build. Earlier local runs, not repeated at the current tip: offline suite **168/168**; pgTAP **71**; unmodified local API suite **15 groups, zero model calls**, with scanning disabled. Live results are recorded separately in [UC8](docs/use-cases.md#uc8-real-gmail-to-review-workflow).

Sania reports that Vercel's production branch is `main` (Settings > Git), and that rollback to `e2b0009` is available after the PR #22 merge. Treat every merge as a production deployment. A rollback does not undo migrations.

Next (as of November 12; the Calendar item as of November 16):

1. Check the live site signed in: account picker, Settings save and exits, a categories-only scan, New/Unread labels, quiet automatic checks (#54, #51).
2. Calendar (on `main` since November 16, #116; its migration and functions on hosted since November 16 with the backend switch set, the web flag still off): the remaining live checks, including the three reconnect cases (#46); then the remaining steps (the production web flag and redeploy, the Calendar API and scope in Google Cloud, then connect, add and remove with a study account), and the noon November 17 decision (#53).
3. Study materials (#58–#64, #101) to match the release; hosted items left in #52 (security review, OAuth test users for the study inboxes, a model spending limit).
4. Close PR #37 (#36 is closed). Background scanning with the app closed (#49) stays after the study.

CP4 deliverables and the evaluation design are in [Checkpoint 4](<../Checkpoint 4/README.md>); the [CP4 plan](<../Checkpoint 4/CP4_PLAN.md>) was updated November 12 to the decisions above.

**Known CP3 gap:** the assignment's "all proposed core features" is not met. Not built: automatic scans, real data in the designed dashboard, a Waiting For view in the workspace and account deletion. Calendar events moved to CP4. **CP4 update (November 12):** real data is in the designed dashboard and onboarding (#51), and automatic checks run while the app is open (#108, #110); scanning with the app closed and account deletion are still not built. Calendar events are on `main` since November 16 (#116), off by default; their migration and functions are on hosted, switched off, so the live site does not offer Calendar.
