# Storyboard Prompt and Response

## 1) Prompt

### Goal
Help me improve the prompt I am working on to generate a storyboard for our solution.

I want the storyboard to describe the workflow of the product and emphasize the most important behavior: classifying emails into two categories:

- Task-based emails
- Communication/informational emails

The desired experience is a digest of tasks that require approval before being added to a task manager and calendar, alongside a digest of non-actional informational emails with backlink references to the original messages.

### Refined Prompt

Act as an expert UX/UI designer and storyboard artist. Generate a comprehensive 6-panel storyboard script illustrating the end-to-end user workflow for "InboxToTask," an AI-native email triage solution.

### Core Concept & Narrative Context
The system automatically classifies incoming messages into two distinct streams based on functional intent:

1. Task-Bearing Emails: Messages requiring action, deadlines, or calendar events.
2. Communication/Informational Emails: General announcements, FYI updates, and newsletters that require no direct action.

### Required Visual & Narrative Details Per Panel
For each of the 6 panels, provide:

- Visual Scene: Setting, framing, character actions, and expressions.
- UI Interface Mockup Description: Exact layout of the app screen, buttons, text fields, and visual split.
- Narrative Caption: 1–2 sentences explaining the user’s cognitive state and workflow step.
- Voiceover/Thought Bubble: What the user is thinking or experiencing.

### Panel Breakdown Requirements

#### Panel 1: The Bottleneck (Before State)
- Scene: An overwhelmed user staring at a bloated, chaotic inbox containing project deadlines, newsletters, calendar requests, and general FYIs.

#### Panel 2: Automated Ingestion & Classification (Behind the Scenes)
- Scene: The AI classification engine running in the background.
- UI Focus: A conceptual diagram showing incoming emails splitting into two paths: "Actionable Tasks" and "Informational/Communication."

#### Panel 3: Actionable Task Digest (Review & Approval Gate)
- Scene: The user reviewing a structured "Task Digest" card on screen.
- UI Focus: A side-by-side view comparing the original email snippet with an extracted action card. Include approval controls such as "Approve to Task Manager," "Add to Calendar," and "Edit Parameters."

#### Panel 4: External Sync Confirmation
- Scene: Human-in-the-loop confirmation for high-consequence tasks.
- UI Focus: Approved tasks and meeting slots visually syncing to Google Calendar and a Kanban/to-do board with status badges.

#### Panel 5: Informational Digest & Backlinks (Zero-Action View)
- Scene: The user viewing a passive "Communication Digest."
- UI Focus: A clean summary of non-actionable announcements and newsletters with clickable "Source Email" backlinks next to each item.

#### Panel 6: Workflow Resolution (After State)
- Scene: The user sitting calmly with an organized inbox, clear schedule, and restored focus.
- Narrative Caption: Highlight reduced cognitive load and the elimination of manual email copy-pasting.

### Formatting Output
Format the response using structured Markdown sections for each panel with clear subheadings: [Visual Shot], [UI Screen Detail], [Caption], and [Key Takeaway].

---

## 2) Example Storyboard Response

### Panel 1: The Bottleneck (Before State)

[Visual Shot]: Medium close-up, eye-level. Inside a dimly lit home office, a college professional sits hunched over a laptop. Their face is lit by screen glare, brows furrowed, eyes wide with fatigue, and one hand massaging their temple in frustration.

[UI Screen Detail]: Standard email client view showing a congested inbox with 1,420 unread messages. The subjects clash incoherently: "URGENT: Submit Final Report Draft by Friday 5 PM," "All-Hands Social Hour & Bagel Breakfast," "Quarterly Project Kickoff Meeting Invitation," and "Company-Wide Policy Update: Travel Expenses." Multiple colored reminder flags compete for attention with no visual hierarchy.

[Caption]: Unstructured inboxes blur urgent commitments with non-actionable chatter, forcing users to waste cognitive energy manually identifying what requires real action.

[Key Takeaway]: Monolithic inbox volume and mixed email types create immediate workflow obstacles and acute cognitive strain.

### Panel 2: Automated Ingestion & Classification (Behind the Scenes)

[Visual Shot]: Conceptual cutaway / schematic diagram overlay. A clean vector diagram abstracts the background engine without exposing raw machine reasoning. Data streams flow smoothly from an inbox icon into an AI evaluation node.

[UI Screen Detail]: A minimalist architectural pipeline. An incoming email stream feeds into a central "Semantic Intent Triage" engine. The stream bifurcates into two color-coded channels:

- Left Channel (Amber): "Task-Bearing Stream" for extracted deliverables, dates, and ownership.
- Right Channel (Cool Slate): "Communication/FYI Stream" for announcements, broadcasts, and notices.

[Caption]: Operating autonomously in the background, InboxToTask classifies incoming mail by functional intent rather than message volume.

[Key Takeaway]: Eliminating irrelevant communication noise at ingestion isolates genuine commitments without requiring reactive manual sorting.

### Panel 3: Actionable Task Digest (Review & Approval Gate)

[Visual Shot]: Over-the-shoulder shot focused on the user’s monitor. The user leans forward attentively, chin resting on one hand, engaged in deliberate evaluation instead of passive skimming.

[UI Screen Detail]: The InboxToTask "Batch Review Interface." A balanced side-by-side comparison card:

