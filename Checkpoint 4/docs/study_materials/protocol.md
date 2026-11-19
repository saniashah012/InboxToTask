# CP4 study protocol

## Session at a glance

There are five scored tasks. Participants do Task 1 in both Gmail and InboxToTask. Run Tasks 2–5 immediately after the InboxToTask list, whether InboxToTask comes first or second.

| Task | Where it runs | What to capture |
| --- | --- | --- |
| 1. Prepare a weekly task list | Gmail and InboxToTask | Both final lists, time, answer-key scores, and review behavior. |
| 2. Handle a changed deadline | InboxToTask | Whether the update appeared, whether the participant noticed it, and the saved deadline. |
| 3. Add a meeting to Calendar | InboxToTask | Correct event, time, help, and any fallback. |
| 4. Mark a task done and bring it back | InboxToTask | Completion and reopening outcomes, first place looked, and help. |
| 5. Turn an informational email into a task | InboxToTask | Whether the participant finds the email, creates one Active task, and saves the requested date and time. |

## Study design

Recruit 5–8 college students outside the team. Each participant completes two conditions on a computer using different matched fictional inboxes. Compare Gmail with a blank task log (manual) against the hosted InboxToTask workflow (assisted). Before each InboxToTask session, save a copy of the starting suggestions. During analysis, compare those suggestions with the answer key and the participant’s final list to identify errors introduced by the system and errors corrected during review. Participants do not complete a separate AI-only round. Practice-session data is excluded from study results.

Assign IDs in session order. Use the scheduled row if a participant reschedules. If someone withdraws, mark their row accordingly and record the actual assignments in the sheet. For fewer than eight participants, use the first available rows in order.

| Participant | First | Second |
|---|---|---|
| P01 | Manual A | InboxToTask B |
| P02 | InboxToTask A | Manual B |
| P03 | Manual B | InboxToTask A |
| P04 | InboxToTask B | Manual A |
| P05 | Manual A | InboxToTask B |
| P06 | InboxToTask A | Manual B |
| P07 | Manual B | InboxToTask A |
| P08 | InboxToTask B | Manual A |

## Before the session

