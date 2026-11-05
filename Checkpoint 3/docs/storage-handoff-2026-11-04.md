# Storage implementation handoff — November 4, 2026

## Resume context

**Resumed after restart:** Local Docker/Supabase verification is now complete. Read [the verification report](local-storage-verification-2026-11-04.md) for the latest results, fixes, runtime state, and remaining limits. The sections below preserve the original restart handoff and its historical pending-work list.

The user asked to implement the storage and migrations plan while a teammate handles Google OAuth. Work is saved in this repository as **uncommitted changes**, including new untracked source files. No commit, push, hosted migration, deployment, hosted secret change, or live Gemini request was made during this implementation session.

The user reports installing WSL and Docker and needs to restart Windows. Their installation and the local Supabase stack have **not yet been verified**. Files saved on disk survive a normal restart; terminal processes, browser automation state, and environment variables may not.

Repository: `C:\Users\mzhen\Desktop\School\IS492\IS-492-Project`.

Resume instruction for the next session:

> Read Checkpoint 3/docs/storage-handoff-2026-11-04.md. Continue the storage implementation from the saved working tree. Address the documented correctness fixes, finish documentation, then verify the actual local Supabase stack now that WSL and Docker are installed. Preserve existing changes. Do not push migrations or deploy to the hosted project. Do not commit or push without a new request.

## What is implemented and saved

### Database

Four additive migrations follow the existing two task-foundation migrations:

- [Storage schema](../app/supabase/migrations/20261104060000_storage_schema.sql): preferences, source metadata, normalized extractions, separate evidence, suggestions, waiting-for items, follow-ups, task provenance, calendar-operation records, private jobs/attempts/budgets, and deletion suppressions.
- [Storage transactions](../app/supabase/migrations/20261104060100_storage_transactions.sql): backend-only claim/finish/fail RPCs, leases, cache identity, atomic persistence, per-user budgets, and shared provider limits.
- [Review and lifecycle](../app/supabase/migrations/20261104060200_storage_review_lifecycle.sql): authenticated review RPCs, original proposals separate from accepted edits, approval, completion/undo, deletion, pause/resume, proposed updates, separately approved calendar records, and cleanup.
- [Activity](../app/supabase/migrations/20261104060300_storage_activity.sql): owner-only activity and budget reporting.

Browser reads use owner-scoped RLS; controlled RPCs handle mutations. Browser roles cannot access private job or credential data. Legacy tasks remain supported. Full email bodies and raw model responses are not persisted. Date-only and conditional deadlines remain structured rather than receiving invented timestamps.

Trial defaults: 20 requests and 200,000 reserved/reported tokens per user per day, three requests per model per minute, three job attempts, and 90-second leases. Retention defaults include 30-day evidence/digest/unapproved suggestions/waiting items and 14-day attempt diagnostics. These are controlled fictional-fixture defaults, not finalized production policies or real-email consent.

Source and extraction suppressions prevent deleted work from being recreated. Minimal source IDs and suppressions currently remain until account deletion. Confirm that retention policy before real-email launch. Cleanup currently coordinates all users through preference locks; batch this before public-scale use.

### Extraction integration

- [Storage coordinator](../app/supabase/functions/_shared/storage.mjs) prepares and hashes canonical input, claims budget before inference, skips inference on cache hits, and reports `saved: true` only after successful transactional persistence.
- [Fixture handler](../app/supabase/functions/_shared/fixture-handler.mjs) passes verified identity and maps safe storage errors.
- [analysis_email](../app/supabase/functions/analysis_email/index.ts) integrates the existing canonical Gemini validator with persistence. It still accepts **only fictional E01–E20 case IDs**, not arbitrary messages or Gmail access.
- [Cleanup function](../app/supabase/functions/storage_cleanup/index.ts) is disabled by default and requires its own scheduler secret when enabled.
- [Optional cleanup schedule installer](../app/supabase/operations/install_cleanup_schedule.sql) is saved but was not executed. It requires separately configured Vault secrets and scheduling extensions; it is not an automatic scan dispatcher.

