# InboxToTask Gmail scanning handoff

**Status note, November 5 review:** the migration, Git and "next work" details below
predate the [code review and fixes](<Checkpoint 3/docs/gmail-manual-scan-review-2026-11-05.md>).
Phases 1-5 are committed in `7d4ee6a` plus the review changes, all migrations are applied
locally, and steps 1-3 of "Next work" are done. Use
[current state](<Checkpoint 3/CURRENT_STATE.md>) first. The remaining work is the Phase 6
runbook in the review report. The product decisions below still apply.

Continue the user's authorized local implementation through the manual Gmail scan
milestone. Read root AGENTS.md and scoped Supabase/web instructions first, then
check Git status. Preserve uncommitted work. Do not push, deploy,
reset databases, enable broad email processing, or print secrets/provider prose.

Repository: `C:/Users/mzhen/Desktop/School/IS492/IS-492-Project`.

## Product decisions and remaining ambiguity

- Exact sender/domain inclusions combine with OR; exclusions and optional literal,
  case-insensitive subject exclusions win. Domains exclude subdomains unless
  explicitly listed. Empty source allowlists permit nothing. No Gmail labels or
  secret-pattern detector. Semantic topics never grant access.
- **User explicitly accepted:** empty semantic inclusions mean no topic inclusion
  restriction within source-permitted content. Semantic exclusions still apply.
  Topic filtering happens after Gemini receives permitted content. Selected topics
  filter both tasks and informational results, separately from Actionable/Passive.
- The implementation uses conservative reviewable edit/cancellation proposals:
  target ID + revision; preserve accepted values until approval; ambiguous targets
  remain untargeted review items; stale targets require explicit rebase and renewed
  review. This was the recommended second decision, and was stated when the user
  said continue. They did not separately answer that second multiple-choice prompt.
  Do not describe it as independently explicitly confirmed.
- Five earlier messages / 90 days default; 0–10 and 1–365 configurable. Existing
  saved context must remain unchanged. 12,000 characters/message and 24,000 total
  defaults, existing configurable caps retained. Age is relative to analyzed mail.
- Connecting Google or saving filters is not consent. Calendar writes require
  separate authorization. All bodies transient, excerpts expire separately.

## Current Git/runtime state

Everything in this session is **uncommitted**. Git was clean initially. Do not
discard changes. No dependencies were installed; npm/pinned pnpm roots preserved.

Local Docker/Supabase are available. Access through Docker/named pipes and cached
tools needed elevated sandbox execution in Codex; this was permission isolation,
not an unavailable daemon. CLI commands use `--agent no`, no `--remote`.

The following new migrations were applied locally, without reset:

1. `20261105200000_source_semantic_contract.sql`
2. `20261105210000_manual_gmail_retrieval.sql`
3. `20261105212000_manual_gmail_pause_gate.sql`

The following migrations are **NOT YET APPLIED to the actual local database**:

4. `20261105220000_gmail_persistence.sql`
5. `20261105223000_gmail_scan_status.sql`

Both unapplied migrations have been exercised in PGlite by the full offline suite.
They are still draft files and need review before local application. Do not edit
the first three applied files; use additional ordered migrations for fixes.

Vite is running at `http://127.0.0.1:5173/`. Shared browser was in fictional preview
onboarding, not an independently authenticated dedicated Gmail account. Earlier
user-reported successful connection is dated evidence, not current verification.

Local Edge functions were refreshed using existing private configuration:

```powershell
npx.cmd supabase --agent no functions serve --env-file supabase/functions/.env
```

Codex background exec session was `68871`; it may still run. Do not launch duplicate
servers without checking processes/ports. Existing runtime recognized gmail_scan;
anonymous 401 and authenticated `GMAIL_SCAN_DISABLED` were verified before the
latest persistence changes. Those latest changes still need real Edge checks.

No private flags/credentials were modified. `ENABLE_GMAIL_RETRIEVAL` is absent or
false in the runtime; new `ENABLE_GMAIL_SCAN` is absent/false. Fixture inference and
cleanup remain disabled. Never print actual environment files or CLI status keys.

**OAuth return route unfinished:** the checked-in function environment template
now uses `GOOGLE_RETURN_URL=http://127.0.0.1:5173/`, but the existing private runtime
configuration likely still returns to `/storage`. Resolve this locally before
product OAuth acceptance, preserving credentials and the existing registered
Google callback. Do not claim the product connection flow was verified.

## Implemented changes

### Phase 1 — implemented and locally verified

- Separate `semantic_preferences` from exact source rules in SQL, pipeline inputs,
  onboarding and settings. Category presets add one topic, never expanded keywords.
