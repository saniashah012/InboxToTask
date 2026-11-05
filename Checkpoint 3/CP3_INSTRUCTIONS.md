# IS 492 Checkpoint 3: Working Implementation & Live Demo

Semester-Long AI Team Project • University of Illinois Urbana-Champaign

**Course:** IS 492 / CS / INFO — Generative AI & Human-AI Systems, Fall 2026\
**Total:** 12.0 points\
**Due:** Week 10\
**Forum deadline:** Friday, 9:00 AM

Source: assignment instructions supplied by the user on November 5, 2026. Formatting has been normalized for Markdown; the requirements below are the supplied assignment text.

## Objective & Core Philosophy

By Checkpoint 3, your team must have a **fully running, end-to-end software application** demonstrating core functional value. Mockups, static HTML wireframes, or simulated responses are no longer accepted—your tool must execute real model inference, state transitions, and user interactions.

> Show the working gears, not just the facade. Prove that the system runs live on realistic workflows and justify your architectural decisions.

## Repository Deliverables (Push to `/app/` & `/docs/`)

```text
├── /app/                       # Full functional source code
│   ├── INSTALL.md              # Clear step-by-step local setup instructions
│   ├── .env.example            # Template for environment variables (NO API keys!)
│   ├── /prompts/               # System prompts, few-shot templates & model settings
│   └── (run scripts)           # package.json / requirements.txt / docker-compose
├── /docs/
│   ├── architecture.png/.md    # End-to-end architecture & dataflow diagram
│   ├── use-cases.md            # Documented use-case walkthroughs & test cases
│   ├── observability.md        # Telemetry, logging & debugging strategy
│   └── safety_privacy.md       # PII handling, rate limits & guardrail mitigations
└── /tests/                     # Unit tests & critical path integration tests
```

### 1. Working Source Code (`/app/`)

Your repository must contain complete, functional code:

- **Feature Completeness:** Implements all proposed core features from Checkpoint 2.
- **`INSTALL.md` & `.env.example`:** Reproducible setup instructions and configuration templates. *Never commit raw secrets.*
- **Prompt Management (`/prompts/`):** Version-controlled system prompts, model parameters, and output schemas.

### 2. Architecture & Documentation (`/docs/`)

- **Architecture Diagram:** Client UI, backend server, database, vector stores, API connectors, and model endpoints.
- **Use Cases (`use-cases.md`):** Walkthrough scripts for all primary user flows.
- **Observability (`observability.md`):** How system logs latency, token cost, and errors.
- **Safety & Privacy (`safety_privacy.md`):** Document your application's potential safety risks, implemented guardrails (e.g., PII sanitization, content filtering, rate limits), and failure fallbacks. Explain how these safeguards work and how they are tested.

### 3. Testing (`/tests/`)

Include automated unit tests or integration scripts for core prompt pipelines and tool execution paths.

## Checkpoint 3 Presentation & Live Demo Guide (5–8 Minutes)

### Live Execution is Mandatory

At least **half of your presentation time (3–4 minutes)** must be spent live in the running software demonstrating realistic use cases and error recovery.

### Recommended 7-Slide Outline + Live Demo

| Slide | Focus Area | Time | Core Content to Cover & Demonstrate |
| --- | --- | --- | --- |
| Slide 1 | Title & System Overview | ~30 sec | Project title, team member names, repo link, and a one-sentence problem reminder. |
| Slide 2 | Architecture & Stack | ~1 min | Walk through your architecture diagram (Frontend UI, backend orchestration, vector DB, LLM endpoints). |
| Slide 3 & Demo | Live Demo: Primary Flow | ~2 min | **LIVE DEMO:** Screen-share the running application. Execute a realistic user task showing generation, streaming, and interactive controls. |
| Slide 4 & Demo | Live Demo: Edge Cases | ~1.5 min | Show how system handles complex inputs, tool-calling (search, DB query, code execution), multi-step reasoning, and error recovery. |
| Slide 5 | Technical Decisions | ~1–1.5 min | Prompt engineering strategies, model selection tradeoffs (open-source vs proprietary), caching, latency optimization, and cost control. |
| Slide 6 | Safety & Guardrails | ~45 sec | PII sanitization, prompt injection defenses, hallucination mitigation, and rate-limit fallbacks. |
| Slide 7 | Path to CP4 Evaluation | ~45 sec | Known technical limitations and preview of CP4 evaluation plan (Track A user study or Track B algorithmic benchmark). |

## Checkpoint 3 Grading Rubric (12.0 Points Total)

| Evaluation Component | Points | Criteria |
| --- | --- | --- |
| Functional End-to-End Implementation | 4.0 pts | Live running application implementing all proposed core features with real LLM/Agent inference (not mockups). |
| Code Quality & Setup Reproducibility | 2.5 pts | Clean modular codebase, reproducible `INSTALL.md`, `.env.example`, prompt templates, and runnable scripts. |
| System Architecture & Observability | 2.5 pts | Clear architecture diagram, documented use cases, telemetry/logging plan, and safety/privacy guardrails. |
| Live In-Class Demo & Presentation | 3.0 pts | Flawless live walkthrough of realistic user scenarios, clear technical articulation, and timely forum submission. |
| **Total Grade** | **12.0 pts** | **Full Checkpoint 3 Deliverable Score** |
