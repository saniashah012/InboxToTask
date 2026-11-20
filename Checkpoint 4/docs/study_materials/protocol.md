# CP4 study protocol

## Session at a glance

There are five scored tasks. Participants do Task 1 in both Gmail and InboxToTask. Run Tasks 2–5 immediately after the InboxToTask list, whether InboxToTask comes first or second.

| Task | Where it runs | What to capture |
| --- | --- | --- |
| 1. Prepare an email task list | Gmail and InboxToTask | Both final lists, time, answer-key scores, and review behavior. |
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

- **Study onboarding default:** configure the study account with Financial excluded before the participant begins. Keep all other study email categories permitted under the agreed sender/source rules. Use this same baseline for every participant. Do not ask participants to choose their own filters during scored onboarding or tasks. Keep this exclusion enabled throughout all scored InboxToTask activities. Do not instruct InboxToTask participants to identify or remove financial emails; the configured exclusion is responsible for filtering them.
- Restore the assigned fictional inboxes and app state using #101. Keep auto-scan on throughout the InboxToTask block. Let the initial scan finish before Task 1 and compare starting suggestions with the expected setup for that inbox. Resolve reset/configuration differences before starting and document any deviations. Preserve genuine model mistakes in the starting-output snapshot; do not silently correct them to match the answer key. If a required follow-up target is unavailable, handle it using that task’s setup/N/A rules after capturing Task 1. Use the same task scope and reference time across inboxes (#62–#64).
- The facilitator key identifies four distinct targets per inbox: the task whose deadline changes, the Calendar meeting, the task to complete and reopen, and the informational email used to create a reminder. Write the exact follow-up reply, old and new deadlines, expected Calendar event, and the Passive conversion target. Include a matched informational email in each inbox that requires no action. Keep both update replies out of the starting inboxes: R01 changes the task deadline and R02 changes the Calendar meeting time (use the corresponding matched replies for Inbox B). Prepare them as scripts or unsent drafts, not delivered messages. Verify that the original threads show their original deadline and meeting time before each participant starts.
- Open a blank task log for the manual round with action, owner, due date/time, and conditions. Prepare the questionnaire (#61), the facilitator script (#59), and the private study data sheet described in [data_dictionary.md](data_dictionary.md).
- Review the consent form (#60). Store signed copies in the team's private shared consent folder and keep them separate from coded results. Confirm that the folder and approved consent form are available before recruiting sessions. Participants use fictional inboxes, with no personal inbox connected.

## Run the session

Ask participants to work at their normal pace. Restart the same stopwatch for each scored activity. Record seconds on a separate row for each Task 1 condition, Task 2, Task 3, each Task 4 step, and Task 5. If Calendar rescheduling runs, give it a separate row and timer.

Start prompted activities on “Begin” and stop when the participant finishes, stops trying, or reaches the agreed task limit. Exclude setup, facilitator verification, and follow-up questions. For Task 2, record reply-to-update delay separately from the prompted handling duration. Start participant interaction timing after the update appears and the facilitator reads the task prompt. Spontaneous noticing is not a scored requirement. Keep the same task limits and update observation windows for every participant, with equal limits for both Task 1 conditions. The session record must name the limits used. Agree on them before the first scored session.

Allow neutral think-aloud prompts such as “What are you looking for?” Record help that identifies a control or answer. Leave survey answers and interview questions untimed.

### Welcome and consent

Explain voluntary participation, what is recorded, and how to think aloud. Assign the study ID after consent. Follow the assigned order above. Use neutral prompts such as “What would you try next?” If you point to a tab, control, or answer, document the help and record the outcome as completed with help if the participant succeeds.

### Task 1. Prepare an email task list

Read this prompt for the InboxToTask condition. For the Gmail condition, replace “Use InboxToTask” with “Use the study inbox” and “save the tasks” with “record the tasks”:

> Imagine you’re catching up on your emails and planning your week. Use InboxToTask to put together your task list of things you need to do. Check the details and deadlines, and save the tasks you want on your list. Include tasks with later dates too, so you don’t lose track of them. Tell me when your list is ready.

Then read the condition-specific instruction:

- **Gmail:** “Read or search the study inbox. Tell me each action and its details, and I will type exactly what you tell me into this log. Review the log and tell me any corrections before you finish.”
- **InboxToTask:** “Review the items in InboxToTask and save the tasks you want on your list. Your saved Active tasks are the final list. You may check source emails and use the available controls as you normally would.”

Do not tell participants the expected number of tasks or identify missing actions. If the system omits an action the participant cannot discover through the available interface, record that as a system omission. Do not interpret it as proof that the participant failed to read or understand the email.

Keep the agreed Financial exclusion enabled throughout scored InboxToTask activities. Do not add a spoken Financial exclusion instruction to the InboxToTask prompt. For the later Gmail comparison, retain its instruction to omit financial mail so the scored task scope matches.

In Gmail, let the participant read and search normally. The evaluator types the actions and deadlines the participant dictates into the digital log. Let the participant review and correct it before calling it final. The evaluator records the participant’s decisions without supplying missing actions. Use this procedure for everyone and describe it when reporting the timing comparison. In InboxToTask, explain that their saved tasks are their list. Let them verify source emails as needed. Start timing on “Begin” and stop when the participant says the list is ready, stops trying, or reaches the common cutoff. Save the full Gmail log or full InboxToTask Active list under the participant ID **before** any follow-ups. Capture task wording and deadlines, along with owner or conditions where applicable.

Score from the appropriate inbox answer key. Compare missing actions with the starting suggestions to see where the omission occurred. If a participant independently spots a missing action, document what they found and whether it made it onto the saved list. A purely informational email counts as an extra action if it appears in the initial task list. In InboxToTask, this can happen if it is incorrectly suggested as actionable and accepted. Any personal reminder deliberately created later in Task 5 is scored in Task 5. Save questions about finding the application confirmation until after Task 5 to avoid teaching its navigation beforehand. Ask the satisfaction question below immediately after each Task 1 round.

### Task 2. Handle a changed deadline

Use the designated task in the participant’s Active list. If it is missing, save the original list first and record the omission. Then help the participant add it as setup and log the help. If the task cannot be set up, record the reason and continue to Calendar.

For every participant, send a fresh R01 reply (or the matched Inbox B reply) in the original task thread from the verified study sender after the original task is saved and Task 1 is recorded. Do not preload this reply or reuse a reply delivered for a previous participant. Keep auto-scan on. Say: “Stay on InboxToTask for a moment while new email is checked.” Do not point to the reply, reveal the new deadline, or trigger a scan.

Tell the participant what is happening while the system processes the reply: “A new deadline email has just been sent. The app checks automatically, so it may take a moment to appear.” Record the system wait separately from interaction time. Once the update appears, read the matching prompt below and start the interaction timer on “Begin.” This task tests prompted handling, not spontaneous discovery. Do not reveal the new deadline or identify the control.

| Inbox | Original email and reply | Participant prompt |
| --- | --- | --- |
| A | A01, “Final storyboard for Media Lab,” from Prof. Maya Chen. Send R01 as a reply in that thread. | “Your instructor sent an email changing the final storyboard deadline. Check the update and make sure your saved storyboard task has the new deadline. Tell me when you’re done.” |
| B | B01, “Reflection memo for Community Workshop,” from Prof. Evelyn Park. Send B16 / R01 as a reply in that thread. | “Your instructor sent an email changing the reflection memo deadline. Check the update and make sure your saved reflection memo task has the new deadline. Tell me when you’re done.” |

Use the exact reply text in the facilitator reply scripts at the end of this document. If the update never appears in the fixed system-wait window, record the system failure. Any manual workaround is recorded separately.
Record when the reply was sent, whether and when the app surfaced the change, whether the participant noticed it, and what they changed. Success means the existing task has the new deadline and there is no duplicate. If the update does not appear within the agreed system-wait window, record the system outcome and mark handling of the update proposal N/A. Record any successful manual workaround separately. Do not wait indefinitely or count a missing proposal as a participant failure. Keep waiting and handling time separate from Task 1.

### Task 3. Add a meeting to Calendar

Before the session, verify that the study account is connected to its primary Google Calendar, that the calendar displays Central Time, and that previous study events have been cleared.

Read the prompt for the assigned inbox:

- **Inbox A:** “You received an email from Noah about the Design Project Check-in. Add that meeting to the connected Google Calendar using the details in the email. Tell me when it’s saved.”
- **Inbox B:** “You received an email from Leo about the Usability Study Planning meeting. Add that meeting to the connected Google Calendar using the details in the email. Tell me when it’s saved.”

| Inbox | Expected event |
| --- | --- |
| A | Design Project Check-in, Dec 1, 2026, 2:00–2:30 p.m. Central, primary calendar of the connected Inbox A study account. |
| B | Usability Study Planning meeting, Dec 2, 2026, 10:00–10:30 a.m. Central, primary calendar of the connected Inbox B study account. |

Start a fresh timer on “Begin.” Stop when the participant says they are done, stops trying, or reaches the agreed Calendar limit. Exclude facilitator verification and questions from elapsed time. Verify the actual saved event in Google Calendar. Success requires exactly one event with the correct title (equivalent wording and capitalization accepted), date, start and end times, time zone, and destination calendar.

Record elapsed seconds, correctness of each field, duplicates, help, where they got stuck, and whether they thought the event was saved. For each prefilled field, record observed corrections or missing values. Use “not observed” if you could not see its initial value.

Ask these questions after the Calendar block, including rescheduling if it runs. Stop all Calendar timers first. This keeps recollections fresh and avoids discussing the interface before the rescheduling activity:

1. “What told you the event and its updated time were saved?”
2. “Was anything confusing about adding or changing the event? What would you change?”

If the participant showed confusion about whether accepting a task also created an event, ask one optional clarification: “Before you used Add to Calendar, did you think the meeting was already on Google Calendar?” Record the answer and observed behavior. Do not ask the obvious general question about what Add to Calendar does.
For these December events, use Central Standard Time when the email omits a zone. An explicit zone in an email determines its meeting time. Confirm the study calendar uses the expected display zone during session setup.

#### Calendar rescheduling

Calendar rescheduling is included in the scored study. Run it after the original event is saved. If a system failure prevents an individual attempt, record the failure and N/A reason rather than silently skipping it.

For every participant who runs this follow-up, send a fresh scripted reply in the original meeting thread after the original event is saved. For Inbox A use R02. For Inbox B use its matched reply. Do not send this reply before the original Calendar event is created, and do not reuse a reply delivered for a previous participant. Inbox A moves Dec 1 from 2:00–2:30 p.m. to 3:00–3:30 p.m. Central. Inbox B moves Dec 2 from 10:00–10:30 a.m. to 11:00–11:30 a.m. Central. Let auto-scan process the reply and record when the change appears.

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

> You want to follow up on your Campus Design Award application. Find the confirmation that your application was received and use it to create a reminder to check the application status on Nov 30, 2026 at 10 a.m. Central. Tell me when the reminder is saved. You do not need to send an email or add a Calendar event.

For Inbox B, use B10, the Student Research Showcase registration confirmation, and the Inbox B reminder prompt in its answer-key section. Use the same planning date and time. This is a reminder the participant chooses to create from informational mail. Capture it after the original task-list score so it is not counted as an extra action in Task 1.

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

After both conditions, all scored tasks, questionnaires, and the interview are complete, offer optional free exploration if consent and the live setup support it. This applies even when InboxToTask is the first condition: wait until the Gmail condition is finished too. Allow about 5–8 extra minutes, which the participant may skip. Explain: “The scored study is finished. You can now explore the website and change the settings however you like, including trying different inclusions or exclusions.” Financial exclusion is required for scored work only and may be changed during this exploration. Continue using fictional study content and verified study accounts, with no personal inbox connection. Give participants the study sender as the default. Use only a verified study sender or another verified test inbox for fictional emails. Invite participants to try sender inclusions or subject exclusions and predict what will be processed. Ask them to predict what will happen before scanning, allow settings changes and an automatic or manual scan, then ask whether the outcome matched their expectation. Keep these results separate. Capture only fictional email content, coded settings, redacted evidence, and consented quotes. Two graders independently assess filter behavior, extraction, and prediction, then reconcile disagreements. Confirm #101 clears the extra message, settings, and output before another session.

### Capture and reset

Complete this reset after every participant, before another participant uses either study inbox:

1. Save both original task lists, follow-up outcomes, questionnaire responses, notes, and reply send/update timestamps under the participant ID before changing or deleting anything.
2. Remove the two delivered update replies from the receiving study inbox: R01 (task deadline change) and R02 (Calendar meeting time change), or their Inbox B equivalents. Delete only the reply messages, preserving the original emails and original threads. If R02 was omitted because Calendar rescheduling was unavailable, record that it was not sent. Archiving or marking a reply unread does not remove the changed content. Follow #101 to ensure removed replies are outside the scan scope. If individual replies cannot be safely removed, restore the original fixture threads using the reset procedure.
3. Run #101 to restore app records, suggestions, task deadlines, settings, scan state, and Calendar events. Deleting the Gmail replies alone does not undo changes already saved in InboxToTask or Google Calendar. Remove exploration emails and outputs as well.
4. Verify that neither update reply remains in the starting inbox, original emails retain the original deadline and meeting time, no previous participant's proposed changes or Calendar events remain, and starting suggestions match the expected setup. Keep automatic scanning from processing leftover messages during reset, then restore the study configuration with auto-scan on before Task 1.
5. Log completion of the reset and any problems. For the next participant, send fresh replies at the Task 2 and Task 3 triggers described above. Resolve reset failures before starting the next session.

Apply the clean starting-inbox check to both conditions. A participant's Gmail comparison must not contain update replies left by an earlier participant.

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

## Facilitator run sheet and Inbox A answer key

This section is for facilitators, not participants. Keep expected answers out of view. It supplements the full procedures above with concrete prompts and scoring checks. Inbox A answers below are grounded in the Inbox A email packet. Inbox B answers and reply scripts are included at the end, grounded in the repository packet and answer_key.md retrieved Nov 20, 2026. The Inbox B packet still marks delivery confirmation as pending. Its owner must confirm that the delivered emails match these fixtures before using the key. Do not use Inbox A answers to grade Inbox B.

### What this study tests

This is a Track A comparative usability study with objective task scoring. Task 1 compares the participant's final list, elapsed time, and satisfaction in Gmail and InboxToTask. Tasks 2–5 assess whether people can manage changes, Calendar events, task states, and informational messages in InboxToTask. Observations and interviews identify confusion, trust, usefulness, and friction to guide improvements. The answer key makes outcomes measurable; it does not make the whole study a model benchmark.

Separately, the starting-output snapshot reveals extraction/filter mistakes. Compare it with the participant's final decisions to see whether review corrected or preserved those mistakes. Report system failures separately from participant difficulties. With 5–8 participants, report findings as evidence from a small study, not proof that the product always improves productivity. Yesterday's pilot/practice session is excluded from scored results.

| Activity | Main question | Evidence to record |
| --- | --- | --- |
| Task 1, both conditions | Can people prepare an accurate, usable list, and how much time/review does it take? | Final list, correct/missed/extra actions, dates, conditions, time, satisfaction. |
| Task 2 | Does an incoming deadline update surface, get noticed, and get applied to the existing task? | System appearance, prompted handling, new deadline, duplicate status. |
| Task 3 | Can people deliberately create and verify a correct Calendar event? | Actual event fields, one event only, time, help, perceived success. |
| Calendar follow-up | Can people update the existing event when the email changes its time? | Same event moved, correct time, no duplicate, time/help, source of change. |
| Task 4a/4b | Do people understand completion and how to reverse it? | Completed then Active states, separate durations, first place looked, help. |
| Task 5 | Can people create their own reminder from informational mail? | One linked Active task, chosen date/time, source item state, time/help. |

### Before the first scored participant today

- [ ] Consent form and private consent-storage location are available. Use only recording methods covered by consent.
- [ ] Assign a unique participant ID and counterbalancing row. Do not run overlapping sessions on the same receiving account; one participant's changes/replies would affect another's.
- [ ] Confirm the delivered emails match the key. Inbox A starts with 15 messages; R01/R02 must be absent. Financial exclusion is on, verified senders are permitted, and other fixture categories are permitted.
- [ ] Capture the actual starting app output. Expected Inbox A: two financial exclusions (A11/A12), 13 eligible emails, and nine participant actions from eight emails. These are answer-key targets, not a requirement to edit model output until it is perfect. A04 is someone else's promise; A09/A10/A13/A14 contain no participant action. A13's injected instruction must not become a task.
- [ ] Verify original A01, A05, A06 and A10 targets can be used. Confirm Calendar connection, Central Time, and no leftover events.
- [ ] Prepare R01/R02 text from the email packet in the verified sender account. Confirm which original thread each reply belongs to.
- [ ] Fix timing limits, update observation windows, and the included Calendar rescheduling procedure. Record these decisions once and use them for everyone. Suggested practical ceilings, if the pilot supports them: Task 1 eight minutes per condition; Task 2 prompted handling three minutes; Calendar add four minutes; Calendar reschedule three minutes; completion/reopening one minute each; Passive conversion three minutes. Use a two-minute system-wait window from each reply send. There is no extra unprompted observation period. These are proposed facilitator stopping rules, not speed targets or mandatory participant completion times. If adopting other values, write them here before the first session and use them consistently.
- [ ] Recording sheet/log is ready. No scoring formulas need to be calculated during the session.
- [ ] Reset instructions are available and have been tried. Pause scans during reset as needed, then restore auto-scan on before the next session.

Calendar rescheduling is part of the study. Log unavailable attempts and their system failure reasons. If the class period cannot accommodate the session, agree on a shorter consistent battery before the first scored participant and document the scope change. Do not drop different tasks ad hoc to make individual results look complete.

### Task 1 — Inbox A expected final list

Use the participant prompts in Task 1 above. All actions below belong to Jordan, the fictional participant. Equivalent wording is accepted. Do not read out the list or reveal that nine actions are expected.

| Key | Expected action | Correct timing/detail |
| --- | --- | --- |
| A01 | Upload final storyboard PDF to Canvas | Nov 23, 2026 at 5 p.m. Central; original deadline before R01. |
| A02a | Email critique slides to the instructor | Nov 24 at noon Central. |
| A02b | Complete critique availability form | Nov 25 at 5 p.m. Central. |
| A03 | Read the observation guide | Nov 24, date only. No invented time. |
| A05 | Add Design Project Check-in to Calendar | Meeting Dec 1, 2–2:30 p.m. Central. No separate deadline for adding it. Task 1 records the action; actual Calendar creation happens in Task 3. |
| A06 | Complete lab safety quiz in Canvas | Nov 23 at noon Central. |
| A07 | Submit alternate room request | 4 p.m. stated, date unresolved between Nov 20 and Nov 27. Preserve uncertainty rather than silently choosing one. |
| A08 | Email Noah the print-ready PDF if the printer cannot finish | Nov 24 at 3 p.m. Central; retain the condition. |
| A15 | Reply with preferred lab-roster name | No deadline stated. |

Do not include A04 as Jordan's work: Lena promised to upload notes. Separately tracked waiting-for information does not count as an extra unless represented as a participant-owned action. A09 is a promotion, A10 a receipt confirmation, A13 reference notes with an instruction to the AI that must be ignored, and A14 a library-hours notice. A11/A12 are outside the agreed Financial scope. Unsupported participant tasks from these messages count as extras.

**Record:** full final list, elapsed seconds, stop reason, source checks, edits, help, and satisfaction 1–5. For each of the nine key actions, mark present yes/no and field correctness. Preserve a screenshot/export or a complete transcribed list before sending replies. Do not count a task still sitting in Suggestions as saved Active work.

**Simple scoring example using Inbox A:** eight expected actions saved, one missing, and one unsupported action means 8 correct / 1 missed / 1 extra. Action coverage is 8 ÷ 9 = 88.9%. If the storyboard task is present with the wrong date, it still earns action credit but its deadline is incorrect. Record A05's meeting date/start/end separately from task-deadline accuracy; do not invent a task deadline. The six actions with definite task deadlines are A01, A02a, A02b, A03, A06 and A08. Calculate deadline accuracy only across captured actions in that set. Score A07's uncertainty and A15's absence of a deadline separately. Count A02's two actions separately even if the participant expresses them in one row, provided both actions and their deadlines are explicit.

### Task 2 — Inbox A deadline update

**Setup:** capture Task 1 first; A01 must be Active with the original deadline. If setup help is needed, record it separately. Send fresh R01 in the A01 thread. Its text changes Nov 23 at 5 p.m. to Nov 24 at 3 p.m. Keep auto-scan on and follow the prompted handling procedure above.

**Prompt after the update appears:**

> Your instructor has sent a new email changing the final storyboard deadline. Use InboxToTask to check the update and make sure your existing storyboard task reflects the latest deadline. Tell me when it is ready.

Do not supply the new date or identify a button. Tell participants this is a separate task after the initial list is saved.

**Expected answer:** the same storyboard task has Nov 24, 2026 at 3 p.m. Central, with no duplicate storyboard task. It remains work to do; the participant does not upload the PDF.

**Record:** reply sent time; proposal appeared time or did not appear; prompt given time; handling duration; final saved deadline; duplicate yes/no; help; outcome. A missing proposal is a system result, not an independent participant failure. A successful manual edit can count as completing the overall goal but must be labeled as a manual workaround, not successful use of the proposal.

### Task 3 — Inbox A Calendar event and reschedule

**Setup:** A05 is available as an Active task; if missing, capture Task 1 first, then assist with setup and log it. No existing study event should remain.

**Read:**

> You received an email from Noah about the Design Project Check-in. Use InboxToTask to add it to the Google Calendar connected to this study account, using the meeting details in the email. Tell me when you believe it is saved.

**Expected answer:** exactly one event titled Design Project Check-in (equivalent title accepted), Dec 1, 2026, 2–2:30 p.m. Central, on the connected account's primary calendar. Verify the actual Google Calendar event after stopping the timer. A task saved in Active alone does not count as a Calendar event.

**Record:** title/date/start/end/zone/destination each correct yes/no, number of events, duration, help, prefill corrections, perceived success and actual success. Do not explain the Calendar controls before the rescheduling task.

**Reschedule:** only after the original event is verified, send fresh R02 in the A05 thread. Once the update is available, read:

> Noah has sent an update about the Design Project Check-in. Use InboxToTask to make sure the event you already created matches the latest email. Tell me when you believe it is updated.

**Expected answer:** the original event moves to Dec 1, 3–3:30 p.m. Central on the same calendar. Exactly one event remains. Record the event identifier if available to verify it is the same event. Keep system wait and participant interaction time separate. Record whether the participant used a proposed change or manual editing. Ask the Calendar follow-up questions only after this block ends, with timers stopped.

### Task 4 — Inbox A complete and reopen

Use A06, the lab safety quiz. Read each prompt separately and wait for the participant to finish before giving the next:

> Imagine you have finished the lab safety quiz. Show me how you would mark that task as done in InboxToTask.

> You realize you still have one question left to finish. Put that same quiz task back on your list of things to do.

**Expected answer:** A06 moves to Completed, then the same A06 task returns to Active. No duplicate is created. The participant is simulating completion; they do not take the real quiz.

**Record:** separate result and duration for completing and reopening, first place looked, help, final state, duplicate yes/no. If completion fails, record the failure, help establish Completed as setup, then allow an independent reopening attempt.

### Task 5 — Inbox A personal reminder from informational mail

**Read:**

> You want to follow up on your Campus Design Award application. Find the confirmation that your application was received and use it to create a reminder to check the application status on Nov 30, 2026 at 10 a.m. Central. Tell me when the reminder is saved. You do not need to send an email or add a Calendar event.

**Expected answer:** one new Active task linked to A10, with a title such as Check Campus Design Award application status and Nov 30 at 10 a.m. Central. The original informational item leaves Passive communication according to the implemented conversion behavior. Verify saved title/date/time and linkage. Record source-item behavior separately if conversion succeeded but the item did not leave Passive.

**Record:** duration, finding the source, prefill corrections, help, task correctness, duplicates, source item state, outcome. This deliberately chosen reminder is scored here only. Do not count it as an extra in the previously captured Task 1 list.

### Minimal session recording template

Use the private shared sheet or copy these fields into a local sheet before testing. Do not put identifiable participant data or signed consent in the public repository.

**Session:** participant ID; date; facilitator; assigned order; Gmail inbox; app inbox; build/version if available; starting-output capture reference; consent recorded; agreed limits; reset checked.

**Activity rows:** Task 1 Gmail, Task 1 app, Task 2, Calendar add, Calendar reschedule if included, Task 4 complete, Task 4 reopen, Task 5. Each row needs elapsed seconds, stop reason (done/gave up/timeout/system unavailable), outcome (independent/help/unsuccessful/N/A), exact help, final result/capture reference, and brief friction notes. Leave unobserved times blank; do not enter zero.

**Task 1 key rows:** participant ID; condition; inbox; key action ID; action present; owner correct; task deadline correct or N/A; condition/uncertainty correct or N/A; observed final wording/date. Add unsupported/duplicate entries separately. Calculate totals after the session.

**Update rows:** participant ID; R01/R02; sent time; appeared time; noticed time if observed; explicit prompt given time if applicable; final task deadline or event time; duplicate; proposal/manual workaround; outcome.

**Surveys:** satisfaction Gmail 1–5; satisfaction app 1–5; UMUX-Lite capabilities 1–7; UMUX-Lite ease 1–7; interview notes/consented quotes. Use the exact questionnaire wording above. Missing answers stay blank.

**Reset:** data saved; R01 removed; R02 removed or not sent; original threads restored; app records/scan settings restored; Calendar cleared; exploration removed; next starting output verified; runner initials.

### Reporting the results

Report Task 1 paired list accuracy, extra actions, time and satisfaction. Report Tasks 2–5 by independent success, success with help, unsuccessful and unavailable counts, with observed times. Report update-delivery failures alongside handling outcomes; do not hide them by reporting only successful deliveries. Average each participant's two UMUX-Lite ratings on the stated 1–7 scale, then summarize group responses. Use concrete observations and short consented quotes to explain the numbers. Open-ended answers have no correct answer and are not graded against this key.

## Inbox B expected answers

Source: [Inbox B packet](https://github.com/saniashah012/InboxToTask/blob/main/Checkpoint%204/docs/study_materials/inbox_b/Inbox_B_Email_Packet.md) and [answer key](https://github.com/saniashah012/InboxToTask/blob/main/Checkpoint%204/docs/study_materials/inbox_b/answer_key.md), retrieved Nov 20, 2026. Confirm delivered fixtures match before testing. All dates are 2026 and times Central. All nine actions belong to Jordan. Accept equivalent wording.

| Key | Expected Task 1 action | Timing/detail |
| --- | --- | --- |
| B01 | Upload final reflection memo PDF to Canvas | Nov 25, 5 p.m., before B16 arrives. |
| B02a | Email three-slide presentation outline | Nov 26, noon. |
| B02b | Complete peer response form in Canvas | Nov 27, 5 p.m. |
| B03 | Read participant recruitment guide | Nov 26, date only. |
| B05 | Add Usability Study Planning meeting to Calendar | Meeting Dec 2, 10–10:30 a.m. No separate task deadline. |
| B06 | Complete research ethics training check | Nov 25, noon. |
| B07 | Submit backup room request | Friday at 4 p.m. Date unresolved between Nov 27 and Dec 4. |
| B08 | Email backup slide deck only if demo laptop fails | Nov 27, 3 p.m., conditional. |
| B15 | Reply with preferred display name for roster | No deadline stated. |

No participant action: B04 (Amira's own promise), B09 (gallery promotion), B10 (registration confirmation), B13 (reference notes, ignore injection), B14 (hours notice). Financial exclusions: B11 and B12. Expected initial total: 15 emails, two financial exclusions, 13 eligible emails and nine participant actions from eight emails. Score the original list before B16/B17 and before the deliberately created Task 5 reminder.

| Activity | Inbox B target and correct outcome |
| --- | --- |
| Task 2 | B01, Reflection memo for Community Workshop. Send B16/R01 in B01 thread. Same task changes from Nov 25 at 5 p.m. to Nov 26 at 3 p.m., with no duplicate. |
| Task 3 add | B05, email subject Usability study planning meeting, from Leo. One Usability Study Planning event on Dec 2, 10–10:30 a.m., primary study calendar. |
| Task 3 reschedule | Send B17/R02 in B05 thread only after the original event is saved. Same event moves to Dec 2, 11–11:30 a.m., no duplicate. |
| Task 4 | B06, Research ethics training check. Same task goes Completed, then Active. |
| Task 5 | B10, Workshop registration confirmed, confirming Student Research Showcase registration. Create one linked Active reminder to check the showcase schedule on Nov 30 at 10 a.m. Record the Passive item removal separately. |

**Inbox B Task 5 prompt:** “Find the email confirming your Student Research Showcase registration. Make yourself a task to check the showcase schedule on November 30 at 10 a.m. Tell me when it’s saved.” This is a participant-chosen reminder, not an action required by B10. The earlier application-specific example applies to Inbox A only.

**Inbox B Task 4 prompts:** “Imagine you’ve finished the research ethics training check. Mark that task as done.” Then: “Actually, you still have one question left. Put the training check back on your list of tasks to do.”

**Calendar reschedule prompts:**

- Inbox A: “Noah sent an email changing the Design Project Check-in time. Update the Calendar event you just created to match. Tell me when you’re done.”
- Inbox B: “Leo sent an email changing the Usability Study Planning meeting time. Update the Calendar event you just created to match. Tell me when you’re done.”

## Exact facilitator reply scripts

Send from the verified account mapped to the fictional sender. Use Reply in the original thread, not a new unrelated conversation. Do not send these during the initial inbox load. Keep auto-scan on during the task. Explain the short processing wait, record system appearance separately, then read the goal prompt and time participant handling. After the participant, remove the delivered replies and reset saved app/Calendar changes before reuse.

### Inbox A deadline — R01 replying to A01

Original subject: **Final storyboard for Media Lab**. Sender role: instructor, Prof. Maya Chen. Send after Task 1 is captured and A01 is Active.

> Hi everyone,
>
> One update to my earlier reminder: the final storyboard PDF is now due Nov 24 at 3 p.m. instead of Nov 23 at 5 p.m. Please use the same Canvas assignment.
>
> Thanks,
> Maya

### Inbox B deadline — B16 / R01 replying to B01

Original subject: **Reflection memo for Community Workshop**. Sender role: instructor, Prof. Evelyn Park. Send after Task 1 is captured and B01 is Active.

> Hi everyone,
>
> One correction to my earlier Community Workshop reminder: the final reflection memo PDF is now due Nov 26 at 3 p.m., rather than Nov 25 at 5 p.m. Please upload it to the same Canvas assignment.
>
> Thanks,
> Evelyn

### Inbox A Calendar — R02 replying to A05

Original subject: **Design Project Check-in**. Sender role: design collaborator, Noah. Send only after the original Dec 1, 2–2:30 p.m. Calendar event is saved and verified.

> Hey Jordan,
>
> Sorry for the shuffle! Can you move our Design Project Check-in to 3:00–3:30 p.m. Central on Dec 1? Same day, just an hour later than we planned.
>
> Thanks,
> Noah

### Inbox B Calendar — B17 / R02 replying to B05

Original subject: **Usability study planning meeting**. Sender role: design collaborator, Leo. Send only after the original Dec 2, 10–10:30 a.m. Calendar event is saved and verified.

> Hey Jordan,
>
> Sorry for the change. Can you move our Usability Study Planning meeting to 11:00–11:30 a.m. Central on Dec 2? We are keeping the same date and meeting link, just starting one hour later.
>
> Thanks,
> Leo
