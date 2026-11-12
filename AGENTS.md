# InboxToTask repository guidance

## Start here

InboxToTask turns permitted Gmail messages into evidence-linked suggestions that users review before accepting tasks or authorizing calendar actions. Active implementation lives under [Checkpoint 3](<Checkpoint 3/>); earlier checkpoints contain requirements and evaluation history.

Start with [current implementation state](<Checkpoint 3/CURRENT_STATE.md>) for code, verification, pending migrations, and next work. The [Claude handoff](CLAUDE_HANDOFF.md) adds continuation detail.

Read the task-relevant entry points below and follow their imports. Avoid scanning dependencies, build output, generated Edge bundles, or the entire checkpoint archive for routine work.

| Area | Entry points and documentation |
| --- | --- |
| Product requirements | [Implementation plan](<Checkpoint 3/IMPLEMENTATION_PLAN.md>) — unchecked items are requirements, not proof that code is absent |
| Frontend | [Web instructions](<Checkpoint 3/app/web/AGENTS.md>), [React entry](<Checkpoint 3/app/web/src/main.tsx>) |
| Canonical extraction | [Pipeline guide](<Checkpoint 3/app/pipeline/README.md>), [core](<Checkpoint 3/app/pipeline/core.mjs>), [Gemini adapter](<Checkpoint 3/app/pipeline/gemini.mjs>) |
| Model contract | [Prompts and schema](<Checkpoint 3/app/prompts/>) — inspect effective overrides as well as defaults |
| Backend and storage | [Supabase instructions](<Checkpoint 3/app/supabase/AGENTS.md>), [setup](<Checkpoint 3/app/supabase/README.md>), [storage contract](<Checkpoint 3/app/supabase/STORAGE.md>) |
| Tests | [Tests](<Checkpoint 3/tests/>); commands below and in scoped instructions |
| Verification evidence | [Local storage report](<Checkpoint 3/docs/local-storage-verification-2026-11-04.md>), [live extraction evaluation](<Checkpoint 3/docs/cp2-live-evaluation-2026-11-03.md>) — dated evidence, not current runtime state |

## Working conventions

- Check Git status before editing; preserve unrelated work. User requests determine scope. Do not infer permission to publish, push, or deploy from a request to implement or test locally.
- Use source and package manifests to resolve stale documentation. Some checkpoint docs are plans or placeholders; do not treat them as implemented behavior. Keep guidance concise and link detailed setup/contracts rather than copying them here.
- There are two package roots: npm in [app](<Checkpoint 3/app/>) and pinned pnpm in [web](<Checkpoint 3/app/web/>). Preserve their respective lockfiles; there is no root package manifest.
- Quote paths containing spaces. On Windows use `npm.cmd` and `npx.cmd` when PowerShell blocks script shims. Search with `rg` when available; otherwise use `git ls-files`, `Select-String`, and scoped `Get-ChildItem` without installing tools just to search.
- Never print or commit real environment values, tokens, email bodies, or raw provider diagnostics. Inspect environment templates instead. Keep privileged Supabase and Gemini credentials server-side; browser configuration contains only public connection values.
- This repository is public. Anything that reaches GitHub (commits, docs, pull request descriptions and comments, issues, handoffs) must not describe an unfixed weakness someone could exploit, the steps to exploit it, or a credential that was exposed and is not yet rotated everywhere. Report those in a private GitHub security advisory (Security tab → Advisories → New draft) and refer to it publicly only by name. Saying a check was not run is fine; explaining how the gap could be abused is not. Use fictional `example.edu` addresses in fixtures and examples, and no personal contact details beyond those the README lists.
- Edit canonical [pipeline](<Checkpoint 3/app/pipeline/>) and [prompts](<Checkpoint 3/app/prompts/>) sources. Rebuild the ignored Edge extraction bundle with `npm.cmd run supabase:prepare`; never maintain a separate copy there.
- Distinguish preview simulation, synthetic integration output, live model results, and deployed behavior when reporting progress. Passing offline tests does not establish live extraction accuracy or hosted integration.
- Handoffs: when asked to hand a task to another person, fill in [the handoff template](HANDOFF_TEMPLATE.md) and show it to your person. Post it as a comment on the task's pull request only after they approve, because the repository is public. When picking up a handoff, run its Resume commands and confirm the branch tip before building on it. Security details in a handoff follow the public-repository rule above.

