# Current implementation and verification state

Calendar integration is implemented separately in this isolated branch, disabled
by default and not deployed. See the [Calendar implementation and approval plan](docs/calendar-integration-2026-11-05.md)
for its additive migration after Gmail hardening, shared OAuth review gate,
offline/browser evidence, Google dashboard setup and exact proposed release order.
This does not change the coordinated Gmail/database rollout status below.

Updated November 5, 2026, after the Gmail scan code review. This is the resumption
index, not a claim that services are running. Check Git status and local
runtime/migration state before new work.

## Read in this order

1. [Repository instructions](../AGENTS.md) and the relevant scoped instructions.
2. This status page for implemented versus verified versus pending work.
3. [Implementation plan](IMPLEMENTATION_PLAN.md) for requirements and acceptance
   gates. An unchecked item can have code without completed acceptance evidence.
4. [Review, fixes and live runbook](docs/gmail-manual-scan-review-2026-11-05.md), then the
   earlier [phase report](docs/gmail-manual-scan-phases-2026-11-05.md) and
   [Claude handoff](../CLAUDE_HANDOFF.md) for continuation detail.

Source/package manifests define code and commands. Migrations define the intended
database contract; only an inspected runtime establishes which are applied. Dated
reports describe their own run, not today's runtime or later code.

## Gmail phases

| Phase | Code | Verification and remaining gate |
| --- | --- | --- |
| 1: permissions/settings | Exact sender/domain access, subject exclusions, separate semantic preferences, legacy phrase review, context defaults/ranges | Offline and local database/API checks pass; existing saved context preserved |
| 2: retrieval/coordination | Bounded metadata-first retrieval, independent context permissions, per-message failure handling, explicit continuation | Injected retrieval tests and local coordination/disabled endpoint checks pass; **real Gmail retrieval not verified** |
| 3: extraction/task context | Versioned Gmail schema, per-item topic relevance, bounded same-thread task candidates, edit/cancel proposals | Fictional injected tests pass; **schema and accuracy not evaluated with a real model** |
| 4: persistence | Gmail identities, budgets/leases/cache, revision/permission fencing, proposal review/rebase, re-extraction dedupe | PGlite plus actual local Auth/PostgREST with an injected model pass |
| 5: product UI | Signed-in workspace, connection/settings, scan/status/backlog, stored review, before/after changes | Browser-checked with seeded fictional accounts: review, reload, stale rebase, cancellation, account switching. **Google sign-in path and a real scan not exercised** |
| 6: live local acceptance | Runbook written | **Blocked on owner inputs:** dedicated test mailbox, fictional mail, private Gemini key |
| 7: automatic scans | Not implemented | Deferred until Phase 6 passes; no schedule authorized or installed |

Empty semantic inclusions mean no topic inclusion restriction within source-permitted
content; semantic exclusions still apply. The user explicitly accepted that behavior.
Edit/cancel proposals use conservative review and stale-target rebase; that was the
recommended option and was not separately confirmed by the user. No source inclusions
means no processing, regardless of semantic topics.

## Local migration and feature state last observed

- All migrations through [gmail_scan_hardening](app/supabase/migrations/20261106000000_gmail_scan_hardening.sql)
  are applied to the local database, without reset. **Nothing is applied to hosted.**
- A hosted rollout of the Gmail migrations must apply them in filename order and include
  the hardening migration. It fixes defects in the two migrations before it.
- `ENABLE_GMAIL_SCAN`, retrieval, fixture inference and cleanup remain disabled. No
  private Gemini key is configured for local functions.
- `GOOGLE_RETURN_URL` in the private local file now points at the product root. This takes
  effect at the next `functions serve` restart.

## Latest evidence and next action

Offline suite **155/155**; pgTAP **71**; local API **13 groups, zero model calls**;
frontend type check and build pass (main-chunk size warning). None of these establish
live Gmail/model behavior.

Next: follow the [Phase 6 runbook](docs/gmail-manual-scan-review-2026-11-05.md#phase-6-live-acceptance-runbook).
