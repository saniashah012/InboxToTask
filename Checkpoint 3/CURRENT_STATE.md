# Current implementation and verification state

Updated November 5, 2026, after live local manual-scan testing. This is the resumption
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
| 2: retrieval/coordination | Bounded metadata-first retrieval, independent context permissions, per-message failure handling, explicit continuation | Injected tests and local coordination checks pass. Real Gmail retrieval worked in live testing; scan-time rate limits were not exercised live |
| 3: extraction/task context | Versioned Gmail schema, per-item topic relevance, bounded same-thread task candidates, edit/cancel proposals | Fictional injected tests pass. The real model accepted the schema on 15 fictional emails, which shows the workflow runs, **not extraction accuracy** |
| 4: persistence | Gmail identities, budgets/leases/cache, revision/permission fencing, proposal review/rebase, re-extraction dedupe | PGlite and actual local Auth/PostgREST with an injected model pass; live saved results, reuse and dedupe confirmed on fictional mail |
| 5: product UI | Plain signed-in `ManualWorkspace` with connection/settings, scan/status/backlog, stored review, before/after changes. `App.tsx` routes signed-in users there, so the designed onboarding and dashboard remain sample-only | Workspace browser-checked with seeded fictional accounts: review, reload, stale rebase, cancellation, account switching. Google sign-in and real scans exercised in live testing. **Not complete: real data is not wired into the designed dashboard.** This is the next work, coordinated with PR 20's onboarding and preference work |
| 6: live local acceptance | Executed with a dedicated test mailbox on fictional mail | Real Gmail → Gemini → storage → review works, including a correctly targeted deadline-change proposal and the OAuth lifecycle checks. Results and findings are in [UC8](docs/use-cases.md#uc8-real-gmail-to-review-workflow). **Not run live:** settings changed during a scan, rate limits, wrong-account connection, domain and subdomain rules. Fixes after the live run have automated coverage only |
| 7: automatic scans | Not implemented | Not started; no schedule authorized or installed |

Empty semantic inclusions mean no topic inclusion restriction within source-permitted
content; semantic exclusions still apply. The user explicitly accepted that behavior.
Edit/cancel proposals use conservative review and stale-target rebase; that was the
recommended option and was not separately confirmed by the user. **The user explicitly
decided** that ambiguous updates show the source and let the user enter what is correct. No source inclusions
means no processing, regardless of semantic topics.

## Local migration and feature state last observed

- All migrations here through [gmail_token_recheck](app/supabase/migrations/20261106040000_gmail_token_recheck.sql)
  are applied to the local database, without reset. **Check with the team what is applied to hosted.**
- A hosted rollout of the Gmail migrations must apply them in filename order and include
  the hardening migration, which fixes defects in the two before it. The later migrations are
  additive, but the product page calls their functions. [Team handoff](../TEAM_HANDOFF.md) has the list.
- `ENABLE_GMAIL_SCAN=false` again after live testing. A Gemini key remains in the private local
  function configuration. Retrieval-only mode, fixture inference and cleanup remain disabled.
- The local Google token key was rotated after being exposed in a development session's output.
  Stored local Gmail connections were cleared, so local accounts must reconnect. If hosted used
  the same key value, rotate it there too.
- `GOOGLE_RETURN_URL` in the private local file points at the product root.

## Latest evidence and next action

Offline suite **168/168**; pgTAP **71**; unmodified local API suite **15 groups, zero model calls**, with scanning disabled. Frontend type check and build pass (main-chunk size warning). Live results are recorded separately in [UC8](docs/use-cases.md#uc8-real-gmail-to-review-workflow).

Next: move real data into the designed dashboard and make the onboarding screens reachable, then decide on rollout and Phase 7.
