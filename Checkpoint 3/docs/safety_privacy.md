# InboxToTask safety and privacy

Updated November 5, 2026. This document distinguishes current local safeguards from planned CP3 integration. It is not evidence of hosted enforcement. See the [implementation plan](../IMPLEMENTATION_PLAN.md), [architecture](architecture.md), [storage contract](../app/supabase/STORAGE.md), and [observability guidance](observability.md).

## Scope and risks

Emails, senders, subjects, extracted tasks, summaries, and evidence excerpts may contain personal information. Principal risks are cross-user disclosure, credential theft, unwanted provider transmission, inaccurate extraction, malicious instructions in email, duplicate external actions, and excessive API spending. Authentication alone does not prevent an authorized tester or faulty scheduler from exhausting a budget.

CP3 should use dedicated test accounts and realistic fictional mail. Proposed processing access is restricted to approved testers; the application-level tester gate is not implemented yet. Google OAuth test-user configuration is not a substitute for that backend gate. Public-launch fraud infrastructure is outside this class-project scope.

## Current safeguards and their limits

| Boundary | Implemented foundation | Remaining limitation |
| --- | --- | --- |
| Identity and ownership | [Session verification](../app/supabase/functions/_shared/auth.mjs) derives the user from Supabase Auth. Owner RLS, scoped grants, and controlled RPCs protect normalized storage | Hosted configuration and integrated real-mail workflows still need verification; a public frontend key is not processing authorization |
| Google credentials | [Connection code](../app/supabase/functions/_shared/google-connection.mjs) implements backend AES-GCM encryption, time-limited single-use OAuth state/PKCE, same-account checks, refresh leases, and disconnect/revocation handling | Initial local connection is user-reported; live refresh, denial, revocation, reload, and reconnect checks remain. Tokens and encryption keys must stay backend-only |
| Scanning permission | [Saved settings](../app/supabase/migrations/20261105070000_scan_settings.sql) default to no consent, paused, empty inclusions, and zero earlier context; authenticated saves validate values/revisions and invalidate older storage jobs | Settings are not wired to Gmail retrieval. The category/phrase filter contract and safe conversion of existing preferences remain integration work; follow the current implementation plan. Connecting Google or saving filters does not grant scanning consent |
| Extraction input | The default-disabled [fixture handler](../app/supabase/functions/_shared/fixture-handler.mjs) accepts only E01-E20 case IDs and bounds requests to 1,024 bytes; callers cannot choose bodies, owner, rules, prompts, or model settings | It is not a real Gmail endpoint. The canonical pipeline receives supplied text and cannot establish pre-retrieval enforcement |
| Model output and actions | The [canonical pipeline](../app/pipeline/core.mjs) validates schema, evidence grounding, and ownership. Review transactions preserve proposals separately from accepted edits; missing dates remain nullable | Validation does not prove factual accuracy or prompt-injection resistance. Calendar approval records exist, but connected execution does not |
| Processing lifecycle | Budget/lease claims, cache identities, generation fencing, revisions, and deletion suppressions protect fixture processing | Real scans must enforce the same protections at every external boundary; extraction leases alone do not coordinate a whole scan |

Google sign-in, Gmail authorization, scanning consent, Calendar authorization, and approval of an individual event are separate decisions. Denying optional Calendar access must leave Gmail/task features usable. Task approval never implicitly authorizes an external write. Completing or deleting an app record does not delete Gmail messages or Calendar events.

## Privacy boundaries for real Gmail processing

The following are required integrations, not current retrieval behavior:

