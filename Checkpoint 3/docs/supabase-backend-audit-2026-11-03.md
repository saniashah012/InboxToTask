# Supabase backend audit

- Date: November 3, 2026 (America/Chicago)
- Project: `IS492_c3`
- Project reference: `ltxhxqxpatemgkhjzmaq`
- Environment reported by CLI: production

## Summary

The hosted backend has an early foundation: one application table, owner-scoped Row Level Security policies, and one deployed email-analysis function. It is not connected to the repository's Gemini extraction pipeline or React dashboard. The deployed function uses Groq and returns analysis without saving tasks.

This report records a read-only CLI inspection. No hosted schema, grants, functions, secrets, schedules, or application records were changed. Application rows and secret values were not read. The extraction endpoint was not invoked, and no model-generation requests were made as part of this inspection.

## Evidence and method

- Listed deployed functions and secret metadata using the authenticated Supabase CLI.
- Queried Postgres catalog metadata in read-only transactions: application tables, columns, constraints, policies, effective privileges, ACLs, indexes, triggers, schemas, routines, and installed extensions.
- Downloaded `analysis_email` source into a temporary inspection directory outside the repository.
- Initialized only that temporary directory and used `config pull --dry-run` to preview hosted configuration. Only selected non-secret Auth settings were reported.
- Checked the frontend's main component and dependency declarations for integration references.
- Did not read application rows, user records, full email content, stored credentials, or existing function logs.

Resource presence and inspected code establish configuration and implementation evidence, not successful end-to-end behavior. No two-user access-control test or write test was performed.

## Priority findings

### 1. Extraction does not require a signed-in user

The active `analysis_email` function, version 6, has `verify_jwt: false`. Its handler uses:

```ts
withSupabase({ auth: ["publishable", "secret"] }, ...)
```

The code permits publishable-key callers without requiring an authenticated user. It contains no per-user budget or explicit rate limiter. Because the function invokes an external model provider, this creates an abuse and spending risk if publicly exposed.

Disabling the platform JWT check alone is not the finding: alternate authentication can be appropriate. The relevant issue is that this handler accepts a public application key without requiring user identity for a billable operation.

Recommended change: require verified user authentication for browser extraction requests, derive ownership from that identity, and enforce budgets/rate limits. If internal-service access is needed, define and test it separately.

### 2. Table grants block normal application access

`public.tasks` has RLS enabled and four owner-scoped policies. However, effective privileges and the underlying ACL both confirmed:

| Role | SELECT | INSERT | UPDATE | DELETE | TRUNCATE |
| --- | --- | --- | --- | --- | --- |
| `anon` | No | No | No | No | Yes |
| `authenticated` | No | No | No | No | Yes |
| `service_role` | No | No | No | No | Yes |

The table owner is `postgres`. The ACL was:

```text
{postgres=arwdDxtm/postgres,anon=Dxtm/postgres,authenticated=Dxtm/postgres,service_role=Dxtm/postgres}
```

The non-owner roles also retain REFERENCES, TRIGGER, and MAINTAIN privileges in this ACL. Review all grants and retain only intended privileges.

RLS policies do not grant table access. The current grants prevent the normal CRUD operations the application needs. Conversely, inappropriate TRUNCATE privileges are not constrained by row policies; this inspection did not demonstrate a browser-accessible truncation path or attempt a destructive operation.

Recommended change: configure least-privilege grants and RLS together in a reviewed migration, then test actual user and backend access.

### 3. Raw provider errors can enter logs

The deployed function reads a failed Groq response as text and passes that raw body to `console.error`. It also logs caught error objects. Provider errors can contain sensitive details, so this conflicts with the plan's sanitized-logging requirement.

Recommended change: log bounded status/error codes and request identifiers, without provider response bodies, email content, or credentials. Existing logs were not inspected; no historical disclosure is claimed.

## Database findings

Only one application table was found: `public.tasks`. There was no `private` schema. Supabase-managed schemas were present and excluded from application-table inspection.

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | uuid | No | `gen_random_uuid()` |
| `user_id` | uuid | No | None observed |
| `title` | text | No | None observed |
| `description` | text | Yes | None observed |
| `due_at` | timestamp with time zone | Yes | None observed |
| `source_email_id` | text | Yes | None observed |
| `confidence` | double precision | Yes | None observed |
| `status` | text | No | `pending` |
| `created_at` | timestamp with time zone | No | `now()` |
| `updated_at` | timestamp with time zone | No | `now()` |

Confirmed constraints:

- Primary key on `id`.
- `user_id` references `auth.users(id)` with `ON DELETE CASCADE`.
- Confidence must be between 0 and 1 when present.
- Status must be `pending`, `approved`, `rejected`, or `completed`.

Only the primary-key index was found. No non-internal trigger was attached to `tasks`; the `updated_at` default alone does not automatically refresh its value on updates.

### RLS policies

RLS is enabled; FORCE RLS is disabled. All four policies target `authenticated`:

| Operation | Existing-row condition | New-row condition |
| --- | --- | --- |
| SELECT | `auth.uid() = user_id` | Not applicable |
| INSERT | Not applicable | `auth.uid() = user_id` |
| UPDATE | `auth.uid() = user_id` | `auth.uid() = user_id` |
| DELETE | `auth.uid() = user_id` | Not applicable |

These express owner isolation but remain unverified through two-user testing. They also do not by themselves protect backend-controlled columns from updates by an owner once write privileges are granted.

