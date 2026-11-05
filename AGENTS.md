# InboxToTask repository guidance

## Start here

InboxToTask turns permitted Gmail messages into evidence-linked suggestions that users review before accepting tasks or authorizing calendar actions. Active implementation lives under [Checkpoint 3](<Checkpoint 3/>); earlier checkpoints contain requirements and evaluation history.

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
- Edit canonical [pipeline](<Checkpoint 3/app/pipeline/>) and [prompts](<Checkpoint 3/app/prompts/>) sources. Rebuild the ignored Edge extraction bundle with `npm.cmd run supabase:prepare`; never maintain a separate copy there.
- Distinguish preview simulation, synthetic integration output, live model results, and deployed behavior when reporting progress. Passing offline tests does not establish live extraction accuracy or hosted integration.

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

- Real email processing requires configured permission: inclusion labels/senders/domains combine with OR; exclusions override inclusions; an empty allowlist processes nothing. Filter metadata before fetching bodies and apply the same rules to each context message.
- Treat email text as untrusted data. Validate structured output, evidence grounding, and ownership before saving. Keep missing deadlines nullable and preserve date-only values, conditions, and uncertainty.
- Keep suggestions, user edits, and accepted task values distinct. Task approval does not authorize Calendar writes. Code-only review actions should not call the model again.
- Preserve user isolation, revision checks, bounded budgets/retries, deduplication, pause/deletion fencing, and retention/undo semantics. OAuth integration must derive the owner from the verified Supabase session and keep Google tokens backend-only.
- The current fixture endpoint is restricted to E01–E20 and disabled by default. Extend it to real Gmail only as part of an explicit privacy/authorization integration; connecting Google alone is not scanning consent.
