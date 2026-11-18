# Answer key for inbox [A or B]

**Checkpoint 4 | Issue #[62 or 63] | Gold labels for scoring; not shown to participants**

Senders are named by role only. Never write an address here.

## Senders

| Role | Who sends | Participants are told to allow it? |
| --- | --- | --- |
| Sender 3 | The test sender account (#57); its email files say `sender: test-sender` | Yes |
| Sender 1 | A team member, by hand | Yes |
| Sender 2 | A team member, by hand | Yes |

## Emails

One row per email, in `id` order. The rows below describe the four example emails; replace
them.

| id | Sender | Subject | Tasks expected | Case type |
| --- | --- | --- | --- | --- |
| 01 | Sender 3 | Lab report 3 due Thursday | 1 | Plain task |
| 02 | Sender 1 | Group presentation next week | 2 | Two tasks in one email |
| 03 | Sender 3 | Re: Lab report 3 due Thursday | 0 new; changes the task from 01 | Changed deadline |
| 04 | Sender 2 | Library hours during fall break | 0 | Informational only |

Case types to cover (#62, #64): plain task, changed deadline, two tasks in one email,
informational only, someone else's promise, ambiguous date, the Calendar meeting (#65), a
sender participants are not told to allow, instructions aimed at the AI, and a word from a
skipped category's list.

## Tasks

One row per task the participant should end up with.

| Task | From email | Owner | Deadline | Notes |
| --- | --- | --- | --- | --- |
| Upload lab report 3 | 01, changed by 03 | Participant | Friday, December 4, 5:00 pm | Thursday is wrong after email 03 |
| Send three slides to Sam | 02 | Participant | Monday, noon | |
| Book a library study room | 02 | Participant | Before Tuesday evening | Deadline is implied, not stated |

## Emails with no task, and expected handling

| id | Expected result | Why |
| --- | --- | --- |
| 04 | No task; may appear as passive communication | Information only |

For the edge cases in #64, state what the app should do: skipped before the AI, not
processed because the sender is not allowed, or processed with the instruction ignored.

## Totals, for matching with the other inbox

| Measure | This inbox |
| --- | --- |
| Emails | |
| Tasks | |
| Total words in bodies | |
