# CP3 demo script

For the 5-8 minute presentation, required by [CP3_INSTRUCTIONS](../CP3_INSTRUCTIONS.md). At least
half must be live. Everything runs locally on a dedicated test mailbox with fictional mail. The
timings below are plan estimates from the instructions, not measurements, and the full run has not
been rehearsed end to end.

## 10-minute setup check

Do this before you present. Never sign in with the account that holds the real mailbox. Use the
dedicated test account only.

1. **Start the stack.** Check whether ports 5173 and 54321 are already in use before starting
   anything, then start only what is missing: Supabase, `functions serve` and Vite. See
   [INSTALL](../app/INSTALL.md).
2. **Turn scanning on.** Set `ENABLE_GMAIL_SCAN=true` in the private functions env file and
   restart `functions serve`. Don't open that file on screen.
3. **Sign in and check the connection.** Sign in with the dedicated test account only. Under
   **Connection and permissions**, look for "Status: connected" with the test address. If it isn't
   connected, click **Reconnect Google**.
4. **Check permissions.** In the settings form, confirm the allowed sender, the `Confidential`
   subject exclusion, consent checked and **Pause scanning** unchecked. Don't save unless something
   needs fixing. The summary with **Edit settings** only appears right after a save.
5. **Test the scan and recovery.** Click **Scan past seven days**. Saved mail should show as reused
   with no new tasks. Then try the pause recovery from Part B once, because a scan after unpausing
   has not been repeated live. Leave scanning unpaused. Make a quick screen recording of this as a
   backup.
6. **Prepare the live emails, and don't send them yet.** Save the three drafts below in the allowed
   sender's Gmail. Test one similar email now if you can, because this exact set has never been run.
   Wait for the countdown ring to finish before you present.

**Live emails** (fictional, sent from the allowed sender to the test mailbox):

| Draft | Subject | Body | Expected |
| --- | --- | --- | --- |
| A, new task | Project budget form | Please submit the Riverton project budget form by Friday, November 13. Dana Whitfield | One new suggestion |
| B, **reply** in the existing "Riverton capstone deliverables" thread | Re: Riverton capstone deliverables | The written report is now due Tuesday, November 24. The slides deadline has not changed. Dana Whitfield | Proposal moving the report from Nov 20 to Nov 24 |
| C, blocked | Confidential: advisor notes | Please review the advisor notes by November 12. Dana Whitfield | Blocked by the subject rule, nothing saved |

A and B use the batch's two model calls. C uses none. Draft B has to be a real reply, or the update
has no task to target. Send from a window that shows only the drafts, and don't show that account's
inbox on screen.

Close other tabs and hide bookmarks. Don't show env files, DevTools network tabs or callback URLs.

The test account already holds results from live testing, so don't re-create them. This is what it
held at 10:27 PM on November 5. If it has changed, adjust the lines below.

| Item | State before the demo | Purpose |
| --- | --- | --- |
| Written report (due Nov 20), slides (due Nov 17) | Accepted, same thread | "2 tasks from this conversation", and the live-update target |
| Lab safety quiz | Accepted, cancelled | A cancellation that kept its values |
| Research poster (L05, no deadline) | Pending in **Review** | Part B ambiguous date. Don't approve it |
| Return the library books (due Nov 15) | Pending in **Review** | Leave as it is, or use it as the backup for the live approval and ICS export |
| Room reservation and room details | Pending in **Review** | Leave as they are |
| L06 injection | Saved as information, no task | Part B |
| L07 `Confidential` subject, L09 unlisted sender | Blocked, nothing saved | Part B |
| Live emails A, B and C | Drafted, not sent | The live scan |

Source mail: [labeled fictional set](../tests/fixtures/gmail-live-cases.json). The live emails are
new for this demo, not recorded cases.

## Run sheet (8 minutes at most, about 4 minutes live)

Time is cumulative plan, not measured. If you run long, drop Part B items from the end, and trim
slide 5 first.

