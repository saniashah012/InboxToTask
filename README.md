# 1. Project Title & Tagline

## **InboxToTask**

*Turn the things you need to remember in your inbox into actions you can actually track.*

## 2. Team Members & Roles

- **Matthew Zheng** — [mzheng22@illinois.edu](mailto:mzheng22@illinois.edu)<br>
  *Product Strategy and Research*

- **Yuchen Zhang** — [yuchen71@illinois.edu](mailto:yuchen71@illinois.edu)<br>
  *Literature Review and Research*

- **Hua Tong** — [huat2@illinois.edu](mailto:huat2@illinois.edu)<br>
  *UX/UI Design and User Research*

- **Sania Shah** — [sania2@illinois.edu](mailto:sania2@illinois.edu)<br>
  *Product Ideation, Design, and Research*

## 3. Problem Statement & Motivation

People receive actionable information through email—such as commitments, deadlines, follow-ups, and requests—but must manually identify, remember, and transfer that information into calendars, task managers, or other systems. As inboxes grow, this creates repetitive organizational work and increases the likelihood that important actions and unresolved commitments are overlooked.

Email is often more than a communication tool: messages can contain information that requires action outside the inbox. Although this information already exists digitally, users often still have to recognize its significance and manually reorganize it elsewhere. We are interested in reducing this gap between receiving information and acting on it.

## 4. Target Users & Core Tasks

The target users include college students who need to manage multiple course assignments, as well as organizations that need to manage corporate projects.

1. Identify a list of deadlines as a report.
2. Remember commitments and follow-ups that require attention at a later time.
3. Keep track of actions they need to complete from information received from emails.

## 5. Competitive Landscape

- **[Gemini](https://workspace.google.com/products/gmail/ai/)** — Requires manual prompts or chat per email; lacks automatic detection, background extraction, and direct sync into organized task lists. The standard experience is manual and reactive; proactive features require manual rule setup.

- **[Copilot](https://support.microsoft.com/en-us/outlook/copilot-outlook/chat-with-copilot-in-outlook)** — Operates primarily as an interactive LLM chat assistant rather than a background automated pipeline that proactively identifies action items across incoming emails. The default behavior is conversational assistance; autonomous background sync requires separate configuration.

- **[Claude](https://support.microsoft.com/en-us/outlook/copilot-outlook/chat-with-copilot-in-outlook)** — It cannot continuously scan incoming mail. It only extracts items when you manually feed it an email or explicitly instruct the chat or connector to inspect a specific conversation. It is primarily an interactive LLM chat/API.

## 6. Initial Concept & Value Proposition

InboxToTask is a GenAI-powered email assistant that turns actionable information from incoming emails into structured next steps. Rather than requiring users to manually identify and transfer important information from their inbox, the system analyzes emails for tasks, commitments, deadlines, events, and follow-ups and determines how that information should be tracked.
The system uses contextual language understanding to distinguish between different types of responsibility and intent. For example, “Can you send the slides by Thursday?” represents a task assigned to the user, while “I’ll send you the slides by Thursday” represents a commitment from someone else that the user may need to follow up on. InboxToTask can also use relevant email-thread context to interpret references, dates, and other details that may not be contained within a single message.

Detected actions are organized into categories such as Task Bearing Commitments and Passive Communication Noise. The system extracts relevant details—including the action, responsible person, deadline, and supporting context—and suggests an appropriate next step, such as creating a task, adding a calendar event, or tracking a commitment for follow-up. Users can review and edit AI-generated actions before they are synchronized with connected tools, and each action remains linked to its source email for verification.
By combining semantic interpretation with structured action tracking, InboxToTask aims to reduce the repetitive organizational work between receiving information and acting on it, while preserving user visibility and control over AI-generated actions.

## 7. Milestones Roadmap

### Checkpoint 1: September 17 at 11:30 PM

- Project Overview / Description — 9/15
- Identify Potential Competitors — 9/15
- Literature Review and Reflection — 9/16
- Formal Proposal — 9/16
- Setting Up GitHub Repository — 9/16

### Checkpoint 2: October 8 at 11:30 PM

- Prompt-based Validation — 9/21
- Gap Analysis and Interviews — 9/24
- Opportunity Framing — 9/27
- Design Specification — 10/4
- Functional Figma Clickthrough — 10/7

### Checkpoint 3: November 5 at 11:30 PM

- Working Source Code — 10/25
- Documentation — 10/27
- Testing — 11/3

### Checkpoint 4: December 3 at 11:30 PM

- Evaluation — 11/20
- Final Report — 11/24
- Complete Artifact — 12/2

