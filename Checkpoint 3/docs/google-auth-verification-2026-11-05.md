# Google Auth implementation verification — November 5, 2026

Implemented locally: Google app sign-in wiring, a backend Google connection,
encrypted private credentials, single-use state/PKCE, refresh leases, safe status,
and disconnect/revocation. See [setup and integration contract](../app/supabase/GOOGLE_AUTH.md).
Google/provider configuration and live OAuth verification remain. No hosted
schema, secrets, Auth settings, functions, or frontend deployment were changed.

## Hosted read-only inspection

- Inspected linked project `IS492_c3` migration history, public/private schema,
  and deployed function list. Read migration SQL from the migration history table.
- Confirmed recorded baseline `20261104050000` matches the local task foundation.
- Recovered hosted `20261104100000_user_onboarding_preferences` SQL locally.
  Removed a PowerShell-added UTF-8 BOM after PGlite caught it; SQL is unchanged.
- Hosted `tasks`, `task_suggestions`, and onboarding records are separate from
  normalized local storage. Existing hosted `analysis_email` is version 6.
- Replayed the inspected hosted public schema into disposable PGlite, inserted
  fictional legacy task/suggestion/onboarding rows, and applied all seven pending
  migrations. All applied successfully, the three fictional rows remained, direct
  browser task inserts were denied, and credential reads were denied. This is a
  schema/SQL rehearsal using simulated Auth roles, not hosted HTTP/runtime evidence
  or a copy of real user data.

## Checks passed

| Check | Result and actual coverage |
| --- | --- |
| `npm.cmd test` | 99 tests pass. Existing extraction/storage semantics plus real AES-GCM, simulated provider exchange/refresh/revocation, HTTP contracts, PostgreSQL grants/state/lease/lifecycle semantics. |
| Frontend TypeScript and build | `corepack pnpm exec tsc --noEmit` and `corepack pnpm build` pass. |
| Edge types | Deno checks pass for both new function entrypoints. Fixed the initial empty-array type inference issue. |
| Real local migrations | Applied recovered onboarding and Google connection migrations without a database reset. |
| Real local pgTAP | 40 checks pass across existing task tests and new Google grants/status tests. |
| Real local Auth/PostgREST/Edge | Four Google integration groups pass: anonymous/browser privilege denial; owner-safe status and two-user isolation; single-use state, refresh locking and disconnect/NULL-generation fencing; disabled Google function gates. Temporary fictional users removed. |
| Browser | Actual local password sign-in, Google controls/status, safe disabled-backend error, session reload, UI sign-out, and simulated denied sign-in callback verified. Callback returns fixed error text and cleans query parameters. |
| Whitespace/links | `git diff --check` and relative links in the new setup/verification documents checked. |

The first real local Edge gate trial returned 404 because the existing runtime had
not loaded new function routes. Serving all functions with an explicit disabled
environment resolved it; the full four-group local Google trial then passed.

Browser sign-out returned to the sign-in UI, but diagnostics reported the global
logout request aborted. This does not establish server-side global session
revocation. The browser test account was subsequently deleted through local Auth.

## Boundaries and remaining checks

- Zero real Google authorization exchanges, Gmail retrievals, model requests, or
  Calendar writes were performed. Provider tests use injected fictional responses.
- Google sign-in provider and backend connection remain disabled by default.
  Configure Cloud clients, callbacks, test users, Auth settings, and private secrets
  using the setup guide, then perform its live checklist.
- Gmail tokens are stored only by the backend connection flow; the Google sign-in
  path requests basic identity scopes and establishes the shared Supabase session.
- Explicit scanning consent, production filter/settings enforcement, real retrieval,
  scheduling, and Calendar integration remain separate implementation phases.
- Hosted app compatibility includes coordinating the changed task-write contract
  and existing `analysis_email` consumers. No hosted rollout was attempted.
- Source changes remain uncommitted. The pre-existing frontend handoff file was
  preserved without edits.
- Temporary frontend and function-serve processes were stopped after verification;
  the pre-existing local database stack was not reset or stopped. Do not assume a
  frontend/function server is running when resuming.