Backend service credentials stay server-side. The browser receives only a public key. Do not print existing environment files or copy keys into this document.

### React storage interface

- [Storage dashboard](../app/web/src/StorageDashboard.tsx), [adapter](../app/web/src/storageAdapter.ts), and [styles](../app/web/src/storage.css) provide an opt-in `/storage` route.
- [Entry point](../app/web/src/main.tsx) preserves the existing prototype and lazy-loads the storage interface when enabled.
- Supports local email/password sign-in, fictional case processing, suggestions and evidence, edits/approval/dismissal, task completion/undo/deletion, waiting-for resolution, confirmed reminder dates, activity, and processing pause/resume.
- [Public configuration template](../app/web/.env.example) starts disabled. Its ignore exception was added so the template can be committed later; real environment files remain ignored.
- The interface caps list reads at 200 and explains this. Reminders are stored dashboard values; no message is sent. Calendar execution is not implemented.
- The exported Supabase client can be reused when the teammate integrates OAuth. Their OAuth code is not in this checkout; coordinate the session/client contract before changing their implementation.

## Validation evidence and limits

Immediately before this handoff, `npm.cmd test` from the app directory passed: **75 tests, zero failures, zero skipped**. Tests are in [storage database tests](../tests/storage-database.test.mjs), [coordinator tests](../tests/storage.test.mjs), and the existing pipeline/endpoint suites.

Storage database tests run real PostgreSQL SQL semantics through PGlite, with simulated Auth schema/roles. They cover migration upgrade, RLS/grants, cross-user ownership, atomic rollback, idempotency, leases, budgets, shared provider limits, review, cleanup, source/account deletion, and a handler-to-SQL path with mocked Auth/inference. They do **not** verify actual Supabase Auth, PostgREST, Docker, or Edge Runtime behavior.

Frontend TypeScript and production build, plus Deno checks for both functions, passed earlier in the session. Recheck them after remaining fixes. The actual Supabase pgTAP tests were updated but have not run against Docker.

Browser testing reached the sign-in interface but could not complete the mocked sign-in flow: automation stalled and the mock recorded no requests. A multiple-GoTrue-client warning appeared during a diagnostic dynamic import; its cause is unconfirmed. **Browser sign-in and real persistent end-to-end behavior are unverified.** The temporary Vite server was stopped and the browser was returned to about:blank.

## Immediate remaining fixes

These were identified during review and have NOT been changed yet. Address them before declaring this ready:

1. In `private.storage_action`, reject NULL/negative revisions for suggestion/task/waiting/followup/calendar mutations. Comparisons such as `revision <> p_revision` currently allow NULL to evade the stale-revision check because SQL NULL is unknown. Processing/source operations have different inputs; keep their behavior intact. Add regression coverage.
2. In `private.storage_finish`, change the lease comparison from `job.lease_token <> p_lease` to `job.lease_token IS DISTINCT FROM p_lease` so a NULL supplied lease cannot bypass fencing. Add regression coverage.
3. Make the dashboard sign-in handler clear busy state in `finally` and handle unexpected SDK/network exceptions safely. Review sign-out error handling too.
4. Refresh the [Supabase README](../app/supabase/README.md): it still describes the earlier non-persistent scaffold, `saved: false`, and the old test count. Its local CLI examples are useful, but its implementation-status statements are stale.
5. Finish a storage setup/contract guide covering schema/RPCs, limits, retention, legacy-task behavior, and the boundaries listed below.

Previously fixed errors: SQL alias ambiguity, account-deletion foreign-key ordering (cyclic task/suggestion references are now deferred), a PL/pgSQL provider-window variable reference, and TypeScript nullable-client closure checks. Those fixes are saved and the current 75-test suite passes. `rg` is not installed in this shell; use PowerShell searches as needed.

## After restarting Windows

1. Launch Docker Desktop, finish any WSL setup prompts, and wait for the Linux-container engine to become ready.
2. Open PowerShell in the repository. Verify installations and inspect saved changes:

   ```powershell
   wsl --status
   wsl --list --verbose
   docker version
   docker info
   git status --short --branch
   ```

   If Docker reports that the daemon is unavailable, finish Docker Desktop/WSL startup first. Do not reset or delete Docker data as a routine troubleshooting step.