- Left Pane: Verbatim email excerpt with highlighted text: "...need the finalized project slides submitted to the client portal by Friday at 5:00 PM."
- Right Pane: Extracted action card with fields such as:
  - Task Title: "Submit Finalized Project Slides to Client"
  - Due Date: "Friday, Oct 24 • 5:00 PM"
  - Controls: [Approve to Task Manager], [Add to Calendar], and [Edit Parameters]

[Caption]: Consolidated batch preview cards contrast original email evidence against extracted parameters, giving the user full oversight before any external action is taken.

[Key Takeaway]: Grounded side-by-side diffs provide clear decision context while preserving user control and reducing approval fatigue.

### Panel 4: External Sync Confirmation (Human-in-the-Loop Gating)

[Visual Shot]: Tight macro close-up of the screen and the user’s index finger deliberately pressing the trackpad. A small modal captures deliberate human sign-off.

[UI Screen Detail]: An "Action Gating / Pre-Commitment" modal for a high-consequence calendar sync. It asks: "Confirm Target Deadline before Sync:" with a verified date-picker defaulting to Friday, 5:00 PM. After clicking [Confirm & Sync], an animated sync arrow pulses toward two connected application icons.

Below, a split desktop view reveals:

- Google Calendar displaying a green event block: "Final Slides Due (5:00 PM)" with a [Verified Sync] badge.
- A Kanban/To-Do board automatically populating a new card under "In Progress" titled "Submit Final Slides" with an attached source link.

[Caption]: High-consequence actions include lightweight verification checkpoints to prevent anchoring bias and mindless rubber-stamping.

[Key Takeaway]: Strategic friction protects external productivity tools from hallucinated dates or unauthorized entries while preserving user control.

### Panel 5: Informational Digest & Backlinks (Zero-Action View)

[Visual Shot]: Wide shot of the user comfortably scrolling through a clean document view, holding a mug with one hand. The tension in their posture is gone; their expression is relaxed and focused.

[UI Screen Detail]: The InboxToTask "Passive Communication Digest" window. A top banner reads: "Daily Communication Digest — 14 Non-Actionable Updates Synthesized." Bulleted overview sections group information logically, such as Company News, Facilities, and Social updates.

Example entries:

- "Campus networking breakfast moved to Hall B tomorrow at 9:00 AM." [Source Email ↗]
- "Updated travel reimbursement guidelines have been published on the internal wiki." [Source Email ↗]

Hovering over a [Source Email ↗] pill reveals a lightweight tooltip preview of the original sender and timestamp.

[Caption]: Peripheral chatter is synthesized into a readable, zero-action summary with inline backlinks, allowing quick verification without generating unnecessary tasks.

[Key Takeaway]: Isolating passive correspondence prevents non-actionable emails from acting as workflow obstacles or creating artificial urgency.

### Panel 6: Workflow Resolution (After State)

[Visual Shot]: Bright, wide-angle cinematic shot of the entire workspace. Natural morning light fills the room. The user sits upright, smiling calmly, hands behind their head in a relaxed stretch.

[UI Screen Detail]: A dual-monitor setup showing seamless organization:

- Primary Screen: InboxToTask dashboard displaying: "Inbox Zero Achieved • 0 Pending Approvals • 1 Digest Read."
- Secondary Screen: A neat calendar and task list with zero conflicting entries or missed commitments.

[Caption]: With incoming noise separated from real commitments, the user regains complete situational control without manually copying or pasting a single email.

[Key Takeaway]: Replacing manual inbox triage with structured, human-in-the-loop digests relieves cognitive load and restores long-term workflow well-being.

---

## 3) Final Notes
This structure clearly separates the prompt from the generated storyboard response and makes the email classification workflow much easier to follow visually and conceptually.

            "Campus networking breakfast moved to Hall B tomorrow at 9:00 AM." [Source Email ↗]

            "Updated travel reimbursement guidelines have been published on the internal wiki." [Source Email ↗]

        Hover state on the clickable [Source Email ↗] pill shows a lightweight tooltip preview of the original sender and timestamp, enabling instant backlinking without cluttering the primary to-do view.   
        PDF

    [Caption]: Peripheral chatter is synthesized into a readable, zero-action summary with inline backlinks, allowing quick verification without generating unneeded tasks.   
    PDF

    [Key Takeaway]: Isolating passive correspondence prevents non-actionable emails from acting as workflow obstacles or creating artificial urgency.   
    PDF

Panel 6: Workflow Resolution (After State)

    [Visual Shot]: Bright, wide-angle cinematic shot of the entire workspace. Natural morning light fills the room. The user sits upright, smiling calmly, hands behind their head in a relaxed stretch.

    [UI Screen Detail]: A dual-monitor setup showing seamless organization:

        Primary Screen: InboxToTask displaying a crisp, minimalist dashboard: "Inbox Zero Achieved • 0 Pending Approvals • 1 Digest Read."

        Secondary Screen: A neat, structured calendar alongside an organized task list with zero conflicting entries or missed commitments.   
        TXT

    [Caption]: With incoming noise separated from real commitments, the user regains complete situational control without manually copying or pasting a single email.   
    TXT+ 1

    [Key Takeaway]: Replacing manual inbox triage with structured, human-in-the-loop digests relieves cognitive load and restores long-term workflow well-being.   
    PDF+ 1

use above to generate me a visual 