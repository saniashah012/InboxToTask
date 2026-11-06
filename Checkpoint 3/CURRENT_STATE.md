# Current implementation and verification state

Updated November 5, 2026, after the 134-test offline run and product workspace
build. This is the resumption index for the working tree, not a claim that services
are running. Check Git status and local runtime/migration state before new work.
The Gmail changes remain uncommitted at this handoff.

## Read in this order

1. [Repository instructions](../AGENTS.md) and the relevant scoped instructions.
2. This status page for implemented versus verified versus pending work.
3. [Implementation plan](IMPLEMENTATION_PLAN.md) for requirements and acceptance
   gates. An unchecked item can have code without completed acceptance evidence.
4. [Phase report](docs/gmail-manual-scan-phases-2026-11-05.md) for validation scope;
   [Claude handoff](../CLAUDE_HANDOFF.md) for detailed continuation steps.

Source/package manifests define code and commands. Migrations define the intended
database contract; only an inspected runtime establishes which are applied. Dated
reports describe their own run, not today's runtime or later code.

## Gmail phases

| Phase | Code in working tree | Verification and remaining gate |
| --- | --- | --- |
| 1: permissions/settings | Exact sender/domain access, subject exclusions, separate semantic preferences, legacy phrase review, context defaults/ranges | Offline and local database/API checks passed; existing saved context preserved |
| 2: retrieval/coordination | Bounded metadata-first retrieval, independent context permissions, backend tokens, explicit continuation | Injected retrieval tests and local coordination/disabled endpoint checks passed; actual Gmail retrieval not verified |
| 3: extraction/task context | Versioned Gmail schema, per-item topic relevance, bounded task candidates, edit/cancel proposals | Fictional injected extraction tests passed; new Gmail schema/model accuracy not evaluated live |
| 4: persistence | Gmail identities, budgets/leases/cache, revision/permission fencing, proposal review/rebase | PGlite integration passed; new persistence migration not yet applied to actual local database |
| 5: product UI | Signed-in persistent workspace, connection/settings, scan/status/backlog, stored review and before/after changes | Type/build passed; authenticated browser flow, reload and account switching still need verification |
| 6: live local acceptance | Test procedure remains to execute | Dedicated fictional-mail test account, remaining OAuth lifecycle and real Gmail → Gemini → storage → product review are outstanding |
| 7: automatic scans | Not implemented | Deferred until manual acceptance passes; no schedule authorized or installed |

Empty semantic inclusions mean no topic inclusion restriction within source-permitted
content; semantic exclusions still apply. The user explicitly accepted that behavior.
Edit/cancel proposals use conservative review and stale-target rebase; see the handoff
for the distinction between the accepted topic decision and the recommended proposal
behavior. No source inclusions means no processing, regardless of semantic topics.

## Local migration and feature state last observed

- Applied locally: [source/semantic settings](app/supabase/migrations/20261105200000_source_semantic_contract.sql),
  [retrieval coordination](app/supabase/migrations/20261105210000_manual_gmail_retrieval.sql),
  [pause safeguard](app/supabase/migrations/20261105212000_manual_gmail_pause_gate.sql).
- **Not applied to the actual local database:** [Gmail persistence](app/supabase/migrations/20261105220000_gmail_persistence.sql)
  and [scan status](app/supabase/migrations/20261105223000_gmail_scan_status.sql).
  Both were exercised in PGlite. Review before applying; never reset existing data.
- Gmail retrieval, persistent scanning, fixture inference and cleanup were not
  enabled. No real Gmail/Gemini calls or hosted changes occurred in this work.
- Local Edge/Vite were started; recheck them. The private Google return destination
  may still be `/storage`, while the template now uses `/`. Resolve before testing
  the product OAuth round trip, preserving private credentials.

## Latest evidence and next action

Full offline suite: **134/134 pass**. Frontend TypeScript/build and Gmail Edge Deno
check pass. The build has a main-chunk size warning. Earlier local checks passed
**71 pgTAP assertions** and **nine Auth/PostgREST/Edge groups**, before the two newest
migrations. Browser evidence covers fictional source/topic controls, not the new
authenticated workspace. These results do not establish live Gmail/model behavior.

Next: review and apply the two pending migrations locally; extend actual database/API
checks for persistence/status/review, then verify the authenticated product UI.
Live acceptance needs a dedicated mailbox with fictional test mail and explicit
saved consent/source rules. Keep scanning disabled during ordinary offline checks.
