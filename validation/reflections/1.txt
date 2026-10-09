# InboxToTask — Storyboard Prompt and Response

## 1) Prompt

### Goal
Create a detailed six-panel storyboard showing how a university student uses InboxToTask to sort email into task-based and informational messages. Show the complete workflow from a crowded inbox through AI-supported review to user-approved calendar and task updates. Emphasize evidence, uncertainty, user decision rights, and links back to source emails.

### Detailed Prompt

Act as an expert UX/UI designer and storyboard artist. Create a comprehensive six-panel storyboard script for InboxToTask, an AI-assisted email triage product used by a university student. The storyboard must show an end-to-end workflow and make the human-AI roles clear: AI scans, summarizes, and proposes; the student checks evidence, corrects details, and approves consequential actions.

Use the same protagonist throughout: a 20-year-old undergraduate student who receives course requests, project messages, deadlines, and informational emails. Keep the visual style minimal and elegant, with a calm university study setting and a clean interface. Do not name a specific email provider or calendar product.

For each panel, provide the following four labeled parts:

- **[Visual Shot]** Setting, framing, student action, and visible emotional state.
- **[UI Screen Detail]** Interface layout and relevant controls or system status.
- **[Caption]** One or two sentences describing the workflow and the student's cognitive state.
- **[Key Takeaway]** The main design lesson shown by the panel.

### Panel Requirements

1. **The Bottleneck — Before State:** Show a crowded inbox containing both genuine tasks and non-actionable information. Convey the student's difficulty distinguishing deadlines and requests from newsletters and notices.
2. **Email Connection and Classification:** Show the student connecting a generic email provider. The system communicates its processing status and separates candidate tasks from informational messages. Do not imply that a message has already been added to a calendar or task manager.
3. **Task Digest — Evidence and Uncertainty:** Show an original email excerpt beside an extracted task. Include task, owner, deadline, requirements, and source. Mark an ambiguous field as “Needs Review” or with a clear uncertainty cue. Provide edit and source-view controls.
4. **Human Review and Approval:** Show the student checking the original email, correcting or confirming a task field, and explicitly approving the task before it is added to a task manager or calendar. The AI must not send an email or make an external commitment on the student's behalf.
5. **Informational Digest — No Action Required:** Show non-actionable emails summarized in a separate digest with links back to their source emails. Make clear that informational messages do not become tasks simply because they contain dates or imperative wording.
6. **Workflow Resolution — After State:** Show the student reviewing an organized task list and calendar after approval. Include a clear confirmation, a way to correct or undo an incorrect item, and an accessible source link. Show reduced clutter without claiming that the inbox is empty or that errors are impossible.

Keep each panel visually distinct and easy to follow in chronological order. Ground the interface behavior in the described workflow. Avoid unsupported claims such as perfect accuracy, automatic approval, or zero missed tasks.

## 2) Storyboard Response

### Panel 1: The Bottleneck (Before State)

**[Visual Shot]:** Medium shot in a university study area. A student sits at a laptop, leaning forward with a mildly overwhelmed expression. The inbox on screen contains a mix of course requests, project messages, a newsletter, and campus notices.

**[UI Screen Detail]:** A conventional email inbox with a long, undifferentiated message list. A course email mentions an assignment deadline; a project email asks for interview notes; other rows show an announcement and a newsletter. No task list or clear priority grouping is visible yet.

**[Caption]:** The student has to scan each message to work out which ones require action and which are only for information. Important deadlines compete for attention with routine updates.

**[Key Takeaway]:** Mixed email types make it difficult to direct attention to real commitments.

### Panel 2: Email Connection and Classification

**[Visual Shot]:** Over-the-shoulder view as the student connects an email account to InboxToTask. The student watches the interface while the system processes a selected set of messages.

**[UI Screen Detail]:** A simple connection and permission screen identifies the selected email provider without naming a brand. After the student confirms access, a visible progress indicator shows messages being scanned. Results begin to appear in two groups: “Task Digest” and “Information Digest.”

**[Caption]:** InboxToTask organizes messages by whether they appear to require an action. Progress feedback helps the student understand that processing is underway and when results are ready to review.

**[Key Takeaway]:** AI can reduce the attention needed to triage a busy inbox, while clear status feedback keeps the process legible.

### Panel 3: Task Digest (Evidence and Uncertainty)

**[Visual Shot]:** Close view of the task review screen. The student leans in to compare an AI-generated task with the original message.

**[UI Screen Detail]:** A side-by-side review card shows an original email excerpt on the left and a proposed task on the right. The task card contains fields for task description, owner, deadline, and requirements. A source link opens the full email. If the owner or deadline is unclear, that field is marked “Needs Review” rather than silently guessed. Controls include “Edit” and “Review source.”

**[Caption]:** The student can see which email supports the proposed task and which details still need attention. The uncertainty cue directs review to the fields most likely to need correction.

**[Key Takeaway]:** Showing provenance and uncertainty helps the user interrogate the AI output instead of relying on an unexplained result.

### Panel 4: Human Review and Approval

**[Visual Shot]:** The student opens the source email, checks the deadline and task owner, edits one field, and then selects an approval control.

**[UI Screen Detail]:** The source sentence is highlighted beside the editable task fields. The student corrects or confirms the deadline and owner, then clicks “Approve and add.” A confirmation step states which task will be sent to the task manager or calendar. No email is sent and no external commitment is made automatically.

**[Caption]:** The student uses context from the original email to decide whether the proposed action is correct. The task is added only after explicit approval.

**[Key Takeaway]:** AI prepares the action; the student retains final decision rights for consequential changes.

### Panel 5: Informational Digest (No Action Required)

**[Visual Shot]:** The student switches to a clean information digest and quickly scans campus announcements and newsletters without the pressure of an overdue-task list.

**[UI Screen Detail]:** A separate “Information Digest” groups non-actionable messages into short summaries. Each item has a “View original email” link. There are no task-creation or calendar buttons on informational items by default; the source remains available if the student wants more context.

**[Caption]:** The student can stay informed without treating every date, invitation, or imperative phrase as a personal obligation. Source links preserve access to the original message.

**[Key Takeaway]:** Separating informational content reduces noise and avoids creating unnecessary tasks.

### Panel 6: Workflow Resolution (After State)

**[Visual Shot]:** Wider shot of the same study area. The student sits more comfortably and reviews a short task list next to a calendar.

**[UI Screen Detail]:** The dashboard shows approved tasks and their deadlines. A confirmation indicates which item was added. Each task retains a source link and offers a way to edit or undo the change. Items that remain uncertain stay in a review state rather than being treated as confirmed.

**[Caption]:** The student can see what was approved, what still needs review, and where each item came from. The workflow supports organization while leaving room to correct mistakes.

**[Key Takeaway]:** A useful human-AI workflow makes actions traceable, reversible, and clearly approved by the person responsible.

## 3) Final Notes

This storyboard treats AI as a triage and memory aid, not as the final decision-maker. Its core interaction is an evidence-linked review step: the student checks task ownership, deadlines, and requirements before approving calendar or task updates. Informational emails remain accessible through source links without being converted into obligations.