3. Address the correctness fixes above, then run from `Checkpoint 3/app`:

   ```powershell
   npm.cmd ci
   npm.cmd test
   npm.cmd run supabase:prepare
   npx.cmd supabase --agent no start
   npx.cmd supabase --agent no migration up
   npx.cmd supabase --agent no test db
   ```

   The installed CLI is v3; confirm help if flags differ. These are **local** commands. Do not use remote push/deploy options. Never reset a database just to apply pending migrations; reset erases data. Docker may need to download runtime images.

4. Recheck Edge types after staging:

   ```powershell
   npx.cmd --yes --package deno deno check supabase/functions/analysis_email/index.ts supabase/functions/storage_cleanup/index.ts
   ```

5. Use local Studio to create a confirmed fictional test user. CLI management login is separate from the application's Auth session.
6. Privately prepare the function environment from [its template](../app/supabase/functions/.env.example). Enable fixture extraction only when ready for billable Gemini requests; keep cleanup disabled unless explicitly testing it. Use exact allowed frontend origins. The local trial override selects the previously evaluated Gemini 3.6 Flash candidate; the canonical model default is unchanged.
7. Serve the fixture function locally:

   ```powershell
   npx.cmd supabase --agent no functions serve analysis_email --env-file supabase/functions/.env
   ```

8. In another terminal, from `Checkpoint 3/app/web`, install the pinned frontend dependencies and verify:

   ```powershell
   corepack pnpm install --frozen-lockfile
   corepack pnpm exec tsc --noEmit
   corepack pnpm build
   ```

9. Copy the public browser template to a local environment file. Set `VITE_STORAGE_ENABLED=true`, the **local** Supabase URL, and its public publishable/anon key. Never use a service-role, secret, or Gemini key in the browser. Start `corepack pnpm dev` and open the displayed origin at `/storage`.
10. Test sign-in, process one permitted fictional fixture, confirm persistence, repeat it to verify a cache hit with no extra inference, approve/edit it, reload, complete/undo, and sign out/in. Test a second user for isolation. Verify missing/invalid sessions fail before inference. Exercise pause, deletion, stale revisions, and expired evidence. Record actual results, failures, and model charges separately from offline tests.
11. Run `git diff --check`, inspect tracked/untracked files for accidental secrets or generated output, and update documentation with the actual local integration evidence. Leave changes uncommitted unless the user asks to commit/push.

## Work outside this saved storage slice

- Gmail OAuth, protected refresh-token storage, scopes, reconnect/disconnect, and real permitted email retrieval are the teammate integration boundary.
- Real inbox allowlists/exclusions must filter metadata before bodies/context and require explicit user configuration. The fixture-trial preferences are not that consent flow.
- No automatic scan/retry dispatcher, incremental Gmail cursor, or deployed scheduled scans yet. Durable jobs support bounded controlled retries.
- The backend can store a proposed task update, but automatic semantic matching of a later email to an accepted task is not implemented.
- Calendar preview/approval storage exists; real Calendar writes, duplicate-safe execution, reconciliation/undo, and ICS export remain.
- Full live extraction evaluation and the known E12 optional-invitation issue remain separate work. Offline test success does not establish general model accuracy.
- Hosted migration-history/schema reconciliation, configuration, deployment, and a fresh team setup rehearsal remain. Do not apply the local baseline blindly to the hosted project.

## Saved file inventory

Modified existing files: app package manifest/lock; Supabase config, function environment template, fixture handler, extraction entry point, and pgTAP task-access test; frontend package manifest/lock, entry point, and ignore rules.

New files: four storage migrations; shared storage coordinator; cleanup function; optional cleanup schedule installer; three frontend storage files and public environment template; two storage test files; this handoff.

Generated extraction staging and dependency directories are reproducible ignored output. No secret values are included here. All source changes are on disk; a Git commit has not been created.
