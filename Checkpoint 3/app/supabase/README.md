# Local Supabase storage

This implements local fixture extraction, persistent suggestions, and user review. It does not change the linked hosted project, replace its deployed Groq function, or configure hosted secrets. Do not run a remote push/deploy as part of the commands below. See [the storage contract](STORAGE.md) for the schema, limits, and integration boundaries.

## What is implemented

- A baseline migration recreates the inspected task table for a fresh local database. `CREATE TABLE IF NOT EXISTS` preserves any existing table and rows; it is not a substitute for reconciling hosted migration history/schema drift.
- Owner-scoped RLS permits browser reads; authenticated review RPCs control edits, approval, completion, undo, and deletion. Direct browser writes are denied. Anonymous users get no task access. Unnecessary privileges, including TRUNCATE, are removed.
- Ownership, source-email associations, model proposals, confidence, IDs, and timestamps cannot be overwritten by a browser client. Backend service access remains privileged and must stay server-side.
- A local `analysis_email` replacement requires a bearer session verified through Supabase Auth. Platform JWT verification is also enabled. A publishable key by itself is insufficient.
- The endpoint accepts **only** `{"caseId":"E01"}` through `E20`. It rejects arbitrary email, identity, rules, model settings, and context supplied by callers. It uses bundled fictional CP2 input and the verified user's email as the inbox owner; it does not read Gmail.
- The canonical Gemini pipeline performs filtering and strict schema/evidence/ownership validation. Successful transactional persistence returns `saved: true` and a receipt. Duplicate requests reuse saved output without inference.
- Inference is disabled by default. No real keys were copied or printed. Error responses are fixed codes, with no raw provider logging.

Persistent budgets, shared rate limits, leases, normalized storage, review transactions, cleanup, and an opt-in React sign-in/review route are implemented. Gmail preferences/OAuth/retrieval, automatic scan dispatch, semantic task-update matching, and real Calendar execution remain. Keep the fixture endpoint disabled outside controlled local testing. The known E12 optional-invitation error is not fixed here.

## Prerequisites

- Node.js 22+ and the project-local Supabase CLI (`npm.cmd install` from the app directory).
- Docker Desktop installed, configured for Linux containers, and running for the local database/Edge runtime.
- Optional Deno runner for type-checking without Docker.

Run the following from `Checkpoint 3/app` in PowerShell. Local stack commands target local services by default. Do not add `--remote`.

```powershell
# Offline tests: no secrets loaded, network calls, or model charges.
npm.cmd test

# Stage canonical pipeline sources and fictional fixtures for Edge bundling.
# Rerun after changing prompts, settings, schema, fixtures, or pipeline code.
npm.cmd run supabase:prepare

# Requires Docker. Applies migrations when initializing a fresh local database.
npx.cmd supabase --agent no start

# On an existing local database, apply only pending migrations (CLI v3).
npx.cmd supabase --agent no migration up
```

The installed CLI v3 lists `migration up` and targets the local database by default. Never reset a non-disposable database just to apply these files. A reset erases local application data; no reset is needed for a fresh stack.

Run the rolled-back database isolation tests once the local stack is available:

```powershell
npx.cmd supabase --agent no test db

# Real local Auth, PostgREST, and Edge gate trial; temporary users removed.
# Expects fixture inference disabled. No model calls.
npm.cmd run test:local
```

These pgTAP tests check actual role privileges, anonymous denial, two-user read/write isolation, ownership protection, protected model fields, approval, update timestamps, and deletion. They create fictional users/tasks inside a transaction and roll back afterward. Do not run them against production.

## Enable the local fixture endpoint

1. Copy [functions/.env.example](functions/.env.example) to `functions/.env`.
2. Fill `GEMINI_API_KEY` privately. The pipeline CLI's app-level environment file is not automatically loaded by Edge Functions; configure the function environment separately.
3. Set `ENABLE_FIXTURE_EXTRACTION=true` only when ready for billable requests.
4. The example explicitly selects `gemini-3.6-flash`, the previously evaluated candidate. This is a local override; the canonical default is unchanged.
5. Set `APP_ORIGINS` to exact frontend origins if testing through a browser. The defaults assume Vite port 5173; change them if needed. CORS is not authentication. Authenticated CLI requests without Origin are allowed.
6. Serve locally:

```powershell
npm.cmd run supabase:prepare
npx.cmd supabase --agent no functions serve analysis_email --env-file supabase/functions/.env
```

Use the local Studio URL shown by `supabase start` to create a confirmed fictional test user. CLI management login is different from an application user's session. Do not use a production user's password/token for this local trial.

In a second PowerShell terminal, obtain a local session and call E01. These assignments keep passwords and access tokens out of printed output and command history; do not print the credential/session variables or enable HTTP debug logging.

```powershell
$localPublicKey = Read-Host 'Local Supabase publishable or anon key'
$localTestCredentials = Get-Credential -Message 'Local fictional test user'
$localSession = Invoke-RestMethod -Method Post `
  -Uri 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' `
  -Headers @{ apikey = $localPublicKey } -ContentType 'application/json' `
  -Body (@{
    email = $localTestCredentials.UserName
    password = $localTestCredentials.GetNetworkCredential().Password
  } | ConvertTo-Json)

# One Gemini request; consumes quota/money. Prints fictional extraction only.
Invoke-RestMethod -Method Post `
  -Uri 'http://127.0.0.1:54321/functions/v1/analysis_email' `
  -Headers @{
    apikey = $localPublicKey
    Authorization = "Bearer $($localSession.access_token)"
  } -ContentType 'application/json' -Body '{"caseId":"E01"}'

Remove-Variable localSession,localTestCredentials
```

Verify missing/invalid bearer tokens are rejected before inference. Repeating an identical successful request should reuse the persisted extraction without another model call. Changed effective inputs/settings have a different cache identity. Deleted sources are suppressed.

## React review interface

From `web`, run `corepack pnpm install --frozen-lockfile`. Copy [the public environment template](../web/.env.example) to a local environment file, enable `VITE_STORAGE_ENABLED`, and fill the local Supabase URL and public key. Never place server credentials in browser configuration. Run `corepack pnpm dev` and open `/storage` on the displayed origin. Sign in with a confirmed local test account. The original prototype remains available at `/`.

## Packaging and validation

The staging script copies the canonical core, adapter, schema, prompt, settings, and fictional fixtures into the ignored `_shared/extraction` directory. The answer key is never packaged. No environment files are read by staging. Generated files are reproducible and should not be edited or committed. This avoids separate hosted/local prompt implementations.

```powershell
npm.cmd run supabase:prepare
npx.cmd --yes --package deno deno check supabase/functions/analysis_email/index.ts
```

The first Deno command may download its runner. Node tests exercise the handler and Auth verifier with injected HTTP/model responses, including a strict-validator integration. They do not establish actual local/hosted Auth, database policy behavior, Gemini availability, or model accuracy.

## Verification status

Updated November 4, 2026. All 75 offline tests pass, including PostgreSQL semantics through PGlite with simulated Auth roles. Frontend TypeScript/build pass. Actual Docker integration results are recorded in [the local verification report](../../docs/local-storage-verification-2026-11-04.md). PGlite and mocked tests alone do not establish Supabase Auth/PostgREST/Edge behavior or live model accuracy. No hosted migration or deployment was performed.

Before hosted deployment, reconcile existing migrations, review permissions, implement the real request/preferences boundary, validate deployment configuration and user isolation, and separately authorize the rollout. The new request contract differs from the currently deployed Groq endpoint.
