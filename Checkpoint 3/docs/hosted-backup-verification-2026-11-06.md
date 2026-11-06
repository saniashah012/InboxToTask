# Hosted backup verification and restore-error assessment

## Rollout result

**The 15-migration batch pinned to `4bb256b` was applied to `IS492_c3` at 2026-11-06 03:26 UTC,**
after the user's approval, in one transaction with its ledger entries, running as `postgres`.
No function was deployed, no secret or flag was changed, and no schedule was installed.

Versions applied: `20261104050100`, `20261104060000`, `20261104060100`, `20261104060200`,
`20261104060300`, `20261104060400`, `20261105060000`, `20261105070000`, `20261105160000`,
`20261105200000`, `20261105210000`, `20261105212000`, `20261105220000`, `20261105223000`,
`20261106000000`. With the two earlier versions, the ledger has 17 entries.

Checked afterward with read-only queries and anonymous REST requests:

- All 15 stored sources match the plan's SHA-256 fingerprints.
- All 14 public tables have RLS, and all public and private tables are owned by `postgres`.
- `scan_settings_save` has eight arguments, and the 9 key RPCs checked exist. `gmail_change_resolve`, `gmail_task_source_links`, `gmail_token_recheck` and `calendar_event_service` do not.
- `authenticated` can read `tasks` but has no table or column write access. It cannot call the two service-only RPCs checked.
- Anonymous requests to 3 RPCs and 3 tables, and an anonymous task insert, all returned 401 with `42501`. The settings and scan-status RPCs no longer return `PGRST202`, so PostgREST sees them.
- Preferences 3 (none changed since the backup), tasks 0, legacy suggestions 0, Auth users 5.
- Only `analysis_email` v6 is deployed. `ENABLE_GMAIL_SCAN`, `ENABLE_GMAIL_RETRIEVAL` and `ENABLE_GOOGLE_CONNECTION` are not set.

**Not yet verified:** signed-in owner isolation, and settings save/reload through the real workspace. Both need the plan's dedicated test accounts and Vercel preview access. These checks also do not establish that the production sign-in flow now works.

Unchanged and worth reviewing separately: the legacy `task_suggestions` table is still selectable by `anon` at the grant level, as the plan required (RLS still applies), and `anon` holds execute on `rls_auto_enable`, which was present before this rollout.

Target: `IS492_c3` / `ltxhxqxpatemgkhjzmaq`. Snapshot start: 2026-11-06 02:48:10 UTC.
This records evidence for the backup gate in the 15-migration rollout plan. It is dated
evidence, not a statement of current hosted state, and no hosted write was made to produce it.
The backup files stay private and outside Git. They contain Auth users, identities, sessions
and refresh tokens, so they must not be committed or shared.

## Conclusion

**The nine restore errors do not reduce recovery coverage of any data that exists on hosted.**
Each one is a `COPY` into a Storage table that has zero rows in the backup and zero rows on
hosted. The errors occurred because the test image lacks those tables, and the dump does not
define them. The backup gate is met for the original batch, subject to the limits below.

## The nine errors

Each error had the form `relation "storage.<table>" does not exist`, while loading `data.sql`.

| Table | Rows in backup | Exact rows on hosted |
| --- | --- | --- |
| `storage.buckets` | 0 | 0 |
| `storage.objects` | 0 | 0 |
| `storage.s3_multipart_uploads` | 0 | 0 |
| `storage.s3_multipart_uploads_parts` | 0 | 0 |
| `storage.buckets_analytics` | 0 | 0 |
| `storage.buckets_vectors` | 0 | 0 |
| `storage.vector_indexes` | 0 | 0 |
| `storage.bucket_lifecycle_states` | 0 | 0 |
| `storage.lifecycle_abandoned_artifacts` | 0 | 0 |

Hosted also has no policies in the `storage` schema, and no migration in this repository
creates Storage objects. Its 11 triggers sit on `storage.buckets` and `storage.objects` and call
functions in the `storage` schema. By name and location they look platform-owned, which is an
inference rather than a Supabase confirmation. The tenth Storage table, `storage.migrations`,
is the platform's own version history (80 rows) and is not in the data dump. A real Supabase
project provides these tables itself.

## What was restored

Files, each with a successful exit and a recorded SHA-256 in the private `SHA256SUMS`: roles,
application schema, data, `auth` schema, and the `supabase_migrations` schema and data. All six
passed a later hash check.

The restore ran in a disposable `supabase/postgres:17.11.0.011` container with no network and no
published ports, matching hosted's Postgres 17.11. The container was stopped and removed afterward.
After the first attempt was invalidated by a timing error in the test, the rerun had no errors
other than the nine above.

| Check | Hosted | Restored |
| --- | --- | --- |
| `user_onboarding_preferences` rows | 3 | 3 |
| `tasks` rows | 0 | 0 |
| `task_suggestions` rows | 0 | 0 |
| `auth.users` rows | 5 | 5 |
| Migration ledger | `20261104050000`, `20261104100000` | Same two versions |
| Public policies | 11 | 11 |
| Public tables with RLS | 3 | 3 |
| Public triggers | 1 | 1 |
| `auth` tables | not compared | 27 |
| Preference rows linked to a restored Auth user | not compared | 3 of 3 |

## Not covered, and why that is acceptable here

| Item | Hosted state | Effect on recovery |
| --- | --- | --- |
| `vault.secrets` | 0 rows | Nothing to recover |
| `realtime.subscription`, `realtime.messages` | 0 rows each | Nothing to recover |
| `auth.schema_migrations` | 82 platform rows, not in the data dump | Platform-managed; a Supabase project supplies its own |
| `storage.migrations` | 80 platform rows, not in the data dump | Platform-managed; a Supabase project supplies its own |
| Edge Function code and secrets | Not database objects | Function source is in Git; secret values are not in this backup |
| Physical backups and point-in-time recovery | None listed; PITR disabled | This logical backup is the only verified restore point found |

## Limits of this verification

- The restore proved these files load and that the counts above match. It compared counts, not every row, and not each table grant. The dump does contain 11 `GRANT` statements. Effective privileges must be rechecked in the pre-write preflight, as the rollout plan requires.
- The Auth service did not run against the restored data, so sign-in after a restore is unverified.
- The restore targeted a disposable container, not a Supabase project. A production restore was neither performed nor authorized. A real recovery should follow Supabase's backup and restore procedure on a project that provides its own managed schemas.
- Recovery only covers the state at the snapshot time. The pre-write preflight must confirm that hosted has not changed. If it has, take and verify a new backup.
- Anything written to hosted after the rollout is not in this backup.
