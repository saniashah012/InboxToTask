# Real Gmail manual-scan implementation record

Date: November 5, 2026. Local work only. The persistent local manual-scan milestone
has **not** been reached. No real Gmail retrieval or Gemini calls were made, no
feature flags were enabled, and no hosted migrations, deployments, pushes, or
Calendar operations were performed. Git was clean before work began.

## Phase 1 — settings and permission contract

Implemented source permissions independently from semantic preferences across
SQL, canonical preparation, onboarding and the shared settings form. Exact sender
and domain inclusions combine with OR; source exclusions and literal
case-insensitive subject exclusions win. Domains do not include subdomains.
Categories/custom topics never expand to access keywords. Empty source lists
permit nothing. The disclosure explains that semantic exclusions act after
permitted content reaches Gemini.

The new [ordered migration](../app/supabase/migrations/20261105200000_source_semantic_contract.sql)
retains incompatible phrase rules verbatim in owner-readable
`legacy_phrase_rules`, requires explicit replacement review, pauses affected
accounts, revokes consent, increments revisions/generations, and cancels stale
storage work. It preserves old subject-only exclusions and accepted tasks. It
does not reconstruct category titles from expanded terms. Onboarding cannot
silently acknowledge old-rule review; users must use the settings form.

The save RPC requires a separate `p_semantic` object with `include` and `exclude`
topic lists. Old clients fail closed. Saved consent is still separate from source
rules and Google connection. New accounts default to five earlier messages within
90 days, configurable to 0–10 and 1–365 days. Existing saved context remains
unchanged, including zero-message settings. Per-message and total character caps
remain 12,000/24,000 by default and 100–30,000/100–60,000 configurable.

Validation: migration upgrade with fictional legacy exclusions, preserved context,
review-required behavior, empty access, owner/anonymous isolation, normalized
topics, stale saves, consent and storage fencing pass in PGlite. The actual local
migration and pgTAP checks pass. Real local Auth/PostgREST checks pass for saved
settings, normalization, account isolation, stale HTTP 409 responses and accepted
task preservation. Frontend TypeScript and production build pass. A browser
preview check confirmed that School adds one topic, does not grant source access,
and leaves Continue disabled until an exact source is added. This was fictional
preview UI, not live Google authorization or an authenticated settings-form trial.

## Phase 2 — bounded retrieval and scan coordination

Implemented the separate [gmail_scan endpoint](../app/supabase/functions/gmail_scan/index.ts),
[handler](../app/supabase/functions/_shared/gmail-scan-handler.mjs),
[canonical retriever](../app/pipeline/gmail-retrieval.mjs), and private coordination
through [the retrieval migration](../app/supabase/migrations/20261105210000_manual_gmail_retrieval.sql)
and [additional pause safeguard](../app/supabase/migrations/20261105212000_manual_gmail_pause_gate.sql).
All three new migrations are applied locally; previously applied history was not
edited. The Edge runtime was refreshed to load the new route, preserving its
existing private configuration.

The endpoint is disabled by default under `ENABLE_GMAIL_RETRIEVAL=false` and also
requires the Google connection feature. It verifies the Supabase bearer session,
derives the owner server-side, accepts only `mode: initial` or `mode: more`, and
uses the existing encrypted token/refresh implementation. It returns sanitized
counts only. Its consumer intentionally makes zero model calls and saves no
extraction. This is a retrieval-only development boundary, not a product scan.

Coordination checks explicit saved consent, both scanning/storage pause controls,
nonempty exact source lists, rule-review status, settings revision, storage
generation, verified mailbox identity, Gmail scope, connection state/generation,
and a four-minute lease. Token retrieval is bracketed by permission assertions.
Claims have a 60-second cooldown. Continuation IDs and Gmail cursors stay private
and require another explicit `more` request; changed settings/generations invalidate
continuation. Fresh initial requests use a seven-day snapshot window.

Bounds and behavior:

- At most 100 permitted messages and 200 candidate metadata messages per request;
  separate metadata/time/request limits can stop work earlier.
- At most 300 checked retrieval boundaries and 500 metadata records considered;
  a thread metadata response is additionally capped at 100 messages/100 KB.
  The bounded thread response can reach the record budget before context selection.
