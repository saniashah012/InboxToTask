# CP4 Calendar study task

Owner: Sania Shah\
Reviewer: Matthew Zheng\
Issue: [#65](https://github.com/saniashah012/InboxToTask/issues/65)

## Facilitator instructions

This section is for the facilitator running the study in [#58](https://github.com/saniashah012/InboxToTask/issues/58). Participants complete both conditions on a computer using the assigned fictional inboxes. The Calendar activity is part of the InboxToTask condition.

1. Before the session, verify that the test account is connected to its primary Google Calendar, confirm the calendar’s display time zone is Central Time, and check that no study event from a previous session remains.
2. Run the Calendar activity at the point specified in the study protocol. Follow the protocol’s task order and time limits.
3. Read the prompt below with the meeting title from the participant’s assigned InboxToTask inbox. Start the Calendar timer when you say “Begin.”
4. Stop the Calendar timer at the task’s stopping point, ask the post-task questions, and verify the saved event. Record Calendar time and outcomes under the Calendar task in the main study data sheet.

## Scored task — Add the meeting

Read aloud:

> You received an email about **[meeting title]**. Using InboxToTask, add the meeting to the Google Calendar connected to this test account. Use the details in the email. Tell me when you think it has been added.

Let the participant find the controls. Give any assistance according to the study protocol and record what help was needed.

### Fictional emails and answer keys

Sania owns the Inbox A emails and answer key (#62). Yuchen owns Inbox B and its answer key (#63). This plan supplies the proposed Calendar email and expected event for each owner to include.

Use natural wording and comparable detail in both inboxes. Use the email date and context to resolve the intended date, and ask for confirmation if more than one date is plausible. Keep the full date and year in each answer key so facilitators can verify the saved event.

**Provisional study default: Central Standard Time (CST).** Use CST as the expected time zone when the email omits a time zone. Matthew is checking whether the model can use the user's time zone, so confirm the actual behavior on the study setup before the pilot. If the email explicitly names a time zone, use that zone to interpret the meeting time and verify that the calendar displays the equivalent local time.

| Inbox | Email subject | Email body | Expected Google Calendar event |
|---|---|---|---|
| A ([#62](https://github.com/saniashah012/InboxToTask/issues/62)) | Design Project Check-in | Hi! Please add our Design Project Check-in to your calendar for Dec 1 from 2:00 to 2:30 p.m. | Design Project Check-in, Dec 1, 2026, 2:00–2:30 p.m. Central Time, primary calendar of the connected inbox A test account |
| B ([#63](https://github.com/saniashah012/InboxToTask/issues/63)) | Research Project Check-in | Hi! Please add our Research Project Check-in to your calendar for Dec 2 from 2:00 to 2:30 p.m. | Research Project Check-in, Dec 2, 2026, 2:00–2:30 p.m. Central Time, primary calendar of the connected inbox B test account |

### What to record

- **Event correctness.** Verify the saved event in Google Calendar. Score it correct when the meeting has one event, with the expected title, date, start, end, time zone, and destination. Ignore capitalization differences in the title. Record missing events, duplicates, and incorrect fields.
- **Elapsed time.** Start when the facilitator says “Begin” after reading the prompt. Stop when the participant says they are done, stops trying, or reaches the protocol's limit. Record seconds and the outcome. Exclude facilitator verification and follow-up questions.
- **Independence and friction.** Record whether the participant found the Calendar action unaided, needed a hint, or could not find it. If they got stuck, note where (finding the action, reviewing details, saving, or verifying). Keep assistance separate from event correctness.
- **Prefill and corrections.** For title, date, start, end, and time zone, note any observed wrong prefill or blank field the participant had to fill, and whether they corrected it. Use “not observed” when you could not see the initial value. This helps distinguish extraction problems from interface friction.
- **Perceived success.** Record whether the participant thought the event was saved before verifying it. Compare this with the actual outcome, especially when the event was missing or saved with the wrong details.
- **Task approval expectation.** After the attempt, ask, “Earlier, when you accepted the meeting suggestion and it became a task in InboxToTask, what did you think, if anything, had happened in Google Calendar at that point?” This refers to accepting the suggestion. Code the response as expected automatic event creation, expected a separate Calendar action, or unsure. Record N/A if the participant did not accept the suggestion. This is a retrospective response.

For analysis, report correct events out of attempted sessions, how many people completed the task without help, and the median time for correct completions alongside timeouts. Use the friction notes, field corrections, and mismatches between perceived and actual success to explain the results.

### Post-task questions

Ask the open questions first.

1. “When you first saw **Add to Calendar**, what did you expect it to do?”
2. “What told you the event had been added? Which calendar did you think it went to?”
3. “How did it feel to review the event details in InboxToTask? Where would you prefer to do that, and why?” If needed, clarify that the alternatives are InboxToTask and Google Calendar.

## Task 2 — Reschedule the existing event (depends on implementation)

If the team implements and verifies email-driven rescheduling on the live study site before the study freeze, run Task 2 for every participant who successfully added the original event. Run it after Task 1 and its questions. If the feature is unavailable, omit Task 2 for the whole study. If the participant did not successfully add the event, record that Task 2 could not be run for that session.

Introduce a separate fictional email with the subject **New time for [meeting title]** and this body:

> The [meeting title] originally scheduled for [original date] from 2:00 to 2:30 p.m. Central Time has moved to 3:00–3:30 p.m. Central Time on the same day.

Use the title and date from the participant's answer key. Process the email before starting the follow-up so the time measures participant interaction. Return the participant to the dashboard.

Read aloud:

> You received another email about the meeting you just added. The meeting time has changed. Use InboxToTask to make sure your calendar shows the new time. Tell me when you think it is updated.

Record whether they noticed the proposal, used the suggested update or managed the event manually, needed help, and how many seconds they took. Verify that the original event on the primary calendar now shows **3:00–3:30 p.m. Central Time** on the same date and that there is no duplicate. Ask, “What told you the new time had been saved?” Record these observations separately from the scored task. If the follow-up is skipped, record the reason.

## Fallback and reset

If Calendar is unavailable under the rollout fallback in [#53](https://github.com/saniashah012/InboxToTask/issues/53), skip both Calendar activities and their questions. Say, “That finishes the inbox activities. Let's move to the next part of the session.” Mark Calendar measures **N/A — activity omitted**.

If Calendar works and rescheduling is unavailable, run the scored task and mark only the follow-up as omitted.

Capture results before resetting the study account. Follow [#101](https://github.com/saniashah012/InboxToTask/issues/101) for cleanup. If the follow-up runs, ensure its extra email and change proposal are cleared or isolated before the next participant.

## Where to use this

Link this plan from the study protocol (#58). Copy the read-aloud prompts into the facilitator script (#59) and the expected events into the inbox A and B answer keys (#62 and #63).
