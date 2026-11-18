# Resetting the study accounts between sessions

**Checkpoint 4 | Issue #101 | For the session runner, not for participants**

This page explains how study accounts A and B go back to their frozen state after every
session. The freeze itself (connect, scan once, back up) is #67; loading the inboxes is
[loading_inboxes.md](loading_inboxes.md) (#57).

**Never add credentials, account addresses, user ids, project identifiers or participant
names to this page, to issue comments or to the reset log.** Use the account labels (A, B)
and participant codes only. Addresses and sign-in details live in the team's password
manager and the private study notes.

## What the reset does and does not do

The reset is a database function in the hosted project. For one study account it, in a
single step:

- deletes the account's app data (suggestions, decisions, tasks, passive items, settings
  and scan state) and puts back the copy taken right after the freeze;
- checks the result against the freeze and that no other account's data changed;
- writes a row to the reset log, `ok` or `failed`.

If any check fails, nothing is changed and the log records the failure.

It only runs against the two study accounts and refuses any other account.

It does **not** call Google. Three things are done by hand, around it:

- **Google Calendar events** the participant created are removed in the app and in Google
  Calendar before the reset.
- **The exploration email**, if a participant sent one, is deleted from the study Gmail
  inbox and from Trash before the reset. The app can only read Gmail, so it cannot delete it.
- **Browser state** ("New" labels, read marks, the scan panel and unsaved Calendar forms) is
  kept in the browser, not the database. It is cleared after the reset.

The reset does not touch Gmail messages from the freeze, the Google connection, or anything
in another account.

## Who runs it

Running the reset needs access to the hosted project's SQL Editor, so the project owner
runs it, or someone the owner names. Everything else on this page is done by the session
runner in the facilitator browser.

A runner without database access does steps 1 to 3 below, then asks the owner in the team's
private chat (not in a public issue) with:

> Reset please: account A, participant code P00, Calendar cleared yes.

The owner runs step 4 and replies with the result (`ok` and whether the digest matches, or
the error message). The runner then does steps 5 to 7. Do not start the next session until
the reset has returned `ok` and the checks in step 6 pass.

## One-time setup at the freeze

Done once per account, right after the freeze scan in #67 and before anyone makes a
decision in the app. Installing the file and taking each snapshot are hosted changes: the
project owner approves them, and each one is recorded in
[current state](<../../../Checkpoint 3/CURRENT_STATE.md>) with the date, time and who
approved it.

- [ ] The primary Google Calendar of each study account is empty, including its Trash.
- [ ] The project owner runs `Checkpoint 3/app/supabase/operations/study_reset.sql` once in
  the hosted SQL Editor. It creates the private `study_reset` schema, which ordinary
  sign-ins and API keys cannot reach.
- [ ] Each study account has Google connected with every permission the session needs,
  Calendar included if the Calendar task is used. Starting a Google connect or permission
  prompt after the freeze, even one that is cancelled, makes every later reset refuse.
- [ ] The owner fills in `study_reset.accounts` by hand: one row labeled `A`, one labeled
  `B`. The account details come from the private study notes and never go in the repository.
  Both rows must exist before either account can be snapshotted or reset.
- [ ] Automatic scanning is off and the settings are the standard setup from the task
  script, for both accounts.
- [ ] The owner takes a snapshot of each account:

  ```sql
  select study_reset.take_snapshot('A');
  select study_reset.take_snapshot('B');
  ```

- [ ] Record each snapshot's digest in the study data sheet. Each reset is compared with it.
- [ ] In a separate browser profile for each account, clear the site's data (see step 5) and
  sign in again.
- [ ] Take freeze screenshots for each account: Tasks with each of Suggestions, Active,
  Completed and Dismissed; Passive communication; the scan status line; and Settings
  (Sources & exclusions, and Consent & context with Automatic scanning). Keep them in the
  private study folder, not in the repository.

Use the same browser profile for an account for the whole study, and do not use it for
anything else.

## Reset after every session

Do this after the pilot and after every session, before the next participant arrives. Work
in the browser profile of the account the participant used.

1. **Finish the exploration, if there was one.**
   - Check that the exploration log under the participant code is complete (the task
     script's Section 7 lists what it holds) and the result screenshot is saved. Nothing
     is deleted until it is.
   - If automatic scanning was turned on, turn it off: Settings, Consent & context,
     Automatic scanning, untick "Check for new email automatically while the app is open".
   - Wait until no scan is running ("Scanning…" has finished), and close any other tab of
     the app.

2. **Remove Calendar events.** While still signed in to the app as the study account:
   - For every task showing "Added to Google Calendar", open **Manage event**, choose
     **Remove from calendar** and confirm "Remove this event from your Google Calendar?".
     Check Active, Completed and Dismissed. If the form shows **Remove again**, use it.
   - Then open Google Calendar signed in as the same study account and delete any event
     still there, including ones from tasks the participant deleted. The calendar was empty
     at the freeze, so anything present came from the session. Empty Calendar's Trash too.
   - Only when the calendar is empty is Calendar cleared.

3. **Delete the exploration email, if one was sent.** In the study Gmail inbox, delete the
   participant's email, then delete it forever from Trash. Check Spam as well. Delete only
   that email, never study mail from the freeze. Do this before anyone scans the account
   again, or the next scan would pick it up.

4. **Run the reset** (project owner, in the hosted SQL Editor):

   ```sql
   select study_reset.reset('P00', 'A', true);
   ```

   Replace `P00` with the participant code used in the study data sheet and `A` with the
   account. The code must be `P00` to `P99`, `PILOT`, or a rehearsal code `R0` to `R9`;
   anything else is refused. Pass `true` only after step 2 is done; otherwise pass `false`,
   and the reset will refuse while event records remain.

   On success the result is `{ok: true, counts, digest}`, and the digest must equal the
   freeze digest. A refusal or failure does not raise an error: the result is
   `{ok: false, error}`, where the error starts with a `STUDY_RESET_` code. See
   [When a reset refuses or fails](#when-a-reset-refuses-or-fails).

5. **Clear the browser and sign in again.** In the account's browser profile, clear this
   site's stored data (in Chrome: the icon to the left of the address, Site settings,
   Delete data). This removes the app's keys starting `inboxtotask:` (New labels, read
   marks, the scan panel) and `itt-calendar-` (unsaved Calendar forms), and signs the app
   out. It does not sign the profile out of Google. Sign in to the app again as the study
   account.

