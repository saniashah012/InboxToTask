# InboxToTask: CP4 plan

Written November 6, 2026, against the [CP4 instructions](CP4_INSTRUCTIONS.md). **Due Thursday, December 3 at 11:30 PM.** The forum post is due Friday, December 4 at 9:00 AM (#39).

> **Status (November 12, 2026):** this plan started as a November 6 proposal. The team's decisions,
> owners and dates now live in the pinned **CP4 working agreement (#39)** and the CP4 issues on the
> [InboxToTask CP4](https://github.com/users/mzheng-01/projects/1) project board; where this plan disagrees with them, they win. Every section
> was checked against the repository and issues on November 12: Calendar is required (D3), automatic
> checks while the app is open shipped (D4), the dashboard runs on real data, and dates follow #39.
> Done items are ticked, open ones point to their issue. What shipped is recorded in
> [current state](<../Checkpoint 3/CURRENT_STATE.md#november-12-2026-cp4-study-release>).

This was a proposal for the team to confirm; the decisions below now show what was decided. Nothing here authorizes deploying, enabling hosted scanning or processing real email; each of those still needs its own approval.

## 1. What the rubric means for priorities

| Rubric item | Points | What it means for us |
| --- | --- | --- |
| Empirical evaluation | 4.5 | Needs quantitative metrics, qualitative depth **and** ablation analysis, whichever track we pick |
| Final report | 4.5 | Depends entirely on the evaluation producing real data |
| Artifact and deployment | 2.0 | Clean code, a working public URL, reproducible scripts, complete docs |
| Presentation | 2.0 | Empirical takeaways, a demo and honest reflection |

**Nine of the 13 points come from the evaluation and report, and features aren't graded directly.** So engineering is limited to what the study needs, what the artifact score needs, and what must be safe to deploy. If engineering runs late, we cut features, not the study; the study runs on frozen results either way (#67).

## 2. Decisions (status as of November 12)

Each row says whether it is **decided**, **done** or still **open**, with the evidence. The team settles open ones in the working agreement (#39) or an issue.

| # | Decision | Status and outcome | Why |
| --- | --- | --- | --- |
| D1 | Evaluation track | **Decided: Track A, plus a small ablation benchmark** (study sessions #69–#72, analysis #76–#79, ablations #75) | The rubric and slides expect qualitative depth and ablations. CP2 also committed us to comparing human-only, AI-only and combined workflows |
| D2 | IRB and consent | **Decided: informal class study without IRB review, with a consent sheet** (#60; disclosed as a limitation in #83) | The study involves people, so consent and the limitation are stated plainly |
| D3 | Google Calendar events | **Decided: required for CP4** (was: cut, keep ICS export) | Tracked in #44–#47 and #53; the latest work is on branch `claude/calendar-designed-ui`, and the go/no-go decision for the study is due noon Tuesday November 17. ICS export stays as the fallback |
| D4 | Automatic scans | **Decided, partly built:** opt-in checks when the app opens and every minute while it's open (#108, #110, tracked in #50). Scanning with the app closed (#49) is still future work, after the study | Background access with the app closed still raises the consent and token questions, so the report must say plainly which part exists |
| D5 | Dashboard topic filter (the prototype's School/Work/… tags) | **Done: the real dashboard has no topic filter**; its only tabs are Suggestions, Active, Completed and Dismissed | Real data has no topic category (see [Section 5](#5-workstream-b-connect-the-designed-dashboard)). Adding one changes the prompt and invalidates saved results |
| D6 | Open-source license | **Open: proposed MIT, unless the team objects** (no `LICENSE` in the repo yet) | The repo is public but has no license, so it isn't legally open source yet. All four authors must agree |
| D7 | App location | **Decided in practice: kept in `Checkpoint 3/app`, mapped in the [CP4 index](README.md)** | Moving it would break CI, Vercel's root setting and doc links, and conflict with open branches, for little gain |
| D8 | Who can use the live URL | **Open: real scanning for approved testers only** (tracked in #48). The fictional preview proposed here was removed (`5d557b4`), so graders need a sign-in or the recorded demo | Keeps the model budget safe. Ask the instructor whether a test sign-in or a recorded demo is acceptable |

## 3. Requirements check

### CP3 gaps carried forward

CP3 has been submitted, so these are carried forward because the final artifact and report must describe them accurately.

| CP3 requirement or gap | Plan |
| --- | --- |
| Real data in the designed dashboard and onboarding | **Built** (PR #26, merged November 9; issue #51; checked November 12) |
| Waiting For view | **Built** in the dashboard's Active view |
| "Clean modular codebase" | **Partly done:** `App.tsx` is down to auth and routing (265 lines), with each screen in its own file; the rest of Workstream A is optional cleanup after the study (schema snapshot: #97) |
| Reproducible `INSTALL.md`, never run on a clean machine | **Verify** on a second machine (#87); add the Google Cloud setup (#88) |
| Latency, token cost and error logging | **Extend** for the benchmark (#75, #76): save per-call latency and token categories, estimate dollar cost, keep usage from failed calls. Error codes for scans were made specific on November 12 (#110) |
| Few-shot templates stored but not loaded | **Evaluate** as an ablation (#75) |
| Rate limits and mid-scan settings changes never run live; other cases in [UC8](<../Checkpoint 3/docs/use-cases.md#uc8-real-gmail-to-review-workflow>) | **Test** before the study, in the live study-flow check (#54) |
| Hosted Gmail not deployed | **Deployed** November 9, updated November 12, each with Matthew's approval; Workstream C items are still open (#48) |
| Account deletion | **Not built; disclose** unless time allows after the study |
| Automatic scans, Calendar events | Calendar: **build** (D3). Automatic checks while open: **built**; with the app closed: **disclose** (D4) |
| Streaming, vector store, tool-calling agent, PII sanitization | **Not building**. Explain why in the report: exact thread lookup replaces retrieval, no tools limits injection risk, and data minimization is the privacy approach. Say plainly that there's no PII sanitization |

### CP4 deliverables

| Deliverable | Where | Status |
| --- | --- | --- |
| `FINAL_REPORT.md` | [docs/FINAL_REPORT.md](docs/FINAL_REPORT.md) | Skeleton only |
| Study materials | [docs/study_materials/](docs/study_materials/) | In progress in #58–#66 (protocol, script, consent, questionnaire, inboxes, recruiting); no files in the repo yet |
| Figures | [docs/figures/](docs/figures/) | Not started; come from the analysis (#76–#79) |
| Clean `/app/` | [Checkpoint 3/app](<../Checkpoint 3/app/>) | Working and deployed; final artifact work in #85–#88 (deploy check, README, install checks) |
| Live URL | Vercel production | Serves the designed app with real data, hosted Gmail scanning and automatic checks while open (November 12); not yet recorded in the [CP4 index](README.md) |
| Presentation | [presentation/](presentation/) | Not started; slides in #89–#92, forum post #93 |

## 4. Evaluation design

This is the design chosen under D1 (Track A plus an ablation benchmark); the study materials in #58–#64 refine it. Write the thresholds and analysis rules down **before** running any session.

### User study (Track A)

**Research questions**

1. Does the combined workflow find tasks more accurately or faster than doing it by hand, and how does it compare with unreviewed AI output?
2. Do people catch the model's mistakes, or do they over-trust it?
3. Do people understand what the system can access?

**Participants:** about 8 college students who aren't on the team, about two per team member (#66). Treat results as exploratory, since this sample can't support strong claims.

**Design:** within-subject. Each participant does one inbox by hand and the other with InboxToTask, with order and inbox counterbalanced. Sessions take about 45 minutes.

| Workflow | How it runs |
| --- | --- |
| Human-only | Participant works through the fictional inbox in Gmail and writes a task list |
| Combined | Participant reviews InboxToTask suggestions for the other inbox |
| AI-only | No participant: the frozen model's unreviewed output is scored against the same gold labels |

**Materials**

- Two matched fictional inboxes (A and B) of about 20 emails each, with answer keys written before the sessions (#62, #63), plus matched edge cases (#64).
- Both include the hard cases: changed deadlines, ambiguous dates, someone else's promise, multiple tasks in one email, off-topic mail and a prompt injection.
- Plant realistic model errors only if consent and debriefing cover it; otherwise rely on the model's own mistakes.

**Keeping it stable and private**

- **Fictional mail only.** Participants never connect their own Gmail (decided in #94). An optional, unscored exploration after the scored tasks lets them *send* a made-up email to the study inbox; it is logged and graded separately (#58, #60, #101).
- **One standard setup for scored tasks**, given in the task script, with automatic scanning off; participants may change settings during exploration (#59).
- **Same suggestions for everyone.** Generate results once with the frozen model and load them into study accounts, so differences reflect people and not model randomness. Report this clearly. Measure live scan latency separately.
- Sessions run in a facilitator-controlled browser signed into dedicated fictional accounts (#55, #56), and a reset returns the accounts to the frozen results between sessions (#101).
- Run a pilot session first (#68, November 18), and don't include it in the results.

**Metrics**

| Type | Measures |
| --- | --- |
| Task success | Precision, recall and F1 against gold labels; deadline and ownership correctness; missed actions; duplicates |
| Efficiency | Time on task, plus number of corrections |
| Oversight | Model errors caught versus accepted, and how often the source was checked |
| Usability | UMUX-Lite and satisfaction Likert items |
| Trust and privacy | Trust Likert items and a short check of what people think the system can access |
| Qualitative | Think-aloud notes and a post-session interview; thematic analysis on trust, usefulness and friction, with two coders on a shared codebook |

**Analysis:** paired comparisons with medians and effect sizes, such as Wilcoxon signed-rank tests. Report individual data points and null results.

### Ablation benchmark (Track B methods)

**Dataset:** extend the existing fixtures (20 CP2 cases, 15 Gmail live cases, plus the review, deadline-update and injection fixtures) to about 70 labeled fictional cases, split into about 40 for development and 30 held out (#73, #74, checked by #95). Someone not tuning the prompt writes the held-out set, and we don't tune on it.

| Variable | Compare |
| --- | --- |
| Prompt | Current rule examples versus the stored [few-shot examples](<../Checkpoint 3/app/prompts/few-shot/>) |
| Context | Current message only versus same-thread context, the closest equivalent to "RAG vs. baseline" |
| Thinking level | LOW versus MEDIUM |
| Model | Current model versus one alternative, chosen with provider data terms in mind |

**Metrics:** detection precision, recall and F1; deadline, ownership and update-target accuracy; tokens; latency; estimated cost per email and per accepted task. Repeat each variant 3 times to measure non-determinism.

**Error analysis:** categorize every failure on the held-out set, such as wrong owner, missed task, invented or wrong date, and wrong update target.

**Cost check:** about 40 cases × 5 variants × 3 runs, plus 30 held-out cases × 2 finalists × 3 runs, is about 780 calls. At the roughly 2,500 tokens per call seen in a small fictional sample, that's about 2 million tokens, and more with thread context. Confirm the quota before running.

**New tooling (#75):** `extract:live` exists, but nothing scores variants against labels yet. Add one command, such as `npm run benchmark`, that runs a named variant and writes results that the [figures](docs/figures/) scripts can use.

### Other evaluation items kept from the earlier checklist

- [ ] Evaluate filtering separately: rule enforcement, excluded context, quoted-content limits and unwanted disclosures. Don't claim semantic privacy protection from metadata rules.
- [ ] Measure end-to-end latency, time to first useful result, retry recovery and scan completeness.
- [ ] Test a larger fictional inbox, overlapping jobs, prolonged failures, expiry or disconnection, cleanup races, and backup and deletion disclosures.
- [ ] Tune prompts, settings and context limits on the development set only, before the freeze. After the study, record suggested accessibility, onboarding and retention changes as findings rather than changing the evaluated version.
- [ ] Reassess Google verification and model-provider terms before anyone beyond test users is included.
- Optional if evidence and time allow: same-thread grouping, Batch API, provider caching.

## 5. Workstream B: connect the designed dashboard

**Done (PR #26, merged November 9; issue #51).** Signed-in users now land on the designed dashboard with real data; `ManualWorkspace` remains as the developer workspace. The field map below is kept as a reference for how the dashboard reads saved records.

### How dashboard fields map to real data

| Dashboard expects | Real source | Note |
| --- | --- | --- |
| `title` | `action` in `review_fields`, `fields` or `accepted_fields` | |
| `caption` | `requirements`, `condition` | |
| `context` | Sender and subject from `storage_sources` | |
| `category` | **None** | Stored category is only `Actionable` or `Passive`, so the six topic tags don't exist. See D5 |
| `date`, `dateLabel`, `tone`, `deadlineLabel` | Derived from `deadline` | Keep date-only values date-only; no deadline must display as such, never as an invented date |
| `email.body` | **Not stored, by design** | Show sender, subject, date, the evidence excerpt and the Gmail link |
| `updated` | `gmail_task_changes` | Broader than a deadline change: also edits, cancellations and ambiguous updates. Reuse the before/after table and `ManualChangeResolver` |
| `reminder`, waiting section | `storage_waiting_for`, `storage_followups` | Shown in the dashboard's Active view |
| Approve, dismiss, complete, undo, edit | `storage_action`, `gmail_change_review` | Replace local React state and timers with saved state. Dismiss undo uses `restore`; completion undo uses `undo` |
| Passive tab | `storage_extractions` | Reuse the Information tab's logic |
| Scan status | `manualScanStatus`, `manualScan` | Real status, one scan button and automatic checks while open (#40, #50) |
| Calendar button | ICS export ("Export calendar file") | Google Calendar events are #44, #45 |

### Checklist

Status November 12: the dashboard runs on real data (#51); open items point to their issues.

- [x] Route signed-in users to the dashboard, with onboarding from the merged branch.
- [x] Add a tested mapper from database rows to dashboard tasks (`dashboardModel.ts`).
- [ ] **Review cards show who sent the email and the evidence for the task** (sender done; subject and excerpt on the card still open, #41), since the current cards don't give enough to judge a suggestion (team feedback, November 5). Add warnings and uncertainty.
- [x] Add the Waiting For view with reminders and resolve/reopen.
- [x] Add a single scan button in place of **Scan past seven days** and **Scan more** (built; #40 is in review), keeping batch limits, visible backlog, cooldown and permission checks. A saved backlog is continued first.
- [x] Keep loading, empty, failure, expired-evidence and missing-context states explicit, with session-change fencing.
- [ ] Keep accessible labels, keyboard use and focus handling (accessibility check of the study flows: #42).
- [ ] Parity check of the study flows on the live site, including account switching with the account picker (#35): #54. `ManualWorkspace` stays as the developer workspace, so it isn't being retired.

## 6. Workstream A: make the codebase modular

**Status November 12:** the dashboard was connected without waiting for this split, and the biggest part happened along the way: `App.tsx` went from 3,213 lines to 265 (auth and routing), with each screen in its own file. What remains below is optional cleanup, to do after the study (Nov 20) so it can't disturb the study build. **Rules:** one small PR per step, moving code without changing behavior; each must pass `tsc`, the build and a browser check of the affected flow.

### Step 0: clear the branches first

These are done first because everything else touches the same files.

- [x] ~~Merge the onboarding branch `claude/onboarding-connect-0e9360`~~ Superseded: onboarding was connected through the designed-frontend merge (#26–#28).
- [x] Rebase and merge PR 20 (`sania/category-chip-toggle`): merged November 9.
- [ ] Apply D3: Calendar is kept; rebase `claude/calendar-designed-ui` (which supersedes `mzheng/calendar-rebase`) onto current `main` (#44).
- [ ] Respect the study freeze (#39): nothing merges to `main` from Tue Nov 17 evening until the last session on Nov 20.

Remember that **every merge to `main` deploys to production.** Check preview builds first.

### Step 1: split the frontend

Screens already live in their own files (`Onboarding.tsx`, `RealDashboard.tsx`, `RealSettingsScreen.tsx` and others). If the team wants folders, this is the target layout:

```text
web/src/
├── main.tsx
├── App.tsx               # auth and routing only
├── features/
│   ├── onboarding/       # Onboarding, RulesEditor, CategorySelector, Chips
│   ├── dashboard/        # Dashboard, TaskRow, task and waiting modals, ScanStatus
│   ├── review/           # Review cards, ManualChangeResolver, ExtractionReview, SourceEmails
│   ├── information/      # Passive tab
│   ├── settings/         # SettingsScreen, ScanSettingsPanel, GoogleConnectionPanel
│   ├── calendar/         # ICS export
│   └── devtools/         # StorageDashboard (development only)
├── data/                 # Supabase client, adapters, row types, workspace hook, task mapper
├── ui/                   # Icon, Modal, shared controls
└── styles/
```

- [x] Remove the sample data and fictional preview from `App.tsx` (`5d557b4`).
- [x] Leave `App.tsx` with auth and routing only.
- [ ] Optionally group the screen files into feature folders as above.
- [ ] Extract `ManualWorkspace`'s loading and session fencing into a shared `useWorkspaceData` hook.
- [ ] Replace `Snapshot = Record<string, StoredRow[]>` and the `any` uses with real row types.
- [ ] Run a formatter over the dense files, in its own commit with no logic changes. Do this after the moves so it doesn't create merge conflicts.
- Optional if time allows: split the 4,113-line `index.css` by feature.

### Step 2: tests that protect the split

- [x] Test the frontend logic in CI: the task mapper, deadline display, scan-state logic, settings and New/Unread rules have offline tests in `tests/` that `npm test` runs. (The [web instructions](<../Checkpoint 3/app/web/AGENTS.md>) still say there's no separate frontend script, which is true.)
- [ ] Add one browser smoke test using seeded fictional data: sign in, review, approve, reload.
- [x] Make one command run all offline suites (`npm test` now includes the calendar suite).

### Step 3: backend tidying

Keep the current shape: Edge Functions, canonical pipeline and SQL.

- [ ] Generate and commit a current schema snapshot (#97). Many SQL functions are redefined across migrations (`gmail_scan_service` alone in eight), so today you have to hunt for the latest version.
- [ ] Don't squash or rename applied migrations.
- [ ] Reformat the dense pipeline and test lines where touched.
- [ ] Archive the handoff and dated working notes under a clearly historical folder, keeping the verification evidence linked.

## 7. Workstream C: safe to deploy

Hosted Gmail went live on November 9 and was updated November 12, each with Matthew's approval. The controls below are tracked in #48 and #52. The [abuse-control design](<../Checkpoint 3/IMPLEMENTATION_PLAN.md#class-project-api-abuse-controls-proposed-implementation>) describes them.

**Existing per-user limits stay:** 20 requests and 200,000 tokens a day, 3 model calls per batch, a 30-second cooldown (both changed November 12) and token reservations. The items below are tracked in #48 and #52.

- [ ] Set a Gemini quota or spending limit in Google's console (#52). Record the setting, without any secrets.
- [ ] Add a private approved-tester table, checked when a scan or extraction is claimed. Browser roles can't edit it.
- [ ] Add an operator control row with an inference on/off switch and global daily request and token limits. Block new calls if accounting is unavailable.
- [ ] Reserve global and per-user budget in the same transaction, on both claim paths: the fixture route and `gmail_process_claim`.
- [ ] Show remaining allowance and reset time in the product, not just the dev tester.
- [ ] Review the shared limit of 3 requests per minute, now that a batch makes up to 3 model calls (2 before November 12).
- [ ] Test concurrent reservations, denied-claim rollback, UTC reset, zero model calls when disabled or out of budget, and overlapping scans. Use fake providers, then a small live trial on fictional mail.
- [x] Fix the two open defects with a new migration (`20261109220000`, PR #34): a deleted earlier email leaves its quote visible, and `valid_task_fields` accepts a null boundary.
- [ ] Hosted key hygiene: tracked in the private security review (#52).
- [ ] Set up production OAuth for the Gmail client with the study inboxes as test users (#52), and check Google's current rules for restricted scopes in testing mode, including token expiry.
- [x] **With separate approval:** apply migrations and deploy `gmail_scan` and the Google functions to hosted (November 9 and 12). The not-yet-live checks on fictional mail are still open (#54).

## 8. Schedule

Dates live in the CP4 working agreement (#39) and on each CP4 issue; they are not copied here, so they can't go stale.

The earlier fallback (run the study on `ManualWorkspace` if the dashboard wasn't ready by November 15) is no longer needed: the designed dashboard runs on real data. If hosted Gmail misbehaves, the study still runs on frozen results (#67).

### Owners

Owners and reviewers are assigned on each CP4 issue and on the [InboxToTask CP4](https://github.com/users/mzheng-01/projects/1) board, not in this plan.

## 9. Workstream D: final artifact

- [ ] Add `LICENSE` after D6.
- [ ] Rewrite the root README for a first-time reader: what it is, live URL, setup, tests, how to reproduce the evaluation, and known limits (#86).
- [ ] Run `INSTALL.md` on a second machine, and fix what breaks (#87); describe the Google Cloud setup (#88).
- [ ] Final deploy check, and record the live URL in the [CP4 index](README.md) (#85).
- [ ] Scan the repository and its history for secrets before final submission.
- [ ] Update architecture, safety and observability docs to match what was actually deployed and evaluated.
- [ ] Confirm charts regenerate from committed scripts and de-identified data.
- [ ] Check the report's word count is within 3,500–4,500, every citation has an APA reference, and the appendices include prompts and questionnaires.
- [ ] Confirm the final slides, report and repo all show the same numbers and the same live URL.

## 10. Not doing

- Redis, device tracking, automated fraud detection or an admin dashboard, as the abuse-control design already says.
- A separate backend server, a job queue, a vector store or an autonomous agent.
- Rewriting the backend, or squashing migrations.
- Processing participants' real email or connecting their inboxes (#94). The optional exploration only lets them send a made-up email to the study inbox.
- Scanning with the app closed (#49) before the study; it's for after Nov 20.
- Optional extras: push-based arrival detection (Gmail's History API would also replace the time-window overlap), richer rule previews, more calendar integrations or a separate classifier.
