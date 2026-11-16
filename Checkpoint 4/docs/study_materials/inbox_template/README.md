# Template for a study inbox

**Checkpoint 4 | Issues #62, #63, #64 | For the people writing the fictional emails**

Copy this folder to `inbox_a/` or `inbox_b/` next to it, then replace the four example
emails and fill in the answer key. The send script (#57) reads the `emails/` folder; see
[loading_inboxes.md](../loading_inboxes.md) for how an inbox is loaded.

```text
inbox_a/
  answer_key.md        the answer key (gold labels)
  emails/
    01-short-name.md   one file per email
    02-short-name.md
    ...
```

Only email files go in `emails/`. Every `.md` file there is treated as an email, so keep the
answer key and any notes one level up.

## One file per email

A file starts with a block between two `---` lines, then the email body as plain text:

```markdown
---
id: 03
sender: Sender 1
subject: Group project: who presents which section
---
Hi team,

Here is who presents each section on Thursday...
```

| Field | Required | What to write |
| --- | --- | --- |
| `id` | Yes | Two digits, unique in this inbox: `01`, `02`, … Start the file name with it |
| `sender` | Yes | `test-sender` if the test sender account sends it, or the role of the team member who sends it by hand: `Sender 1`, `Sender 2`, … |
| `subject` | Yes | The subject line. For a reply, write the original subject; `Re:` is added for you |
| `send_order` | No | A number, only if the email should not be sent in `id` order |
| `reply_to_id` | No | The `id` of the earlier email this one replies to, for example a changed deadline |

Rules the script checks:

- No other fields. A misspelled field name is an error, not ignored.
- A `reply_to_id` must name an email that is sent earlier in the same inbox.
- The body cannot be empty.

Things it cannot check, so please do:

- Fictional content only. No real names of classmates or staff, no real addresses or phone
  numbers. If the body needs an address or a link, use `example.edu`.
- Plain text only. The script does not send formatting, images or attachments.
- Use the same role label for the same person throughout an inbox, and the same labels in
  the answer key. Never write an address in a file or in the key.
- In the answer key the test sender gets a number like the other senders (the template uses
  Sender 3). The label `test-sender` appears only in the email files.
- Two people write into each `emails/` folder. Use ids `01` to `29` for the main inbox (#62,
  #63) and `30` onward for the edge cases (#64), so they never collide.
- A reply reaches Gmail as one thread only when both emails come from the same sender. If
  a by-hand email replies to another, that person replies inside the Gmail thread.

## Check your files

From `Checkpoint 3/app`, this lists the emails in sending order and reports any mistake. It
sends nothing:

```powershell
npm.cmd run study:send -- --inbox A
```

To check this template itself:

```powershell
npm.cmd run study:send -- --inbox A --dir "../../Checkpoint 4/docs/study_materials/inbox_template/emails"
```

## Writing each type of email

The types come from #62 and #64. Give each email one hard feature, so it can be scored
cleanly, and write the matched emails for inboxes A and B together.

| Type | How to write it | What the answer key records |
| --- | --- | --- |
| Plain task | One clear request to the participant, with an explicit date | The task, owner and deadline |
| Two tasks in one email | Two separate requests with different deadlines, not one request with two steps | Two tasks |
| Changed deadline | A reply to the original email, from the same sender, giving the new date and saying it replaces the old one | No new task; the original task's new deadline |
| Ambiguous date | A real ambiguity, such as "by the end of next week" or "the 5th" | The task, and which deadlines count as correct, including none |
| Someone else's promise | The sender commits to do something for the participant | No task for the participant |
| Informational only | News or a notice with no request | No task |
| Calendar meeting (#65) | The meeting email the Calendar task defines, with its date and start time | The expected event from #65 |
| Sender not allowed | Sent from a team member's account that participants are not told to allow | Not processed |
| Skipped-category word | From an allowed sender, using a word on a skip list in the standard setup | Skipped before the AI |
| Instructions aimed at the AI | A fictional email whose body tells an assistant to do something, such as mark every task complete | Processed as ordinary text; the instruction is not followed |

- **Dates.** Except in the ambiguous-date email, write absolute dates that fall after
  November 20. The scan is frozen before the sessions, so a deadline during the session days
  would be overdue for some participants and not for others.
- **Changed deadlines stay in one thread.** Send the change as a reply from the same sender
  as the original. The app looks for the task to update in the same Gmail thread.
- **Matching.** #62 asks for the same case types in both inboxes, task counts within one, and
  total words within 20%.

## The four examples

| File | Shows |
| --- | --- |
| `01-example-plain-task.md` | A plain task, sent by the test sender |
| `02-example-by-hand.md` | An email a team member sends by hand, with two tasks |
| `03-example-changed-deadline.md` | A reply that changes the deadline in `01` |
| `04-example-no-task.md` | Informational mail with no task |

Delete them from your copy once your own emails are in place.