- Ten candidate IDs per page; 90-second work window and ten-second provider requests.
- Explicit metadata field masks omit snippets and bodies. Each source is checked
  before `format=full`, independently for every context message.
- Context age is measured backward from the analyzed message. The newest eligible
  messages are selected and then presented chronologically. Zero context skips
  thread retrieval. Message and combined text caps are enforced.
- Full Gmail JSON responses are capped at 2 MB, candidate/individual metadata at
  16 KB. MIME recursion/part counts and encoded text are bounded. Plain text is
  preferred to HTML alternatives; scripts/styles, attachments and nested forwarded
  messages are omitted. Unsupported/non-UTF-8 encodings can require manual handling.
- Partial/error work retains the pending ID/cursor rather than silently claiming
  coverage. Backlog is reported as a boolean with unknown exact count. Oversized
  or malformed messages currently block continuation at that ID; explicit
  per-message recovery/skip controls remain future work.

Validation: ten fictional injected retrieval/HTTP tests pass, including excluded
bodies/context never fetched, topic-only/empty source permissions, subdomains,
subject exclusions, context ordering, zero context, changed permissions, bounded
metadata work, rate limits, pending coverage, MIME/HTML and disabled/Auth gates.
PGlite checks pass for role denial, consent, seven-day windows, concurrent claims,
NULL leases, stale settings/connections, continuation and storage pause. Real local
Auth/PostgREST verifies privileged claim denial, consent, serialization and stale
settings using a fictional connection row; no Google provider was called. Actual
Edge requests return 401 for invalid/anonymous sessions and 503
`GMAIL_SCAN_DISABLED` for a verified temporary user. The Edge entrypoint passes
cached Deno type checking. Canonical sources were rebuilt with `supabase:prepare`.

## Checks performed

- Full offline suite: initially 119/121 passed; two new retrieval test assertions
  were corrected (independent request budget and a Gmail base64url fixture).
  The corrected ten-test retrieval subset passed. Subsequent changed pipeline and
  retrieval checks passed 49/49; settings/retrieval checks passed 20/20. These
  overlapping counts are not additive or a claim of a fresh full-suite rerun.
- Local pgTAP: 71 checks across four files pass after new role checks were added.
- Local integration: nine groups pass, temporary users removed, zero model calls.
- Frontend TypeScript and production build pass; browser preview source/topic
  interactions checked. Edge Deno check passes. No dependencies installed.
- Git whitespace and documentation link/path checks are recorded after final review.

## Phases 3–7 — outstanding work and blockers

Phase 3 is waiting on two requested product decisions:

1. Whether empty semantic selections mean all permitted topics (recommended) or
   require a topic, and whether selected topics filter both task and informational
   results. Actionable/Passive remains a separate dimension.
2. Structured edit/cancellation proposal behavior: recommended target ID plus
   expected revision, accepted values preserved until review, ambiguous references
   untargeted for review, stale targets requiring reload and renewed review.

After those decisions, extend canonical prompts/schema/validation, load bounded
relevant accepted task state/user edits/revisions with current permission checks,
and test multi-task threads, cancellations, ambiguity and user edits. Task-state
and full-input limits must be separate from email context limits.

Phase 4 must adapt the fixture-only storage coordination for stable Gmail source
identities, atomic permission/connection/deletion checks at inference/persistence,
budgets, leases, suppression, revision-scoped reuse, deduplication and partial
recovery. Existing fixture restrictions remain intact; `analysis_email` still
accepts only E01–E20 and is disabled. Retrieval-only continuation is not a
persistent extraction coverage checkpoint and must not be reused as one blindly.

Phase 5 must replace product simulation with real connection/scan status, stored
records, before/after update review, approve/dismiss/reload, errors/backlog and
account-switch fencing. `/storage` remains development tooling.

Phase 6 requires an authenticated dedicated test mailbox, fictional test emails,
remaining live OAuth lifecycle checks, actual refresh/revocation/reconnect,
Gmail→Gemini→storage→product review, repeats/settings races/rate limits/recovery,
and a deadline-change proposal targeting the correct accepted task. The agent's
shared browser currently shows sign-in, not an authenticated dedicated mailbox.
User-reported earlier connection success is not current independent evidence.

Phase 7 is deferred until the manual acceptance gate passes. No automatic scan,
incremental checkpoint or 15-minute schedule was added. Calendar authorization
and execution remain separate from task approval.
