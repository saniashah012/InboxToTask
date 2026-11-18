# Loading and reloading a study inbox

**Checkpoint 4 | Issue #57 | For the person loading the inboxes, not for participants**

This page explains how the fictional emails for inboxes A and B get into the study Gmail
accounts, how to check a load against the answer key, and how to reload an inbox. The
content and answer keys come from #62 and #63; the scan that freezes the results is #67,
and the reset between sessions is #101.

**Never add real email, real addresses, account names, app passwords or participant
details to this page or to the inbox files.** Addresses and credentials live in the team's
password manager and the private study notes, not in this repository.

## Who sends what

Each study inbox receives mail from several senders, so participants have more than one
sender to allow:

- **Team members' own accounts** send some emails by hand. The inbox files mark these with
  a role label such as `Sender 1`.
- **The test sender**, one dedicated Gmail account, sends the rest. The inbox files mark
  these `sender: test-sender`.

The test sender is the team's existing development test account. For the study it sends
fictional email to study inboxes A and B, and the team also uses it to try the app during
development. It is never a study account and holds only test mail. Participants never get
its sign-in details. In the optional exploration (task script, Section 7) a participant who
does not want to use their own account may type a made-up email in a new-message window the
facilitator opens in the test sender. There is no spare study inbox.

Every email is really sent through Gmail. Nobody inserts messages directly into an inbox or
changes a sender address, so what participants see is ordinary delivered mail.

Two ways to send as the test sender are under consideration: the Claude Gmail connection,
and the send script described below. Whether the Claude Gmail connection can send (rather
than only create drafts) is recorded on issue #57. The script is the documented fallback,
and this page describes it.

## One-time setup

Done once, by the person who owns #57. Record completion on the issue as a ticked
checklist, with no addresses.

- [ ] Two-step verification is turned on for the test sender account.
- [ ] The account holds only test mail: fictional email and Google's own account notices.
- [ ] Its sign-in details are only in the team's password manager.
- [ ] A Gmail app password created for the script (Gmail allows these only with two-step
  verification on), and stored in the password manager next to the account.
- [ ] The addresses of study inboxes A and B are in the password manager or the private
  study notes.

To set up a machine to run the script:

1. Use Node 22 or later and install dependencies in `Checkpoint 3/app` as usual.
2. Copy the template `Checkpoint 3/app/study/.env.study.example` to
   `Checkpoint 3/app/.env.study`. That file is ignored by Git. Never commit it, paste it in
   an issue or show it on screen during a session.
3. Fill in, from the password manager:

   | Variable | Value |
   | --- | --- |
   | `STUDY_SENDER_ADDRESS` | The test sender's address |
   | `STUDY_SENDER_APP_PASSWORD` | The test sender's app password, not its normal password |
   | `STUDY_INBOX_A_ADDRESS` | Study inbox A |
   | `STUDY_INBOX_B_ADDRESS` | Study inbox B |

   Leave `STUDY_INBOX_C_ADDRESS` in the template empty; the study has no spare inbox. The
   same variables can be set in the shell instead of the file.

The script sends only to the study inbox addresses set here and refuses any other
destination.

## Email file format

Each inbox has a folder of email files, one Markdown file per email:

