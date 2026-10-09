# Design Specification

## 1. User Journey & Task Flow

The diagram shows how students move from connecting their email accounts to reviewing AI-generated tasks and syncing approved tasks to their calendars.

![User Journey and Task Flow](prototype/user_journey.png)

## 2. User Persona

Our primary user is a university student who wants help managing emails and deadlines without losing control over important decisions. The design focuses on accuracy, transparency, and user approval.

![User Persona](prototype/persona.png)

## 3. Low-Fidelity Wireframe

The dashboard allows students to review extracted tasks, check their original email sources, and add approved tasks to their calendars.

![Low-Fidelity Wireframe](prototype/wireframe.png)

## 4. Design System Alignment

**Selected system: IBM Carbon Design System.** InboxToTask is a desktop-first, information-dense task review tool. Carbon provides reusable components and guidance suited to structured data, task actions, and system feedback. Use Carbon as the single source of truth for component behavior, spacing, typography, color tokens, focus states, and accessibility; do not mix in component styling from other systems.

- **Task and information lists:** Use Carbon data-table/list patterns with clear row hierarchy, subtle dividers, selected and hover states, and visible source/action controls. Keep task title, owner, deadline, status, and source easy to scan. Carbon's data-table guidance uses layer and text tokens to distinguish headers, rows, selected states, and focus. ([Data table specifications](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/specifications))
- **Primary and secondary actions:** Use a primary button only for the current decisive action, such as “Approve and add.” Use secondary or tertiary buttons for “Edit,” “View source,” “Skip,” and “Undo.” Button labels should state the action clearly, and focus, hover, active, and disabled states should follow Carbon. ([Button specifications](https://www.carbondesignsystem.com/building-blocks/core/components/button/specifications))
- **Processing and status feedback:** Show a progress indicator and plain-language status while email is being analyzed. Use inline notices for “Needs review” states and a success toast after a confirmed calendar update. Preserve important confirmation details in the task row after the toast disappears. Use text and an icon with color so status is never communicated by color alone. ([Notification guidelines](https://www.carbondesignsystem.com/building-blocks/core/components/notification/guidelines))
- **Trust and AI behavior:** Identify AI-generated task fields, show the source email excerpt, and surface uncertain fields for review. Keep the student in control of approval and external actions. These choices align with Carbon for AI's emphasis on trust and transparency in AI experiences. ([Carbon for AI](https://www.carbondesignsystem.com/building-blocks/foundations/carbon-for-ai))
- **Accessibility:** Keep all review, edit, approve, skip, and undo actions keyboard accessible; provide visible focus states and descriptive labels for icon-only controls. Pair warning/success colors with text and icons.

## 5. Traceability to Steps 6–7

Step 6 defines the theoretical lens: AI and human roles across reasoning, memory, and attention, coordinated through decision rights and escalation. Step 7 prioritizes features by connecting empirical evidence to that theory. The table below makes each major interface choice traceable through that chain.

| Empirical evidence (Step 5) | Theoretical interpretation (Step 6) | Prioritized feature and UI choice (Step 7) |
|---|---|---|
| Tim worried that AI could misread deadlines, omit requirements, or assign another person's action to the student. Xuyuan wants to verify important information. | **Memory + reasoning:** AI can retrieve and organize email details; the student contributes context-sensitive judgment. Provenance enables interrogation of the AI's reasoning. | **Priority 1 — Evidence-linked task review.** Show task, owner, deadline, requirements, and original email excerpt together. Let the student open the source and edit fields before approval. |
| Xuyuan emphasized missed information; both interviews describe concerns about consequential errors. DeepSeek omitted E17 and E18 while claiming to cover all 20 targets. | **Attention + memory:** AI can triage large message sets, but the interface must make coverage gaps, uncertainty, and errors visible to the human reviewer. | **Priority 1 — Completeness and uncertainty review.** Show scan progress and processed/total counts. Flag ambiguous fields as “Needs Review” and keep unresolved items visible until reviewed. |
| Tim wanted decision authority to remain with the user and opposed automatic email replies. Xuyuan double-checks important emails. | **Meta-coordination / role partition:** AI prepares recommendations; the student retains final authority for consequential actions. | **Priority 1 — Approval gate.** Do not add a task or calendar event until the student approves. Require explicit authorization for external communication. |
| Participants wanted access to the original message; the project distinguishes task-bearing email from informational email. | **Shared memory:** Both teammates need a common, inspectable record of what the email said and how the system interpreted it. | **Priority 2 — Separate digests with provenance.** Keep task and informational messages in distinct views, each with a “View original email” link. Informational items do not create tasks by default. |
| Tim accepted up to three minutes for a summary, while Xuyuan preferred about one minute. | **Attention orchestration:** Clear status and progressive results help the student allocate attention while the AI works. | **Priority 2 — Streaming progress.** Display processing stages and stream completed results as they are ready. Test perceived responsiveness at 60- and 180-second targets. |
| Participants were concerned about mistakes; the validation notes identify missing ownership and follow-up-recipient information. | **Reasoning + meta-coordination:** Corrections and disagreement must have a clear path, and AI suggestions must remain distinct from user-assigned actions. | **Priority 2 — Correction and undo.** Allow field-level edits, error feedback, and undo after sync. Label “waiting for” items separately from “suggested follow-up,” with recipient and rationale. |
| Xuyuan raised concerns about sensitive information such as grades; Tim did not state the same concern. | **Goals and constraints / role partition:** The team must establish what information the AI can access and what remains private. | **Priority 3 — Privacy controls.** Explain access scope before connection and provide controls for sensitive content and task visibility. Validate these controls with more users. |

**Design principle:** Partition roles and orchestrate attention and interrogation. InboxToTask should let AI scan and organize messages, while the student checks evidence, resolves uncertainty, and authorizes consequential changes. In Checkpoint 3, evaluate the combined workflow against both required baselines: a human-alone workflow and an AI-alone workflow.
