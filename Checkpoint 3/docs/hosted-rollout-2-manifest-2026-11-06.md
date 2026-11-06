# Hosted rollout 2 manifest and result

**Status: applied to hosted on 2026-11-06 at 03:50 UTC, after the user's approval.** It ran once, in one
transaction, after a passing preflight. Evidence below is dated November 6, 2026 (UTC), and is not a
statement of current hosted state. No function was deployed, and no secret or flag was changed.

## Result

Versions applied: `20261106010000`, `20261106030000`, `20261106040000`. The ledger now has 20 versions.
Checked afterward with read-only queries and anonymous REST requests:

- All three stored sources match the fingerprints below, and no Calendar version is in the ledger.
- All three functions are owned by `postgres`, are security definer, and have a fixed `search_path` setting. The `gmail_change_no_repeat` trigger exists, and all public tables have RLS.
- The privilege list went from 130 to 133 lines: one new grant for each function, and none removed. Anonymous calls to all three returned 401 with `42501`.
- Preferences 3 (none changed since the backup), tasks 0, `gmail_task_changes` 0, Auth users 5.
- Only `analysis_email` v6 is deployed. `ENABLE_GMAIL_SCAN`, `ENABLE_GMAIL_RETRIEVAL`, `ENABLE_GOOGLE_CONNECTION` and `ENABLE_CALENDAR_EVENTS` are not set.

**Not verified:** signed-in calls to these three functions, because there is no Gmail data on hosted. Sania's signed-in settings checks ran on a preview of `ffa915a` and are [recorded separately](hosted-backup-verification-2026-11-06.md#signed-in-checks-reported-by-sania). The two defects below remain open.

The sections below are the manifest as approved.

Target: `IS492_c3` / `ltxhxqxpatemgkhjzmaq`. The first rollout is recorded in
[hosted backup verification](hosted-backup-verification-2026-11-06.md).

## Exact scope

Pinned commit: `ffa915a1679e82002fb2d62ddfe3166011eba1aa`. Later commits have not changed these files.

| Order | Migration | SHA-256 | Purpose |
| --- | --- | --- | --- |
| 1 | `20261106010000_gmail_manual_resolution.sql` | `c5ebe27e9dabb538552e40afb1e70fe3f25c6d99e86eb29c6de0400d1d8c03b3` | `gmail_change_resolve` and a trigger that stops re-extraction repeating a decided update. The workspace calls this function. |
| 2 | `20261106030000_gmail_task_source_links.sql` | `de016b0f463a7190422a2ccb2d55284d07f3500139f8cb140d1f78aca4ff85e4` | `gmail_task_source_links` for the naive open-in-Gmail links. The workspace calls this function. |
| 3 | `20261106040000_gmail_token_recheck.sql` | `4cd4260ea26cacdec814367bd489a97e2e8e8422668cc1fc73a991a9a4c0f43f` | Service-only `gmail_token_recheck`, called by `gmail_scan`, which is not deployed on hosted. |

Batch SHA-256: `e97d316f018c59dad78a2ce091afd69d5f4fc2df43b4f1efb46ad9c9cee25890`. The batch is a
temporary file built from the pinned commit with `git show`. It wraps the three files in one
transaction and writes their ledger entries in that transaction.

**Not included:** Calendar (moved to CP4 by user decision, and renumbered `20261106050000` on the local-only `mzheng/calendar-rebase`), any function
deployment, secret or flag change, schedule, PR merge, or Google configuration. Scanning stays off.

## Apply-time effects

These migrations add functions and one trigger. They change no existing rows. On hosted,
`gmail_task_changes` has 0 rows, tasks 0, sources 0, scan settings 0, and preferences 3 (untouched).
After this rollout, the ledger should have 20 versions and the latest should be `20261106040000`.

## Batch safeguards

The batch aborts and rolls back unless all of these hold:

- The role is `postgres`.
- The ledger is exactly the current 17 versions, so a Calendar entry or other drift stops it.
- The three functions do not already exist, and `tasks` is still empty.
- Before commit: 20 ledger versions, all three function signatures, no `anon` execute on the two browser functions, and no `authenticated` execute on `gmail_token_recheck`.

Lock and statement timeouts and a transaction advisory lock also apply. Do not use `db push` or `migration repair`. On an ambiguous outcome, inspect read-only and never replay blindly.

## Evidence so far

| Gate | Result |
| --- | --- |
| Offline rehearsal (in-memory PGlite, not hosted) | Commit path reaches 20 versions with the preference row intact; replay is blocked; a forced failure rolls back to 17; an unexpected ledger entry is blocked |
| Independent code review | Read-only subagent review of the pinned SQL: safe to apply, with the two defects below. Not run on hosted |
| Backup | Taken 2026-11-06 03:41:29 UTC, held privately outside Git, 6 files with hashes in its private `SHA256SUMS` |
| Restore | Disposable, networkless Postgres 17.11 container. Only errors: 9 empty Storage tables, as assessed in the first rollout record |
| Restore comparison | Same as hosted: ledger 17, preferences 3, Auth users 5, 14 public and 11 private tables, 22 policies, 14 RLS tables, function source digest, table and function privilege digests (130 of 130 lines) |
| Hosted preflight, before the manifest was written | 17 versions, none of the three functions, no Calendar table, no preference or Auth user changed since the backup, flags unset, only `analysis_email` deployed |

## Recovery hazard: restores can silently over-grant

**A plain restore of this backup is not privilege-accurate.** The first restore attempts had all data
and matching counts but 145 extra grants, including anonymous write access to `gmail_task_changes` and
anonymous execute on service-only functions. Restoring as `postgres` did not help. The evidence fits
this cause: the dump revokes from `PUBLIC` only, so recreated objects keep Supabase's default grants to
`anon`, `authenticated` and `service_role`.

Clearing those defaults before loading `schema.sql`, as `postgres`, gave an exact match:

```sql
alter default privileges for role postgres in schema public revoke all on tables from anon,authenticated,service_role;
alter default privileges for role postgres in schema public revoke all on functions from anon,authenticated,service_role;
alter default privileges for role postgres in schema public revoke all on sequences from anon,authenticated,service_role;
```

The dump's own `ALTER DEFAULT PRIVILEGES` statements then restore the defaults. After any real restore,
compare privileges against this record before allowing traffic. This was tested in a container, not on a
Supabase project. The first rollout's backup was only compared by counts and carries the same hazard.

## Open defects, not blocking this rollout

Both reproduced offline with fictional rows. Neither can trigger on hosted today: there is no Gmail data and scanning is off.

1. **Deleting an earlier email leaves its quote visible.** If source B's evidence quotes earlier message A and A is deleted, `storage_evidence` keeps the quote. It stays readable to the same user, and `gmail_task_source_links` then attributes it to B. The stored quote predates this rollout; the misattribution comes with it. Fix in a new migration, and before enabling hosted scanning, because source deletion promises to remove extracted content.
2. **`valid_task_fields` accepts `boundary: null`.** `null not in (...)` does not fail the check. This predates this rollout. The shipped form cannot send null, but `gmail_change_resolve` takes browser fields, so a crafted same-user request could store it. Fix with `is null or ... not in`.

## After applying

Verify read-only: ledger and stored-source hashes, function signatures and privileges, anonymous denial, unchanged counts, flags and deployed functions. Report the exact versions to Sania.

Merging PR 22 should wait until this rollout is applied, which it now is.