## CP4 task tracking

CP4 work is tracked in GitHub issues and the team's CP4 project board. The pinned "CP4 working agreement" issue is the source of truth; this is what agents need from it.

- Before starting a task, find its issue. Read its "Done when" checklist, its "Depends on" and "Used by" lists, its owner and its reviewer. If no issue covers the work, tell your person instead of creating one.
- A PR that completes an issue says `Closes #N` in its description; one that only advances it says `Part of #N`. The reviewer named on the issue approves the PR, confirms the "Done when" list and closes the issue.
- Don't tick checklist items, comment, close issues, or change labels, assignees or board fields unless your person asks. Show them the text first, because the repository is public.
- Keep issues in step with the code. When you open a PR, merge one, or change behavior, search the open issues (`gh issue list --state open`, then read the likely ones) for every issue the change affects, not only the one you worked from:
  - issues it completes or advances: which "Done when" items it satisfies, with the PR link;
  - issues whose wording, "Done when" items or assumptions it changes or contradicts (for example, a rule an issue's copy or study materials rely on);
  - issues it unblocks, or that now need a different order, migration or rollout step.
  For each, draft a short comment: what changed, which items it meets or affects, and what is still open. When an issue has a dated "Status (Mon D):" line, draft a replacement for it too. Show the drafts to your person and post only what they approve; tick items only after the PR that satisfies them is merged. Never mention someone with a bare `@` unless they should be notified.
- Proof of work outside the repo (accounts, recruiting, sessions, forms, slides) is a comment on the issue: a link, a screenshot or the completed checklist. Never include participant names, account addresses or credentials.
- Due dates are targets to keep the team on track, not strict requirements. When a date will slip, say so early and suggest a comment with the new expected date. Never skip a "Done when" item or a check to make a date.
- Fall break (Nov 21–29) has nothing scheduled. Work then is optional and only on tasks nothing else is waiting on. A task listed in another issue's "Depends on", or one with a "Used by" list, keeps its date and can't be moved into the break.
- The study freeze runs from Tue Nov 17 (evening) until the last study session on Fri Nov 20. Don't merge to `main` or deploy during it, because `main` deploys to production. Improvements that touch the dashboard or onboarding merge after Nov 20.

## Validation

Run checks appropriate to changed behavior. Documentation-only changes need link/path/command verification and `git diff --check`, not model calls or the full runtime suite.

From `Checkpoint 3/app`:

```powershell
npm.cmd ci                 # When dependencies need installing
npm.cmd test               # Offline pipeline/handler/storage semantics
npm.cmd run test:storage   # Targeted storage subset
```

For frontend changes, follow the web instructions. For migrations, Auth/RPCs, or Edge integration, follow the Supabase instructions. Use meaningful regression checks for changed behavior and report checks that could not run. Do not install dependencies or repeat already-passed suites without a task-related reason.

## Product invariants

- Real email processing requires configured permission: exact sender/domain inclusions combine with OR; exact sender/domain and literal subject exclusions override inclusions; semantic topics never grant access; an empty allowlist processes nothing. Skipped-topic word lists only withhold email: check them in backend code before any model call, on the current message, every context message and existing-task context, and never send the lists to the model. Filter metadata before fetching bodies and apply the same rules to each context message.
- Treat email text as untrusted data. Validate structured output, evidence grounding, and ownership before saving. Keep missing deadlines nullable and preserve date-only values, conditions, and uncertainty.
- Keep suggestions, user edits, and accepted task values distinct. Task approval does not authorize Calendar writes. Code-only review actions should not call the model again.
- Preserve user isolation, revision checks, bounded budgets/retries, deduplication, pause/deletion fencing, and retention/undo semantics. OAuth integration must derive the owner from the verified Supabase session and keep Google tokens backend-only.
- The current fixture endpoint is restricted to E01–E20 and disabled by default. Extend it to real Gmail only as part of an explicit privacy/authorization integration; connecting Google alone is not scanning consent.