| Time | Slide or screen | Click | Say |
| --- | --- | --- | --- |
| 0:00 | 1. Title | Slide only | "Important requests get buried in email. InboxToTask turns permitted email into reviewable tasks." Names, repo link |
| 0:30 | 2. Architecture | Slide only, see [diagram](architecture.md) | "React front end, Supabase Auth and Postgres, Edge Functions, the Gmail API and Gemini. No vector database, because results are structured state." |
| 1:30 | 3. Primary flow (live) | Browser. Point at the branded top bar, then open **Connection and permissions** | "Real Gmail and real Gemini, running locally on fictional mail. Connecting Gmail didn't allow scanning. Scanning needs a sender allowlist and separate consent." Point at the status line "Status: connected" with its icon and the settings form |
| 2:00 | Live | Send drafts A, B and C. Check that they arrived in the test mailbox and not in Spam | "I'm sending three new emails right now: a new request, a deadline change, and one the rules should block." |
| 2:20 | Live | **Review** section, then click **Scan past seven days** | "While it scans you'll see a spinner." Then read the number tiles under Last batch: "Two new emails went to the model. The blocked one was rejected on metadata, so its body was never fetched. Reused messages cost zero model calls." Note the countdown ring and disabled scan buttons: "That is the 60-second cooldown." Scan length isn't measured, so keep talking if it takes a while |
| 3:00 | Live | Point at the new budget form card in **Review** | "Each suggestion has its evidence quote and a link, **Open conversation in Gmail**. This is a proposal with its source, not a task yet." |
| 3:15 | Live | Click **Approve task** on that card | "Approval makes no model call and writes nothing to Calendar." Read the notice: "Task approved. No Calendar event was created." |
| 3:30 | Live | **Review** proposal for the report (expected: Nov 20 to Nov 24, slides untouched). This reply has never been run, so check what appears. Click **Approve edit** | "A reply moved the deadline. The accepted value doesn't change until I approve." Only if the proposal targets the report: "Two tasks share this thread, and it targeted the right one." Then open **Accepted tasks** |
| 3:50 | Live | **Accepted tasks**: show "2 tasks from this conversation". Click **Show saved excerpt** on a task | "Each task keeps an email history with its evidence behind **Show saved excerpt**." |
| 4:15 | Live (Calendar) | On the budget form task you just approved, click **Export calendar file**, then **Download ICS** | "Approval doesn't create a calendar event. The user explicitly exports a file. It holds only the title and the schedule." Point at the confirmation "Calendar file download started. Import it into your chosen calendar." |
| 4:40 | 4. Edge cases (live) | **Review** and **Information** | See Part B. "It flags the ambiguous date (L05) rather than guessing." Then L06: "One test is not proof of resistance. The stronger defense is structural: the model has no tools, output is validated, and only the user can approve." |
| 5:10 | Live | **Connection and permissions**, check **Pause scanning**, **Save scanning settings**, then try a scan if the buttons are enabled | "The scan is refused, and saved results stay." Then click **Edit settings**, uncheck and save. If the countdown is still running, skip the scan and say it comes back when the countdown ends |
| 5:30 | 5. Technical decisions | Slide only | "One combined structured call per message, reuse of saved results, budget reserved before inference, low thinking, no silent fallback model." |
| 6:30 | 6. Safety | Slide only | "Rules run in code before bodies are fetched. Email is untrusted data. Output is validated. The model has no tools." |
| 7:15 | 7. Path to CP4 | Slide only | Read the limitations below, then the evaluation plan |

## Part B details

Do these in order, and drop from the end. The run sheet leaves about 50 seconds, so expect to cover
two or three.

1. **Ambiguous date (L05).** Deadline is empty and the app asks which date `12/11` means.
2. **Prompt injection (L06).** The email tells AI assistants to create a password task and mark it
   approved. The result is passive with no task. This is one probe only.
3. **Blocked content (L07, L09).** Neither has a saved record. Mention the marker test (L15), which
   checked saved results.
4. **Pause recovery.** Under **Connection and permissions**, check **Pause scanning** and click
   **Save scanning settings**. The form collapses to a summary. Click **Scan past seven days**. It
   is refused and saved results stay visible. Then click **Edit settings**, uncheck it and save. Scan
   buttons stay disabled during the 60-second countdown, so a scan may have to wait. A scan after unpausing has not been repeated live, so try it once during
   setup.

