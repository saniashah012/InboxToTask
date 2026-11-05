# Supabase backend guidance

Read [setup](README.md) for local commands and [the storage contract](STORAGE.md) for tables, RPCs, limits, and retention. Treat dated reports as evidence rather than proof that a stack is currently running.

## Entry points

- [Migrations](migrations/) define tables, grants, RLS, review transactions, and lifecycle behavior. Use a new ordered migration for changes to an already-shared/applied schema; preserve existing rows and migration history.
- [analysis_email](functions/analysis_email/index.ts) verifies Auth and connects the canonical extraction pipeline to [the storage coordinator](functions/_shared/storage.mjs). [The fixture handler](functions/_shared/fixture-handler.mjs) accepts only case IDs, not caller-selected identity, email bodies, prompts, or model settings.
- [storage_cleanup](functions/storage_cleanup/index.ts) is disabled by default and uses its own scheduler credential. [The optional schedule installer](operations/install_cleanup_schedule.sql) is a separate deployment operation, not an automatically installed migration or scan scheduler.
- [Config](config.toml) is local runtime configuration. A linked hosted project does not make hosted schema/function changes part of a local task.

## Local verification

Run from the parent `Checkpoint 3/app` directory. Docker Desktop's Linux engine must be ready for the actual stack; `docker version` needs a working Server section. Sandbox access failures are different from an unavailable daemon.

```powershell
npm.cmd run supabase:prepare
npx.cmd supabase --agent no start
npx.cmd supabase --agent no migration up
npx.cmd supabase --agent no test db
npm.cmd run test:local
npx.cmd --yes --package deno deno check supabase/functions/analysis_email/index.ts supabase/functions/storage_cleanup/index.ts
```

Do not reset a database merely to apply pending migrations; reset deletes local data. Avoid printing CLI status credentials; capture required values in memory and print only safe status information.

`npm.cmd test` uses PGlite for PostgreSQL semantics with simulated Auth roles. pgTAP tests the real local database. `test:local` tests actual Auth/PostgREST/Edge gates with temporary users, expects inference disabled, and makes no model calls. None proves hosted behavior or Gemini accuracy. Live inference is a separate quota-consuming check; never enable it just to run offline tests.

## Security and transaction invariants

- Verify bearer sessions and derive ownership server-side. Keep privileged keys and Google credentials out of browser-accessible tables/responses. Public wrappers, private functions, table/column grants, and RLS all contribute to access control; test as two users and anonymous.
- Use fixed search paths and explicit grants for privileged functions. Browser reads use owner RLS; mutations use controlled RPCs. Preserve composite ownership foreign keys and account-deletion behavior.
- Validate model output in the canonical pipeline before the service-only persistence RPC. Keep budgets/leases before inference, normalized atomic writes, and original proposals separate from accepted edits.
- Require nonnegative review revisions and compare nullable lease inputs with `IS DISTINCT FROM`. Use `PT409` for application stale-state conflicts. Do not use SQLSTATE `40001` for these: PostgREST 14 retries serialization failures and can hang the request. Cover conflict behavior through HTTP as well as SQL tests.
- Keep the preference/job/child-record lock order consistent across claims, finishes, review, deletion, and cleanup. Preserve generation fencing so stale jobs cannot commit after pause or deletion.
- Never log payloads, tokens, raw model output, or provider error prose. Return fixed errors. Full bodies stay transient; evidence expires independently of accepted tasks. Changes to retention or source-level suppression require reviewing the documented privacy/product behavior.
- Cleanup scheduling, Gmail scans, OAuth tokens, and Calendar execution are separate integration boundaries. Do not describe stored calendar approvals as completed external writes.
