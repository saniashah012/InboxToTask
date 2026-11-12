# IS 492 Checkpoint 4: Comprehensive Evaluation & Final Report

Semester-Long AI Team Project • University of Illinois Urbana-Champaign

**Course:** IS 492 / CS / INFO — Generative AI & Human-AI Systems, Fall 2026\
**Total:** 13.0 points\
**Due:** December 3 by 11:30 PM (Week 14)\
**Forum deadline:** Friday, 9:00 AM

Source: assignment instructions supplied by the user on November 6, 2026. Formatting has been normalized for Markdown; the requirements below are the supplied assignment text, including its spelling.

## Objective & Core Philosophy

Checkpoint 4 is the capstone deliverable of your project. Conduct a rigorous empirical evaluation, package all open-source artifacts, deploy a working web application, and author a comprehensive 3,500–4,500 word final report.

> "Data & Evidence > Sales Pitches. Deliver a rigorous synthesis of what was learned from building and evaluating your system."

## Choose Your Evaluation Track

### Track A: Tool / User Study

Empirical evaluation with real target users.

- **Task Battery:** Realistic user task set.
- **Quantitative Metrics:** Task success, time-on-task, SUS / UMUX-Lite usability scores, satisfaction Likert scales.
- **Qualitative:** Thematic analysis on user trust, usefulness, and friction.
- **Materials:** Protocols, consent, task prompts.

### Track B: Algorithmic Research

Benchmark experiments on models & pipelines.

- **Datasets & Baselines:** Standardized test sets.
- **Quantitative Metrics:** Accuracy, F1, win rates, token cost, response latency.
- **Ablations:** Prompt variants, model choices, RAG vs. baseline.
- **Error Analysis:** Deep categorization of failure modes.

## Repository Deliverables (Push to `/docs/` & Main Repo)

```text
├── /docs/
│   ├── FINAL_REPORT.md         # Comprehensive 3,500–4,500 word final report
│   ├── /study_materials/       # User study protocols, surveys, or benchmark datasets
│   └── /figures/               # Charts, latency plots, architecture diagrams
├── /app/                       # Clean, deployable, open-source code repository
└── (Live Deployed URL)         # Deployed web application or interactive demo link
```

### 1. Final Report (`/docs/FINAL_REPORT.md`)

A self-contained academic and engineering paper of 3,500–4,500 words covering:

- **Title, Authors & Abstract:** ~150 word summary.
- **1. Introduction:** Problem significance and core contributions.
- **2. Related Work:** Literature grounded in your Checkpoint 1 corpus.
- **3. Methodology:** System architecture, agent design, prompts, and pipeline.
- **4. Evaluation Design:** Protocol, participants/datasets, baselines, and metrics.
- **5. Results & Discussion:** Statistical findings, charts, qualitative themes.
- **6. Limitations & Ethics:** Safety, bias, hallucinations, and privacy.
- **7. Conclusion:** Key takeaways and future work.
- **References & Appendices:** Complete APA references, prompts, and questionnaires.

### 2. Complete Artifact Package & Deployment

- **Live Deployed URL:** Working public link (Vercel, Render, Spaces, etc.).
- **Reproducibility:** Clean open-source code, dataset access, and run scripts.
- **Visual Charts:** Latency curves, ablation plots, cost analyses.

## Final Presentation Guide (≤ 8 Minutes)

**Presentation Goal: Data-Backed Empirical Synthesis.** Focus on what users actually did and what the data shows. Highlight honest engineering takeaways and failure reflections rather than commercial hype.

### Recommended 8-Slide Outline

| Slide | Focus Area | Time | Core Content to Cover |
| --- | --- | --- | --- |
| Slide 1 | Title & Deployed Link | ~30 sec | Project title, team member names, public GitHub repo link, and live deployed web URL. |
| Slide 2 | System & 60s Demo | ~1.5 min | Quick reminder of problem context and high-impact highlight reel of the polished system in action. |
| Slide 3 | Evaluation Setup | ~1 min | Track A: Participant cohort, task scenarios, protocol. Track B: Benchmark datasets, baselines, ablation variables, metrics. |
| Slide 4 | Quantitative Results | ~1.5–2 min | The Core Findings: Charts, task success rates, SUS/UMUX scores, speedup metrics, ablation comparison tables, or cost/latency curves. |
| Slide 5 | Qualitative Insights | ~1–1.5 min | User interview themes, mental models, trust dynamics, unexpected user workarounds, and friction points. |
| Slide 6 | Limitations & Ethics | ~1 min | Honest technical boundaries, edge-case failures, hallucination risks, privacy safeguards, and bias considerations. |
| Slide 7 | Engineering Lessons | ~1 min | What worked well vs what failed, prompt design takeaways, non-determinism handling, and human-AI interaction insights. |
| Slide 8 | Future Work & Conclusion | ~30 sec | Open-source roadmap, potential future extensions, and final project conclusion. |

## Checkpoint 4 Grading Rubric (13.0 Points Total)

| Evaluation Component | Points | Criteria |
| --- | --- | --- |
| Empirical Evaluation Rigor | 4.5 pts | Sound study methodology (Track A user study or Track B algorithmic benchmark) with quantitative metrics, qualitative depth, and ablation analysis. |
| Final Report Quality (`FINAL_REPORT.md`) | 4.5 pts | Comprehensive (3,500–4,500 words), clearly structured, academically rigorous, deeply connected to related work, and complete with APA references and appendices. |
| Artifact Package & Deployment | 2.0 pts | Clean open-source codebase, working live deployed link, reproducible test scripts, and complete documentation. |
| Final Oral Presentation | 2.0 pts | Professional ≤ 8 min presentation delivering clear empirical takeaways, demo highlights, and thoughtful engineering reflections. |
| **Total Grade** | **13.0 pts** | **Full Checkpoint 4 Deliverable Score** |

IS 492: Generative AI & Human-AI Systems • Fall 2026 • University of Illinois Urbana-Champaign