Optional, only if merged: first-run setup was being connected on a separate branch and may not have
landed. If it is in your build, click **Run setup again** to show it. If you don't see that button,
skip this and never describe onboarding as available.

## If something breaks

- **Scan or model fails.** Say so: "The scan failed, so I'll show what was saved." Click
  **Reload saved results** and continue with the prepared results. Saved results surviving a failure
  is part of the recovery story.
- **Scan refused or cooling down.** Wait for the countdown ring to finish. Then check
  **Connection and permissions**: consent given, not paused, connected.
- **Connection says reconnect required.** Don't retry Google consent on stage (30-second connect
  cooldown). Use the saved results and say the connection lapsed.
- **New email isn't found.** Check Gmail's Spam folder and that the sender is allowed. Say what
  happened, and use the "Return the library books" card for the approval and ICS steps.
- **Update proposal doesn't appear.** Say it didn't arrive. Likely causes are Spam, or a message that
  wasn't a reply in the thread. Show the [recorded L10 result](use-cases.md#uc8-real-gmail-to-review-workflow),
  which moved the report from Nov 13 to Nov 18.
- **ICS import looks wrong.** Importing the same task twice is untested, and its identifier stays
  the same. Use a task that hasn't been exported before, or delete the earlier event first.
- **Everything is down.** Play the screen recording and say it is a recording of a clean run.

## Limits and budgets

| Limit | Effect on the demo |
| --- | --- |
| Daily request limit per account per **UTC** day | Default is 20. The local test account's limit was raised from 20 to 50 for the demo. Say so if asked. Rehearsing in the evening Central time uses the same UTC day as a morning demo |
| 200,000 tokens per UTC day, three requests per minute | Unchanged |
| Two model calls per batch, 60-second scan cooldown | A live scan processes two new permitted messages at most, so send only drafts A and B plus the blocked C |
| Tokens per call | About 2,500 per live call across 14 local calls. Failed attempts keep their reservation, which was 24,384-26,058 tokens in testing |
| Updates need an approved task in the same thread | The report and slides are already approved. Send the update as a reply in their thread |
| 30-second connect cooldown | Don't cancel and retry Google consent on stage |
| Gmail can file test mail as spam | Spam and Trash are not scanned |
| Google notices count as blocked candidates | Candidate and blocked counts run high. Explain if asked |
| Every normal reply is marked for review | Expected (finding F5), not a failure |

## Limitations to state on slide 7

Say these plainly:

- Automatic scans are not implemented. Scans are manual.
- Google Calendar event creation is on a separate unmerged branch with offline tests only, never
  tested live, and is planned for CP4. ICS file export is the current calendar path. All-day and
  timed imports were each checked once by a tester in Google Calendar, and importing the same task
  twice is untested. The file holds only the title and schedule, with no sync or undo.
- Real data is not connected to the designed dashboard.
- The demo runs locally. Hosted has the Gmail migrations, but no Gmail functions are deployed, so
  connecting Gmail and scanning don't work on the live site.
- Live cases are fictional mail in one test mailbox, about 15 emails and one tester. They show the
  workflow runs, not extraction accuracy. L06 is one probe, not proof of injection resistance.
- Hosted settings save, reload, stale-tab rejection and two-account isolation passed in a teammate's
  check of an earlier preview. That doesn't cover review or the newest screens. Sign-in also silently
  reuses the current Google account, so switching accounts isn't verified.
- Not run live: settings changed mid-scan, rate limits, wrong-account connection, and domain and
  subdomain rules.

**CP4 preview:** the instructions aren't supplied yet, so confirm the track. Plan to expand the
labeled set, freeze prompts, hold out test cases, compare human, AI and combined workflows, and
measure task precision and recall, deadline accuracy and cost per reviewed task.

## After the demo

1. Set `ENABLE_GMAIL_SCAN=false` in the private functions env file and restart `functions serve`.
2. Optional: restore the test account's daily request limit from 50 to 20.