- Incompatible old phrase rules retained verbatim in `legacy_phrase_rules`; consent
  revoked, paused, revisions/generation fenced; explicit replacement review required.
- Old subject-only exclusions retain scope. Accepted tasks unchanged.
- New-account context defaults 5/90; existing users' saved values preserved.
- Old save clients fail closed because `p_semantic` is required.
- Root/web instructions and related contracts updated to supersede phrase access.

### Phase 2 — retrieval implementation and synthetic/local gates verified

Canonical `app/pipeline/gmail-retrieval.mjs`, separate `gmail_scan` Edge endpoint,
handler and private work coordination. Verified Supabase owner; encrypted backend
Google token/refresh reuse; metadata field masks omit snippets/bodies; each current
and earlier message independently source-filtered before `format=full`.

Seven-day snapshot, explicit initial/more requests, private cursor/pending IDs,
four-minute lease, 60-second cooldown. At most 100 permitted / 200 candidate
messages, separate checked-boundary/metadata/time limits, ten IDs/page. MIME/HTML,
recursion/part/response/text caps. UTF-8 only; oversized/malformed current messages
currently stop at a pending ID rather than silently losing coverage. Backlog exact
count unknown. No automatic schedule or incremental checkpoint.

### Phases 3–4 — new implementation, offline tested; local integration unfinished

- `app/prompts/extraction.schema.mjs` keeps the original fixture default schema and
  exports a versioned `gmailSchema` with per-item relevance and edit/cancel changes.
- Canonical prompt adds Gmail-only rules. `core.mjs` validates grounded current-mail
  change evidence, candidate IDs/revisions, untouched accepted fields, topic output,
  separate task-state/full-input bounds. Fixture E01–E20 boundary remains unchanged.
- `task-context.mjs` selects bounded accepted task candidates using permitted
  provenance, same thread AND meaningful action-word overlap. Thread alone cannot
  identify a target. This is candidate selection, not source permission. It can miss
  semantically related messages without lexical overlap; disclose/test this limit.
- `gmail-processor.mjs` joins trusted settings, task state, canonical model call,
  semantic filtering and service-only SQL persistence. Max two inference calls per
  batch; existing daily/provider budgets and retry/lease machinery reused.
- Gmail storage uses stable connection subject + Gmail IDs. SQL rechecks settings,
  connection, source suppression and task state before inference and persistence.
- `gmail_task_changes` stores independent edit/cancellation proposals with baseline,
  expected revision, changed fields and evidence. Review RPC supports approve,
  dismiss and explicit rebase (apply only changed fields to current task, then review
  again). Cancellation sets `tasks.cancelled_at`, preserving accepted fields/status.
- Cache base identity covers content/context/config/topics/access rules/day; task
  dependencies invalidate stale reuse. Approval of this extraction's own changes
  is handled to avoid unnecessary repeat inference. Tests cover repeat new tasks,
  repeat cancellation, user edits and stale rebase. More cache adversarial checks
  are still warranted.
- Source deletion purges change proposal fields/baselines/reason; expired/deleted
  evidence cannot authorize proposal approval. Review code never calls the model.

### Phase 5 — product wiring drafted; browser validation unfinished

- New `ManualWorkspace.tsx`, `manualScanAdapter.ts`, CSS. The normal signed-in root
  now routes to this persistent workspace, keyed by user ID. Demo remains separate;
  `/storage` remains local development tooling.
- Connection + saved permission form, manual initial/more requests, status/counts,
  backlog, last successful batch, reload, proposal approve/dismiss, task completion,
  before/after edit comparison and explicit stale rebase.
- Safe `gmail_scan_status` RPC in unapplied migration. Actual runtime flags remain
  disabled; UI reports backend disabled/retrieval-only mode explicitly.
- Shared client reused; async account/state fencing added. Raw console errors in
  App were removed. Type checking/build pass, but actual browser interactions,
  reload/account switching and authenticated review still require verification.

## Validation already completed — do not rerun without a reason

Latest full offline `npm.cmd test`: **134/134 pass**, including all new migrations
in PGlite, schema/task-context tests, and a fictional injected model → canonical
pipeline → SQL persistence/review flow. No Gmail/Gemini provider calls.

The new end-to-end synthetic storage test is
`Checkpoint 3/tests/gmail-persistence.test.mjs`. It verifies new task persistence,
repeat reuse before/after approval, correct deadline target, preserved user values,
owner isolation, stale approval denial, explicit rebase then approval, cancellation
and repeat reuse. `gmail-extraction.test.mjs` covers mismatches, ambiguity, untouched
fields, new tasks and mixed-topic filtering.

