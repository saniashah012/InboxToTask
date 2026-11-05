# Local storage verification — November 4, 2026

Local verification completed. No hosted changes, deployment, commit, push, or live model request was performed in this resumed session.

- WSL is installed with default version 2. Before Docker Desktop startup, WSL reported no distributions.
- Docker Desktop was launched; the Linux engine became available (29.9.2).
- Local Supabase started successfully. All seven migrations are applied; no reset was used.
- Fixed NULL lease fencing and NULL/negative review revision rejection; regression assertions pass.
- Fixed sign-in/sign-out exception handling and loading-state cleanup.
- All 75 offline tests pass. Frontend TypeScript and production build pass. Deno checks pass for both Edge Functions.
- All 28 pgTAP checks pass against the Docker PostgreSQL database.
- Seven real local API integration groups pass: Auth sign-in/verification for two users; Edge anonymous rejection and disabled-inference gate; browser denial of privileged RPCs; persistence/cache and NULL lease rejection; JWT/RLS isolation and stale revision rejection; approval/reload/date-only/completion/undo; pause/resume/activity/deletion suppression.
- Browser check passes for actual sign-in, loading a synthetic suggestion with evidence, approval, persistence across a full page reload, completion, and undo. The session also survived the page reload.
- Browser sign-out returned the UI to sign-in. Its global logout request was reported aborted by browser diagnostics, so server-side global session revocation is not established by this check. The temporary account was deleted afterward.
- All temporary users and their cascaded storage records were removed. No real inbox was accessed. API fixtures and the browser suggestion used synthetic output, not live inference.

## Integration defect found and fixed

Explicit application stale-state exceptions used SQLSTATE `40001`, which denotes a serialization failure. PostgREST 14 retried these requests until the HTTP client timed out. This did not appear in PGlite or pgTAP because they do not traverse the HTTP retry layer. Local API testing reproduced the problem twice; replacing application conflicts with `PT409` made them return immediately as HTTP 409.

The original uncommitted storage migrations, backend transport, frontend error handling, and regression assertions now use `PT409`. An additional [upgrade migration](../app/supabase/migrations/20261104060400_storage_conflict_responses.sql) updates already-created functions without erasing local data. [Supabase documents the retry behavior](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions).

## Repeat the checks

From `Checkpoint 3/app`, with Docker Desktop and this local stack running:

```powershell
npm.cmd test
npx.cmd supabase --agent no test db
npm.cmd run test:local
```

[The local API test](../tests/storage-local.mjs) obtains this project's local CLI status in memory, refuses non-local URLs, creates temporary fictional users, and removes them in `finally`. It never prints keys/passwords or calls a model. Its Edge gate checks expect fixture inference to remain disabled. The service RPC persistence portion uses explicitly synthetic output; this validates storage, not extraction accuracy.

## Remaining limits and current runtime

- Docker Desktop and the local Supabase stack are left running. Studio: `http://127.0.0.1:54323`; API: `http://127.0.0.1:54321`. The temporary frontend dev server was stopped. Its public configuration was supplied only through that process's environment; no browser credential file was saved.
- The CLI reports local services bind to `0.0.0.0`; local stack defaults are development settings, not a hosted deployment configuration.
- Fixture inference remains disabled. A real Gemini-to-Edge-to-database-to-UI trial is still pending; no model charges were incurred here.
- Gmail OAuth/retrieval, scheduled scans, task-update matching, Calendar execution, production retention decisions, and hosted rollout remain outside this verification. See [the storage contract](../app/supabase/STORAGE.md).
- Changes remain saved locally and uncommitted. Read the current Git status before continuing.

The earlier [handoff](storage-handoff-2026-11-04.md) describes the saved implementation and boundaries. Its pending-fix list is historical; consult this report for resumed progress.