- `inbox_a/emails/*.md` for inbox A (#62)
- `inbox_b/emails/*.md` for inbox B (#63)

The answer key sits in the same inbox folder, outside `emails/`, and names senders by role,
never by address. In the key the test sender gets a number like the other senders (for
example Sender 3); only the email files use the label `test-sender`, which is how the script
knows what to send.

[inbox_template/](inbox_template/) has a copy-ready folder with example emails, a proposed
answer key layout and notes on writing each type of email. Two people write into each
`emails/` folder, so keep the ids apart: `01` to `29` for the main inbox (#62, #63) and `30`
onward for the edge cases (#64).

A file starts with front matter between two `---` lines, followed by the plain-text body:

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | Yes | Two digits, unique within the inbox, for example `07` |
| `sender` | Yes | `test-sender`, or a role label such as `Sender 1` for an email sent by hand |
| `subject` | Yes | The subject line |
| `send_order` | No | Where the email goes in the sending order |
| `reply_to_id` | No | The `id` of an earlier email this one replies to, for threads such as a changed deadline |

A fictional example:

```markdown
---
id: 07
sender: test-sender
subject: Lab report deadline moved
send_order: 7
reply_to_id: 03
---
Hi all,

Quick update on my earlier message: the lab report is now due Friday at 5 pm instead of
Thursday. Please upload it to the course site as before.

Thanks,
Course staff, Biology 101
```

Fictional content only. If an email needs an address or link in its body, use an
`example.edu` address.

## Loading an inbox

Run from `Checkpoint 3/app`.

1. **Dry run.** Check the files and see the plan without sending anything:

   ```powershell
   npm.cmd run study:send -- --inbox A
   ```

   Without `--send` the script opens no connection. It checks the files and prints the
   emails in sending order. Emails whose sender is a role label are listed as "send by
   hand from" that role. Fix any file errors and run it again until it is clean.

2. **Send the test sender's emails.**

   ```powershell
   npm.cmd run study:send -- --inbox A --send
   ```

   The script signs in to Gmail as the test sender and sends each `test-sender` email to
   study inbox A, one recipient per message, with a pause between messages (4 seconds by
   default; change it with `--delay-ms`). It stops at the first failure and exits with an
   error. See [Troubleshooting](#troubleshooting).

3. **Send the by-hand emails.** Each team member sends the emails listed for their role
   from their own account, in the order the dry run printed, to the study inbox address
   from the private notes. Copy the subject and body exactly from the file. For a reply
   (`reply_to_id`), reply to the earlier email in the same thread rather than starting a
   new one.

Use `--inbox B` for inbox B. The destination defaults to the inbox with the same letter.

If the order matters across both kinds of sender (for example, a by-hand reply to a test
sender email), follow the dry run's order: send the test sender's emails up to that point
with `--only`, send the by-hand email, then continue.

## Checking the load against the answer key

Sign in to the study inbox in Gmail and check:

- [ ] **Count.** The number of study emails matches the number of files.
- [ ] **Senders.** Each email came from the right sender for its role. Note the role in the
  check, not the address.
- [ ] **Order.** Emails arrived in the planned order.
- [ ] **Threads.** Replies (`reply_to_id`) appear in the same Gmail thread as the email they
  answer.
- [ ] **Spam.** Nothing is in Spam. Check the Spam folder explicitly.
- [ ] **Answer key.** Tick each email off against the answer key: subject, sender role, and
  that the body matches the file.

Post the completed checklist on the inbox's issue (#62 or #63), without addresses or
screenshots that show them.

## Reloading an inbox

Reloading means starting the inbox again from empty:

1. In Gmail, delete the study mail from the study inbox, then empty it from Trash as well,
   so old copies cannot be matched or scanned again. Delete only study mail.
2. Load the inbox again from step 1 of [Loading an inbox](#loading-an-inbox).

To resend only some emails, for example after a partial send, use `--only` with their ids:

```powershell
npm.cmd run study:send -- --inbox A --send --only 03,07
```

**After the freeze, do not reload study inboxes A and B.** The frozen scan (#67) and the
between-session reset (#101) depend on the Gmail messages that were scanned. Resending an
email creates a new Gmail message with a new id, so the frozen results would no longer match
the inbox. After the freeze, a reload happens only as part of a re-freeze that the team has
agreed and recorded on #67.

## No spare inbox

The study has no spare inbox, so each load goes straight into inbox A or B and is checked
there. Send one email first with `--only` and confirm it arrives before sending the rest.
Before the freeze a wrong load is fixed by reloading. Leave time for that: finish and check
both loads before the freeze scan (#67).

## Troubleshooting

| Problem | What to do |
| --- | --- |
| Sign-in fails | Check that `STUDY_SENDER_APP_PASSWORD` is the app password, not the account password, and that two-step verification is still on. If the app password was revoked, create a new one and update the password manager |
| Gmail starts refusing or delaying messages | Stop. Wait before sending more, raise `--delay-ms`, and resend the rest with `--only` |
| Mail lands in Spam | In the study inbox, open it and mark it "Not spam" so it moves to the inbox. Check the rest of the load, since more may follow |
| The script stopped partway | It stops at the first failure. Check the inbox to see which emails arrived, then resend only the missing ones with `--only` |
| The script refuses a destination | Only the configured study inboxes are allowed. Check the `STUDY_INBOX_*` values |
| A file error in the dry run | Fix the front matter: a missing field, a duplicate `id`, or a `reply_to_id` that names no earlier email |

If a send fails after some emails went out, do not rerun the whole inbox, or the inbox will
get duplicates. Resend the missing ids, or reload it from empty.

## After CP4

When the study and any re-checks are finished, remove the study's access to the test sender.
Record the completed checklist on #57, with no addresses.

- [ ] The Claude Gmail connection to the test sender revoked, if it was used.
- [ ] The test sender's app password revoked.
- [ ] The test sender account's password rotated, or the account closed if the team no
  longer needs it for development.
- [ ] `.env.study` deleted from every machine that ran the script.
- [ ] Study inbox passwords rotated or the accounts closed, as agreed for #55 and #56.