1. Load trusted saved settings and connection state server-side. Absent consent, paused processing, disconnected access, or empty inclusions must block scanning.
2. Retrieve candidate metadata first. Apply the confirmed deterministic inclusion rules and overriding exclusions before fetching bodies. Follow the [current category/phrase filter plan](../IMPLEMENTATION_PLAN.md#custom-sender-domain-and-subject-filters-implementation-plan): phrase fields, mappings, and matching still require confirmation; do not silently broaden saved permissions or treat category titles as effective filters. Require review/conversion of obsolete settings before scanning. Each context message must independently qualify.
3. Enforce saved context limits within backend caps. Remove practical quoted-history/signature boilerplate, preserve meaningful content, and flag necessary missing context. Metadata rules and quote removal do not guarantee removal of sensitive topics or copied private text.
4. Recheck current settings/connection generations before each new body/context request, inference, and persistence. Changed permissions must fence stale work. Already transmitted content cannot be retracted; stopping processing cannot cancel a provider request already sent.
5. Keep full bodies transient. Persist only required source metadata, structured results, and bounded supporting excerpts. Treat these derived records as sensitive, too. Cache reuse must remain user-scoped and respect current permissions and deletion suppressions.
6. Explain provider processing before consent. Verify and document the selected Gemini service/tier's actual data-use and retention terms before personal mail is sent; do not promise zero provider retention or automatic PII sanitization.

Email is untrusted data, including email from an allowed sender. The model has no email-sending, arbitrary browsing, or Calendar execution tools. Budget, retry, permission, and execution decisions belong to backend code and cannot be changed by instructions in an email.

## API abuse and token spending

### Existing fixture-trial controls

The [storage coordinator](../app/supabase/functions/_shared/storage.mjs) and database claims provide 20 requests and 200,000 reported-or-reserved tokens per user per UTC day, a shared three-requests-per-model-per-minute limit, one live job per user, and 90-second leases. At most three attempts are allowed per extraction identity with a 60-second failure retry delay; no automatic retry dispatcher exists. The fixture Edge function forces one provider attempt per dispatch.

Claims reserve an input/prompt/schema byte-based estimate plus the output allowance before inference. This is neither an exact tokenizer count nor a dollar spending guarantee. Reported usage reconciles reservations; unknown-cost failures retain them. Effective settings bound context, output, and timeout. Valid cached results and code-only review avoid another model call. See [usage/accounting limitations](observability.md#token-usage-budgets-and-cost).

### Proposed class-project implementation

These additions are planned, not implemented or deployed. Numerical global limits and the proposed 60-second manual cooldown still need selection/confirmation.

| Stage | Backend changes | Completion check |
| --- | --- | --- |
| 1. Access and global budgets | Add private approved-tester records, an operator-controlled inference enable switch, global daily request/token limits, and global usage/reservations. Extend the existing claim transaction to reserve both user and global allowance atomically; deny dispatch when authorization/accounting cannot be verified. Browser roles cannot edit these controls | Unapproved callers and disabled/exhausted processing make zero model calls. Concurrent claims cannot over-reserve the configured allowance |
| 2. Shared extraction boundary | Route manual, scheduled, backlog, and retry extraction through the same coordinator. Keep source selection, model/configuration, and work caps server-controlled. Reuse unchanged permitted results; retries require another reservation. Retain unknown-cost accounting | Every model attempt has a reservation; empty/unchanged scans and review/Calendar code actions use zero inference. Failed/deferred work is never marked successful |
| 3. Scan coordination | Persist active scan/lease, next manual refresh time, settings/connection generations, and pending/deferred item references. Claim scans transactionally and return an existing running scan. Bound batches, retries, and concurrent work; recover expired leases without duplicate extraction | Fifty simultaneous refresh requests and manual/scheduled overlap produce one scan with no duplicate inference. Permission changes prevent further unauthorized dispatch |
| 4. Status and operations | Expose owner-scoped progress, remaining allowance/reset, cooldown, and safe deferral reasons. Document private tester approval, limit changes, and the kill switch; use basic usage inspection instead of building an admin dashboard | Users see why work is deferred; another user's usage is inaccessible. Operators can stop new inference dispatches without changing source code |

The kill switch stops new dispatches; it cannot undo requests already sent. Check it immediately before external inference as well as at claim time. Preserve accounting for in-flight requests. Proposed scan suspension should also stop new Gmail retrieval; define that separately from an inference-only switch. Calendar undo and task review should not depend on inference availability.

A global token/request limit bounds application work but is not a guaranteed currency cap. Choose allowances from measured fictional-case usage and the team's total budget, keep model choices controlled, and configure provider quotas/spending controls where available. Billing alerts are supplementary and do not stop spending. The initial scan's 100-message ceiling does not override daily budgets: preserve and display excess work as deferred. Do not reset allowances on reconnect, page reload, or settings edits.

For CP3, defer dedicated Redis infrastructure, device tracking, automated fraud detection, and a custom security dashboard. Retain authentication, ownership, permission checks, bounded work, and spending controls. This scope follows [OWASP resource-consumption guidance](https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/).

## Retention, deletion, and diagnostics

- Current storage defaults make evidence, digest summaries, unapproved suggestions, and waiting items eligible for expiry after 30 days. Completed tasks become eligible for deletion after 30 days; undo clears eligibility, and recompletion restarts it. Active accepted tasks remain until completion or explicit deletion.
- Source deletion removes extracted content while independently accepted tasks remain. Minimal identifiers/suppressions currently remain until account deletion to prevent deleted results being recreated. Finalize retention for dismissed/unreviewed items, scan history, and suppression records before real-mail use; a complete account-deletion flow remains unfinished.
- Attempt diagnostics have a 14-day cleanup policy. [Cleanup code](../app/supabase/functions/storage_cleanup/index.ts) exists but is disabled and not scheduled. Eligibility is not evidence of automatic deletion. Enable/test the scheduler separately, including races with undo and retries.
- Backend responses use fixed errors rather than raw provider prose. Do not log bodies, subjects, prompts, extracted text, tokens, keys, or callback parameters. Safe identifiers/codes still need access control and retention. Some product SDK error logging remains to be audited; there is no universal redaction guarantee.
- Document hosting backups, platform logs, and Google/model-provider retention separately. Application deletion cannot promise immediate removal of every provider or backup copy. Manual ICS imports are managed in the destination calendar; repeated imports can duplicate entries and have no remote undo through the app.

## Failure behavior and verification

Authentication or accounting unavailability must fail closed. Invalid/oversized input is rejected before inference. Rate limits and exhausted budgets defer eligible work visibly. Invalid, ungrounded, or truncated output is not saved as a successful extraction. Stale revisions require reloading current state. Revoked authorization requires reconnecting, not an unlimited retry loop. Unknown provider outcomes must not trigger blind replay or released budget reservations. Future Calendar execution needs remote reconciliation and stable operation IDs before retrying an uncertain write.

Existing [endpoint tests](../tests/supabase-endpoint.test.mjs), [pipeline tests](../tests/pipeline.test.mjs), [storage tests](../tests/storage.test.mjs), [database tests](../tests/storage-database.test.mjs), [Google tests](../tests/google-connection.test.mjs), and [settings tests](../tests/scan-settings.test.mjs) cover offline or simulated boundaries. The [injection fixture](../tests/fixtures/prompt-injection.json) is a probe, not proof of resistance. See dated [storage](local-storage-verification-2026-11-04.md), [Google](google-auth-verification-2026-11-05.md), [settings](scan-settings-verification-2026-11-05.md), and [live extraction](extraction-review-verification-2026-11-04.md) reports for the scope of actual verification.

Before enabling the planned controls, add targeted tests for tester/anonymous isolation, concurrent global/user reservations, denied claims leaving no partial reservations, daily UTC reset, repeated refresh, scheduler overlap, expired leases, unknown-cost failures, bounded retries, and current permission checks during queued/in-flight work. Simulate fifty refresh requests without live model charges. Verify zero new model calls when the switch is off, budgets are exhausted, or accounting is unavailable. Stopping the scheduler prevents scheduled dispatch only; manual requests must still obey the same controls.

Then perform a small fictional Gmail end-to-end trial and verify the closed-dashboard schedule, live OAuth lifecycle, provider revocation, retention cleanup, and separately approved Calendar operations when implemented. Local/offline results do not establish hosted protection. Documentation updates alone close none of these runtime acceptance checks.