6. **Verify** with the checklist below.

7. **Log it** in the study data sheet against the participant code: date and time, account,
   `ok`, digest matches, verify checklist passed, and "exploration: yes" or
   "exploration: no". Nothing else about the exploration goes in this row.

## Verify checklist

Compare with the freeze screenshots.

- [ ] The reset returned `ok` and its digest equals the freeze digest.
- [ ] Suggestions and Passive communication show the same counts as at the freeze.
- [ ] Active, Completed and Dismissed are empty (no tasks), as at the freeze.
- [ ] No card shows a "New" label or a Calendar line.
- [ ] Settings match the standard setup: the same senders, domains and exclusions; the same
  categories to check and to skip, with their words; Automatic scanning off.
- [ ] The scan status line reads as at the freeze (the "Last scan" or "Checked" line).
- [ ] The study account's Google Calendar is empty, including Trash.
- [ ] If there was an exploration email, it is gone from the inbox, Spam and Trash.
- [ ] The screens match the freeze screenshots.

## Rehearsals before the pilot

Before the pilot on November 18, rehearse the full reset twice, at least once on each
account:

1. Sign in as the study account and do what a session does: approve, edit and dismiss some
   suggestions, add a Calendar event, change a setting and, with the project owner's
   agreement, turn automatic scanning on.
2. Follow [Reset after every session](#reset-after-every-session), using a rehearsal code
   (for example `R1`, `R2`) in place of a participant code.
3. Pass the verify checklist.

Record each rehearsal on #101 as a completed checklist: rehearsal code, account label,
`ok`, digest matched, checklist passed. No screenshots that show addresses. If a rehearsal
fails, fix the cause and rehearse again; two clean rehearsals are needed before the pilot.

## When a reset refuses or fails

A refusal changes nothing. The account stays as the participant left it, and the log has a
`failed` row.

| Error code | Cause | What to do |
| --- | --- | --- |
| `STUDY_RESET_BAD_PARTICIPANT_CODE` | The code is not `P00`–`P99`, `PILOT` or `R0`–`R9` | Correct the code and run it again |
| `STUDY_RESET_UNKNOWN_LABEL` | The label is not `A` or `B` | Check the label and run it again |
| `STUDY_RESET_ACCOUNTS_NOT_TWO` | `study_reset.accounts` does not hold exactly the two study accounts | Stop. The owner completes the freeze setup |
| `STUDY_RESET_ACCOUNT_CHANGED` | The study account's details changed since the freeze | Stop. The owner checks the account against the private notes |
| `STUDY_RESET_NO_SNAPSHOT` | `take_snapshot` was not run for this account | Stop. The freeze setup is not complete for this account |
| `STUDY_RESET_LIVE_LEASE` | A scan, job or Calendar request was still running | Close the app's tabs, wait a few minutes, and run it again |
| `STUDY_RESET_CONNECTION_CHANGED` | A Google connect or permission prompt was started, or Google was disconnected, since the freeze | Stop. Do not reconnect. The owner decides whether a re-freeze is needed (#67) |
| `STUDY_RESET_CALENDAR_NOT_CLEARED` | `false` was passed and event records remain | Do step 2, then run it again with `true` |
| `STUDY_RESET_OTHER_ACCOUNTS_CHANGED` | Another account was active in the app while the reset ran | Nothing was changed. Run it again once; if it repeats, stop and tell the owner |
| `STUDY_RESET_DIGEST_MISMATCH` | The restored data did not match the freeze | Nothing was changed. Stop and tell the owner |
| `STUDY_RESET_SCHEMA_CHANGED` | The database tables differ from the ones the reset was written for | Stop and tell the owner |

To keep the Google connection unchanged, participants do not use Settings, Connections
during exploration, and nobody starts a Google connect or permission prompt on a study
account after the freeze.

If a reset fails during the study sessions:

1. Do not start the next session on that account. Pause it, and use the other account only
   if the protocol's counterbalancing allows it.
2. Tell the owner in the team's private chat.
3. Add a comment on #101 with the date, the account label, the participant code and the
   kind of failure from the table above. No addresses, ids or screenshots of them.
4. Resume only after a reset returns `ok` and the verify checklist passes. Log that reset
   as usual.

To see recent reset attempts, the owner can run:

```sql
select * from study_reset.log;
```

## After the study

When the last session and any re-checks are done, the project owner removes the reset:

```sql
drop schema study_reset cascade;
```

This deletes the snapshots, the account rows and the reset log, so copy what the study data
sheet needs from the log first. Record the removal in
[current state](<../../../Checkpoint 3/CURRENT_STATE.md>) with the date, time and who
approved it, and tick it off on #101.
