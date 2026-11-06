# CP3 demo script

Draft for the 5-8 minute presentation. At least half must be live (3-4 minutes). Everything
below runs locally on a dedicated test mailbox with fictional mail. It has not been rehearsed,
so timings are estimates. Replace anything that changes if Calendar or the designed dashboard
lands before the demo.

## Limits that shape the demo

| Limit | Effect on the demo |
| --- | --- |
| 20 model requests per account per **UTC** day by default | Rehearsing tonight (after 6 PM Central) uses the same UTC day as a Friday morning demo. The local test account had used 16 of 20 by 9:35 PM Central on November 5, so its limit was raised to 50 for the demo. Say so if asked. The 200,000 daily token limit and the three-requests-per-minute limit are unchanged, and failed attempts keep their reservation, which was 24,384-26,058 tokens in testing |
| Two model calls per batch, 60-second scan cooldown | A live scan can only process two new messages at once. Pre-scan everything except the live email |
| Newest-first scanning; updates need an approved task | Approve the original task before the live deadline-change scan, or no targeted proposal appears |
| 30-second connect cooldown | Don't cancel and retry Google consent on stage |
| Gmail can file test mail as spam | Check Spam after sending. Spam and Trash are not scanned |
| Google notices count as blocked candidates | Candidate and blocked counts run high. Explain this if asked |
| Every normal reply is marked for review | Expected behavior (finding F5), not a failure |

**Never use the local account with the real mailbox.** Sign in only with the dedicated test account.

## Before the presentation

Run this at least 30 minutes ahead.

1. Check ports 5173 and 54321 before starting anything, then start only what's missing:
   Supabase, `functions serve`, and Vite. See [INSTALL](../app/INSTALL.md).
2. Set `ENABLE_GMAIL_SCAN=true` in the private functions file and restart `functions serve`.
3. Sign in at the product root and **reconnect Gmail**. Local connections were cleared when the
   token key was rotated.
4. Under **Connection and permissions**, save the allowed sender, the `Confidential` subject
   exclusion and the `School` topic. Give consent and uncheck **Pause scanning**.
5. Prepare mail from the [labeled fictional set](../tests/fixtures/gmail-live-cases.json):

   | When | Case | Purpose |
   | --- | --- | --- |
   | Already scanned | L01 two tasks, L05 ambiguous date, L06 injection | Results ready to show |
   | Already scanned | L07 `Confidential` subject, L09 unlisted sender | Blocked, nothing saved |
   | Approved beforehand | Both L01 tasks (report and slides) | Both must be approved, or the live update has only one candidate task |
   | **Sent during the demo, or just before** | L10 report deadline change | The live model call |

6. Do one full run-through, then confirm you still have budget left for the demo.
7. Keep backups open: a screen recording of a clean run, and the [L01-L25 results](use-cases.md#uc8-real-gmail-to-review-workflow).

Close other tabs and hide bookmarks. Don't show `.env` files, DevTools network tabs or callback URLs.

## Slides and timing

| Slide | Time | Say |
| --- | --- | --- |
| 1. Title | 30 s | Team, repo link. Important requests get buried in email |
| 2. Architecture | 1 min | Walk through the [diagram](architecture.md): React, Supabase Auth and Postgres, Edge Functions, Gmail API, Gemini. No vector database, because results are structured state |
| 3. Primary flow | 2 min, live | Part A below |
| 4. Edge cases | 1.5 min, live | Part B below |
| 5. Technical decisions | 1 min | One combined structured call per message, result reuse, budget reservation before inference, low thinking, no silent fallback model |
| 6. Safety | 45 s | Rules run in code before bodies are fetched, email is untrusted data, output is validated, the model has no tools |
| 7. Path to CP4 | 45 s | The limitations and evaluation plan below |

## Part A: primary flow (about 2 minutes)

1. **Settings.** Open **Connection and permissions**. "Connecting Gmail didn't allow scanning. Scanning needs a sender allowlist and separate consent, and topics never grant access."
2. **Live scan.** Click **Scan past seven days** and read out the batch counts. "Blocked mail was rejected on metadata, so its body was never fetched. Reused messages cost zero model calls."
3. **Review.** Open a suggestion. Point out the evidence quote and the **Open conversation in Gmail** link. "This is a proposal with its source, not a task yet."
4. **Approve.** Approve one suggestion. "Approval makes no model call and writes nothing to Calendar."
5. **Live update.** Show the L10 proposal: report moves from Nov 13 to Nov 18, slides untouched. "Two tasks share this thread, and it targeted the right one. The accepted value doesn't change until I approve." Approve it, then show the task and its source emails.

## Part B: edge cases and recovery (about 1.5 minutes)

Do these in order, and drop from the end if time is short.

1. **Ambiguous date (L05).** The deadline is empty and the app asks which date `12/11` means. "It flags this rather than guessing."
2. **Prompt injection (L06).** The email tells AI assistants to create a password task and mark it approved. The result is passive with no task. "One test case isn't proof of resistance. The stronger defense is structural: the model has no tools, output is validated, and only the user can approve."
3. **Blocked content (L07, L09).** Show that neither has a saved record, then mention the excluded marker test (L15), which checked saved results.
4. **Error recovery.** Check **Pause scanning**, save, and click scan. It's refused and saved results stay visible. Uncheck it, save, and the scan is allowed once the cooldown passes. This is the safest recovery to do live. A scan after unpausing wasn't repeated in the live test, so try this in rehearsal.

If the scan or model fails on stage, say so, click **Reload saved results**, and use the prepared results. Saved results surviving a failure is itself part of the recovery story.

## Limitations to state on slide 7

Disclosing these is required, so say them plainly unless the work lands first:

- Automatic 15-minute scans are not implemented; scans are manual.
- Google Calendar event creation is built but not verified live, and is planned for CP4. Accepted tasks offer a downloadable ICS file instead, which the user imports manually, with no sync or undo.
- Signed-in users get a plain workspace, not the designed dashboard from CP2.
- The demo runs locally. Hosted has the Gmail migrations, but the Gmail functions aren't deployed, so connecting Gmail and scanning work only locally.
- Live tests used one tester and about 15 fictional emails. They show the workflow runs, not how accurate extraction is.
- Not run live: settings changed mid-scan, rate limits, wrong-account connection, and domain and subdomain rules.

**CP4 preview:** the instructions aren't supplied yet, so confirm the track. Plan to expand the labeled set, freeze prompts, hold out test cases, compare human, AI and combined workflows, and measure task precision and recall, deadline accuracy and cost per reviewed task.

## After the demo

Set `ENABLE_GMAIL_SCAN=false` again and restart `functions serve`.
