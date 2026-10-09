**Problem Significance**

Email functions as an informal operating system where messages carry requests, deadlines, follow-ups, and commitments requiring external action. However, users must manually parse unstructured text and transcribe obligations into calendars, issue trackers, or personal to-do lists. As inboxes grow, this repetitive triage creates severe organizational friction, allowing critical commitments to slip through the cracks.

InboxToTask bridges the gap between receiving unstructured communications and executing actionable work.

The problem requires an AI-native solution because operational commitments lack standardized syntax. Subtle linguistic shifts fundamentally alter responsibility: “Can you send the slides by Thursday?” creates an incoming task for the recipient, whereas “I will send the slides by Thursday” represents an external commitment requiring deferred tracking.

Furthermore, cross-message references and implicit timelines require semantic disambiguation that traditional keyword rules cannot achieve. Generative AI uniquely resolves these linguistic nuances, transforming conversational prose into structured, auditable tasks.

---

**Prior Work & Gaps**

Prior email productivity systems reveal clear technical and operational gaps:

* **Structural Organization vs. Semantic Parsing:** Bellotti et al. (2003) pioneered task-centric email organization with Taskmaster. However, the system lacked automated semantic extraction, leaving the burden of task identification and categorization entirely on the user.
* **Cognitive Strain and Unfiltered Noise:** Kern et al. (2024) demonstrated that traditional email loads directly drive workplace irritation and future task stress. Standard inboxes treat all inbound mail identically, failing to filter communication noise from time-sensitive obligations.
* **Conversational Interface Latency:** Modern generative assistants (e.g., Copilot, Claude) require manual prompting in detached chat panes. This conversational paradigm introduces interaction latency and generates conversational text rather than structured, actionable records.
* **Domain Fragility:** While Azarbonyad et al. (2019) demonstrated automated commitment detection via machine learning, classification performance degraded sharply across diverse organizational domains, highlighting the need for generalized semantic reasoning models.

---

**Proposed Technical Approach**

InboxToTask connects to inbound email streams to extract and track commitments through an agentic pipeline:

* **Triage & Classification:** Upon message receipt, an LLM classifier separates passive communication noise (e.g., FYI notices) from task-bearing commitments.
* **Entity & Metadata Extraction:** For actionable emails, the pipeline extracts key operational attributes: primary deliverable, responsibility (assigned to user vs. external follow-up), deadlines, and dependencies. Thread history is ingested to resolve contextual references.
* **Action Generation & State Tracking:** Interpreted emails are converted into structured candidate actions, such as calendar events, deadline tasks, or follow-up monitors. Users inspect and edit drafts before synchronization with external tools. Over time, agentic components track commitment states across follow-up messages, automatically marking items as resolved or flagging overdue commitments for escalation.

---

**Checkpoint 2 Validation Plan**

For Checkpoint 2, we will evaluate the core prompt chains against a benchmark corpus of synthetic and real-world email scenarios. The test set will span direct user assignments, external commitments, multi-action messages, implicit timelines, ambiguous phrasing, and non-actionable noise.

Model outputs will be evaluated against ground-truth structured schemas across four criteria:

1. Intent classification (noise vs. actionable commitment).
2. Ownership assignment (user obligation vs. third-party tracking).
3. Entity extraction precision (dates, assignees, deliverables).
4. Action category mapping (calendar event, task, follow-up).

Failure cases will be systematically audited to iteratively refine prompt phrasing, few-shot examples, and chain-of-thought reasoning.

---

**Risk Analysis & Mitigation**

To balance safety with cognitive efficiency, InboxToTask implements tiered approval thresholds informed by Geninatti Cossatin et al.’s (2026) findings on trust and workload trade-offs between full automation and explicit confirmation.

Low-risk tasks execute autonomously under high autonomy, while high-consequence or state-modifying actions revert to medium autonomy for human review.

To prevent anchoring bias and passive rubber-stamping during review, the interface uses pre-commitment prompting by concealing extracted parameters until the user inputs an initial baseline (e.g., entering an agreed milestone date) to catch hallucinated errors (Mitchell et al., 2026).

Grounding is further enforced by linking extracted fields directly to source email excerpts. Priority models evaluate purely functional markers (e.g., explicit deadlines, deliverables) rather than sender seniority or style to prevent bias.

Data privacy is protected through domain allowlists, sender/keyword blacklists, and customizable retention schedules (e.g., automated record deletion after 7, 14, or 30 days) alongside strict opt-outs for model training. Together, these mechanisms translate cognitive safety principles into an interface that balances automated throughput with meaningful user oversight.

---