The public routine `rls_auto_enable` is SECURITY DEFINER, returns `event_trigger`, and sets `search_path=pg_catalog`. Its presence is not evidence of a task-processing endpoint; ordinary callers cannot treat an event-trigger function as a normal RPC. No invocation was attempted.

### Storage gaps against the plan

No application structures were found for processing preferences, email rules, Google connection credentials, OAuth state, scan runs, durable processing jobs, extraction versions, evidence expiry, waiting-for items, proposed updates, calendar operations, usage reservations, or deletion/suppression state.

The existing task table uses status to distinguish pending and approved records, but no reviewed transition implementation or preservation of accepted versus incoming values was found. It lacks explicit conditions, original deadline boundaries, separate local date/time and IANA zone, evidence excerpts, uncertainty, completion timestamps, and retention fields.

There is a confidence-scale mismatch: the hosted table accepts 0–1, while the local Gemini pipeline returns 0–100. Integration requires an explicit conversion or schema change.

## Deployed function findings

| Property | Observed value |
| --- | --- |
| Name | `analysis_email` |
| Status | ACTIVE |
| Version | 6 |
| Platform JWT check | Disabled |
| Handler authentication | Publishable or secret key |
| Provider | Groq |
| Model | `openai/gpt-oss-120b` |
| Provider secret name | `GROP_API_KEY` |
| Database writes | None in inspected source |

Implemented behavior:

- Accepts POST requests with a supplied subject and body.
- Rejects invalid JSON, missing/empty strings, subjects over 500 characters, and bodies over 10,000 characters.
- Sends a prompt instructing the model not to invent deadlines and to treat email as untrusted data.
- Requests JSON-object output and parses the response.
- Checks a top-level actionable flag and task array.
- Normalizes returned task fields and forces `needs_review: true`.
- Returns the analysis to the caller.

Missing from the inspected implementation:

- Integration with the version-controlled Gemini prompt, schema, and strict validator.
- Verified user identity and ownership derivation.
- Gmail authorization or retrieval.
- Allowlist/exclusion enforcement and permitted thread-context selection.
- Strict task schema, date, and evidence validation.
- Saving suggestions or approved tasks.
- Deduplication, persistent retries, budgets, explicit provider timeout, and scan progress.
- Waiting-for/follow-up and calendar operations.

The source statement that tasks require review is an instruction/output flag, not an implemented persistent approval workflow. The local pipeline's validation results do not apply to this different hosted model and prompt.

## Secret configuration

Secret metadata listed these names; values were not read:

- `GROP_API_KEY`
- `SUPABASE_ANON_KEY`
- `SUPABASE_DB_URL`
- `SUPABASE_JWKS`
- `SUPABASE_PUBLISHABLE_KEYS`
- `SUPABASE_SECRET_KEYS`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`

`GEMINI_API_KEY` and custom Google OAuth, encryption, or scheduler secrets were not in this listing. Supabase Auth's provider credentials are a separate configuration surface; their absence cannot be inferred from this function-secret inventory.

Vault is installed, but credential-storage usage was not established. Vault secret contents were not inspected.

## Authentication configuration

The hosted configuration preview confirmed:

| Setting | Observed value |
| --- | --- |
| Site URL | `http://localhost:3000` |
| Additional redirect URLs | Empty list |
| Email confirmation | Enabled |

The Site URL needs to match the intended application environment, and the required local/hosted callback URLs need verification before deployment.

Google provider enablement, provider credentials, test users, and successful sign-in were not established. No user records were read. No Gmail or Calendar OAuth callback function was deployed in the function inventory.

## Scheduling and frontend integration

Installed extensions were `plpgsql`, `pg_stat_statements`, `uuid-ossp`, `pgcrypto`, and `supabase_vault`. Neither `pg_cron` nor `pg_net` was installed, and no Cron schema was present. Supabase Cron scanning/cleanup is therefore not configured in this database. An external scheduler was not inspected and cannot be ruled out.

No Supabase dependency or integration reference was found in the frontend's inspected [package declaration](../app/web/package.json) or [main component](../app/web/src/App.tsx). The dashboard remains a sample-data prototype based on the repository evidence inspected.

The local [Gemini extraction pipeline](../app/pipeline/README.md) is separate from the deployed function.

## Recommended next steps

1. Correct table grants, require appropriate authentication for extraction, and replace raw provider-error logging.
2. Bring deployed function source into version control and choose one maintained extraction implementation. Adapt the local Gemini pipeline rather than assuming the Groq endpoint shares its validation guarantees.
3. Add migrations for the missing application state and retain accepted/user-edited values separately from new proposals.
4. Persist validated suggestions and connect React authentication, reads, and approval actions.
5. Prove a fictional-email → extraction → saved suggestion → approval → reload flow.
6. Implement Gmail OAuth, token protection, permitted retrieval, incremental jobs, budgets, scheduling, calendar approval, and retention according to the [implementation plan](../IMPLEMENTATION_PLAN.md).
7. Test two-user isolation, changed preferences during work, retries, duplicate suppression, disconnect/deletion, calendar approval/undo, and retention boundaries.

## Verification limits

This inspection did not establish successful sign-in, successful hosted inference, task persistence, user isolation under real sessions, calendar operations, or background processing. No writes or billable inference calls were used to test those behaviors. Findings describe the inspected configuration and source as of the date above.

## References

- [Implementation plan](../IMPLEMENTATION_PLAN.md)
- [Local pipeline guide](../app/pipeline/README.md)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Edge Function authorization](https://supabase.com/docs/guides/functions/auth-headers)