Actual local checks before latest draft migrations:

- pgTAP **71 checks** pass across four files.
- **Nine local Auth/PostgREST/Edge groups** pass, with temporary users removed and
  zero model calls. Includes private coordination, owner/role denial, consent,
  serialization, stale settings, actual disabled scan endpoint.
- Frontend `corepack pnpm exec tsc --noEmit` and `corepack pnpm build` passed **after
  the new ManualWorkspace wiring**. Build warns that the main chunk exceeds 500 KB;
  this is a warning, not a failing build. Consider lazy-loading workspace if useful.
- Cached Deno check of `supabase/functions/gmail_scan/index.ts` passed after the
  persistent processor was wired. Cached executable:
  `C:/Users/mzhen/AppData/Local/npm-cache/_npx/05b6ef7b13673c57/node_modules/deno/deno.exe`.
- `npm.cmd run supabase:prepare` completed after canonical changes. Generated
  extraction files are ignored and must not be maintained separately.
- Earlier browser preview check proved School adds a single semantic topic without
  granting access; Continue stayed disabled until an exact sender/domain was added.
  This is not validation of the new authenticated workspace.

## Next work in order

1. Review current diffs and the two unapplied migrations/processor. Pay special
   attention to atomic permission/deletion/task revision fencing, idempotent finish,
   cache dependency rules, expired/source-deleted proposals, and retention. Add
   meaningful missing regression cases instead of rerunning unchanged suites.
2. Apply **local only** pending migrations with `npx.cmd supabase --agent no migration up`
   from `Checkpoint 3/app`; no reset. Run relevant pgTAP and extend `test:local` for
   Gmail persistence/status/change RPCs against actual Auth/PostgREST, with fictional
   temporary data and no provider calls. Existing `storage-local.mjs` has fictional
   connection scaffolding; never send its dummy ciphertext through token decryption.
3. Browser-check normal signed-in root, connection/permission settings, scan disabled
   state, saved review/approval/reload/stale proposals and account switching. Use
   temporary fictional local accounts/seeded inference and label evidence honestly.
   The current shared browser is not authenticated to a dedicated mailbox.
4. Resolve local Google return destination. Confirm private Gemini configuration
   presence without printing values. Explicit live acceptance needs a dedicated
   Gmail test account containing fictional mail and explicit saved source/consent
   settings. Do not turn on broad scanning as a side effect of setup/tests.
5. Finish Phase 6 actual lifecycle tests: reload, real refresh, denial/revocation,
   disconnect/reconnect, permitted/excluded bodies/context, semantic results,
   correct multi-task deadline change, repeat zero inference, changed settings,
   rate limits and partial recovery. Explain any tests blocked by user sign-in,
   mailbox setup, missing private model configuration or quota. Never claim mocks
   establish real Gmail/model accuracy or hosted behavior.
6. Update phase report/plan/setup/storage docs. Existing
   `Checkpoint 3/docs/gmail-manual-scan-phases-2026-11-05.md` and the top plan summary
   are **STALE after this continuation**: they still say Phases 3–6 are unimplemented
   and product decisions pending. Preserve dated evidence, add current state.
   Finish `git diff --check` and link/path checks.
7. Phase 7 automatic scanning is forbidden until the manual acceptance gate passes.
   No 15-minute schedule, hosted rollout, push or deployment is authorized.

## Known rough edges to assess

- Product workspace is functional draft styling reusing existing storage styles;
  no Carbon compliance claim. It currently shows summary information, but does not
  yet expose all waiting-for/follow-up details or a product task-field editor.
- Progress updates counts after each batch; it shows running state while pending,
  not real per-message live counters. `prepared` means successfully consumed in the
  retrieval coordinator; persistent mode saves, retrieval-only mode does not.
- Metadata/body failure can leave a continuation blocked on one ID. Explicit
  skip/retry controls are not implemented. No content silently discarded.
- Task candidate provenance is bounded conservatively; >30 provenance records or
  oversized task context can defer an email. Candidate overlap can miss implicit
  references; these need review/live fictional acceptance, not stronger claims.
- Provider model default remains existing configured default; explicit local
  `GEMINI_MODEL` override is honored. Do not silently switch models. New Gmail
  structured schema has not yet been evaluated with a real model.
- Stored scan settings disclosure still uses existing `gmail-scan-v1`. Verify the
  updated UI accurately describes actual stored content/retention before live use.
- The phase report is registered as an artifact in the previous tool session;
  this handoff is the newest implementation status.