- Restore the assigned fictional inboxes and app state using #101. Keep auto-scan on throughout the InboxToTask block. Let the initial scan finish before Task 1 and compare starting suggestions with the expected setup for that inbox. Resolve setup differences before starting and document any deviations. Use the same task scope and reference time across inboxes (#62–#64).
- The facilitator key identifies four distinct targets per inbox: the task whose deadline changes, the Calendar meeting, the task to complete and reopen, and the informational email used to create a reminder. Write the exact follow-up reply, old and new deadlines, expected Calendar event, and the Passive conversion target. Include a matched informational email in each inbox that requires no action. Keep the deadline-change reply out of the starting inboxes.
- Open a blank task log for the manual round with action, owner, due date/time, and conditions. Prepare the questionnaire (#61), the facilitator script (#59), and the private study data sheet described in [data_dictionary.md](data_dictionary.md).
- Review the consent form (#60). Store signed copies in the team's private shared consent folder and keep them separate from coded results. Confirm that the folder and approved consent form are available before recruiting sessions. Participants use fictional inboxes, with no personal inbox connected.

## Run the session

Ask participants to work at their normal pace. Restart the same stopwatch for each scored activity. Record seconds on a separate row for each Task 1 condition, Task 2, Task 3, each Task 4 step, and Task 5. If Calendar rescheduling runs, give it a separate row and timer.

Start prompted activities on “Begin” and stop when the participant finishes, stops trying, or reaches the agreed task limit. Exclude setup, facilitator verification, and follow-up questions. For Task 2, record reply-to-update delay, update-to-notice delay, and notice-to-completion time separately. If the update is never noticed, leave notice-dependent times blank and record that outcome. Keep the same task limits and update observation windows for every participant, with equal limits for both Task 1 conditions. The session record must name the limits used. Agree on them before the first scored session.

Allow neutral think-aloud prompts such as “What are you looking for?” Record help that identifies a control or answer. Leave survey answers and interview questions untimed.

### Welcome and consent

Explain voluntary participation, what is recorded, and how to think aloud. Assign the study ID after consent. Follow the assigned order above. Use neutral prompts such as “What would you try next?” If you point to a tab, control, or answer, document the help and record the outcome as completed with help if the participant succeeds.

### Task 1. Prepare a weekly task list

Read the same goal in both conditions:

> Imagine these emails came in while you were busy. Make a list of the things you need to do, and include a deadline whenever the email gives one. Let me know when you’d feel ready to work from your list.

Tell participants in both conditions to leave financial emails out of their study task list. Keep the agreed Financial exclusion enabled throughout scored InboxToTask activities.

In Gmail, let the participant read and search normally. The evaluator types the actions and deadlines the participant dictates into the digital log. Let the participant review and correct it before calling it final. The evaluator records the participant’s decisions without supplying missing actions. Use this procedure for everyone and describe it when reporting the timing comparison. In InboxToTask, explain that their saved tasks are their list. Let them verify source emails as needed. Start timing on “Begin” and stop when the participant says the list is ready, stops trying, or reaches the common cutoff. Save the full Gmail log or full InboxToTask Active list under the participant ID **before** any follow-ups. Capture task wording and deadlines, along with owner or conditions where applicable.

Score from the appropriate inbox answer key. Compare missing actions with the starting suggestions to see where the omission occurred. If a participant independently spots a missing action, document what they found and whether it made it onto the saved list. A purely informational email counts as an extra action if it appears in the initial task list. In InboxToTask, this can happen if it is incorrectly suggested as actionable and accepted. Any personal reminder deliberately created later in Task 5 is scored in Task 5. Save questions about finding the application confirmation until after Task 5 to avoid teaching its navigation beforehand. Ask the satisfaction question below immediately after each Task 1 round.

### Task 2. Handle a changed deadline

Use the designated task in the participant’s Active list. If it is missing, save the original list first and record the omission. Then help the participant add it as setup and log the help. If the task cannot be set up, record the reason and continue to Calendar.

Send the scripted reply from the study sender after the original task is saved and Task 1 is recorded. Keep auto-scan on. Give the same neutral prompt in every session: “Continue getting your week ready.” Observe without pointing to the reply or triggering a scan.

Record when the reply was sent, whether and when the app surfaced the change, whether the participant noticed it, and what they changed. Success means the existing task has the new deadline and there is no duplicate. If the update does not appear within the agreed observation window, record the system outcome and mark the participant response as not assessable. Keep waiting and handling time separate from Task 1.

### Task 3. Add a meeting to Calendar

Before the session, verify that the study account is connected to its primary Google Calendar, that the calendar displays Central Time, and that previous study events have been cleared.

Read the prompt using the assigned meeting title:

> You received an email about [meeting title]. Using InboxToTask, add the meeting to the Google Calendar connected to this test account. Use the details in the email. Tell me when you think it has been added.

| Inbox | Expected event |
| --- | --- |
| A | Design Project Check-in, Dec 1, 2026, 2:00–2:30 p.m. Central, primary calendar of the connected Inbox A study account. |
| B | Research Project Check-in, Dec 2, 2026, 2:00–2:30 p.m. Central, primary calendar of the connected Inbox B study account. |

Start a fresh timer on “Begin.” Stop when the participant says they are done, stops trying, or reaches the agreed Calendar limit. Exclude facilitator verification and questions from elapsed time. Verify the actual saved event in Google Calendar. Success requires exactly one event with the correct title (equivalent wording and capitalization accepted), date, start and end times, time zone, and destination calendar.

Record elapsed seconds, correctness of each field, duplicates, help, where they got stuck, and whether they thought the event was saved. For each prefilled field, record observed corrections or missing values. Use “not observed” if you could not see its initial value.

Ask these questions after the Calendar block, including rescheduling if it runs. Stop all Calendar timers first. This keeps recollections fresh and avoids discussing the interface before the rescheduling activity:

1. “When you first saw Add to Calendar, what did you expect it to do?”
2. “What told you the event had been added? Which calendar did you think it went to?”
3. “How did it feel to review the event details in InboxToTask? Where would you prefer to do that, and why?”
4. “Earlier, when you accepted the meeting suggestion and it became a task in InboxToTask, what did you think, if anything, had happened in Google Calendar at that point?”

For question 4, code expected automatic Calendar creation, expected a separate Calendar action, or unsure. Use N/A if they did not accept the original suggestion. Keep answers separate from observed event correctness.

For these December events, use Central Standard Time when the email omits a zone. An explicit zone in an email determines its meeting time. Confirm the study calendar uses the expected display zone during session setup.

#### Calendar rescheduling, if implemented for the study

Run this scored follow-up for participants who successfully added the original event if email-driven rescheduling is verified before the study version is fixed. If unavailable, omit the follow-up consistently and log why.

Send the scripted same-thread reply after the original event is saved. For Inbox A use R02. For Inbox B use its matched reply. Both move the meeting to 3:00–3:30 p.m. Central on the same date. Let auto-scan process the reply and record when the change appears.

Once the proposal is available, read:

> You received another email about the meeting you just added. The meeting time has changed. Use InboxToTask to make sure your calendar shows the new time. Tell me when you think it is updated.

Start its own interaction timer on “Begin.” Verify that the original event moved to the new time on the same primary calendar and there is exactly one event. Record elapsed seconds, help, whether they used the proposal or manual editing, and their observed verification behavior. Ask “What told you the new time had been saved?” after stopping the timer. Report this outcome separately from adding the meeting. If the proposal never appears, record the system outcome and mark participant handling N/A.

If Calendar is unavailable, skip both Calendar activities and their questions. Say, “Let’s move to the next activity.” Record N/A — Calendar activity omitted. Continue with Tasks 4 and 5.

### Task 4. Mark a task done and bring it back

Use the designated Active task. If it is missing, help the participant add it and record that setup. Read the prompts one at a time, substituting the task name:

> Imagine you’ve finished [task]. Show me how you’d mark it done.

> You realize there’s still one thing left to do. Make sure [task] is back on your list of things to do.

Start and stop a separate timer for each prompt, recording both durations. Score completion and reopening separately. Verify that the task reaches Completed and that the same task returns to Active. Either unchecking the item or choosing Move to Active counts. If the participant cannot complete the first step, record it and help establish the Completed state so they can try reopening. Record where they look first, any help, and what tells them the task is back. In the debrief, ask where they would look for a dismissed suggestion and what they expect Restore to do.

### Task 5. Turn an informational email into a task

Run this after recording the original task list and completing Tasks 2–4. Choose one informational email per inbox that has no required action. Use a matched example in both inboxes, such as the application confirmation. During session setup, confirm that the target email appears in Passive communication and that Turn into task is available.

Read the scenario without naming the tab or button:

> You want to check on the status of your design award application next week. Use the application confirmation email to make yourself a task to check its status on Nov 30 at 10 a.m. Tell me when it’s ready.

For Inbox B, use the corresponding application and the same planning date and time. This is a reminder the participant chooses to create from informational mail. Capture it after the original task-list score so it is not counted as an extra action in Task 1.

Start a fresh timer on “Begin.” Observe whether they find the confirmation, open its source, discover Turn into task, review the prefilled fields, and save. Do not direct them to Passive communication or the button unless they need assistance. Stop on completion, giving up, or the agreed task limit.

Success means exactly one new Active task linked to the confirmation email, with a title that expresses checking the application status and Nov 30, 2026 at 10 a.m. Central as its planning deadline. Verify the saved task, rather than relying only on the participant saying it worked. Record any help, prefill corrections, elapsed seconds, and whether the original item leaves Passive after saving. If the feature is unavailable, record N/A and the reason.

Ask afterward, “What did you expect would happen to the original email when you made it a task?” Record any confusion about the difference between the original informational message and the reminder they chose to create.

### Questionnaires and debrief

Use the following questions in the study survey and align them with #61. Save responses under the participant ID. The facilitator records the numbers as given and calculates scores afterward.

#### Satisfaction after each task-list round

Ask immediately after Gmail Task 1 and immediately after InboxToTask Task 1:

> How satisfied were you with the process of putting together your task list?

| Rating | Meaning |
| --- | --- |
| 1 | Very dissatisfied |
| 2 | Somewhat dissatisfied |
| 3 | Neither satisfied nor dissatisfied |
| 4 | Somewhat satisfied |
| 5 | Very satisfied |

These are the same question and response options in both rounds. Save both ratings. Subtract Gmail from InboxToTask to calculate the paired satisfaction difference. For example, Gmail 3 and InboxToTask 5 gives +2. If either is missing, leave the difference blank.

#### UMUX-Lite usability questionnaire

Ask after all scored InboxToTask activities, before optional exploration. Use the two standard statements, substituting the product name:

1. InboxToTask’s capabilities meet my requirements.
2. InboxToTask is easy to use.

Each statement uses 1–7, with 1 Strongly disagree, 4 Neither agree nor disagree, and 7 Strongly agree. Let the participant select any integer from 1 to 7.

Save both raw ratings. For this study, report their average on the 1–7 scale. Example: ratings of 6 and 5 give (6 + 5) ÷ 2 = 5.5 out of 7. If either is missing, leave the average blank. Label the score “UMUX-Lite mean, 1–7.” This protocol selects UMUX-Lite as the usability questionnaire.

#### Interview after both rounds

Ask what helped, what slowed them down, when they trusted or checked a suggestion, and how they decided the list was ready. Ask for concrete examples. Include “If you dismissed a suggestion and changed your mind, where would you look for it, and what would you expect Restore to do?” Record consented quotes and notes for later analysis of trust, usefulness, and friction.

### Exploration after scored work

If consent and the live setup support the exploration proposed in #58, offer it after the InboxToTask scored activities and its usability questionnaire. Allow 5–8 extra minutes. Give participants the study sender as the default. Use only a verified study sender or another verified test inbox for fictional emails. Invite participants to try sender inclusions or subject exclusions and predict what will be processed. Ask them to predict what will happen before scanning, allow settings changes and an automatic or manual scan, then ask whether the outcome matched their expectation. Keep these results separate. Capture only fictional email content, coded settings, redacted evidence, and consented quotes. Two graders independently assess filter behavior, extraction, and prediction, then reconcile disagreements. Confirm #101 clears the extra message, settings, and output before another session.

### Capture and reset

Confirm that both original task lists, follow-up outcomes, questionnaire responses, and notes are saved under the participant ID before resetting. Run #101 to clear or restore study messages, app state, settings, and Calendar events as applicable. Verify the previous deadline-change reply is gone and log reset status. Resolve reset failures before starting the next session.

## Scoring and analysis

Before scored sessions, align #59, the data dictionary, and the shared data sheet with these tasks. Include fields for update appearance, deadline handling, and both completion and reopening outcomes.

Write the final answer keys and lock these rules before scored sessions. Match final actions to answer-key IDs by meaning and owner context, accepting equivalent wording. Each gold action can match once. Extra actions and duplicate rows are false positives. Missed gold actions are false negatives. Score owner, due date/time, and condition separately for matched actions. Preserve “no deadline” where the key has none. A stale date after a change counts as a deadline error. A canceled action kept as active counts as an extra action. Record ambiguous cases for two graders to reconcile using the answer key and source.

| Measure | Record and interpret |
|---|---|
| Task success | For each workflow and inbox, record matched, missed, extra, and duplicate actions plus owner, deadline, and condition accuracy. Compute precision = TP/(TP+FP), recall = TP/(TP+FN), and F1 = 2TP/(2TP+FP+FN). Use N/A for undefined denominators. Use the final saved list for the primary score. Record missing-task flags separately and mark whether each omission was absent from the initial suggestions or remained uncaptured after review. |
| Time | Seconds from “Begin” to completion, stopping, or timeout. Record timeout and early stop separately. Report completion times with the counts of timeouts and partial attempts. Keep Calendar, live scan latency, and optional exploration out of core times. |
| Corrections and source checks | Tally changes to task fields or decisions and deliberate checks against source messages. Count one correction per changed field or decision and one check per deliberate verification action. For AI oversight, compare frozen errors with final decisions and code caught, accepted, or unresolved. |
| Changed deadline | Record reply send time, update appearance, whether it was noticed, final deadline, duplicate status, and assistance. Report how often the update surfaced and how often participants handled it among sessions where it surfaced. |
| Completion and reopening | Record whether each state change succeeded independently or with help, where the participant first looked, and the final task state. |
| Calendar | Use the correctness checks and outcomes in Task 3 above. Record correctness, elapsed seconds, assistance, prefill corrections, perceived success, approval expectation, and omissions. Report Calendar rescheduling separately if run. |
| UMUX-Lite and satisfaction | Save raw responses. Average the two 1–7 usability ratings. Compare each participant’s two 1–5 satisfaction ratings using InboxToTask minus Gmail. Report individual responses and group medians. |
| Passive conversion | Record independent success, success with help, unsuccessful, or N/A, plus seconds, saved task title/date/time, duplicates, prefill corrections, and expectations about the original message. |
| Interview and think-aloud | Record coded notes and consented quotes. Two teammates code for trust, usefulness, and friction, reconcile disagreements, and document revisions to the codebook. |

### Plain-language scoring guide and worked example

Use the final Task 1 list captured before all follow-ups. Accept equivalent wording and match each expected action once.

| Term | Meaning |
| --- | --- |
| Correct actions (TP, true positives) | Expected participant actions present on the final list. |
| Extra actions (FP, false positives) | Unsupported actions plus duplicate entries beyond the first matching action. |
| Missed actions (FN, false negatives) | Expected actions absent from the final list. |

Example: an answer key has six actions. The participant records five expected actions and one unsupported action. Record 5 correct, 1 extra, and 1 missed.

- Percentage of expected actions captured = correct ÷ expected × 100. Here, 5 ÷ 6 × 100 = 83%.
- Deadline accuracy = correctly recorded deadlines ÷ captured actions that have a known deadline in the key × 100. If four captured actions have known deadlines and three are right, 3 ÷ 4 × 100 = 75%. A blank deadline counts as incorrect. Exclude unresolved dates from this denominator and score whether the participant preserved their uncertainty. Use N/A when the denominator is zero.
- Score the action and deadline separately. An expected action with a wrong deadline still earns action credit and receives a deadline error.
- Record whether conditional actions preserve their condition. Record a user-chosen planning date separately from a deadline stated in the email.

The analysis team may also calculate precision = correct ÷ (correct + extra), recall = correct ÷ (correct + missed), and F1 = 2 × correct ÷ (2 × correct + extra + missed). For this example, all three equal 83% when expressed as percentages. Use N/A for a zero denominator. Facilitators only need to record the counts and field accuracy.

### Outcomes for Tasks 2–5

Record independent success, success with help, unsuccessful, or N/A, using the success criteria in each task. Record the help and why N/A applies. For Task 4, record completion and reopening as two outcomes.

Example: among six participants who could attempt Passive conversion, four succeeded independently, one succeeded with help, and one did not succeed. Report 4/6 independent successes and 5/6 total successes with the assistance count alongside them. Exclude unavailable activities from the attempted denominator and report how many were unavailable.

For deadline and Calendar updates, report the number of replies that produced an update as well as success among participants whose update appeared. This keeps system availability visible in the results.

### Compare conditions and summarize findings

Compare each participant’s Gmail and InboxToTask action coverage, extras, deadline accuracy, satisfaction, and time. Report individual paired differences and group medians, including ties, partial attempts, and timeouts. Faster time is an improvement only when considered alongside list accuracy. Treat statistical tests as exploratory with 5–8 participants.

Score the archived starting suggestions against the answer key using the same action and field rules as the final list. If starting suggestions are identical across sessions, score that set once per inbox. If they differ, compare each participant’s final list with their own starting set. Report corrected errors, errors left in place, and missing actions. Mark unavailable snapshots explicitly.

Task success, elapsed time, UMUX-Lite, and the satisfaction item cover the rubric’s quantitative measures. Use interview and observation notes to explain trust, usefulness, and friction. Two teammates review ambiguous scoring and qualitative themes and reconcile disagreements.

Use the same finalized answer keys, timing rules, facilitator script, and scoring guide throughout scored sessions. The shared sheet and data dictionary must include all five tasks and the Calendar follow-up. Record any deviations and exclude practice-session data from study results.
