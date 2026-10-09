# Individual Validation Reflection — Yuchen Zhang

**Project:** InboxToTask  
**Interviewer:** Yuchen Zhang  
**Interview participants:** 2 peers  
**Method:** Brief speed-dating interviews and review of ChatGPT and Claude email-analysis outputs

## 1. Prompting / AI Validation Notes

The validation materials include ChatGPT and Claude outputs for a simulated inbox containing 20 emails (E01–E20), analyzed as of October 5, 2026, at 9:00 AM (America/Chicago). The outputs were reviewed for task classification, extracted actions, deadlines, conditional tasks, and uncertainty. These notes summarize the supplied outputs; they do not claim that I personally ran both tests unless that is confirmed.

| Observation | Evidence from outputs | What it means for InboxToTask |
|---|---|---|
| Actionable versus passive classification | ChatGPT classified 10 emails as Actionable and 10 as Passive; Claude likewise classified E01, E02, E03, E05, E06, E09, E10, E11, E15, and E16 as Actionable, with the remaining 10 Passive. | The system should separate actual responsibilities from newsletters and optional invitations. |
| Possible duplicate assignments | Claude flagged E01 and E06 as potentially describing the same assignment with different deadlines, but did not merge them without evidence. | Show source emails and ask the user to resolve ambiguous duplicates. |
| Conditional action | Both outputs treated E09 as a reminder to send only if feedback had not arrived by Friday afternoon. | Conditional tasks should remain visible without being treated as immediately due. |
| Completed and canceled actions | Both outputs excluded E07 (canceled proposal) and E08 (completed slide update) from outstanding tasks. | The system needs thread context to avoid creating outdated tasks. |
| Summary consistency requires checking | ChatGPT displayed a summary count of 12 outstanding tasks. This count should be independently checked against the extracted task list before treating it as an error. | Compute summary counts from structured tasks rather than relying on generated summary text alone. |

**Key takeaway:** Even when an AI system extracts tasks correctly, users need access to the original email, clear indications of uncertainty, and a chance to approve or correct the result. These observations are based on the supplied transcripts, not a measured comparison with a verified answer key.

## 2. Speed-Dating Interview Notes

I interviewed two peers about six dimensions of the proposed InboxToTask experience.

| Dimension | Respondent 1 | Respondent 2 |
|---|---|---|
| Accuracy and hallucinations | Worried about misclassified emails, missed responsibilities, and tasks invented by AI; checks email daily to avoid missing important items. | Also concerned about mistakes, but thought AI might review a large inbox more thoroughly than a person and catch overlooked details. |
| Reliability and consistency | Different outputs for the same input would make it hard to know what to trust and could cause missed responsibilities. | Consistent, reliable results would increase confidence and willingness to use the system. |
| Latency and performance | Preferred results in approximately 15 seconds to 1 minute; longer delays could lead to switching tools. | Valued accuracy over speed and would wait longer, but not more than about five minutes. |
| UX friction and human–AI collaboration | Wanted automatic inbox review, task organization, scheduling help, and a weekly summary of upcoming work. | Wanted integration with Outlook or Gmail, a task plan that could be checked against original emails, highlighting of important emails, and filtering of advertisements. |
| Security and safeguards | Was relatively unconcerned about AI reading email. | Was strongly concerned about sensitive information and wanted clear privacy safeguards. |
| Cost and efficiency | Estimated spending more than an hour daily organizing messages; would consider paying about $10–$20 for a useful service (billing period not specified in the notes). | Spent about 10–15 minutes daily on email; preferred free access or approximately $3–$5 per month. |

**Interview takeaway:** Both participants valued accuracy and reliability, but they differed on privacy, acceptable wait times, and willingness to pay. Respondent 2's request to cross-check task plans against original emails especially supports a reviewable human–AI workflow.

## 3. Class-Generated Storyboard

![Five-panel InboxToTask storyboard](./Yuchen_Zhang_ChatGPT_Generated_image.png)

**Storyboard title:** From Email Overload to Action

1. **Email Overload:** A student receives many routine emails and overlooks a professor's urgent assignment deadline.
2. **The Missed Deadline Risk:** Later that evening, the student thinks the day's work is finished while InboxToTask scans for important actions.
3. **InboxToTask Catches It:** The system identifies the deadline and shows an urgent task card, supporting email evidence, and **View Email / Edit / Confirm Task** controls.
4. **From Email to Action:** After the student confirms the task, it is added to the task list and calendar; the student starts working.
5. **Crisis Averted:** The student submits the assignment on time, and InboxToTask shows it as completed while preserving access to the original email.

The storyboard focuses on **role partitioning**: AI finds and organizes a potentially missed action, while the student reviews and confirms the task before it is added to external tools. The original storyboard-generation prompt is saved separately as `zhang_yuchen_storyboard_prompt.md`.

## 4. One Finding That Changed (or Confirmed) My Assumption About the Proposed Scenario

**Draft for personal confirmation:**

I initially focused on how InboxToTask could save students time by finding tasks hidden among many emails. The interviews made me think more about what happens after AI finds a task. Both participants worried about AI missing important information or creating incorrect tasks, and one specifically wanted to compare the generated plan with the original emails. That stood out to me because a fast task list is not very helpful if students cannot tell whether it is right.

This finding connects to **trust calibration** and **human–AI complementarity** in Gonzalez et al. (2026). AI can help with attention by scanning large numbers of emails, but people still need enough context to judge its suggestions. For our design, I think each suggested task should link back to the source email and allow users to edit or reject it before confirmation. This would help users benefit from AI's speed without giving up control over important decisions.

## 5. Reference

Gonzalez et al. (2026). *Toward a science of human–AI teaming for decision making: A complementarity framework*. *PNAS Nexus*. https://doi.org/10.1093/pnasnexus/pgag030

---

### Before submitting

- [ ] Confirm the personal opening assumption in Section 4 accurately reflects my experience.
- [ ] Confirm which AI platform tests I personally ran; edit the method/notes if necessary.
- [ ] Upload this Markdown file, `zhang_yuchen_storyboard.png`, and `zhang_yuchen_storyboard_prompt.md` to the same GitHub folder (`validation/reflections/`) so the relative image link works.
- [ ] Confirm this is the storyboard the class intended us to submit.
